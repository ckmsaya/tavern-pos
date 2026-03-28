"""
Tavern Daily Report Generator
Usage: python generate_report.py --data-file '/tmp/data.json' --output 'report.pdf'
Or import and call generate_report(data, output_path)
"""

import json
import sys
import argparse
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# ─── COLOURS ────────────────────────────────────────────────────────────────
GOLD        = colors.HexColor("#D4AF37")
DARK_BG     = colors.HexColor("#1A1A1A")
MID_GREY    = colors.HexColor("#2E2E2E")
LIGHT_GREY  = colors.HexColor("#F5F5F5")
WHITE       = colors.white
RED         = colors.HexColor("#C0392B")
GREEN       = colors.HexColor("#27AE60")
ORANGE      = colors.HexColor("#E67E22")
BLUE        = colors.HexColor("#2980B9")

def generate_report(data: dict, output_path: str):
    """
    data shape:
    {
      "date": "2025-03-28",
      "revenue": 12500,
      "cash": 7500,
      "card": 5000,
      "profit": 4300,
      "staff": [{"name": "Jane", "total": 6000}, ...],
      "products": [
        {
          "name": "Castle Lite",
          "category": "beer",
          "price": 25,
          "cost_price": 15,
          "opening_stock": 48,
          "stock": 12,
          "sold": 36
        }, ...
      ],
      "sales": [
        {"created_at": "...", "total": 125, "payment_method": "cash", "staff_name": "Jane"},
        ...
      ]
    }
    """

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=15*mm,
        rightMargin=15*mm,
        topMargin=15*mm,
        bottomMargin=15*mm,
    )

    styles = getSampleStyleSheet()
    story  = []

    # ── Custom styles ──────────────────────────────────────────────────────
    title_style = ParagraphStyle("TavernTitle",
        fontSize=26, textColor=GOLD, alignment=TA_CENTER,
        fontName="Helvetica-Bold", spaceAfter=2)

    subtitle_style = ParagraphStyle("TavernSub",
        fontSize=11, textColor=colors.grey, alignment=TA_CENTER,
        fontName="Helvetica", spaceAfter=14)

    section_style = ParagraphStyle("Section",
        fontSize=13, textColor=GOLD, fontName="Helvetica-Bold",
        spaceBefore=14, spaceAfter=6)

    normal = ParagraphStyle("Norm",
        fontSize=9, textColor=colors.black, fontName="Helvetica")

    small_grey = ParagraphStyle("SmallGrey",
        fontSize=8, textColor=colors.grey, fontName="Helvetica")

    def section(text):
        story.append(Spacer(1, 4))
        story.append(HRFlowable(width="100%", thickness=1, color=GOLD))
        story.append(Paragraph(text, section_style))

    def alt_table(headers, rows, col_widths, highlight_col=None, highlight_fn=None):
        """Build a styled table with alternating row colours."""
        table_data = [headers] + rows
        t = Table(table_data, colWidths=col_widths)

        style_cmds = [
            # Header
            ("BACKGROUND",  (0, 0), (-1, 0), DARK_BG),
            ("TEXTCOLOR",   (0, 0), (-1, 0), GOLD),
            ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, 0), 9),
            ("ALIGN",       (0, 0), (-1, 0), "CENTER"),
            ("BOTTOMPADDING",(0,0), (-1, 0), 6),
            ("TOPPADDING",  (0, 0), (-1, 0), 6),
            # Body
            ("FONTNAME",    (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE",    (0, 1), (-1, -1), 8),
            ("ALIGN",       (1, 1), (-1, -1), "CENTER"),
            ("ALIGN",       (0, 1), (0, -1),  "LEFT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_GREY]),
            ("GRID",        (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
            ("TOPPADDING",  (0, 1), (-1, -1), 4),
            ("BOTTOMPADDING",(0,1), (-1, -1), 4),
        ]

        # Per-cell colour highlighting
        if highlight_col is not None and highlight_fn:
            for i, row in enumerate(rows, start=1):
                cell_val = row[highlight_col]
                colour = highlight_fn(cell_val)
                if colour:
                    style_cmds.append(
                        ("TEXTCOLOR", (highlight_col, i), (highlight_col, i), colour)
                    )
                    style_cmds.append(
                        ("FONTNAME",  (highlight_col, i), (highlight_col, i), "Helvetica-Bold")
                    )

        t.setStyle(TableStyle(style_cmds))
        return t

    # ══════════════════════════════════════════════════════════════════════
    #  PAGE 1 — HEADER & FINANCIAL SUMMARY
    # ══════════════════════════════════════════════════════════════════════

    # Logo / Title block
    header_data = [[
        Paragraph("<b>TAVERN</b>", ParagraphStyle("Logo",
            fontSize=28, textColor=GOLD, fontName="Helvetica-Bold")),
        Paragraph(
            f"<b>DAILY BUSINESS REPORT</b><br/>"
            f"<font size=9 color='grey'>{data.get('date', datetime.today().strftime('%Y-%m-%d'))}</font>",
            ParagraphStyle("HDR", fontSize=16, textColor=DARK_BG,
                fontName="Helvetica-Bold", alignment=TA_RIGHT))
    ]]
    header_table = Table(header_data, colWidths=[80*mm, 95*mm])
    header_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), DARK_BG),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING",   (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 10),
        ("ROUNDEDCORNERS", [6]),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 10))

    # ── KPI Cards ──────────────────────────────────────────────────────────
    revenue = data.get("revenue", 0)
    cash    = data.get("cash", 0)
    card    = data.get("card", 0)
    profit  = data.get("profit", 0)
    margin  = round((profit / revenue * 100), 1) if revenue else 0

    def kpi_cell(label, value, colour=DARK_BG):
        return Paragraph(
            f"<font size=7 color='grey'>{label}</font><br/>"
            f"<font size=16 color='{colour.hexval() if hasattr(colour,'hexval') else '#D4AF37'}'>"
            f"<b>{value}</b></font>",
            ParagraphStyle("KPI", alignment=TA_CENTER, leading=20))

    kpi_data = [[
        kpi_cell("TOTAL REVENUE",  f"R{revenue:,.2f}",  GOLD),
        kpi_cell("CASH SALES",     f"R{cash:,.2f}",     GREEN),
        kpi_cell("CARD SALES",     f"R{card:,.2f}",     BLUE),
        kpi_cell("NET PROFIT",     f"R{profit:,.2f}",   GREEN if profit >= 0 else RED),
        kpi_cell("PROFIT MARGIN",  f"{margin}%",        GREEN if margin >= 20 else ORANGE),
    ]]
    kpi_table = Table(kpi_data, colWidths=[35*mm]*5)
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), LIGHT_GREY),
        ("BOX",           (0,0), (-1,-1), 1, GOLD),
        ("INNERGRID",     (0,0), (-1,-1), 0.5, colors.HexColor("#DDDDDD")),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("ROUNDEDCORNERS",[4]),
    ]))
    story.append(kpi_table)

    # ── Cash vs Card bar ──────────────────────────────────────────────────
    section("💰 PAYMENT BREAKDOWN")
    if revenue > 0:
        cash_pct = round(cash / revenue * 100, 1)
        card_pct = round(card / revenue * 100, 1)
        breakdown_data = [[
            Paragraph(f"<b>Cash  R{cash:,.2f}  ({cash_pct}%)</b>",
                ParagraphStyle("BP", fontSize=9, textColor=WHITE)),
            Paragraph(f"<b>Card  R{card:,.2f}  ({card_pct}%)</b>",
                ParagraphStyle("BP2", fontSize=9, textColor=WHITE, alignment=TA_RIGHT)),
        ]]
        bar_widths = [175*mm * cash_pct/100, 175*mm * card_pct/100]
        bar_widths = [max(w, 5*mm) for w in bar_widths]
        bar_table  = Table(breakdown_data, colWidths=bar_widths)
        bar_table.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (0,0), GREEN),
            ("BACKGROUND", (1,0), (1,0), BLUE),
            ("TOPPADDING", (0,0),(-1,-1), 8),
            ("BOTTOMPADDING",(0,0),(-1,-1),8),
            ("LEFTPADDING", (0,0),(-1,-1), 6),
            ("RIGHTPADDING",(0,0),(-1,-1), 6),
        ]))
        story.append(bar_table)
        story.append(Spacer(1, 4))

    # ══════════════════════════════════════════════════════════════════════
    #  STAFF PERFORMANCE
    # ══════════════════════════════════════════════════════════════════════
    section("👥 STAFF PERFORMANCE")
    staff = sorted(data.get("staff", []), key=lambda x: x["total"], reverse=True)

    if staff:
        top_total = staff[0]["total"] if staff else 1
        staff_rows = []
        for rank, s in enumerate(staff, 1):
            pct = round(s["total"] / revenue * 100, 1) if revenue else 0
            bar_len = int((s["total"] / top_total) * 30) if top_total else 0
            bar = "█" * bar_len
            medal = ["🥇","🥈","🥉"][rank-1] if rank <= 3 else f"#{rank}"
            staff_rows.append([
                f"{medal}  {s['name']}",
                f"R{s['total']:,.2f}",
                f"{pct}% of revenue",
                bar,
            ])

        t = alt_table(
            ["STAFF MEMBER", "SALES TOTAL", "REVENUE SHARE", "PERFORMANCE"],
            staff_rows,
            [60*mm, 35*mm, 40*mm, 40*mm]
        )
        story.append(t)

    # ══════════════════════════════════════════════════════════════════════
    #  HOURLY SALES BREAKDOWN
    # ══════════════════════════════════════════════════════════════════════
    section("🕐 HOURLY SALES BREAKDOWN")
    sales = data.get("sales", [])
    hourly: dict = {}
    for s in sales:
        try:
            hour = datetime.fromisoformat(s["created_at"]).strftime("%H:00")
        except Exception:
            hour = "Unknown"
        if hour not in hourly:
            hourly[hour] = {"total": 0, "count": 0}
        hourly[hour]["total"] += s.get("total", 0)
        hourly[hour]["count"] += 1

    if hourly:
        peak_hour = max(hourly, key=lambda h: hourly[h]["total"])
        hourly_rows = []
        for hour in sorted(hourly.keys()):
            h = hourly[hour]
            avg = h["total"] / h["count"] if h["count"] else 0
            flag = " ⚡ PEAK" if hour == peak_hour else ""
            hourly_rows.append([
                f"{hour}{flag}",
                str(h["count"]),
                f"R{h['total']:,.2f}",
                f"R{avg:,.2f}",
            ])
        t = alt_table(
            ["HOUR", "TRANSACTIONS", "REVENUE", "AVG SALE"],
            hourly_rows,
            [50*mm, 35*mm, 45*mm, 45*mm]
        )
        story.append(t)
        story.append(Paragraph(
            f"Peak trading hour: <b>{peak_hour}</b> — R{hourly[peak_hour]['total']:,.2f} in sales",
            small_grey))

    # ══════════════════════════════════════════════════════════════════════
    #  PAGE 2 — PRODUCT PERFORMANCE
    # ══════════════════════════════════════════════════════════════════════
    story.append(PageBreak())

    section("📦 FULL PRODUCT PERFORMANCE")

    products = data.get("products", [])
    # Sort by units sold descending
    products_sorted = sorted(products, key=lambda p: p.get("sold", 0), reverse=True)

    prod_rows = []
    for p in products_sorted:
        sold     = p.get("sold", (p.get("opening_stock", 0) - p.get("stock", 0)))
        price    = p.get("price", 0)
        cost     = p.get("cost_price", 0)
        margin_u = price - cost
        profit_p = sold * margin_u
        stock    = p.get("stock", 0)
        opening  = p.get("opening_stock", 0)

        if sold == 0:
            status = "DEAD STOCK"
        elif stock <= 5:
            status = "LOW STOCK"
        elif sold >= opening * 0.7:
            status = "FAST MOVER"
        else:
            status = "Normal"

        prod_rows.append([
            p.get("name", ""),
            p.get("category", "").upper(),
            f"R{cost:.2f}",
            f"R{price:.2f}",
            f"R{margin_u:.2f}",
            str(opening),
            str(stock),
            str(sold),
            f"R{profit_p:.2f}",
            status,
        ])

    def profit_colour(val):
        try:
            num = float(val.replace("R","").replace(",",""))
            if num < 0:   return RED
            if num == 0:  return ORANGE
            return GREEN
        except Exception:
            return None

    def status_colour(val):
        mapping = {
            "DEAD STOCK":  RED,
            "LOW STOCK":   ORANGE,
            "FAST MOVER":  GREEN,
            "Normal":      None,
        }
        return mapping.get(val)

    # Split into two tables so profit col and status col both get highlights
    headers = ["PRODUCT","CAT","COST","PRICE","MARGIN",
               "OPENING","STOCK","SOLD","PROFIT","STATUS"]
    col_w   = [38*mm,16*mm,16*mm,16*mm,16*mm,14*mm,14*mm,12*mm,18*mm,18*mm]

    t = Table([headers] + prod_rows, colWidths=col_w)
    style_cmds = [
        ("BACKGROUND",  (0,0),(-1,0), DARK_BG),
        ("TEXTCOLOR",   (0,0),(-1,0), GOLD),
        ("FONTNAME",    (0,0),(-1,0), "Helvetica-Bold"),
        ("FONTSIZE",    (0,0),(-1,0), 8),
        ("ALIGN",       (0,0),(-1,0), "CENTER"),
        ("BOTTOMPADDING",(0,0),(-1,0), 6),
        ("TOPPADDING",  (0,0),(-1,0), 6),
        ("FONTNAME",    (0,1),(-1,-1), "Helvetica"),
        ("FONTSIZE",    (0,1),(-1,-1), 7.5),
        ("ALIGN",       (1,1),(-1,-1), "CENTER"),
        ("ALIGN",       (0,1),(0,-1),  "LEFT"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, LIGHT_GREY]),
        ("GRID",        (0,0),(-1,-1), 0.4, colors.HexColor("#CCCCCC")),
        ("TOPPADDING",  (0,1),(-1,-1), 3),
        ("BOTTOMPADDING",(0,1),(-1,-1), 3),
    ]
    for i, row in enumerate(prod_rows, start=1):
        pc = profit_colour(row[8])
        sc = status_colour(row[9])
        if pc:
            style_cmds += [("TEXTCOLOR",(8,i),(8,i),pc),("FONTNAME",(8,i),(8,i),"Helvetica-Bold")]
        if sc:
            style_cmds += [("TEXTCOLOR",(9,i),(9,i),sc),("FONTNAME",(9,i),(9,i),"Helvetica-Bold")]
    t.setStyle(TableStyle(style_cmds))
    story.append(t)

    # ══════════════════════════════════════════════════════════════════════
    #  FAST MOVERS vs SLOW MOVERS
    # ══════════════════════════════════════════════════════════════════════
    section("🚀 FAST MOVERS vs ❄️ SLOW MOVERS")

    fast = [p for p in products_sorted if p.get("sold", 0) > 0 and
            p.get("sold", 0) >= p.get("opening_stock", 1) * 0.5]
    slow = [p for p in products_sorted if p.get("sold", 0) == 0]
    mid  = [p for p in products_sorted if p not in fast and p not in slow]

    def mini_table(title, items, colour):
        if not items:
            return
        story.append(Paragraph(title, ParagraphStyle("MiniHdr",
            fontSize=10, textColor=colour, fontName="Helvetica-Bold", spaceBefore=8)))
        rows = []
        for p in items:
            sold = p.get("sold", 0)
            rows.append([p["name"], p.get("category","").upper(),
                         str(sold), f"R{sold*(p.get('price',0)-p.get('cost_price',0)):,.2f}"])
        t2 = alt_table(["PRODUCT","CATEGORY","SOLD","PROFIT"],
                       rows, [70*mm, 30*mm, 30*mm, 45*mm])
        story.append(t2)

    mini_table("🚀 Fast Movers (50%+ of opening stock sold)", fast, GREEN)
    mini_table("⚠️  Dead Stock (nothing sold today)",         slow, RED)

    # ══════════════════════════════════════════════════════════════════════
    #  LOW STOCK & RESTOCK RECOMMENDATIONS
    # ══════════════════════════════════════════════════════════════════════
    section("🔴 LOW STOCK & RESTOCK RECOMMENDATIONS")

    low = [p for p in products if p.get("stock", 0) <= 5]
    if low:
        restock_rows = []
        for p in low:
            sold_today  = p.get("sold", 0)
            recommended = max(sold_today * 2, 24)  # restock at least 2× today's sales or 24
            urgency     = "CRITICAL" if p.get("stock", 0) == 0 else "URGENT" if p.get("stock", 0) <= 2 else "LOW"
            restock_rows.append([
                p["name"],
                p.get("category", "").upper(),
                str(p.get("stock", 0)),
                str(sold_today),
                str(int(recommended)),
                urgency,
            ])
        t = alt_table(
            ["PRODUCT", "CATEGORY", "STOCK LEFT", "SOLD TODAY", "RECOMMENDED ORDER", "URGENCY"],
            restock_rows,
            [50*mm, 20*mm, 22*mm, 22*mm, 35*mm, 26*mm]
        )

        # Colour urgency column
        style_extra = []
        for i, row in enumerate(restock_rows, start=1):
            urg_colour = {"CRITICAL": RED, "URGENT": ORANGE, "LOW": colors.goldenrod}.get(row[5])
            if urg_colour:
                style_extra += [
                    ("TEXTCOLOR",(5,i),(5,i), urg_colour),
                    ("FONTNAME", (5,i),(5,i), "Helvetica-Bold"),
                ]
        if style_extra:
            t.setStyle(TableStyle(style_extra))
        story.append(t)
    else:
        story.append(Paragraph("✅ All products are adequately stocked.", normal))

    # ══════════════════════════════════════════════════════════════════════
    #  FOOTER SUMMARY BOX
    # ══════════════════════════════════════════════════════════════════════
    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD))

    total_units_sold = sum(p.get("sold", 0) for p in products)
    best_product     = products_sorted[0]["name"] if products_sorted else "N/A"
    best_staff       = staff[0]["name"] if staff else "N/A"

    summary_data = [[
        Paragraph(
            f"<b>END OF DAY SUMMARY</b><br/><br/>"
            f"Total Revenue:      <b>R{revenue:,.2f}</b><br/>"
            f"Cash:               <b>R{cash:,.2f}</b>  |  Card: <b>R{card:,.2f}</b><br/>"
            f"Net Profit:         <b>R{profit:,.2f}</b>  ({margin}% margin)<br/>"
            f"Units Sold:         <b>{total_units_sold}</b><br/>"
            f"Best Selling Item:  <b>{best_product}</b><br/>"
            f"Top Staff Member:   <b>{best_staff}</b><br/>"
            f"Low Stock Items:    <b>{len(low)}</b><br/>"
            f"Dead Stock Items:   <b>{len(slow)}</b>",
            ParagraphStyle("SumBox", fontSize=9, textColor=WHITE,
                fontName="Helvetica", leading=16))
    ]]
    sum_table = Table(summary_data, colWidths=[175*mm])
    sum_table.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), DARK_BG),
        ("TOPPADDING",    (0,0),(-1,-1), 12),
        ("BOTTOMPADDING", (0,0),(-1,-1), 12),
        ("LEFTPADDING",   (0,0),(-1,-1), 14),
        ("RIGHTPADDING",  (0,0),(-1,-1), 14),
        ("BOX",           (0,0),(-1,-1), 1.5, GOLD),
    ]))
    story.append(sum_table)

    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}  |  Confidential — Owner Use Only",
        ParagraphStyle("Footer", fontSize=7, textColor=colors.grey, alignment=TA_CENTER)))

    doc.build(story)
    print(f"Report saved to {output_path}")


# ── CLI entry point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-file", required=True, help="Path to JSON file with report data")
    parser.add_argument("--output",    required=True, help="Output PDF path")
    args = parser.parse_args()
    with open(args.data_file, "r") as f:
        data = json.load(f)
    generate_report(data, args.output)

