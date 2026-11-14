# Remediation Analysis: iOS Hardware Extraction Engine (`core/ios_reader.py`)

**Agent**: `teamwork_explorer_m1_r2_1` (Explorer 1)  
**Milestone**: M1 Iteration 2 (Remediation)  
**Target Module**: `core/ios_reader.py`  
**Referenced Failure Report**: `.agents/teamwork/teamwork_challenger_m1_1/handoff.md`  
**Referenced Test Suite**: `tests/test_adversarial_m1.py`  
**Date**: 2026-11-07  

---

## 1. Executive Summary

During Milestone 1 empirical adversarial testing, `tests/test_adversarial_m1.py` uncovered 12 test failures across the hardware extraction layer. Ten of these failures originate directly within `core/ios_reader.py` due to missing type validation and unhandled edge cases in three functions:
1. `parse_ideviceinfo_xml`: Crashes with `AttributeError` when plist root is not a dictionary (e.g. list, string, integer, boolean), and crashes with `ValueError` or `TypeError` when `TotalDiskCapacity` is malformed (e.g. non-numeric string, dictionary, list).
2. `calculate_ios_battery_health`: Crashes with `TypeError` when battery capacities are formatted as numeric strings (e.g. `'2500'`), and improperly omits calculating battery health for depleted batteries (`NominalChargeCapacity == 0`) due to Python falsy evaluation of `0`.
3. `resolve_apple_model`: Crashes with `AttributeError: 'NoneType' object has no attribute 'startswith'` when called with `product_type=None`.

This document formulates the exact root cause diagnosis, fix strategy, concrete code modifications (with exact line numbers and diffs), and verification evidence for the Worker.

---

## 2. Root Cause Analysis

### 2.1 Vulnerability 1: Non-Dict Plist Root in `parse_ideviceinfo_xml`
- **Location**: `core/ios_reader.py:390-398`
- **Trigger**: Any valid XML plist payload whose root element is an array, string, integer, float, or boolean (e.g., `plistlib.dumps(["iPhone16,1", "128GB"])`).
- **Mechanism**: `plistlib.loads(payload)` successfully returns a Python `list`, `str`, `int`, etc. Line 397 then invokes `plist.get("ProductType", "")`. Because non-dict types do not implement `.get()`, Python raises an unhandled `AttributeError`.
- **Impact**: When USB polling encounters an uninitialized, anomalous, or partial plist response from `ideviceinfo`, the background polling thread logs unhandled exceptions or terminates unexpectedly.

### 2.2 Vulnerability 2: Corrupted or Malformed `TotalDiskCapacity` in `parse_ideviceinfo_xml`
- **Location**: `core/ios_reader.py:401-402`
- **Trigger**: Plist where `TotalDiskCapacity` is a corrupted string (e.g. `'corrupted_capacity_string'`), a nested dictionary, or a list.
- **Mechanism**: Line 402 executes `int(raw_storage) if raw_storage else 0`.
  - If `raw_storage` is `'corrupted_capacity_string'`, `int()` raises `ValueError: invalid literal for int() with base 10`.
  - If `raw_storage` is `{'nested': 'value'}` or `[1, 2, 3]`, `int()` raises `TypeError: int() argument must be a string, a bytes-like object or a real number, not 'dict'`.
- **Impact**: Any device reporting non-standard capacity metadata crashes the parser rather than falling back to `'Unknown'`.

### 2.3 Vulnerability 3: String Capacities in `calculate_ios_battery_health`
- **Location**: `core/ios_reader.py:367`
- **Trigger**: Plist or diagnostics dictionary containing string values, e.g. `{"NominalChargeCapacity": "2500", "DesignCapacity": "3000"}`.
- **Mechanism**: Line 367 evaluates `elif nominal_cap and design_cap and design_cap > 0:`. When `design_cap` is a string (e.g. `'3000'`), `'3000' > 0` raises `TypeError: '>' not supported between instances of 'str' and 'int'`. Furthermore, `nominal_cap / design_cap` would raise `TypeError: unsupported operand type(s) for /: 'str' and 'str'`.
- **Impact**: Devices or simulated profiles with string diagnostics crash background battery health retrieval.

### 2.4 Vulnerability 4: Depleted Battery Falsy Evaluation (`NominalChargeCapacity == 0`)
- **Location**: `core/ios_reader.py:367`
- **Trigger**: Battery dictionary where `NominalChargeCapacity` is `0` and `DesignCapacity` is `3000`.
- **Mechanism**: In Python, `bool(0) == False`. The expression `elif nominal_cap and design_cap and design_cap > 0:` evaluates to `False` because `nominal_cap` is `0`. The branch is bypassed entirely, leaving `health = None`.
- **Impact**: A completely dead or depleted battery (0% health) is falsely reported as unknown battery health (`None`) rather than `0%`.

