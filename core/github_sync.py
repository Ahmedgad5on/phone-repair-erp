"""
core/github_sync.py — Automatic Two-Way Synchronization Engine for GitHub
Provides seamless bidirectional synchronization between the local application and GitHub.
- Pulls updates automatically when remote changes are detected.
- Commits and pushes local application changes automatically.
- Integrated background QThread worker for live PyQt UI updates.
"""
import os
import sys
import time
import logging
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Tuple, Optional, Dict, Any

from PyQt6.QtCore import QObject, QThread, pyqtSignal, pyqtSlot

logger = logging.getLogger("thermal_lab.github_sync")

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


class GitHubSyncSignals(QObject):
    """Signals for UI integration of GitHub synchronization."""
    sync_started = pyqtSignal()
    sync_completed = pyqtSignal(bool, str)          # success, summary message
    status_changed = pyqtSignal(str, str)           # status_code (SYNCED, PULLING, PUSHING, ERROR), label_text
    auto_sync_toggled = pyqtSignal(bool)


class GitHubSyncManager:
    """Core Git command executor for two-way synchronization."""

    @staticmethod
    def _detect_repo_dir() -> str:
        """Finds the absolute path to the Git repository under any execution context."""
        candidates = [
            Path(__file__).resolve().parent.parent if "__file__" in globals() else None,
            Path(os.getcwd()).resolve(),
            Path(sys.executable).parent / "label",
            Path(sys.executable).parent,
            Path.home() / "Desktop" / "label",
            Path("C:/Users/Eng_Ahmed/Desktop/label"),
        ]
        for candidate in candidates:
            if candidate and (candidate / ".git").is_dir():
                return str(candidate)
        return str(Path("C:/Users/Eng_Ahmed/Desktop/label").resolve())

    def __init__(self, repo_dir: Optional[str] = None, remote: str = "origin", branch: str = "main"):
        self.repo_dir = str(Path(repo_dir).resolve()) if repo_dir else self._detect_repo_dir()
        self.remote = remote
        self.branch = branch

    def _run_git(self, args: list, timeout: float = 30.0) -> Tuple[int, str, str]:
        """Executes a git command inside the repository directory."""
        cmd = ["git"] + args
        try:
            res = subprocess.run(
                cmd,
                cwd=self.repo_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=CREATE_NO_WINDOW,
                timeout=timeout
            )
            return res.returncode, res.stdout.strip(), res.stderr.strip()
        except subprocess.TimeoutExpired:
            return -1, "", "انتهت مهلة استجابة Git (Timeout)."
        except Exception as e:
            return -1, "", str(e)

    def check_connection(self) -> bool:
        """Verifies network and SSH connectivity to GitHub."""
        code, out, err = self._run_git(["ls-remote", "--heads", self.remote, self.branch], timeout=12.0)
        return code == 0

    def get_sync_state(self) -> Dict[str, Any]:
        """Inspects status of local working tree and ahead/behind commit counts."""
        # Check local changes
        code, status_out, _ = self._run_git(["status", "--porcelain"])
        has_local_changes = bool(status_out)

        # Fetch latest references silently
        code, _, _ = self._run_git(["fetch", self.remote, self.branch], timeout=15.0)

        # Count ahead and behind commits
        code_rev, counts_out, _ = self._run_git([
            "rev-list", "--left-right", "--count", f"HEAD...{self.remote}/{self.branch}"
        ])
        ahead = 0
        behind = 0
        if code_rev == 0 and counts_out:
            parts = counts_out.split()
            if len(parts) >= 2:
                ahead = int(parts[0])
                behind = int(parts[1])

        return {
            "has_local_changes": has_local_changes,
            "ahead": ahead,
            "behind": behind,
            "is_clean": not has_local_changes and ahead == 0 and behind == 0
        }

    def sync_two_way(self, auto_commit_msg: Optional[str] = None) -> Tuple[bool, str]:
        """
        Executes complete Two-Way Synchronization:
        1. If local changes exist: commits them cleanly.
        2. Fetches remote changes from GitHub.
        3. If remote has new commits: pulls with rebase/autostash.
        4. If local is ahead: pushes commits to GitHub.
        """
        try:
            # 1. Inspect status
            code, status_out, _ = self._run_git(["status", "--porcelain"])
            has_local_changes = bool(status_out)

            # 2. Auto-commit local modifications if any
            if has_local_changes:
                self._run_git(["add", "."])
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                msg = auto_commit_msg or f"auto(sync): update from ThermalLabPro desktop [{timestamp}]"
                c_code, c_out, c_err = self._run_git(["commit", "-m", msg])
                logger.info(f"Auto-committed local changes: {c_out}")

            # 3. Fetch from remote
            f_code, _, f_err = self._run_git(["fetch", self.remote, self.branch], timeout=20.0)
            if f_code != 0:
                return False, f"تعذر الاتصال بـ GitHub لجلب التحديثات:\n{f_err}"

            # 4. Check ahead / behind counts
            _, counts_out, _ = self._run_git([
                "rev-list", "--left-right", "--count", f"HEAD...{self.remote}/{self.branch}"
            ])
            ahead = 0
            behind = 0
            if counts_out:
                parts = counts_out.split()
                if len(parts) >= 2:
                    ahead = int(parts[0])
                    behind = int(parts[1])

            # 5. Pull remote changes if behind
            pulled = False
            if behind > 0:
                p_code, p_out, p_err = self._run_git([
                    "pull", "--rebase", "--autostash", self.remote, self.branch
                ], timeout=30.0)
                if p_code != 0:
                    return False, f"حدث تعارض أو خطأ أثناء سحب التحديثات من GitHub:\n{p_err}"
                pulled = True
                logger.info(f"Pulled {behind} commits from GitHub.")

            # 6. Push local changes if ahead
            pushed = False
            # Recalculate ahead after pull
            _, counts_out2, _ = self._run_git([
                "rev-list", "--left-right", "--count", f"HEAD...{self.remote}/{self.branch}"
            ])
            if counts_out2:
                parts2 = counts_out2.split()
                if len(parts2) >= 1:
                    ahead = int(parts2[0])

            if ahead > 0 or has_local_changes:
                push_code, push_out, push_err = self._run_git([
                    "push", self.remote, self.branch
                ], timeout=40.0)
                if push_code != 0:
                    return False, f"تعذر رفع التحديثات إلى GitHub:\n{push_err}"
                pushed = True
                logger.info("Pushed local updates to GitHub successfully.")

            # Summary message
            now_str = datetime.now().strftime("%H:%M:%S")
            if pulled and pushed:
                return True, f"تم تبادل التحديثات بنجاح (سحب {behind} ورفع {ahead}) في {now_str}."
            elif pulled:
                return True, f"تم سحب {behind} تحديثات جديدة من GitHub بنجاح في {now_str}."
            elif pushed:
                return True, f"تم رفع التحديثات المحلية إلى GitHub بنجاح في {now_str}."
            else:
                return True, f"المستودع متطابق ومحدث بالكامل مع GitHub في {now_str}."

        except Exception as e:
            logger.exception("Error in sync_two_way: %s", e)
            return False, f"خطأ أثناء المزامنة: {str(e)}"


