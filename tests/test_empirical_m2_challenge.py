"""
Milestone M2 Empirical Challenge Suite.
Adversarially stress-tests edge cases and failure modes for:
1. validate_luhn / validate_luhn_imei
2. ensure_keypair_exists / ensure_adb_keypair_exists
3. decode_samsung_product_code
4. parse_imei_from_service_call & Dual-SIM parcel parsing
"""
import os
from pathlib import Path
import random
import shutil
import tempfile
from typing import Optional
import unittest

from core.adb_reader import (
    validate_luhn,
    validate_luhn_imei,
    decode_samsung_product_code,
    parse_imei_from_service_call,
    extract_imei_from_properties,
)
from core.paths import (
    ensure_keypair_exists,
    ensure_adb_keypair_exists,
    setup_adb_environment,
    get_adb_keys_dir,
)


class TestLuhnValidationEmpirical(unittest.TestCase):
    """Challenge 1: validate_luhn edge cases."""

    def test_valid_15_digit_imeis(self):
        valid_imeis = [
            "358901234567896",
            "351782110293840",
            "358901230192830",
            "864284040182748",
            "990000862471853",
            "012345678901237",
        ]
        for imei in valid_imeis:
            with self.subTest(imei=imei):
                self.assertTrue(validate_luhn(imei))
                self.assertTrue(validate_luhn_imei(imei))

    def test_invalid_check_digits(self):
        # Same first 14 digits as above, but with corrupted 15th digit
        invalid_imeis = [
            "358901234567895",  # should be 6
            "358901234567890",
            "351782110293849",  # should be 0
            "358901230192839",  # should be 0
            "864284040182741",  # should be 8
            "990000862471854",  # should be 3
        ]
        for imei in invalid_imeis:
            with self.subTest(imei=imei):
                self.assertFalse(validate_luhn(imei))
                self.assertFalse(validate_luhn_imei(imei))

    def test_all_zeros(self):
        self.assertFalse(validate_luhn("000000000000000"))
        self.assertFalse(validate_luhn("00000000000000"))    # 14 zeros
        self.assertFalse(validate_luhn("0000000000000000"))  # 16 zeros

    def test_lengths_other_than_15(self):
        self.assertFalse(validate_luhn("35178211029384"))      # 14 digits
        self.assertFalse(validate_luhn("3517821102938"))       # 13 digits
        self.assertFalse(validate_luhn("3517821102938466"))    # 16 digits
        self.assertFalse(validate_luhn("35178211029384661"))   # 17 digits
        self.assertFalse(validate_luhn("3"))                   # 1 digit
        self.assertFalse(validate_luhn(""))                    # empty

    def test_non_digit_characters(self):
        self.assertFalse(validate_luhn("abcdefghijklmno"))
        self.assertFalse(validate_luhn("35178211029384A"))    # 14 digits + 1 letter -> 14 digits
        self.assertFalse(validate_luhn("!@#$%^&*()_+=-~"))
        self.assertFalse(validate_luhn("   "))

    def test_none_and_non_string_types(self):
        self.assertFalse(validate_luhn(None))
        self.assertFalse(validate_luhn(123456789012345))      # int
        self.assertFalse(validate_luhn(["358901234567896"]))  # list
        self.assertFalse(validate_luhn({"imei": "358901234567896"}))  # dict

    def test_randomized_oracle_1000_pairs(self):
        random.seed(1337)
        for _ in range(1000):
            first14 = "".join(str(random.randint(0, 9)) for _ in range(14))
            if first14 == "0" * 14:
                continue
            s = 0
            for i in range(14):
                d = int(first14[i])
                if i % 2 == 1:
                    d *= 2
                    if d > 9:
                        d -= 9
                s += d
            valid_cd = (10 - (s % 10)) % 10
            valid_imei = first14 + str(valid_cd)
            invalid_cd = (valid_cd + random.randint(1, 9)) % 10
            invalid_imei = first14 + str(invalid_cd)

            self.assertTrue(validate_luhn(valid_imei), f"Expected True for {valid_imei}")
            self.assertFalse(validate_luhn(invalid_imei), f"Expected False for {invalid_imei}")