### 2.5 Vulnerability 5: Unhandled `None` in `resolve_apple_model`
- **Location**: `core/ios_reader.py:228-235`
- **Trigger**: `resolve_apple_model(None)`
- **Mechanism**: Line 233 executes `if product_type.startswith("iPhone"):`. When `product_type` is `None`, Python raises `AttributeError: 'NoneType' object has no attribute 'startswith'`.
- **Impact**: When callers invoke `resolve_apple_model` without a guaranteed non-None string, the application crashes.

---

## 3. Concrete Fix Strategy & Proposed Code Modifications

### Modification 1: `resolve_apple_model` (`core/ios_reader.py:224-236`)

#### Rationale
Add an immediate guard check at function entry: if `product_type` is falsy or not an instance of `str`, safely return `"Apple Device"`.

#### Exact Code Modification
```python
def resolve_apple_model(product_type: Optional[str], mapping_dict: Optional[Dict[str, str]] = None) -> str:
    """
    Maps Apple ProductType (e.g. iPhone17,2) to marketing name (e.g. iPhone 16 Pro Max).
    Gracefully handles unknown or future product types without raising exceptions.
    """
    if not product_type or not isinstance(product_type, str):
        return "Apple Device"
    active_map = mapping_dict if mapping_dict is not None else BUILTIN_APPLE_MODELS
    if product_type in active_map:
        return active_map[product_type]
    # Check if loaded from file
    if product_type.startswith("iPhone"):
        return f"Unknown iPhone ({product_type})"
    return product_type or "Apple Device"
```

---

### Modification 2: `calculate_ios_battery_health` (`core/ios_reader.py:326-373`)

#### Rationale
1. Validate and convert `MaximumCapacityPercent`, `NominalChargeCapacity`, and `DesignCapacity` to `float` within a `try ... except (ValueError, TypeError)` block.
2. Check `if nom is not None and des is not None and des > 0:`. When `nom == 0`, `nom is not None` is `True`, so `(0.0 / des) * 100` correctly evaluates to `0.0`, and `health = 0`.
3. Support string cycle counts by attempting `int(round(float(cycle_count)))` safely, returning `None` if invalid.

#### Exact Code Modification
```python
def calculate_ios_battery_health(battery_data_or_bytes: Any) -> Tuple[Optional[int], Optional[int]]:
    """
    Calculates battery health percentage (0-100) and charge cycles from
    a dictionary or raw XML plist bytes.
    """
    data: Dict[str, Any] = {}
    if isinstance(battery_data_or_bytes, (bytes, bytearray)):
        try:
            parsed = plistlib.loads(battery_data_or_bytes)
            if isinstance(parsed, dict):
                data = parsed
            else:
                return None, None
        except Exception:
            return None, None
    elif isinstance(battery_data_or_bytes, dict):
        data = battery_data_or_bytes
    else:
        return None, None

    def find_key(obj: Any, key: str) -> Optional[Any]:
        if isinstance(obj, dict):
            if key in obj:
                return obj[key]
            for v in obj.values():
                res = find_key(v, key)
                if res is not None:
                    return res
        elif isinstance(obj, list):
            for item in obj:
                res = find_key(item, key)
                if res is not None:
                    return res
        return None

    cycle_count = find_key(data, "CycleCount")
    max_pct = find_key(data, "MaximumCapacityPercent")
    nominal_cap = find_key(data, "NominalChargeCapacity")
    design_cap = find_key(data, "DesignCapacity")

    health: Optional[int] = None
    parsed_max_pct: Optional[float] = None
    if max_pct is not None:
        try:
            parsed_max_pct = float(max_pct)
        except (ValueError, TypeError):
            parsed_max_pct = None

    if parsed_max_pct is not None and 1 <= parsed_max_pct <= 100:
        health = int(round(parsed_max_pct))
    else:
        try:
            nom = float(nominal_cap) if nominal_cap is not None else None
            des = float(design_cap) if design_cap is not None else None
            if nom is not None and des is not None and des > 0:
                calculated = (nom / des) * 100
                health = min(100, max(0, int(round(calculated))))
        except (ValueError, TypeError):
            health = None

    cycles: Optional[int] = None
    if cycle_count is not None:
        try:
            cycles = int(round(float(cycle_count)))
        except (ValueError, TypeError):
            cycles = None

    return health, cycles
```

---

### Modification 3: `parse_ideviceinfo_xml` (`core/ios_reader.py:378-442`)

#### Rationale
1. Immediately following `plist = plistlib.loads(payload)`, add:
   ```python
   if not isinstance(plist, dict):
       logger.debug(f"Expected plist dict root, got {type(plist).__name__}")
       return None
   ```
