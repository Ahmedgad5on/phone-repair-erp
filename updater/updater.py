"""
updater/updater.py — Standalone Safe Application Updater & Recovery Engine
Detached process that waits for main application shutdown, backs up the local SQLite database,
replaces executable/resource files, supports automatic rollback on error, and relaunches the app.
"""
import argparse
import logging
import os
import shutil
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path

# Setup simple file logger for updater diagnostics
log_file = Path(os.environ.get("TEMP", ".")) / "prolab_updater.log"
logging.basicConfig(
    filename=str(log_file),
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("prolab_updater")


def wait_for_process_exit(pid: int, timeout_seconds: int = 15) -> bool:
    """Waits until the specified process ID terminates."""
    logger.info("Waiting for main application PID %s to exit...", pid)
    start_time = time.time()
    while time.time() - start_time < timeout_seconds:
        if sys.platform == "win32":
            import ctypes
            PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            SYNCHRONIZE = 0x00100000
            handle = ctypes.windll.kernel32.OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, False, pid
            )
            if not handle:
                logger.info("Process %s has terminated.", pid)
                return True
            ctypes.windll.kernel32.CloseHandle(handle)
        else:
            try:
                os.kill(pid, 0)
            except OSError:
                logger.info("Process %s has terminated.", pid)
                return True
        time.sleep(0.5)

    logger.warning("Timed out waiting for PID %s to exit.", pid)
    return False


def backup_database(target_dir: Path) -> bool:
    """Creates a safety backup of local app.db prior to updating files."""
    db_path = target_dir / "data" / "app.db"
    if not db_path.exists():
        # Check appdata path
        appdata = os.environ.get("APPDATA")
        if appdata:
            alt_db = Path(appdata) / "ThermalLabPro" / "data" / "app.db"
            if alt_db.exists():
                db_path = alt_db

    if not db_path.exists():
        logger.info("No local SQLite database found at %s. Skipping DB backup.", db_path)
        return True

    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = backup_dir / f"pre_update_backup_{ts}.db"

    try:
        shutil.copy2(db_path, backup_file)
        logger.info("Successfully took pre-update database snapshot at %s", backup_file)
        return True
    except Exception as e:
        logger.error("Failed backing up database: %s", e)
        return False


def apply_update(target_dir: Path, package_path: Path) -> bool:
    """Unpacks zip package and updates target directory files with rollback safety."""
    temp_extract = target_dir / "_update_temp"
    temp_rollback = target_dir / "_update_rollback"

    try:
        if temp_extract.exists():
            shutil.rmtree(temp_extract, ignore_errors=True)
        if temp_rollback.exists():
            shutil.rmtree(temp_rollback, ignore_errors=True)

        logger.info("Extracting update package %s...", package_path)
        with zipfile.ZipFile(package_path, "r") as z:
            z.extractall(temp_extract)

        # Prepare rollback folder for any files that will be overwritten
        temp_rollback.mkdir(parents=True, exist_ok=True)

        for src_path in temp_extract.rglob("*"):
            if src_path.is_file():
                rel_path = src_path.relative_to(temp_extract)
                dest_path = target_dir / rel_path
                dest_path.parent.mkdir(parents=True, exist_ok=True)

                if dest_path.exists():
                    rb_file = temp_rollback / rel_path
                    rb_file.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(dest_path, rb_file)

                # Overwrite destination
                shutil.copy2(src_path, dest_path)

        logger.info("All updated files successfully placed in %s", target_dir)

        # Clean temp
        shutil.rmtree(temp_extract, ignore_errors=True)
        shutil.rmtree(temp_rollback, ignore_errors=True)
        return True

    except Exception as e:
        logger.error("Error applying update: %s. Initiating rollback...", e)
        # Rollback overwritten files
        if temp_rollback.exists():
            for rb_file in temp_rollback.rglob("*"):
                if rb_file.is_file():
                    rel_path = rb_file.relative_to(temp_rollback)
                    dest_path = target_dir / rel_path
                    try:
                        shutil.copy2(rb_file, dest_path)
                    except Exception:
                        pass
        return False


def relaunch_app(app_exe: str, target_dir: Path):
    """Relaunches the main application."""
    import subprocess
    logger.info("Relaunching application: %s in %s", app_exe, target_dir)
    try:
        subprocess.Popen([app_exe], cwd=str(target_dir), close_fds=True)
    except Exception as e:
        logger.error("Failed relaunching app: %s", e)


def main():
    parser = argparse.ArgumentParser(description="ProLab Studio Standalone Updater")
    parser.add_argument("--target-dir", required=True, help="Target application directory")
    parser.add_argument("--package-path", required=True, help="Path to downloaded zip package")
    parser.add_argument("--app-exe", required=True, help="Path or name of main application executable")
    parser.add_argument("--main-pid", type=int, default=0, help="PID of main application process")

    args = parser.parse_args()

    target_dir = Path(args.target_dir).resolve()
    package_path = Path(args.package_path).resolve()

    logger.info("ProLab Updater starting...")
    logger.info("Target: %s, Package: %s, PID: %s", target_dir, package_path, args.main_pid)

    # 1. Wait for process exit
    if args.main_pid > 0:
        wait_for_process_exit(args.main_pid)

    # 2. Database safety backup
    backup_database(target_dir)

    # 3. Apply files
    ok = apply_update(target_dir, package_path)

    # 4. Relaunch
    if ok:
        logger.info("Update completed successfully.")
    else:
        logger.error("Update failed or rolled back.")

    relaunch_app(args.app_exe, target_dir)
    logger.info("Updater process exiting.")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
