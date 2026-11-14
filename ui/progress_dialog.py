"""
progress_dialog.py — Simple progress dialog with ETA.
"""

import time
from PyQt6.QtWidgets import QDialog, QVBoxLayout, QLabel, QProgressBar, QPushButton
from PyQt6.QtCore import Qt, QTimer

class ProgressDialog(QDialog):
    """Dialog showing a determinate progress bar and estimated time remaining.

    Usage:
        dlg = ProgressDialog(total_steps=100, parent=self)
        dlg.start()
        # In a background task, call dlg.update(step) periodically.
        # When finished, call dlg.finish().
    """
    def __init__(self, total_steps: int = 100, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Progress")
        self.setModal(True)
        self.resize(300, 120)
        self.total_steps = max(1, total_steps)
        self.current_step = 0
        self.start_time = None

        layout = QVBoxLayout(self)
        self.label_info = QLabel("Starting...", self)
        layout.addWidget(self.label_info)
        self.progress = QProgressBar(self)
        self.progress.setRange(0, self.total_steps)
        layout.addWidget(self.progress)
        self.btn_cancel = QPushButton("Cancel", self)
        self.btn_cancel.clicked.connect(self.reject)
        layout.addWidget(self.btn_cancel)

        # Timer to refresh ETA display every second
        self.timer = QTimer(self)
        self.timer.timeout.connect(self._refresh_eta)

    def start(self):
        """Initialize timing and show the dialog."""
        self.start_time = time.time()
        self.current_step = 0
        self.progress.setValue(0)
        self.label_info.setText("0 / {0} steps completed".format(self.total_steps))
        self.timer.start(1000)
        self.show()

    def update(self, step_increment: int = 1):
        """Advance the progress bar by *step_increment* steps."""
        self.current_step = min(self.total_steps, self.current_step + step_increment)
        self.progress.setValue(self.current_step)
        self.label_info.setText(f"{self.current_step} / {self.total_steps} steps completed")
        if self.current_step >= self.total_steps:
            self.finish()

    def _refresh_eta(self):
        if self.current_step == 0 or self.start_time is None:
            return
        elapsed = time.time() - self.start_time
        avg_per_step = elapsed / self.current_step
        remaining = (self.total_steps - self.current_step) * avg_per_step
        if remaining > 60:
            mins = int(remaining // 60)
            secs = int(remaining % 60)
            eta_str = f"{mins} min {secs} sec"
        else:
            eta_str = f"{int(remaining)} sec"
        self.label_info.setText(
            f"{self.current_step}/{self.total_steps} steps completed – ETA: {eta_str}"
        )

    def finish(self):
        """Mark the operation as complete and close the dialog."""
        self.timer.stop()
        self.label_info.setText("Completed.")
        QTimer.singleShot(500, self.accept)  # close shortly after showing completion
