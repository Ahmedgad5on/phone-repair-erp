"""
scripts/publish_release.py — Fully-Automated Desktop-to-Cloud Release Publisher
Seamlessly compiles, bundles, updates version metadata, updates the website,
and deploys to GitHub Pages & GitHub CDN to trigger live client auto-updates.
"""
import os
import re
import sys
import json
import time
import shutil
import hashlib
import argparse
import subprocess
from pathlib import Path
from datetime import datetime, date

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
ISCC_PATH = Path(r"C:\Users\Eng_Ahmed\AppData\Local\Programs\Inno Setup 6\ISCC.exe")


def get_current_version() -> str:
    from core.version import APP_VERSION
    return APP_VERSION


def bump_patch_version(ver: str) -> str:
    parts = ver.split(".")
    if len(parts) >= 3:
        parts[-1] = str(int(parts[-1]) + 1)
        return ".".join(parts)
    return f"{ver}.1"


def compute_sha256(filepath: Path) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def update_core_version_file(new_ver: str, notes: str):
    ver_file = REPO_ROOT / "core" / "version.py"
    content = ver_file.read_text(encoding="utf-8")
    parts = list(map(int, new_ver.split(".")))
    
    content = re.sub(r"VERSION_MAJOR = \d+", f"VERSION_MAJOR = {parts[0]}", content)
    content = re.sub(r"VERSION_MINOR = \d+", f"VERSION_MINOR = {parts[1]}", content)
    content = re.sub(r"VERSION_PATCH = \d+", f"VERSION_PATCH = {parts[2]}", content)
    today = date.today().isoformat()
    content = re.sub(r'BUILD_DATE = "[^"]+"', f'BUILD_DATE = "{today}"', content)
    
    # Prepend to release history
    entry = f"""    {{
        "version": "{new_ver}",
        "date": "{today}",
        "codename": "Titanium Enterprise",
        "title": "تحديث جديد لنظام ThermalLabPro",
        "changes": [
            "{notes}"
        ]
    }},"""
    content = content.replace("RELEASE_HISTORY: List[Dict[str, Any]] = [", f"RELEASE_HISTORY: List[Dict[str, Any]] = [\n{entry}")
    ver_file.write_text(content, encoding="utf-8")
    print(f"[*] Updated core/version.py to v{new_ver}")


def update_installer_iss(new_ver: str):
    iss_file = REPO_ROOT / "installer.iss"
    content = iss_file.read_text(encoding="utf-8")
    content = re.sub(r'#define MyAppVersion "[^"]+"', f'#define MyAppVersion "{new_ver}"', content)
    content = re.sub(r'OutputBaseFilename=ThermalLabPro_Setup_v[^\s]+', f'OutputBaseFilename=ThermalLabPro_Setup_v{new_ver}', content)
    iss_file.write_text(content, encoding="utf-8")
    print(f"[*] Updated installer.iss to v{new_ver}")


