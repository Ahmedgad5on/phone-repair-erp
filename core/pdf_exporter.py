"""
core/pdf_exporter.py — Professional PDF Report Generator
Mobile Phone Trading Store ERP (ReportLab + Arabic Bidi Engine)

Implements:
1. Owner Full Secret Financial & Profit PDF
2. Public Trader / Customer Price List PDF (Hides Buy Price, Profit & IMEI)
3. Detailed Trader Account Statement PDF (كشف حساب تاجر بالأجهزة والدفعات)
4. Dynamic Custom PDF Builder with selectable columns
"""
from datetime import datetime, date
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from reportlab.lib.pagesizes import A4, letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)

# Arabic reshaping helper
def reshape_arabic(text: Union[str, Any]) -> str:
    if text is None:
        return ""
    text_str = str(text).strip()
    if not text_str:
        return ""
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
        reshaped = arabic_reshaper.reshape(text_str)
        return get_display(reshaped)
    except Exception:
        return text_str


class NumberedCanvas(canvas.Canvas):
    """Adds luxury page numbers and header rules to each page."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        # Top gold border line
        self.setStrokeColor(colors.HexColor("#D4AF37"))
        self.setLineWidth(1.5)
        self.line(40, 800, 555, 800)

        # Bottom footer line
        self.setStrokeColor(colors.HexColor("#282834"))
        self.setLineWidth(0.8)
        self.line(40, 45, 555, 45)

        # Footer text
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#6B7280"))
        footer_text = f"ProLab Mobile Trading ERP  |  Page {self._pageNumber} of {page_count}"
        self.drawString(40, 32, footer_text)
        print_date = datetime.now().strftime("%Y-%m-%d %H:%M")
        self.drawRightString(555, 32, f"Generated: {print_date}")
        self.restoreState()


class PDFReportExporter:
    """Enterprise-grade PDF generator for mobile store inventory and ledger statements."""

    @staticmethod
    def _get_base_styles():
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'DocTitle',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#16161D"),
            alignment=1, # Center
            spaceAfter=6
        )
        subtitle_style = ParagraphStyle(
            'DocSubtitle',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#4B5563"),
            alignment=1,
            spaceAfter=15
        )
        cell_style = ParagraphStyle(
            'TableCell',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#1F2937")
        )
        cell_bold = ParagraphStyle(
            'TableCellBold',
            parent=cell_style,
            fontName='Helvetica-Bold'
        )
        cell_gold = ParagraphStyle(
            'TableCellGold',
            parent=cell_style,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor("#B48A18")
        )
        return styles, title_style, subtitle_style, cell_style, cell_bold, cell_gold

    @classmethod
    def generate_owner_financial_pdf(
        cls,
        devices: List[Dict[str, Any]],
        output_path: str,
        store_name: str = "ProLab Mobile Trading",
        filters_summary: str = "All In-Stock Units"
    ) -> str:
        """
        Preset 1: Owner Full Secret Financial & Profit PDF
        Contains Buy Price, Target Selling Price, Prep Cost, Margin, Estimated Profit, and Totals.
        """
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            leftMargin=36,
            rightMargin=36,
            topMargin=46,
            bottomMargin=50
        )
        styles, title_style, subtitle_style, cell_style, cell_bold, cell_gold = cls._get_base_styles()
        elements = []

        # Sort devices: New first, then Used; then by Brand, then Model
        devices = sorted(devices, key=lambda d: (0 if d.get("condition") == "New" else 1, (d.get("brand") or "").lower(), (d.get("model_name") or "").lower()))

        # Header Title
        title_text = f"{store_name} — Owner Financial & Inventory Valuation Report"
        elements.append(Paragraph(title_text, title_style))
        sub_text = f"Filter Scope: {filters_summary} | Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        elements.append(Paragraph(sub_text, subtitle_style))

        # Financial Summary Cards / Metrics
        total_units = len(devices)
        total_capital = sum(float(d.get("buy_price") or 0.0) for d in devices)
        total_prep = sum(float(d.get("prep_cost") or 0.0) for d in devices)
        total_target_rev = sum(float(d.get("target_selling_price") or 0.0) for d in devices)
        total_est_profit = total_target_rev - (total_capital + total_prep)

        summary_data = [
            [
                Paragraph(f"<b>Total Units:</b><br/>{total_units} Devices", cell_style),
                Paragraph(f"<b>Total Capital (Cost):</b><br/>{total_capital:,.2f} EGP", cell_style),
                Paragraph(f"<b>Target Revenue:</b><br/>{total_target_rev:,.2f} EGP", cell_style),
                Paragraph(f"<b>Estimated Profit:</b><br/>{total_est_profit:,.2f} EGP", cell_gold)
            ]
        ]
        summary_table = Table(summary_data, colWidths=[125, 135, 135, 128])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#D4AF37")),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 15))

        # Table Header
        col_widths = [22, 60, 160, 55, 55, 60, 60, 50]
        headers = [
            "#", "Stock No", "Brand / Model", "Color", "Cipher", "Buy Price", "Target Sell", "Est. Profit"
        ]

        # Group and order devices by Condition (New first, then Used), then by Brand
        grouped: Dict[str, Dict[str, List[Dict[str, Any]]]] = {"New": {}, "Used": {}}
        for dev in devices:
            cond = "New" if dev.get("condition") == "New" else "Used"
            b = (dev.get("brand") or "Other").strip()
            if b not in grouped[cond]:
                grouped[cond][b] = []
            grouped[cond][b].append(dev)

        section_idx = 1
        for cond_key in ("New", "Used"):
            cond_brands = grouped[cond_key]
            if not cond_brands:
                continue

            cond_title = "🆕 NEW SEALED PHONES (الأجهزة الجديدة المتبرشمة)" if cond_key == "New" else "✨ USED PHONES (الأجهزة المستعملة كسر زيرو)"
            cond_total_count = sum(len(d_list) for d_list in cond_brands.values())
            
            # Condition Banner
            banner_style = ParagraphStyle(
                f'Banner_{cond_key}',
                parent=title_style,
                fontSize=12,
                leading=15,
                textColor=colors.HexColor("#D4AF37") if cond_key == "New" else colors.HexColor("#38BDF8"),
                alignment=0, # Left
                spaceBefore=10,
                spaceAfter=4
            )
            elements.append(Paragraph(f"<b>{cond_title} — ({cond_total_count} Devices)</b>", banner_style))

            for brand_name in sorted(cond_brands.keys()):
                brand_devs = sorted(cond_brands[brand_name], key=lambda x: (x.get("model_name") or "").lower())
                
                # Brand mini subheader
                brand_style = ParagraphStyle(
                    f'Brand_{cond_key}_{brand_name}',
                    parent=cell_bold,
                    fontSize=10,
                    textColor=colors.HexColor("#111827"),
                    spaceBefore=6,
                    spaceAfter=2
                )
                elements.append(Paragraph(f"<b>🏷️ {brand_name} ({len(brand_devs)} Devices)</b>", brand_style))

                table_rows = [[Paragraph(f"<b>{h}</b>", cell_bold) for h in headers]]
                brand_buy = 0.0
                brand_sell = 0.0
                brand_profit = 0.0

                for dev in brand_devs:
                    buy = float(dev.get("buy_price") or 0.0)
                    prep = float(dev.get("prep_cost") or 0.0)
                    sell = float(dev.get("target_selling_price") or 0.0)
                    profit = sell - (buy + prep)
                    brand_buy += buy
                    brand_sell += sell
                    brand_profit += profit

                    model_info = f"{dev.get('brand', '')} {dev.get('model_name', '')} ({dev.get('storage', '')})"
                    color_info = dev.get("color", "") or "-"

                    table_rows.append([
                        Paragraph(str(section_idx), cell_style),
                        Paragraph(dev.get("stock_no", ""), cell_bold),
                        Paragraph(model_info, cell_style),
                        Paragraph(color_info, cell_style),
                        Paragraph(dev.get("secret_cost_cipher", ""), cell_style),
                        Paragraph(f"{buy:,.0f}", cell_style),
                        Paragraph(f"{sell:,.0f}", cell_style),
                        Paragraph(f"{profit:,.0f}", cell_gold if profit >= 0 else cell_style)
                    ])
                    section_idx += 1

                # Brand Subtotal row
                table_rows.append([
                    Paragraph("", cell_bold),
                    Paragraph("<b>Subtotal</b>", cell_bold),
                    Paragraph(f"<b>{brand_name} ({len(brand_devs)})</b>", cell_bold),
                    Paragraph("", cell_style),
                    Paragraph("", cell_style),
                    Paragraph(f"<b>{brand_buy:,.0f}</b>", cell_bold),
                    Paragraph(f"<b>{brand_sell:,.0f}</b>", cell_bold),
                    Paragraph(f"<b>{brand_profit:,.0f}</b>", cell_gold)
                ])

                data_table = Table(table_rows, colWidths=col_widths, repeatRows=1)
                data_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#16161D")),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#D4AF37")),
                    ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#F3F4F6")),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor("#F9FAFB")]),
                    ('PADDING', (0, 0), (-1, -1), 4),
                ]))
                elements.append(data_table)
                elements.append(Spacer(1, 8))

        doc.build(elements, canvasmaker=NumberedCanvas)
        return output_path

    @classmethod
    def generate_public_pricelist_pdf(
        cls,
        devices: List[Dict[str, Any]],
        output_path: str,
        store_name: str = "ProLab Mobile Trading",
        store_phone: str = ""
    ) -> str:
        """
        Preset 2: Public Trader/Customer Price List PDF
        Hides Buy Price, Profit, and Serial/IMEI.
        """
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            leftMargin=36,
            rightMargin=36,
            topMargin=46,
            bottomMargin=50
        )
        styles, title_style, subtitle_style, cell_style, cell_bold, cell_gold = cls._get_base_styles()
        elements = []

        # Sort devices: New first, then Used; then by Brand, then Model
        devices = sorted(devices, key=lambda d: (0 if d.get("condition") == "New" else 1, (d.get("brand") or "").lower(), (d.get("model_name") or "").lower()))

        title_text = f"{store_name} — Official Stock Price List"
        elements.append(Paragraph(title_text, title_style))
        sub_text = f"Tel / WhatsApp: {store_phone}  |  Prices Valid on: {date.today().strftime('%Y-%m-%d')}"
        elements.append(Paragraph(sub_text, subtitle_style))

        headers = ["#", "Brand", "Model & Specifications", "Color", "Warranty / Tax", "Selling Price"]
        col_widths = [25, 65, 175, 75, 95, 85]

        # Group by Condition, then Brand
        grouped: Dict[str, Dict[str, List[Dict[str, Any]]]] = {"New": {}, "Used": {}}
        for dev in devices:
            cond = "New" if dev.get("condition") == "New" else "Used"
            b = (dev.get("brand") or "Other").strip()
            if b not in grouped[cond]:
                grouped[cond][b] = []
            grouped[cond][b].append(dev)

        section_idx = 1
        for cond_key in ("New", "Used"):
            cond_brands = grouped[cond_key]
            if not cond_brands:
                continue

            cond_title = "🆕 BRAND NEW PHONES (الأجهزة الجديدة كلياً متبرشمة)" if cond_key == "New" else "✨ USED PHONES (الأجهزة المستعملة كسر زيرو)"
            banner_style = ParagraphStyle(
                f'PubBanner_{cond_key}',
                parent=title_style,
                fontSize=12,
                leading=15,
                textColor=colors.HexColor("#D4AF37") if cond_key == "New" else colors.HexColor("#0284C7"),
                alignment=0,
                spaceBefore=10,
                spaceAfter=4
            )
            elements.append(Paragraph(f"<b>{cond_title}</b>", banner_style))

            for brand_name in sorted(cond_brands.keys()):
                brand_devs = sorted(cond_brands[brand_name], key=lambda x: (x.get("model_name") or "").lower())
                
                brand_style = ParagraphStyle(
                    f'PubBrand_{cond_key}_{brand_name}',
                    parent=cell_bold,
                    fontSize=10,
                    textColor=colors.HexColor("#111827"),
                    spaceBefore=6,
                    spaceAfter=2
                )
                elements.append(Paragraph(f"<b>🏷️ {brand_name} ({len(brand_devs)} Units)</b>", brand_style))

                table_rows = [[Paragraph(f"<b>{h}</b>", cell_bold) for h in headers]]
                for dev in brand_devs:
                    sell = float(dev.get("target_selling_price") or 0.0)
                    specs = f"{dev.get('model_name', '')} {dev.get('storage', '')} {dev.get('ram', '')}".strip()
                    tax_warr = f"{dev.get('tax_status', '')} / {dev.get('warranty_status', '')}"

                    table_rows.append([
                        Paragraph(str(section_idx), cell_style),
                        Paragraph(dev.get("brand", ""), cell_bold),
                        Paragraph(specs, cell_style),
                        Paragraph(dev.get("color", "") or "-", cell_style),
                        Paragraph(tax_warr, cell_style),
                        Paragraph(f"<b>{sell:,.0f} EGP</b>", cell_gold)
                    ])
                    section_idx += 1

                data_table = Table(table_rows, colWidths=col_widths, repeatRows=1)
                data_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E1E28")),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#D4AF37")),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
                    ('PADDING', (0, 0), (-1, -1), 5),
                ]))
                elements.append(data_table)
                elements.append(Spacer(1, 8))

        doc.build(elements, canvasmaker=NumberedCanvas)
        return output_path

    @classmethod
    def generate_trader_statement_pdf(
        cls,
        trader: Dict[str, Any],
        transactions: List[Dict[str, Any]],
        output_path: str,
        store_name: str = "ProLab Mobile Trading"
    ) -> str:
        """
        Preset 3: Detailed Trader Account Statement PDF (كشف حساب تاجر بالأجهزة والدفعات)
        Shows double-entry ledger history and current net balance.
        """
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            leftMargin=36,
            rightMargin=36,
            topMargin=46,
            bottomMargin=50
        )
        styles, title_style, subtitle_style, cell_style, cell_bold, cell_gold = cls._get_base_styles()
        elements = []

        # Sort devices: New first, then Used; then by Brand, then Model
        devices = sorted(devices, key=lambda d: (0 if d.get("condition") == "New" else 1, (d.get("brand") or "").lower(), (d.get("model_name") or "").lower()))

        title_text = f"{store_name} — Trader Statement of Account"
        elements.append(Paragraph(title_text, title_style))

        trader_name = trader.get("name", "N/A")
        trader_phone = trader.get("phone", "")
        trader_company = trader.get("company", "")
        net_bal = float(trader.get("net_balance") or 0.0)

        bal_label = "We Owe Him (له)" if net_bal >= 0 else "He Owes Us (عليه)"
        sub_text = f"Trader: <b>{trader_name}</b> ({trader_company}) | Phone: {trader_phone} | Balance: <b>{abs(net_bal):,.2f} EGP ({bal_label})</b>"
        elements.append(Paragraph(sub_text, subtitle_style))

        # Ledger Table
        headers = ["#", "Date & Time", "Type", "Amount (EGP)", "Reference / Device", "Payment Method", "Running Balance"]
        table_rows = [[Paragraph(f"<b>{h}</b>", cell_bold) for h in headers]]

        for idx, tx in enumerate(transactions, 1):
            amt = float(tx.get("amount") or 0.0)
            bal = float(tx.get("balance_after") or 0.0)
            ref_info = tx.get("reference_no") or ""
            if tx.get("model_name"):
                ref_info += f" ({tx.get('model_name')})"

            table_rows.append([
                Paragraph(str(idx), cell_style),
                Paragraph(tx.get("trans_date", ""), cell_style),
                Paragraph(tx.get("trans_type", ""), cell_bold),
                Paragraph(f"{amt:,.2f}", cell_style),
                Paragraph(ref_info, cell_style),
                Paragraph(tx.get("payment_method", "") or "-", cell_style),
                Paragraph(f"{bal:,.2f}", cell_gold)
            ])

        col_widths = [25, 95, 75, 80, 130, 75, 75]
        data_table = Table(table_rows, colWidths=col_widths, repeatRows=1)
        data_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#16161D")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#D4AF37")),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
            ('PADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(data_table)

        doc.build(elements, canvasmaker=NumberedCanvas)
        return output_path

    @classmethod
    def generate_custom_inventory_pdf(
        cls,
        devices: List[Dict[str, Any]],
        selected_columns: List[str],
        output_path: str,
        store_name: str = "ProLab Mobile Trading",
        title: str = "Custom Inventory Report"
    ) -> str:
        """
        Interactive column cherry-picking export.
        Available columns: stock_no, brand, model_name, storage, color, condition,
        serial_number, imei1, tax_status, ownership, buy_price, target_selling_price, status
        """
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            leftMargin=36,
            rightMargin=36,
            topMargin=46,
            bottomMargin=50
        )
        styles, title_style, subtitle_style, cell_style, cell_bold, cell_gold = cls._get_base_styles()
        elements = []

        # Sort devices: New first, then Used; then by Brand, then Model
        devices = sorted(devices, key=lambda d: (0 if d.get("condition") == "New" else 1, (d.get("brand") or "").lower(), (d.get("model_name") or "").lower()))

        elements.append(Paragraph(f"{store_name} — {title}", title_style))
        elements.append(Paragraph(f"Total Items: {len(devices)} | Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}", subtitle_style))

        if not selected_columns:
            selected_columns = ["stock_no", "brand", "model_name", "storage", "condition", "target_selling_price", "status"]

        # Build table
        headers = [c.replace("_", " ").title() for c in selected_columns]
        table_rows = [[Paragraph(f"<b>{h}</b>", cell_bold) for h in headers]]

        for dev in devices:
            row_items = []
            for col in selected_columns:
                val = dev.get(col, "")
                if col in ("buy_price", "target_selling_price", "min_allowed_price"):
                    try:
                        val = f"{float(val):,.0f}"
                    except Exception:
                        pass
                row_items.append(Paragraph(str(val if val is not None else ""), cell_style))
            table_rows.append(row_items)

        total_width = 520
        col_w = total_width / len(selected_columns)
        data_table = Table(table_rows, colWidths=[col_w] * len(selected_columns), repeatRows=1)
        data_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#16161D")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#D4AF37")),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
            ('PADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(data_table)

        doc.build(elements, canvasmaker=NumberedCanvas)
        return output_path
