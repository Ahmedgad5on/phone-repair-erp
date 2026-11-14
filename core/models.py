"""
core/models.py — Strongly typed domain models for Mobile Phone Trading Store ERP.
Strictly trading focused: Owner (صاحب المحل) and Salesperson (موظف المبيعات).
"""
from dataclasses import dataclass, field, asdict
import json
from typing import Optional, Dict, Any, List


class UserRole:
    OWNER = "Owner"
    SALESPERSON = "Salesperson"
    OWNER_AR = "صاحب المحل"
    SALESPERSON_AR = "موظف المبيعات"


@dataclass
class DeviceSpecs:
    """
    Normalized hardware telemetry profile extracted from connected Android/iOS devices
    or simulated via Mock engine.
    """
    connection_type: str  # "adb", "fastboot", "ios", "none", "mock"
    device_id: str        # Serial or UDID
    brand: str
    marketing_name: str
    model_code: str
    storage: str          # e.g. "128GB", "256GB"
    ram: str              # e.g. "8GB", "12GB"
    color: str
    os_version: str
    serial_number: str
    imei1: str
    imei2: Optional[str] = None
    ecid: Optional[str] = None
    battery_health: Optional[int] = None  # Percentage 0-100
    battery_cycles: Optional[int] = None
    sales_region: Optional[str] = None    # e.g. "LL/A"
    bootloader_locked: Optional[bool] = None
    condition_grade: str = "A+"
    remarks: str = ""
    raw_properties: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert dataclass to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DeviceSpecs":
        """Instantiate DeviceSpecs from a dictionary, safely ignoring unknown keys."""
        valid_keys = cls.__dataclass_fields__.keys()
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)

    @classmethod
    def empty(cls) -> "DeviceSpecs":
        """Factory for a blank/disconnected state."""
        return cls(
            connection_type="none",
            device_id="",
            brand="",
            marketing_name="",
            model_code="",
            storage="",
            ram="",
            color="",
            os_version="",
            serial_number="",
            imei1="",
            imei2=None,
            ecid=None,
            battery_health=None,
            battery_cycles=None,
            sales_region=None,
            bootloader_locked=None,
            condition_grade="A+",
            remarks="",
            raw_properties={}
        )

    def to_json(self) -> str:
        """Serializes DeviceSpecs to JSON string."""
        return json.dumps(self.to_dict(), ensure_ascii=False)

    @classmethod
    def from_json(cls, json_str: str) -> "DeviceSpecs":
        """Deserializes DeviceSpecs from JSON string."""
        return cls.from_dict(json.loads(json_str))

    @property
    def is_apple(self) -> bool:
        """Returns True if this device is an Apple / iOS hardware profile."""
        if self.connection_type == "ios":
            return True
        brand_l = (self.brand or "").lower()
        model_l = (self.marketing_name or "").lower()
        os_l = (self.os_version or "").lower()
        return ("apple" in brand_l) or ("iphone" in model_l) or ("ipad" in model_l) or ("ios" in os_l)


@dataclass
class DeviceRecord:
    """Commercial trading inventory item for new and used smartphones."""
    id: Optional[int] = None
    stock_no: str = ""
    condition: str = "Used"  # "New" (جديد متبرشم) vs "Used" (مستعمل / كسر زيرو)
    brand: str = ""          # Apple, Samsung, Xiaomi, Oppo, Realme, Vivo, Honor, Huawei, Google Pixel, Other
    model_name: str = ""
    model_code: str = ""
    storage: str = ""
    ram: str = ""
    color: str = ""
    serial_number: str = ""
    imei1: str = ""
    imei2: Optional[str] = ""
    ecid: Optional[str] = ""
    os_version: str = ""
    sales_region: str = ""
    battery_health: Optional[int] = None
    battery_cycles: Optional[int] = None
    warranty_status: str = "ساري"
    tax_status: str = "ضمان محلي / مسدد الضريبة"  # ضمان محلي / مسدد الضريبة | دولي بدون ضريبة | شريحتين / eSIM
    ownership: str = "ملك المحل"                  # ملك المحل | بضاعة أمانة | خارج للعرض عند تاجر
    buy_price: float = 0.0
    prep_cost: float = 0.0
    target_selling_price: float = 0.0
    min_allowed_price: float = 0.0
    secret_cost_cipher: str = ""
    status: str = "in_stock"                      # in_stock, sold, on_memo, trade_in, returned
    intake_date: str = ""
    seller_name: str = ""
    seller_phone: str = ""
    seller_id_photo: Optional[str] = ""
    trader_id: Optional[int] = None
    remarks: str = ""
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DeviceRecord":
        valid_keys = cls.__dataclass_fields__.keys()
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)


