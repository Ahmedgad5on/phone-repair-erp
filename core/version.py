"""
core/version.py — Centralized Versioning & Release Lifecycle Management
Single Source of Truth for ProLab Smart Label Studio & Mobile Trading ERP.

This module governs semantic versioning (Major.Minor.Patch), build timestamps,
release codenames, and the user-facing release changelog.
"""
from datetime import datetime, date
import logging
import os
import re
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

# ==============================================================================
# Single Source of Truth — Version Numbers
# ==============================================================================
VERSION_MAJOR = 4
VERSION_MINOR = 7
VERSION_PATCH = 2

VERSION_TUPLE = (VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH)
APP_VERSION = f"{VERSION_MAJOR}.{VERSION_MINOR}.{VERSION_PATCH}"
BUILD_DATE = "2026-11-19"
BUILD_CODENAME = "Offline-First Enterprise"

APP_NAME = "ThermalLabPro Commercial ERP"
APP_SUBTITLE = "Mobile Trading ERP & 203 DPI Thermal CAD"

# ==============================================================================
# Release Changelog & Update History
# ==============================================================================
RELEASE_HISTORY: List[Dict[str, Any]] = [
    {
        "version": "4.7.2",
        "date": "2026-11-19",
        "codename": "Titanium Enterprise",
        "title": "تحديث جديد لنظام ThermalLabPro",
        "changes": [
            "تحديث جديد يتضمن تحسينات عامة في الأداء، واستقرار قراءة الهواتف، ودعم ميزات التراخيص الحديثة."
        ]
    },
    {
        "version": "4.7.1",
        "date": "2026-11-19",
        "codename": "Titanium Enterprise",
        "title": "تحديث جديد لنظام ThermalLabPro",
        "changes": [
            "إصلاح التفعيل والعمل أوفلاين بالكامل وحل مشكلة الاتصال بالسيرفر للعملاء"
        ]
    },
    {
        "version": "4.7.1",
        "date": "2026-11-19",
        "codename": "Offline-First Enterprise",
        "title": "إصلاح التفعيل والعمل أوفلاين بالكامل وحل مشكلة الاتصال بالسيرفر للعملاء",
        "changes": [
            "حل مشكلة تعذر الاتصال بخادم التراخيص (Connection Refused) لجميع العملاء.",
            "دعم كامل للتسجيل والعمل بدون إنترنت (Offline-First) وحفظ بيانات المحل محلياً.",
            "تفعيل فترة التجربة المجانية 14 يوماً تلقائياً وبدون الحاجة لأي سيرفر.",
            "دعم الاستيراد المباشر لملفات التراخيص المشفرة رقمياً (.prolablic) مع التفعيل الفوري."
        ]
    },
    {
        "version": "4.7.0",
        "date": "2026-11-14",
        "codename": "Titanium Enterprise",
        "title": "المنظومة التجارية الشاملة للتراخيص وإصلاح التعرف اللوني العميق وتحديثات سطح المكتب",
        "changes": [
            "إصلاح نهائي لمشكلة قراءة ألوان أجهزة Apple وتجاوز كود حافة الشاشة السوداء (DeviceColor: 1) لكافة هواتف iPhone الحديثة.",
            "إضافة ميزة الفحص اللوني المعمق (Deep Telemetry Query) لألوان الغلاف الخلفي (Housing & Enclosure Color).",
            "دمج منظومة التراخيص السحابية المشفرة Ed25519 والتحقق الفوري مع وضع القراءة فقط عند انتهاء الاشتراك.",
            "إطلاق تطبيق مدير التراخيص المستقل على سطح المكتب (ThermalLabPro License Manager).",
            "إظهار نسبة بطارية iPhone بدقة على شاشة البرنامج وقوالب الطباعة الحرارية 203 DPI."
        ]
    },
    {
        "version": "4.6.0",
        "date": "2026-11-14",
        "codename": "Apex Precision",
        "title": "نظام التعرف اللوني الذكي ودعم صحة البطارية وترقيم الإصدارات الموحد",
        "changes": [
            "توسيع مكتبة ألوان أجهزة Apple لأكثر من 80 لوناً رسمياً تشمل كافة أجيال iPhone حتى iPhone 16 Pro Max.",
            "معالجة الرموز الرقمية اللونية (#1, #2) ومطابقتها التلقائية للألوان التسويقية.",
            "إضافة خوارزمية التطابق التقريبي اللوني (Euclidean RGB Matching) للتعرف على درجات الهيكس المتفاوتة.",
            "تفعيل ميزة التعلم التلقائي للألوان (TAC-to-Color Learning) من أول 8 أرقام للـ IMEI.",
            "إصلاح إظهار نسبة وصحة البطارية على ملصقات الطباعة الحرارية لكافة أجهزة iPhone.",
            "تحديث قوالب الطباعة القياسية (38x25 مم، 40x30 مم، 60x30 مم) لتشمل عنصر البطارية رسمياً.",
            "تأسيس نظام إدارة وترقيم الإصدارات المركزي (Single Source of Truth) وسجل التحديثات التفاعلي."
        ]
    },
    {
        "version": "4.5.0",
        "date": "2026-11-14",
        "codename": "Enterprise Shield",
        "title": "حزمة معالجة التدقيق الشامل واستقرار المخزن المالي والرقابي",
        "changes": [
            "معالجة كافة الملاحظات الرقابية والمحاسبية (TASK-001 إلى TASK-015).",
            "نظام شفرة التكلفة السرية (10-Letter Secret Cost Cipher) المشفرة تلقائياً.",
            "طابور المزامنة التلقائية مع تيليجرام دون اتصال بالإنترنت (Offline Telegram Queue).",
            "نظام حماية العمليات وتأكيد الحذف بصلاحيات المالك (Owner PIN Protection).",
            "إدارة الخزائن المتعددة ومزامنة أرصدة الصناديق بدقة.",
            "تأمين واجتياز 861 اختباراً آلياً بنسبة نجاح 100%."
        ]
    },
    {
        "version": "4.0.0",
        "date": "2026-11-07",
        "codename": "Thermal Foundation",
        "title": "استوديو الملصقات الحرارية CAD بدقة 203 DPI ونقاط البيع",
        "changes": [
            "محرك الرندر المباشر بدقة 203 DPI وتوليد باركود Code128 و QR Codes.",
            "التعرف اللحظي التلقائي على أجهزة Android و iOS عبر الـ USB.",
            "نظام إدارة المخزن وجرد الهواتف وإصدار فواتير المبيعات والميمو.",
            "واجهة مستخدم احترافية باللون الأسود الملكي والذهبي (Obsidian & Gold Theme)."
        ]
    }
]