class TestEnsureKeypairExistsEmpirical(unittest.TestCase):
    """Challenge 2: ensure_keypair_exists edge cases."""

    def setUp(self):
        self.test_dir = Path(tempfile.mkdtemp(prefix="lab_test_adb_vault_"))

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_key_generation_when_empty(self):
        priv, pub = ensure_keypair_exists(self.test_dir)
        self.assertTrue(priv.exists())
        self.assertTrue(pub.exists())
        self.assertGreater(priv.stat().st_size, 0)
        self.assertGreater(pub.stat().st_size, 0)
        pub_text = pub.read_text(encoding="utf-8")
        self.assertIn("adbkey.pub", pub_text)

    def test_alias_equivalence(self):
        priv1, pub1 = ensure_adb_keypair_exists(self.test_dir)
        self.assertTrue(priv1.exists())
        self.assertTrue(pub1.exists())

    def test_key_preservation_when_keys_already_exist(self):
        priv_path = self.test_dir / "adbkey"
        pub_path = self.test_dir / "adbkey.pub"
        custom_priv = "-----BEGIN RSA PRIVATE KEY-----\nMIIEogIBAAKCAQEAzCustomBitExactKey123\n-----END RSA PRIVATE KEY-----\n"
        custom_pub = "adbkey.pub custom_public_key_bits_preserved smartlabeler@lab\n"

        priv_path.write_text(custom_priv, encoding="utf-8")
        pub_path.write_text(custom_pub, encoding="utf-8")

        # Invoke function
        ret_priv, ret_pub = ensure_keypair_exists(self.test_dir)

        # Check that existing keys were NOT overwritten or re-generated
        self.assertEqual(ret_priv.read_text(encoding="utf-8"), custom_priv)
        self.assertEqual(ret_pub.read_text(encoding="utf-8"), custom_pub)

    def test_corrupted_zero_byte_key_regeneration(self):
        priv_path = self.test_dir / "adbkey"
        pub_path = self.test_dir / "adbkey.pub"

        # Create 0-byte corrupted files
        priv_path.write_text("", encoding="utf-8")
        pub_path.write_text("", encoding="utf-8")
        self.assertEqual(priv_path.stat().st_size, 0)
        self.assertEqual(pub_path.stat().st_size, 0)

        # Function should detect corruption and regenerate
        ret_priv, ret_pub = ensure_keypair_exists(self.test_dir)
        self.assertGreater(ret_priv.stat().st_size, 0)
        self.assertGreater(ret_pub.stat().st_size, 0)

    def test_single_zero_byte_key_corruption(self):
        priv_path = self.test_dir / "adbkey"
        pub_path = self.test_dir / "adbkey.pub"

        # Valid priv, corrupted 0-byte pub
        priv_path.write_text("VALID_PRIV_DATA_123", encoding="utf-8")
        pub_path.write_text("", encoding="utf-8")

        ret_priv, ret_pub = ensure_keypair_exists(self.test_dir)
        self.assertGreater(ret_priv.stat().st_size, 0)
        self.assertGreater(ret_pub.stat().st_size, 0)

    def test_nested_nonexistent_directory_creation(self):
        nested_dir = self.test_dir / "deep" / "nested" / "adb_keys"
        self.assertFalse(nested_dir.exists())

        priv, pub = ensure_keypair_exists(nested_dir)
        self.assertTrue(nested_dir.exists())
        self.assertTrue(priv.exists())
        self.assertTrue(pub.exists())


class TestDecodeSamsungProductCodeEmpirical(unittest.TestCase):
    """Challenge 3: decode_samsung_product_code edge cases."""

    def test_direct_product_codes(self):
        cases = {
            "SM-S928BZKG": "Black",
            "SM-S928BZKA": "Black",
            "SM-S928BZWG": "White",
            "SM-S928BZWA": "White",
            "SM-S918BZGA": "Green",
            "SM-S918BZVA": "Violet",
            "SM-S918BZBA": "Blue",
            "SM-S918BZDA": "Gold",
            "SM-S928BZTA": "Titanium Gray",
            "SM-S928BZSA": "Silver",
            "SM-S928BZOA": "Orange",
        }
        for code, expected in cases.items():
            with self.subTest(code=code):
                self.assertEqual(decode_samsung_product_code(code), expected)

    def test_carrier_skus_with_csc(self):
        # 3-letter CSC suffixes like EUE, EUX, MID, TPA, TUR, KSA
        cases = {
            "SM-S928BZKGEUE": "Black",
            "SM-S928BZKGEUX": "Black",
            "SM-S928BZWGEUE": "White",
            "SM-S918BZGAEUE": "Green",
            "SM-S918BZVAEUE": "Violet",
            "SM-S918BZBAEUE": "Blue",
            "SM-S918BZDAEUE": "Gold",
            "SM-S928BZTGEUE": "Titanium Gray",
            "SM-S928BZKGMID": "Black",
            "SM-S928BZWGTPA": "White",
        }
        for code, expected in cases.items():
            with self.subTest(code=code):
                self.assertEqual(decode_samsung_product_code(code), expected)

    def test_case_insensitivity(self):
        self.assertEqual(decode_samsung_product_code("sm-s928bzkgeue"), "Black")
        self.assertEqual(decode_samsung_product_code("sm-s928bzkg"), "Black")
        self.assertEqual(decode_samsung_product_code("Sm-S928BzWgEuE"), "White")

    def test_unknown_codes_return_none(self):
        unknowns = [
            "SM-S928B",
            "SM-G998B",
            "UNKNOWN_CODE_XYZ",
            "SM-S928BXXXEUE",
            "NOT_A_SAMSUNG_CODE",
        ]
        for code in unknowns:
            with self.subTest(code=code):
                self.assertIsNone(decode_samsung_product_code(code))

    def test_empty_none_and_invalid_types(self):
        self.assertIsNone(decode_samsung_product_code(None))
        self.assertIsNone(decode_samsung_product_code(""))
        self.assertIsNone(decode_samsung_product_code("   "))
        self.assertIsNone(decode_samsung_product_code(12345))
        self.assertIsNone(decode_samsung_product_code(["SM-S928BZKG"]))