class GitHubSyncWorker(QThread):
    """Background worker thread for periodic non-blocking two-way sync."""

    def __init__(self, manager: Optional[GitHubSyncManager] = None, interval_seconds: int = 45, parent=None):
        super().__init__(parent)
        self.manager = manager or GitHubSyncManager()
        self.interval_seconds = interval_seconds
        self.signals = GitHubSyncSignals()
        self._running = True
        self._paused = False

    def run(self):
        logger.info("GitHub Auto-Sync background worker started.")
        # Initial sync on launch
        time.sleep(3)
        self.trigger_sync()

        while self._running:
            for _ in range(self.interval_seconds):
                if not self._running:
                    break
                time.sleep(1)

            if self._running and not self._paused:
                self.trigger_sync()

    def trigger_sync(self):
        """Executes a single two-way sync pass and emits signals."""
        try:
            self.signals.sync_started.emit()
            self.signals.status_changed.emit("SYNCING", "🔄 جاري المزامنة مع GitHub...")
            success, message = self.manager.sync_two_way()
            if success:
                self.signals.status_changed.emit("SYNCED", "✅ متزامن مع GitHub")
            else:
                self.signals.status_changed.emit("ERROR", "⚠️ تنبيه في المزامنة")
            self.signals.sync_completed.emit(success, message)
        except Exception as e:
            logger.error("Error triggering sync: %s", e)
            self.signals.status_changed.emit("ERROR", f"خطأ: {e}")
            self.signals.sync_completed.emit(False, str(e))

    def stop(self):
        self._running = False
        self.wait(2000)

    def pause_sync(self):
        self._paused = True

    def resume_sync(self):
        self._paused = False