# ==============================================================================
# Helper Accessor Functions
# ==============================================================================

def get_version() -> str:
    """Returns standard semantic version string: e.g. '4.6.0'."""
    return APP_VERSION


def get_version_display() -> str:
    """Returns display version string: e.g. 'v4.6.0'."""
    return f"v{APP_VERSION}"


def get_build_date() -> str:
    """Returns application build release date: e.g. '2026-11-14'."""
    return BUILD_DATE


def get_full_version() -> str:
    """Returns full version with build stamp: e.g. 'v4.6.0 (Build 2026.11.14)'."""
    clean_date = BUILD_DATE.replace("-", ".")
    return f"v{APP_VERSION} (Build {clean_date})"


def get_window_title() -> str:
    """Returns official formatted application window title."""
    return f"ThermalLabPro Commercial ERP — v{APP_VERSION} (203 DPI Thermal CAD)"


def get_changelog() -> List[Dict[str, Any]]:
    """Returns chronological list of releases and change notes."""
    return list(RELEASE_HISTORY)


def bump_version(level: str = "patch", notes: Optional[List[str]] = None, codename: Optional[str] = None) -> str:
    """
    Programmatically bumps the application version and updates core/version.py.
    level: 'patch' (4.6.0 -> 4.6.1), 'minor' (4.6.0 -> 4.7.0), 'major' (4.6.0 -> 5.0.0).
    """
    global VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH, APP_VERSION, BUILD_DATE

    new_major = VERSION_MAJOR
    new_minor = VERSION_MINOR
    new_patch = VERSION_PATCH

    lvl = level.lower().strip()
    if lvl == "major":
        new_major += 1
        new_minor = 0
        new_patch = 0
    elif lvl == "minor":
        new_minor += 1
        new_patch = 0
    else:  # patch
        new_patch += 1

    new_version_str = f"{new_major}.{new_minor}.{new_patch}"
    new_build_date = datetime.now().strftime("%Y-%m-%d")

    file_path = os.path.abspath(__file__)
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Update constants
        content = re.sub(r'VERSION_MAJOR\s*=\s*\d+', f'VERSION_MAJOR = {new_major}', content)
        content = re.sub(r'VERSION_MINOR\s*=\s*\d+', f'VERSION_MINOR = {new_minor}', content)
        content = re.sub(r'VERSION_PATCH\s*=\s*\d+', f'VERSION_PATCH = {new_patch}', content)
        content = re.sub(r'BUILD_DATE\s*=\s*"[^"]+"', f'BUILD_DATE = "2026-11-19"', content)
        if codename:
            content = re.sub(r'BUILD_CODENAME\s*=\s*"[^"]+"', f'BUILD_CODENAME = "{codename}"', content)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        logger.info("Successfully bumped version to %s (Build %s)", new_version_str, new_build_date)
        return new_version_str
    except Exception as e:
        logger.error("Failed to bump version in %s: %s", file_path, e)
        return APP_VERSION


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1].lower() in ("bump", "patch", "minor", "major"):
        bump_type = sys.argv[2] if len(sys.argv) > 2 else sys.argv[1]
        if bump_type not in ("patch", "minor", "major"):
            bump_type = "patch"
        res = bump_version(bump_type)
        print(f"Bumped version to: {res}")
    else:
        print(f"Current version: {get_full_version()}")
        print(f"Window title: {get_window_title()}")
