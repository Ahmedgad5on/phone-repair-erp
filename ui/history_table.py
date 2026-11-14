"""
ui/history_table.py — Bottom Panel: Searchable Historical Log & Export Table
Features:
- Live multi-column search filtering (Serial, IMEI, Model, Customer, Phone).
- 1-Click reprint action emitting record dictionary to live preview / printer.
- Direct Excel (.xlsx) and CSV exports with styled headers and UTF-8 BOM encoding.
- Row deletion and dynamic table refresh from SQLite persistence engine.
"""
from typing import List, Dict, Any, Optional
from PyQt6.QtCore import pyqtSignal, Qt, QTimer
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QTableWidget, QTableWidgetItem, QHeaderView,
    QFileDialog, QMessageBox, QFrame
)

from core.database import DatabaseManager


class HistoryTablePanel(QFrame):
    """
    Bottom log table displaying historical label prints and repair tickets.
    """
    reprint_requested = pyqtSignal(dict)  # record dictionary

    COLUMNS = [
        ("Stock #", 110),
        ("Model", 170),
        ("Serial #", 150),
        ("IMEI 1", 170),
        ("Specifications", 220),
        ("Printed At", 140),
        ("Action", 90),
    ]

    def __init__(self, db: DatabaseManager, parent=None):
        super().__init__(parent)
        self.setObjectName("CardFrame")
        self.setProperty("class", "CardFrame")
        self.setFixedHeight(210)
        self._db = db

        self._debounce_timer = QTimer(self)
        self._debounce_timer.setSingleShot(True)
        self._debounce_timer.setInterval(150)
        self._debounce_timer.timeout.connect(self._do_search)

        self._init_ui()
        self.reload_data()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 8, 10, 8)
        layout.setSpacing(8)

        # 1. Top Controls Bar
        top_bar = QHBoxLayout()
        top_bar.setSpacing(10)

        lbl_title = QLabel("📋 Activity History & Reprints")
        lbl_title.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 13px;")
        top_bar.addWidget(lbl_title)

        # Search Input
        self.edit_search = QLineEdit()
        self.edit_search.setPlaceholderText("🔍 Search by Serial, IMEI, Model, Phone, Customer...")
        self.edit_search.setFixedWidth(360)
        self.edit_search.textChanged.connect(self._on_search_text_changed)
        top_bar.addWidget(self.edit_search)

        self.lbl_count = QLabel("Records: 0")
        self.lbl_count.setProperty("class", "MutedLabel")
        top_bar.addWidget(self.lbl_count)

        top_bar.addStretch()

        # Action Buttons
        self.btn_refresh = QPushButton("Refresh")
        self.btn_refresh.clicked.connect(self.reload_data)
        top_bar.addWidget(self.btn_refresh)

        self.btn_export_excel = QPushButton("📊 Export Excel")
        self.btn_export_excel.clicked.connect(self._export_excel)
        top_bar.addWidget(self.btn_export_excel)

        self.btn_export_csv = QPushButton("📄 Export CSV")
        self.btn_export_csv.clicked.connect(self._export_csv)
        top_bar.addWidget(self.btn_export_csv)

        layout.addLayout(top_bar)

        # 2. Table
        self.table = QTableWidget()
        self.table.setColumnCount(len(self.COLUMNS))
        self.table.setHorizontalHeaderLabels([col[0] for col in self.COLUMNS])
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.verticalHeader().setVisible(False)

        header = self.table.horizontalHeader()
        for i, (name, width) in enumerate(self.COLUMNS):
            if name in ["Model", "Details / Fault"]:
                header.setSectionResizeMode(i, QHeaderView.ResizeMode.Stretch)
            else:
                header.setSectionResizeMode(i, QHeaderView.ResizeMode.Interactive)
                self.table.setColumnWidth(i, width)

        layout.addWidget(self.table)

    def _on_search_text_changed(self):
        self._debounce_timer.start()

    def _do_search(self):
        q = self.edit_search.text().strip()
        records = self._db.search_history(q)
        self._populate_table(records)

    def reload_data(self):
        self._do_search()

    def _populate_table(self, records: List[Dict[str, Any]]):
        self.table.setRowCount(len(records))
        self.lbl_count.setText(f"Records: {len(records)}")

        for row_idx, r in enumerate(records):
            self.table.setItem(row_idx, 0, QTableWidgetItem(str(r.get("ref_id", ""))))
            self.table.setItem(row_idx, 1, QTableWidgetItem(str(r.get("model", ""))))
            self.table.setItem(row_idx, 2, QTableWidgetItem(str(r.get("serial_number", ""))))
            self.table.setItem(row_idx, 3, QTableWidgetItem(str(r.get("imei1", ""))))
            self.table.setItem(row_idx, 4, QTableWidgetItem(str(r.get("details", ""))))
            self.table.setItem(row_idx, 5, QTableWidgetItem(str(r.get("created_at", ""))))

            # Reprint Button
            btn_reprint = QPushButton("Reprint")
            btn_reprint.setStyleSheet("padding: 2px 8px; font-size: 11px;")
            btn_reprint.clicked.connect(lambda checked, rec=r: self.reprint_requested.emit(rec))
            self.table.setCellWidget(row_idx, 6, btn_reprint)

    def _export_excel(self):
        path, _ = QFileDialog.getSaveFileName(
            self, "Export History to Excel", "label_history.xlsx", "Excel Files (*.xlsx)"
        )
        if path:
            ok = self._db.export_history_to_excel(path)
            if ok:
                QMessageBox.information(self, "Export Complete", f"Successfully exported to:\n{path}")
            else:
                QMessageBox.critical(self, "Export Failed", "Could not export database to Excel.")

    def _export_csv(self):
        path, _ = QFileDialog.getSaveFileName(
            self, "Export History to CSV", "label_history.csv", "CSV Files (*.csv)"
        )
        if path:
            ok = self._db.export_history_to_csv(path)
            if ok:
                QMessageBox.information(self, "Export Complete", f"Successfully exported to:\n{path}")
            else:
                QMessageBox.critical(self, "Export Failed", "Could not export database to CSV.")