def compile_inno_setup(new_ver: str, rebuild_pyinstaller: bool = True) -> Path:
    if rebuild_pyinstaller:
        print("[*] Rebuilding PyInstaller standalone executable with latest Python code...")
        # Terminate any running instances before building/copying
        try:
            subprocess.run(["taskkill", "/F", "/IM", "ThermalLabPro.exe"], capture_output=True)
            time.sleep(1)
        except Exception:
            pass

        res_py = subprocess.run(["pyinstaller", "--noconfirm", "app.spec"], cwd=str(REPO_ROOT), capture_output=True, text=True)
        if res_py.returncode != 0:
            print(f"[ERROR] PyInstaller compilation failed:\n{res_py.stderr}")
            sys.exit(1)
        src_exe = REPO_ROOT / "dist" / "ThermalLabPro.exe"
        if src_exe.exists():
            (REPO_ROOT / "dist_installer").mkdir(exist_ok=True)
            shutil.copy2(src_exe, REPO_ROOT / "dist_installer" / "ThermalLabPro.exe")
            desktop_exe = Path(os.environ.get("USERPROFILE", "")) / "Desktop" / "ThermalLabPro.exe"
            if desktop_exe.parent.exists():
                try:
                    shutil.copy2(src_exe, desktop_exe)
                    print(f"[✔] Updated desktop executable at: {desktop_exe}")
                except Exception as e:
                    print(f"[!] Warning updating desktop exe: {e}")
            print("[✔] PyInstaller build completed and copied to dist_installer/ThermalLabPro.exe")

    print(f"[*] Compiling Inno Setup package for v{new_ver}...")
    if not ISCC_PATH.exists():
        raise FileNotFoundError(f"Inno Setup Compiler not found at {ISCC_PATH}")
    
    res = subprocess.run([str(ISCC_PATH), "installer.iss"], cwd=str(REPO_ROOT), capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[ERROR] Inno Setup compilation failed:\n{res.stderr}")
        sys.exit(1)
        
    out_file = REPO_ROOT / "dist_installer" / f"ThermalLabPro_Setup_v{new_ver}.exe"
    if not out_file.exists():
        candidates = list((REPO_ROOT / "dist_installer").glob(f"*{new_ver}*.exe"))
        if candidates:
            out_file = candidates[0]
        else:
            raise FileNotFoundError(f"Expected compiled installer at {out_file}")
            
    print(f"[✔] Compiled installer created: {out_file.name} ({out_file.stat().st_size / (1024*1024):.1f} MB)")
    return out_file


def update_server_database(new_ver: str, installer_path: Path, notes: str):
    import secrets
    from datetime import datetime, timezone
    from server.security import Ed25519LicensingEngine
    import sqlite3

    server_db_path = REPO_ROOT / "server_data" / "licensing.db"
    if not server_db_path.exists():
        print("[!] server_data/licensing.db not found, skipping local server DB update.")
        return

    sha256_hash = compute_sha256(installer_path)
    size_bytes = installer_path.stat().st_size
    filename = installer_path.name
    now_iso = datetime.now(timezone.utc).isoformat()

    manifest_data = {
        "version": new_ver,
        "channel": "stable",
        "package_sha256": sha256_hash,
        "published_at_utc": now_iso
    }
    try:
        manifest_signature = Ed25519LicensingEngine.sign_payload(manifest_data)
    except Exception as e:
        print(f"[!] Warning: failed to sign with Ed25519: {e}")
        manifest_signature = ""

    # Copy installer to server_data/releases/
    server_releases_dir = REPO_ROOT / "server_data" / "releases"
    server_releases_dir.mkdir(parents=True, exist_ok=True)
    target_server_pkg = server_releases_dir / filename
    try:
        shutil.copy2(installer_path, target_server_pkg)
    except Exception as e:
        print(f"[!] Warning copying installer to server_data/releases: {e}")

    conn = sqlite3.connect(str(server_db_path))
    cur = conn.cursor()
    release_id = f"REL-{secrets.token_hex(4).upper()}"
    cur.execute("""
        INSERT OR REPLACE INTO server_software_releases (
            release_id, version, channel, min_supported_version, is_mandatory,
            is_active, package_filename, package_size_bytes, package_sha256,
            manifest_signature, release_notes, created_at, published_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?);
    """, (
        release_id, new_ver, "stable", "4.0.0",
        0, filename, size_bytes, sha256_hash,
        manifest_signature, notes, now_iso, now_iso
    ))

    cur.execute("""
        UPDATE server_system_settings
        SET value = ?, updated_at = ?
        WHERE key = 'latest_stable_version';
    """, (new_ver, now_iso))

    conn.commit()
    conn.close()
    print(f"[✔] Updated server_data/licensing.db: release v{new_ver} registered & latest_stable_version updated.")


def relaunch_desktop_app():
    desktop_exe = Path(os.environ.get("USERPROFILE", "")) / "Desktop" / "ThermalLabPro.exe"
    if desktop_exe.exists():
        print(f"[*] Relaunching updated desktop app from {desktop_exe}...")
        try:
            subprocess.Popen([str(desktop_exe)], cwd=str(desktop_exe.parent))
            print("[✔] Desktop application launched successfully!")
        except Exception as e:
            print(f"[!] Warning launching desktop app: {e}")


def update_website_and_manifest(new_ver: str, installer_path: Path, notes: str):
    downloads_dir = REPO_ROOT / "docs" / "downloads"
    downloads_dir.mkdir(parents=True, exist_ok=True)
    target_installer = downloads_dir / installer_path.name
    shutil.copy2(installer_path, target_installer)
    print(f"[*] Copied installer to docs/downloads/{target_installer.name}")

    sha256 = compute_sha256(target_installer)
    cdn_url = f"https://media.githubusercontent.com/media/Ahmedgad5on/phone-repair-erp/main/docs/downloads/{target_installer.name}"
    
    # 1. Update version.json
    manifest_file = REPO_ROOT / "docs" / "version.json"
    manifest_data = {
        "latest_version": new_ver,
        "is_mandatory": False,
        "download_url": cdn_url,
        "release_notes": notes,
        "sha256": sha256,
        "published_at": date.today().isoformat()
    }
    manifest_file.write_text(json.dumps(manifest_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[✔] Updated docs/version.json with live URL & SHA-256")

    # 2. Update index.html
    index_file = REPO_ROOT / "docs" / "index.html"
    index_content = index_file.read_text(encoding="utf-8")
    index_content = re.sub(r'const DIRECT_DOWNLOAD_URL = "[^"]+";', f'const DIRECT_DOWNLOAD_URL = "{cdn_url}";', index_content)
    index_content = re.sub(r'href="https://media.githubusercontent.com/[^"]+"', f'href="{cdn_url}"', index_content)
    index_content = re.sub(r'الإصدار التجاري v[0-9\.]+', f'الإصدار التجاري v{new_ver}', index_content)
    index_file.write_text(index_content, encoding="utf-8")
    print(f"[✔] Updated docs/index.html references")


def deploy_to_cloud(new_ver: str):
    print(f"[*] Committing and pushing release v{new_ver} to GitHub & GitHub Pages...")
    git_add = subprocess.run(["git", "add", ".gitattributes", "core/version.py", "installer.iss", "docs/"], cwd=str(REPO_ROOT))
    if git_add.returncode != 0:
        print("[!] Git add warning")

    commit_msg = f"release(v{new_ver}): deploy automated release and update cloud manifest"
    subprocess.run(["git", "commit", "-m", commit_msg], cwd=str(REPO_ROOT))

    print("[*] Pushing to origin main (Git LFS CDN upload)...")
    push_main = subprocess.run(["git", "push", "origin", "main"], cwd=str(REPO_ROOT))
    if push_main.returncode != 0:
        print("[ERROR] Failed to push main to GitHub")
        sys.exit(1)

    print("[*] Pushing docs/ to gh-pages (GitHub Pages live update)...")
    push_pages = subprocess.run(["git", "subtree", "push", "--prefix", "docs", "origin", "gh-pages"], cwd=str(REPO_ROOT))
    if push_pages.returncode != 0:
        print("[WARNING] Subtree push warning, retrying force branch...")
        subprocess.run(["git", "push", "origin", "main:gh-pages", "--force"], cwd=str(REPO_ROOT))

    print("\n" + "=" * 70)
    print(f"🎉 التحديث v{new_ver} تم نشره سحابياً بنجاح تام!")
    print(f"🌐 رابط الموقع الحي: https://ahmedgad5on.github.io/phone-repair-erp/")
    print(f"📦 ملف التحديث المباشر: docs/downloads/ThermalLabPro_Setup_v{new_ver}.exe")
    print(f"🔔 ستصل الآن إشعارات التحديث التلقائي لكافة أجهزة العملاء فور تشغيل البرنامج!")
    print("=" * 70 + "\n")


def main():
    parser = argparse.ArgumentParser(description="ThermalLabPro Automated Cloud Release Publisher")
    parser.add_argument("--version", type=str, help="New semantic version number (e.g. 4.7.1)")
    parser.add_argument("--notes", type=str, help="Arabic/English release notes for customers")
    parser.add_argument("--skip-build", action="store_true", help="Skip compiling installer if already generated")
    args = parser.parse_args()

    curr_ver = get_current_version()
    print(f"\n=======================================================================")
    print(f"  ThermalLabPro — أداة أتمتة ونشر التحديثات السحابية للعملاء")
    print(f"  الإصدار الحالي المثبت: v{curr_ver}")
    print(f"=======================================================================\n")

    new_ver = args.version or bump_patch_version(curr_ver)
    notes = args.notes or f"تحديث جديد يتضمن تحسينات عامة في الأداء، واستقرار قراءة الهواتف، ودعم ميزات التراخيص الحديثة."

    print(f"[+] الإصدار الجديد الذي سيتم نشره: v{new_ver}")
    print(f"[+] ملاحظات التحديث: {notes}\n")

    # Step 1: Update version files
    update_core_version_file(new_ver, notes)
    update_installer_iss(new_ver)

    # Step 2: Compile Inno Setup installer
    if args.skip_build:
        installer_path = REPO_ROOT / "dist_installer" / f"ThermalLabPro_Setup_v{new_ver}.exe"
        if not installer_path.exists():
            installer_path = compile_inno_setup(new_ver)
    else:
        installer_path = compile_inno_setup(new_ver)

    # Step 3: Update website & manifest
    update_website_and_manifest(new_ver, installer_path, notes)

    # Step 4: Update central licensing server database
    update_server_database(new_ver, installer_path, notes)

    # Step 5: Deploy to GitHub & GitHub Pages
    deploy_to_cloud(new_ver)

    # Step 6: Relaunch updated desktop application
    relaunch_desktop_app()


if __name__ == "__main__":
    main()