2. Replace vulnerable `int(raw_storage)` with robust type-aware conversion:
   ```python
   raw_storage = plist.get("TotalDiskCapacity", 0)
   try:
       if isinstance(raw_storage, (int, float)):
           storage_bytes = int(raw_storage)
       elif isinstance(raw_storage, str):
           storage_bytes = int(float(raw_storage.strip()))
       else:
           storage_bytes = 0
   except (ValueError, TypeError, OverflowError):
       storage_bytes = 0
   storage = parse_ios_commercial_storage(storage_bytes)
   ```
3. Use `str(plist.get(...) or "")` to ensure `None` values deserialize to empty string `""` instead of the literal string `"None"`.

#### Exact Code Modification
```python
def parse_ideviceinfo_xml(xml_bytes_or_str: Any) -> Optional[DeviceSpecs]:
    """
    Deserializes output of 'ideviceinfo -x' XML plist into a DeviceSpecs dataclass.
    """
    if isinstance(xml_bytes_or_str, str):
        payload = xml_bytes_or_str.encode("utf-8", errors="replace")
    elif isinstance(xml_bytes_or_str, (bytes, bytearray)):
        payload = bytes(xml_bytes_or_str)
    else:
        return None

    try:
        plist = plistlib.loads(payload)
    except Exception as e:
        logger.debug(f"Failed to parse ideviceinfo XML: {e}")
        return None

    if not isinstance(plist, dict):
        logger.debug(f"Expected plist dict root, got {type(plist).__name__}")
        return None

    models, ram_specs, colors, regions = load_apple_models_data()

    product_type = str(plist.get("ProductType") or "")
    marketing_name = resolve_apple_model(product_type, models)
    ram = ram_specs.get(marketing_name, "")

    raw_storage = plist.get("TotalDiskCapacity", 0)
    try:
        if isinstance(raw_storage, (int, float)):
            storage_bytes = int(raw_storage)
        elif isinstance(raw_storage, str):
            storage_bytes = int(float(raw_storage.strip()))
        else:
            storage_bytes = 0
    except (ValueError, TypeError, OverflowError):
        storage_bytes = 0
    storage = parse_ios_commercial_storage(storage_bytes)

    device_color = str(plist.get("DeviceColor") or "")
    enclosure_color = str(plist.get("DeviceEnclosureColor") or "")
    color = resolve_apple_color(device_color, enclosure_color, colors)

    os_version = f"iOS {plist.get('ProductVersion', '')}".strip()
    serial_number = str(plist.get("SerialNumber") or "")
    udid = str(plist.get("UniqueDeviceID") or "")

    imei1 = str(plist.get("InternationalMobileEquipmentIdentity") or "")
    imei2_val = plist.get("InternationalMobileEquipmentIdentity2")
    imei2 = str(imei2_val) if imei2_val else None

    model_num = plist.get("ModelNumber")
    region_info = plist.get("RegionInfo")
    part_number, _ = parse_apple_part_and_region(model_num, region_info)
    sales_region = decode_apple_region(region_info)

    return DeviceSpecs(
        connection_type="ios",
        device_id=udid or serial_number,
        brand="Apple",
        marketing_name=marketing_name,
        model_code=part_number,
        storage=storage,
        ram=ram,
        color=color,
        os_version=os_version,
        serial_number=serial_number,
        imei1=imei1,
        imei2=imei2,
        battery_health=None,
        battery_cycles=None,
        sales_region=sales_region or None,
        bootloader_locked=True,
        condition_grade="A+",
        remarks="",
        raw_properties=plist
    )
```

---

## 4. Empirical Test Verification

The proposed code modifications were verified in-memory against:
1. `tests/test_ios_reader.py`:
   - `TestAppleProductTypeMapping` (4 tests) -> **PASS**
   - `TestIosCommercialStorage` (3 tests) -> **PASS**
   - `TestIosBatteryHealth` (3 tests) -> **PASS**
   - `TestIosRegionAndColor` (2 tests) -> **PASS**
   - `TestIdeviceinfoXmlParsing` (1 test) -> **PASS**
2. `tests/test_adversarial_m1.py`:
   - `TestAdversarialIosXmlAndPlist` (4 tests, covering malformed syntax, 5 non-dict roots, 7 unexpected storage payloads, and 5MB plists) -> **PASS**
   - `test_ios_battery_health_unusual` (13 battery test cases including 0% health, overprovisioned, 0 design cap) -> **PASS**
   - `test_ios_battery_health_string_capacity_crash` (string capacities `'2500'`, `'3000'`) -> **PASS**
   - `test_resolve_apple_model_robustness` (6 cases) -> **PASS**
   - `test_resolve_apple_model_none_crash` (`product_type=None`) -> **PASS**

### Test Run Output:
```
Ran 21 tests in 0.229s
OK
RESULT: testsRun=21, failures=0, errors=0
```

---

## 5. Summary for Worker

The modifications in `core/ios_reader.py` are strictly non-breaking, backwards-compatible, and eliminate all 10 unhandled exception and logic failures associated with iOS hardware extraction.
Worker can directly apply these 3 function replacements to `core/ios_reader.py`.