class TestParcelParsingEmpirical(unittest.TestCase):
    """Challenge 4: Parcel parsing edge cases and dual-sim tokens."""

    def test_strategy_a_quoted_dump(self):
        parcel = (
            "Result: Parcel(\n"
            "  0x00000000: 00000000 0000000f 00350033 00390038 '........3.5.8.9.'\n"
            "  0x00000010: 00310030 00330032 00350034 00370036 '0.1.2.3.4.5.6.7.'\n"
            "  0x00000020: 00060039 00000038                   '8.9.6...        ')\n"
        )
        imei = parse_imei_from_service_call(parcel)
        self.assertEqual(imei, "358901234567896")
        self.assertTrue(validate_luhn(imei))

    def test_strategy_b_hex_word_unpacking_without_ascii(self):
        # Hex-only dump where quoted ASCII region is absent or obscured
        # 358901234567896 unpacked UTF-16 code units in 32-bit hex words:
        # Word 0: 00000000 (status)
        # Word 1: 0000000f (length 15)
        # Word 2: 00350033 ('3', '5')
        # Word 3: 00390038 ('8', '9')
        # Word 4: 00310030 ('0', '1')
        # Word 5: 00330032 ('2', '3')
        # Word 6: 00350034 ('4', '5')
        # Word 7: 00370036 ('6', '7')
        # Word 8: 00390038 ('8', '9')
        # Word 9: 00000036 ('6', '\0')
        parcel = (
            "Result: Parcel(\n"
            "  0x00000000: 00000000 0000000f 00350033 00390038\n"
            "  0x00000010: 00310030 00330032 00350034 00370036\n"
            "  0x00000020: 00390038 00000036\n"
            ")\n"
        )
        imei = parse_imei_from_service_call(parcel)
        self.assertEqual(imei, "358901234567896")
        self.assertTrue(validate_luhn(imei))

    def test_empty_and_none_parcels(self):
        self.assertIsNone(parse_imei_from_service_call(None))
        self.assertIsNone(parse_imei_from_service_call(""))
        self.assertIsNone(parse_imei_from_service_call("   \n\t"))

    def test_malformed_and_error_parcels(self):
        malformed = [
            "Can't find service: iphonesubinfo",
            "Result: Parcel()",
            "Result: Parcel( 0x00000000: 00000000 )",
            "Segmentation fault",
            "Permission Denial: can't read phone state",
            "0x00000000: not_hex_words_here",
            "\x00\x01\xfe\xff\xba\xbe",
        ]
        for p in malformed:
            with self.subTest(parcel=p):
                self.assertIsNone(parse_imei_from_service_call(p))

    def test_all_zeros_parcel_rejected(self):
        parcel = (
            "Result: Parcel(\n"
            "  0x00000000: 00000000 0000000f 00300030 00300030 '........0.0.0.0.'\n"
            "  0x00000010: 00300030 00300030 00300030 00300030 '0.0.0.0.0.0.0.0.'\n"
            "  0x00000020: 00300030 00000030                   '0.0.0...        ')\n"
        )
        self.assertIsNone(parse_imei_from_service_call(parcel))

    def test_dual_sim_imei_extraction_and_deduplication(self):
        # SIM 1 parcel (valid IMEI 1)
        parcel_sim1 = (
            "Result: Parcel(\n"
            "  0x00000000: 00000000 0000000f 00350033 00390038 '........3.5.8.9.'\n"
            "  0x00000010: 00310030 00330032 00350034 00370036 '0.1.2.3.4.5.6.7.'\n"
            "  0x00000020: 00060039 00000038                   '8.9.6...        ')\n"
        )
        # SIM 2 parcel (valid IMEI 2: 351782110293840)
        parcel_sim2 = (
            "Result: Parcel(\n"
            "  0x00000000: 00000000 0000000f 00310033 00370035 '........3.5.1.7.'\n"
            "  0x00000010: 00320038 00310031 00320030 00330039 '8.2.1.1.0.2.9.3.'\n"
            "  0x00000020: 00300034 00000038                   '8.4.0...        ')\n"
        )
        imei1 = parse_imei_from_service_call(parcel_sim1)
        imei2 = parse_imei_from_service_call(parcel_sim2)

        self.assertEqual(imei1, "358901234567896")
        self.assertEqual(imei2, "351782110293840")
        self.assertNotEqual(imei1, imei2)
        self.assertTrue(validate_luhn(imei1))
        self.assertTrue(validate_luhn(imei2))

    def test_oem_properties_dual_sim_deduplication(self):
        props = {
            "ro.ril.oem.imei": "358901234567896, 351782110293840",
            "ril.IMEI": "358901234567896",
        }
        imei1, imei2 = extract_imei_from_properties(props)
        self.assertEqual(imei1, "358901234567896")
        self.assertEqual(imei2, "351782110293840")


if __name__ == "__main__":
    unittest.main()
