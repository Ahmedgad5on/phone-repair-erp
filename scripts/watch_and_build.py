"""
scripts/watch_and_build.py — Real-time Source Watcher & Auto-Builder
Monitors ui/, core/, and main.py for changes and automatically rebuilds ThermalLabPro.exe.
"""
import os
import sys
import time
import subprocess
from pathlib import Path

WATCH_DIRS = ["ui", "core", "server", "data"]
WATCH_FILES = ["main.py", "app.spec"]
DEBOUNCE_SECONDS = 5.0

def get_latest_mtime(root: Path) -> float:
    max_mtime = 0.0
    for f in WATCH_FILES:
        p = root / f
        if p.exists():
            max_mtime = max(max_mtime, p.stat().st_mtime)
    for d in WATCH_DIRS:
        dp = root / d
        if dp.exists():
            for child in dp.rglob("*"):
                if child.is_file() and child.suffix in (".py", ".qss", ".json"):
                    max_mtime = max(max_mtime, child.stat().st_mtime)
    return max_mtime

def main():
    root = Path(__file__).resolve().parent.parent
    print(f"[*] Starting ThermalLabPro Auto-Builder watcher in {root}...")
    last_mtime = get_latest_mtime(root)
    
    while True:
        try:
            time.sleep(2)
            current_mtime = get_latest_mtime(root)
            if current_mtime > last_mtime:
                print(f"[!] Detected code modifications. Debouncing for {DEBOUNCE_SECONDS}s...")
                time.sleep(DEBOUNCE_SECONDS)
                print("[*] Rebuilding Standalone Executable (build_exe.bat)...")
                subprocess.run(["cmd.exe", "/c", "build_exe.bat"], cwd=str(root))
                last_mtime = get_latest_mtime(root)
                print("[✔] Auto-build complete. Waiting for next change...")
        except KeyboardInterrupt:
            print("\nWatcher stopped.")
            break
        except Exception as e:
            print(f"[ERROR] Watcher error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