@dataclass
class SaleRecord:
    """POS transaction record with multi-wallet payment and trade-in support."""
    id: Optional[int] = None
    invoice_no: str = ""
    sale_date: str = ""
    device_id: int = 0
    salesperson: str = ""
    customer_name: str = ""
    customer_phone: str = ""
    selling_price: float = 0.0
    discount: float = 0.0
    final_price: float = 0.0
    payment_method: str = "Cash"  # Cash, InstaPay, Vodafone Cash, Other E-Wallets, Trader Credit, Split
    cash_amount: float = 0.0
    instapay_amount: float = 0.0
    vodafone_cash_amount: float = 0.0
    other_wallet_amount: float = 0.0
    trader_credit_amount: float = 0.0
    instapay_ref: Optional[str] = ""
    proof_photo: Optional[str] = ""
    trade_in_device_id: Optional[int] = None
    trade_in_allowance: float = 0.0
    net_collected: float = 0.0
    status: str = "completed"     # completed, voided
    notes: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SaleRecord":
        valid_keys = cls.__dataclass_fields__.keys()
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)


@dataclass
class TraderRecord:
    """Trader / B2B Dealer credit and inventory account."""
    id: Optional[int] = None
    name: str = ""
    phone: str = ""
    company: str = ""
    net_balance: float = 0.0  # Positive: له (we owe), Negative: عليه (he owes)
    notes: str = ""
    created_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TraderRecord":
        valid_keys = cls.__dataclass_fields__.keys()
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)


@dataclass
class TraderLedgerEntry:
    """Double-entry transaction ledger for traders."""
    id: Optional[int] = None
    trader_id: int = 0
    trans_date: str = ""
    trans_type: str = ""  # شراء آجل, بيع آجل, دفعة مقبوضة, دفعة مدفوعة, بضاعة أمانة, تسوية
    amount: float = 0.0
    device_id: Optional[int] = None
    reference_no: Optional[str] = ""
    payment_method: Optional[str] = ""
    notes: str = ""
    balance_after: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TraderLedgerEntry":
        valid_keys = cls.__dataclass_fields__.keys()
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)


@dataclass
class MemoRecord:
    """Item lent out to another trader for exhibition or customer demo."""
    id: Optional[int] = None
    trader_id: int = 0
    device_id: int = 0
    out_date: str = ""
    expected_return_date: str = ""
    returned_date: Optional[str] = ""
    status: str = "active"  # active, returned, converted_to_sale
    notes: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MemoRecord":
        valid_keys = cls.__dataclass_fields__.keys()
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)


@dataclass
class SecurityAuditLog:
    """Immutable security audit trail."""
    id: Optional[int] = None
    timestamp: str = ""
    user_role: str = ""   # Owner, Salesperson
    user_name: str = ""
    action_type: str = "" # price_edit, sale_void, trader_balance_change, label_reprint, etc.
    device_imei: Optional[str] = ""
    old_value: Optional[str] = ""
    new_value: Optional[str] = ""
    details: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SecurityAuditLog":
        valid_keys = cls.__dataclass_fields__.keys()
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)


@dataclass
class RepairTicket:
    """Legacy compatibility dataclass for label rendering utilities."""
    ticket_id: str = ""
    customer_name: str = ""
    customer_phone: str = ""
    device_model: str = ""
    reported_fault: str = ""
    passcode: str = ""
    sim_removed: bool = True
    back_cracked: bool = False
    dead_device: bool = False
    estimated_cost: float = 0.0
    intake_datetime: str = ""

