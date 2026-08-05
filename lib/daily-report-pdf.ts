import PDFDocument from "pdfkit";
import { businessDateString } from "@/lib/business-day";

// ─── COLOURS ─────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const DARK   = "#1A1A1A";
const GREEN  = "#27AE60";
const RED    = "#C0392B";
const ORANGE = "#E67E22";
const BLUE   = "#2980B9";
const LGREY  = "#F5F5F5";
const MGREY  = "#CCCCCC";
const WHITE  = "#FFFFFF";
const DGREY  = "#666666";
const INK    = "#111111";

// Content must never run into the footer band drawn at the very end.
const BOTTOM_MARGIN = 55;

export interface ReportProduct {
  name: string;
  category: string;
  price: number;
  cost_price: number;
  opening_stock: number;
  stock: number;
  sold: number;
}
export interface ReportStaff { name: string; total: number; }
export interface ReportSale  { created_at: string; total: number; payment_method: string; staff_name: string; }
export interface ReportStaffSession {
  staffName: string;
  loginAt: string;
  logoutAt: string | null;
  hoursWorked: number;
  itemsSold: number;
  moneyMade: number;
  moneyCounted: number | null;
}
export interface ReportCashCount {
  created_at: string;
  staff_name: string;
  counted_amount: number;
  expected_cash: number;
  status: string;
  owner_amount: number | null;
}
export interface ReportUndoEntry {
  created_at: string;
  staff_name: string;
  undone_by: string;
  approved_by: string | null;
  total: number;
}
export interface ReportData {
  date: string;
  revenue: number;
  cash: number;
  card: number;
  profit: number;
  staff: ReportStaff[];
  products: ReportProduct[];
  sales: ReportSale[];
  staffSessions: ReportStaffSession[];
  cashCounts: ReportCashCount[];
  undoLog: ReportUndoEntry[];
}

function n(v: unknown): number { return Number(v) || 0; }
function fmt(v: number)    { return `R${v.toFixed(2)}`; }
function fmtSigned(v: number) { return `${v >= 0 ? "+" : "-"}R${Math.abs(v).toFixed(2)}`; }

export async function buildDailyReportPDF(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 20, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data",  c  => chunks.push(c));
    doc.on("end",   ()  => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W     = doc.page.width;
    const LEFT  = 20;
    const RIGHT = W - 20;
    const COL   = RIGHT - LEFT;

    // ── helpers ──────────────────────────────────────────────────────────
    function hline(y: number, colour = GOLD, lw = 0.5) {
      doc.save().strokeColor(colour).lineWidth(lw)
        .moveTo(LEFT, y).lineTo(RIGHT, y).stroke().restore();
    }

    function sectionTitle(title: string) {
      doc.moveDown(0.4);
      hline(doc.y);
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(GOLD).text(title, LEFT);
      doc.moveDown(0.3);
    }

    function drawTable(
      headers:   string[],
      rows:      string[][],
      rawColWidths: number[],
      colAligns: ("left"|"right"|"center")[],
      rowColours?: (string|null)[][]
    ) {
      // Guard against column widths that sum past the printable width —
      // previously this silently pushed the rightmost column off the page
      // instead of erroring, which is exactly how the STAFF ACTIVITY table
      // ended up with a clipped "MONEY MADE" column.
      const rawTotal = rawColWidths.reduce((s, w) => s + w, 0);
      const colWidths = rawTotal > COL ? rawColWidths.map(w => (w / rawTotal) * COL) : rawColWidths;

      const ROW_H = 16;
      const HDR_H = 18;
      const PAD   = 4;
      const x0    = LEFT;

      function drawHeader(y: number) {
        doc.save().rect(x0, y, COL, HDR_H).fill(DARK).restore();
        let cx = x0 + PAD;
        headers.forEach((h, i) => {
          doc.font("Helvetica-Bold").fontSize(7).fillColor(GOLD)
            .text(h, cx, y + 5, { width: colWidths[i] - PAD * 2, align: colAligns[i] ?? "left", lineBreak: false });
          cx += colWidths[i];
        });
        return y + HDR_H;
      }

      // Check page space
      if (doc.y + HDR_H + ROW_H * 2 > doc.page.height - BOTTOM_MARGIN) {
        doc.addPage();
        doc.y = 30;
      }

      let ry = drawHeader(doc.y);

      rows.forEach((row, ri) => {
        if (ry + ROW_H > doc.page.height - BOTTOM_MARGIN) {
          doc.addPage();
          doc.y = 30;
          ry = drawHeader(doc.y);
        }

        // Row bg
        doc.save().rect(x0, ry, COL, ROW_H).fill(ri % 2 === 0 ? WHITE : LGREY).restore();
        // Row border
        doc.save().strokeColor(MGREY).lineWidth(0.3).rect(x0, ry, COL, ROW_H).stroke().restore();

        // Cells
        let cx = x0 + PAD;
        row.forEach((cell, ci) => {
          const colour = rowColours?.[ri]?.[ci] ?? INK;
          const bold   = colour !== INK && colour !== DGREY && colour !== WHITE;
          doc.font(bold ? "Helvetica-Bold" : "Helvetica")
            .fontSize(7).fillColor(colour)
            .text(cell ?? "", cx, ry + 5, {
              width: colWidths[ci] - PAD * 2,
              height: ROW_H - PAD,
              align: colAligns[ci] ?? "left",
              ellipsis: true,
            });
          cx += colWidths[ci];
        });

        ry += ROW_H;
      });

      doc.y = ry + 6;
    }

    function emptyNote(msg: string, colour = DGREY) {
      doc.font("Helvetica").fontSize(8).fillColor(colour).text(msg, LEFT);
      doc.moveDown(0.3);
    }

    function roundedKpiCard(x: number, y: number, w: number, h: number, label: string, value: string, colour: string) {
      doc.save().roundedRect(x, y, w, h, 4).fill(LGREY).restore();
      doc.save().roundedRect(x, y, w, h, 4).strokeColor(MGREY).lineWidth(0.5).stroke().restore();
      doc.save().roundedRect(x, y, 3, h, 1.5).fill(colour).restore();
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(DGREY).text(label, x + 9, y + 7, { width: w - 14 });
      doc.font("Helvetica-Bold").fontSize(11).fillColor(colour).text(value, x + 9, y + 22, { width: w - 14 });
    }

    // A horizontal legend that measures its own text so entries never
    // overlap, regardless of how long the currency values get.
    function legendRow(y: number, items: { label: string; colour: string }[]) {
      const swatch = 9;
      const gap = 22;
      let x = LEFT;
      items.forEach((item) => {
        doc.save().rect(x, y + 1, swatch, swatch).fill(item.colour).restore();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(INK)
          .text(item.label, x + swatch + 6, y, { lineBreak: false });
        x += swatch + 6 + doc.widthOfString(item.label) + gap;
      });
    }

    // Real drawn horizontal bar chart (replaces the old monospace-dependent
    // ASCII "I" bar, which could visually run into the next column).
    function drawBarChart(rows: { label: string; value: number; colour: string }[], maxValue: number) {
      const labelW = 130;
      const valueW = 80;
      const barH = 10;
      const rowH = 20;
      const trackW = COL - labelW - valueW;

      if (doc.y + rowH * rows.length > doc.page.height - BOTTOM_MARGIN) {
        doc.addPage();
        doc.y = 30;
      }

      rows.forEach((row) => {
        const y = doc.y;
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(INK)
          .text(row.label, LEFT, y + 2, { width: labelW - 6, lineBreak: false });

        const trackX = LEFT + labelW;
        doc.save().rect(trackX, y, trackW, barH).fill(LGREY).restore();
        const w = maxValue > 0 ? Math.max(2, (row.value / maxValue) * trackW) : 0;
        doc.save().rect(trackX, y, w, barH).fill(row.colour).restore();

        doc.font("Helvetica-Bold").fontSize(7.5).fillColor(row.colour)
          .text(fmt(row.value), trackX + trackW + 6, y + 1, { width: valueW - 6, align: "right", lineBreak: false });

        doc.y = y + rowH;
      });
    }

    // ════════════════════════════════════════════════════════════════════
    //  PAGE 1 — HEADER
    // ════════════════════════════════════════════════════════════════════
    doc.save().rect(LEFT, 20, COL, 55).fill(DARK).restore();
    doc.font("Helvetica-Bold").fontSize(26).fillColor(GOLD).text("TAVERN", LEFT + 10, 26);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(WHITE).text("DAILY BUSINESS REPORT", LEFT + 10, 56);
    doc.font("Helvetica").fontSize(7).fillColor("#B8860B").text("Powered by TillFlow", LEFT + 10, 68);
    doc.font("Helvetica").fontSize(9).fillColor(GOLD)
      .text(data.date ?? businessDateString(), RIGHT - 110, 58, { width: 100, align: "right" });
    doc.y = 85;

    // ── KPI CARDS ────────────────────────────────────────────────────────
    const revenue = n(data.revenue);
    const cash    = n(data.cash);
    const card    = n(data.card);
    const profit  = n(data.profit);
    const margin  = revenue > 0 ? (profit / revenue * 100).toFixed(1) : "0.0";

    const kpis = [
      { label: "TOTAL REVENUE", value: fmt(revenue), colour: GOLD  },
      { label: "CASH SALES",    value: fmt(cash),    colour: GREEN },
      { label: "CARD SALES",    value: fmt(card),    colour: BLUE  },
      { label: "NET PROFIT",    value: fmt(profit),  colour: profit >= 0 ? GREEN : RED },
      { label: "PROFIT MARGIN", value: `${margin}%`, colour: parseFloat(margin) >= 20 ? GREEN : ORANGE },
    ];

    const kw = COL / 5;
    const ky = doc.y;
    kpis.forEach((k, i) => {
      roundedKpiCard(LEFT + i * kw, ky, kw - 6, 44, k.label, k.value, k.colour);
    });
    doc.y = ky + 54;

    // ── PAYMENT BAR ──────────────────────────────────────────────────────
    sectionTitle("PAYMENT BREAKDOWN");
    if (revenue > 0) {
      const by    = doc.y;
      const cashW = COL * (cash / revenue);
      const cardW = COL * (card / revenue);
      doc.save().rect(LEFT, by, cashW, 16).fill(GREEN).restore();
      doc.save().rect(LEFT + cashW, by, cardW, 16).fill(BLUE).restore();
      doc.y = by + 24;

      legendRow(doc.y, [
        { label: `Cash  ${fmt(cash)}  (${(cash / revenue * 100).toFixed(1)}%)`, colour: GREEN },
        { label: `Card  ${fmt(card)}  (${(card / revenue * 100).toFixed(1)}%)`, colour: BLUE },
      ]);
      doc.y += 20;
    } else {
      emptyNote("No sales recorded yet.");
    }

    // ── STAFF PERFORMANCE ────────────────────────────────────────────────
    sectionTitle("STAFF PERFORMANCE");
    const staff = [...(data.staff ?? [])].sort((a, b) => n(b.total) - n(a.total));
    if (staff.length) {
      const medals   = ["1st", "2nd", "3rd"];
      const sRows    = staff.map((s, i) => {
        const pct = revenue > 0 ? (n(s.total) / revenue * 100).toFixed(1) : "0.0";
        return [`${medals[i] ?? "#" + (i + 1)}  ${s.name}`, fmt(n(s.total)), `${pct}%`];
      });
      const sColours = sRows.map((_, i) => [
        i === 0 ? GOLD : i === 1 ? "#999999" : "#CD7F32",
        GREEN, DGREY,
      ]);
      drawTable(
        ["STAFF MEMBER", "SALES TOTAL", "REVENUE %"],
        sRows,
        [255, 150, 150],
        ["left", "right", "right"],
        sColours
      );

      doc.moveDown(0.2);
      const topTotal = n(staff[0]?.total) || 1;
      drawBarChart(
        staff.map((s, i) => ({
          label: s.name,
          value: n(s.total),
          colour: i === 0 ? GOLD : i === 1 ? "#999999" : i === 2 ? "#CD7F32" : BLUE,
        })),
        topTotal
      );
    } else {
      emptyNote("No staff sales recorded.");
    }

    // ── HOURLY BREAKDOWN ─────────────────────────────────────────────────
    sectionTitle("HOURLY SALES BREAKDOWN");
    const hourly: Record<string, { total: number; count: number }> = {};
    (data.sales ?? []).forEach(s => {
      const hour = s.created_at
        ? new Date(s.created_at).getHours().toString().padStart(2,"0") + ":00"
        : "Unknown";
      if (!hourly[hour]) hourly[hour] = { total: 0, count: 0 };
      hourly[hour].total += n(s.total);
      hourly[hour].count += 1;
    });

    if (Object.keys(hourly).length) {
      const peak     = Object.entries(hourly).sort((a,b) => b[1].total - a[1].total)[0][0];
      const hRows    = Object.keys(hourly).sort().map(h => {
        const avg = hourly[h].total / hourly[h].count;
        return [h === peak ? `${h} PEAK` : h, String(hourly[h].count), fmt(hourly[h].total), fmt(avg)];
      });
      const hColours = hRows.map(r => [
        r[0].includes("PEAK") ? GOLD : INK, INK, GREEN, INK
      ]);
      drawTable(
        ["HOUR","TRANSACTIONS","REVENUE","AVG SALE"],
        hRows,
        [140,120,140,155],
        ["left","center","right","right"],
        hColours
      );
    } else {
      emptyNote("No hourly data available.");
    }

    // ── STAFF ACTIVITY ───────────────────────────────────────────────────
    sectionTitle("STAFF ACTIVITY");
    const sessions = data.staffSessions ?? [];
    if (sessions.length) {
      const fmtTime = (v: string | null) => v ? new Date(v).toLocaleTimeString() : "—";
      const aRows = sessions.map(s => [
        s.staffName,
        fmtTime(s.loginAt),
        fmtTime(s.logoutAt),
        s.hoursWorked.toFixed(1),
        String(s.itemsSold),
        fmt(s.moneyMade),
        s.moneyCounted === null ? "—" : fmt(s.moneyCounted),
      ]);
      const aColours = aRows.map((row) => [INK, INK, INK, INK, INK, GREEN, row[6] === "—" ? DGREY : GREEN]);
      drawTable(
        ["STAFF", "LOGIN", "LOGOUT", "HOURS", "ITEMS SOLD", "MONEY MADE", "MONEY COUNTED"],
        aRows,
        [95, 70, 70, 50, 75, 100, 95],
        ["left", "center", "center", "center", "center", "right", "right"],
        aColours
      );
    } else {
      emptyNote("No staff activity recorded.");
    }

    // ── CASH RECONCILIATION ──────────────────────────────────────────────
    sectionTitle("CASH RECONCILIATION");
    const cashCounts = data.cashCounts ?? [];
    if (cashCounts.length) {
      const cRows = cashCounts.map(c => {
        const counted  = n(c.counted_amount);
        const expected = n(c.expected_cash);
        const variance = counted - expected;
        return [
          c.created_at ? new Date(c.created_at).toLocaleTimeString() : "—",
          c.staff_name ?? "",
          fmt(counted),
          fmt(expected),
          fmtSigned(variance),
          (c.status ?? "pending").toUpperCase(),
        ];
      });
      const statusColour = (s: string) => s === "CONFIRMED" ? GREEN : s === "DISCREPANCY" ? RED : ORANGE;
      const cColours = cashCounts.map((c, i) => {
        const variance = n(c.counted_amount) - n(c.expected_cash);
        return [INK, INK, INK, INK, variance === 0 ? GREEN : RED, statusColour(cRows[i][5])];
      });
      drawTable(
        ["TIME", "STAFF", "COUNTED", "EXPECTED", "VARIANCE", "STATUS"],
        cRows,
        [80, 110, 95, 95, 85, 90],
        ["left", "left", "right", "right", "right", "center"],
        cColours
      );
    } else {
      emptyNote("No cash counts submitted today.");
    }

    // ── UNDO LOG ─────────────────────────────────────────────────────────
    sectionTitle("UNDO LOG");
    const undoLog = data.undoLog ?? [];
    if (undoLog.length) {
      const uRows = undoLog.map(u => [
        u.created_at ? new Date(u.created_at).toLocaleString() : "—",
        u.staff_name ?? "",
        u.undone_by ?? "",
        u.approved_by || "—",
        fmt(n(u.total)),
      ]);
      const uColours = uRows.map(() => [INK, INK, INK, INK, ORANGE]);
      drawTable(
        ["TIME", "ORIGINAL STAFF", "UNDONE BY", "APPROVED BY", "AMOUNT"],
        uRows,
        [140, 110, 90, 90, 125],
        ["left", "left", "left", "left", "right"],
        uColours
      );
    } else {
      emptyNote("No sales were undone today.", GREEN);
    }

    // ════════════════════════════════════════════════════════════════════
    //  PAGE 2 — PRODUCTS
    // ════════════════════════════════════════════════════════════════════
    doc.addPage();
    doc.save().rect(LEFT, 20, COL, 32).fill(DARK).restore();
    doc.font("Helvetica-Bold").fontSize(11).fillColor(GOLD)
      .text("TAVERN  PRODUCT PERFORMANCE", LEFT + 10, 29);
    doc.font("Helvetica").fontSize(9).fillColor(WHITE)
      .text(data.date ?? "", RIGHT - 110, 29, { width: 100, align: "right" });
    doc.y = 62;

    sectionTitle("FULL PRODUCT PERFORMANCE");

    const products = [...(data.products ?? [])].sort((a,b) => n(b.sold) - n(a.sold));

    const statusOf = (p: ReportProduct) => {
      const sold = n(p.sold);
      if (sold === 0)                       return "DEAD STOCK";
      if (n(p.stock) <= 5)                  return "LOW STOCK";
      if (sold >= n(p.opening_stock) * 0.7) return "FAST MOVER";
      return "Normal";
    };
    const statusColour = (s: string) =>
      s === "DEAD STOCK" ? RED : s === "LOW STOCK" ? ORANGE : s === "FAST MOVER" ? GREEN : INK;
    const profitColour = (v: number) => v < 0 ? RED : v === 0 ? ORANGE : GREEN;

    if (products.length) {
      const pRows = products.map(p => {
        const sold  = n(p.sold);
        const prof  = sold * (n(p.price) - n(p.cost_price));
        return [
          p.name ?? "",
          (p.category ?? "").toUpperCase(),
          fmt(n(p.cost_price)),
          fmt(n(p.price)),
          fmt(n(p.price) - n(p.cost_price)),
          String(n(p.opening_stock)),
          String(n(p.stock)),
          String(sold),
          fmt(prof),
          statusOf(p),
        ];
      });

      const pColours = products.map(p => {
        const sold = n(p.sold);
        const prof = sold * (n(p.price) - n(p.cost_price));
        return [
          INK, DGREY, INK, INK, INK,
          INK, INK, INK,
          profitColour(prof),
          statusColour(statusOf(p)),
        ];
      });

      drawTable(
        ["PRODUCT","CAT","COST","PRICE","MARGIN","OPEN","STOCK","SOLD","PROFIT","STATUS"],
        pRows,
        [122, 44, 44, 44, 44, 34, 34, 30, 54, 105],
        ["left","center","right","right","right","center","center","center","right","center"],
        pColours
      );
    } else {
      emptyNote("No products recorded.");
    }

    // ── LOW STOCK ─────────────────────────────────────────────────────────
    sectionTitle("LOW STOCK & RESTOCK RECOMMENDATIONS");
    const low = products.filter(p => n(p.stock) <= 5);
    if (low.length) {
      const lRows = low.map(p => {
        const rec     = Math.max(n(p.sold) * 2, 24);
        const urgency = n(p.stock) === 0 ? "CRITICAL" : n(p.stock) <= 2 ? "URGENT" : "LOW";
        return [p.name ?? "", (p.category ?? "").toUpperCase(), String(n(p.stock)), String(n(p.sold)), String(Math.round(rec)), urgency];
      });
      const urgColour = (u: string) => u === "CRITICAL" ? RED : u === "URGENT" ? ORANGE : "#B8860B";
      const lColours  = lRows.map(r => [INK,INK,INK,INK,INK, urgColour(r[5])]);
      drawTable(
        ["PRODUCT","CATEGORY","STOCK LEFT","SOLD TODAY","REORDER QTY","URGENCY"],
        lRows,
        [160,80,65,65,90,95],
        ["left","center","center","center","center","center"],
        lColours
      );
    } else {
      emptyNote("All products adequately stocked.", GREEN);
    }

    // ── DEAD STOCK ────────────────────────────────────────────────────────
    const dead = products.filter(p => n(p.sold) === 0);
    if (dead.length) {
      sectionTitle("DEAD STOCK — NOTHING SOLD TODAY");
      const dRows    = dead.map(p => [p.name ?? "", (p.category ?? "").toUpperCase(), String(n(p.stock)), fmt(n(p.price) - n(p.cost_price))]);
      const dColours = dRows.map(() => [INK, DGREY, INK, ORANGE]);
      drawTable(["PRODUCT","CATEGORY","STOCK","MARGIN/UNIT"], dRows, [220,120,100,115], ["left","center","center","right"], dColours);
    }

    // ── FAST MOVERS ───────────────────────────────────────────────────────
    const fast = products.filter(p => n(p.sold) >= n(p.opening_stock) * 0.5 && n(p.sold) > 0);
    if (fast.length) {
      sectionTitle("FAST MOVERS — 50%+ OF OPENING STOCK SOLD");
      const fRows    = fast.map(p => [p.name ?? "", (p.category ?? "").toUpperCase(), String(n(p.sold)), fmt(n(p.sold) * (n(p.price) - n(p.cost_price)))]);
      const fColours = fRows.map(() => [INK, DGREY, GREEN, GREEN]);
      drawTable(["PRODUCT","CATEGORY","SOLD","PROFIT"], fRows, [220,120,100,115], ["left","center","center","right"], fColours);
    }

    // ── SUMMARY BOX ───────────────────────────────────────────────────────
    doc.moveDown(0.5);
    if (doc.y + 110 > doc.page.height - BOTTOM_MARGIN) doc.addPage();
    hline(doc.y, GOLD, 1.5);
    doc.moveDown(0.3);

    const sy  = doc.y;
    const sh  = 100;
    doc.save().roundedRect(LEFT, sy, COL, sh, 6).fill(DARK).restore();

    const totalSold = products.reduce((s,p) => s + n(p.sold), 0);
    const best      = products[0]?.name ?? "N/A";
    const topStaff  = staff[0]?.name    ?? "N/A";

    doc.font("Helvetica-Bold").fontSize(10).fillColor(GOLD).text("END OF DAY SUMMARY", LEFT + 12, sy + 10);

    type SummaryLine = { label: string; value: string; colour?: string };
    const sl: SummaryLine[] = [
      { label: "Total Revenue", value: fmt(revenue), colour: GOLD },
      { label: "Net Profit",    value: `${fmt(profit)}  (${margin}% margin)`, colour: profit >= 0 ? "#6fe08a" : "#ff8589" },
      { label: "Best Seller",   value: best },
      { label: "Low Stock Items", value: String(low.length), colour: low.length > 0 ? ORANGE : WHITE },
    ];
    const sr: SummaryLine[] = [
      { label: "Cash / Card", value: `${fmt(cash)} / ${fmt(card)}` },
      { label: "Units Sold",  value: String(totalSold) },
      { label: "Top Staff",   value: topStaff },
      { label: "Dead Stock Items", value: String(dead.length), colour: dead.length > 0 ? ORANGE : WHITE },
    ];

    const labelW = 100;
    const colX = [LEFT + 12, LEFT + COL / 2];
    [sl, sr].forEach((column, ci) => {
      column.forEach((line, i) => {
        const x = colX[ci];
        const y = sy + 26 + i * 16;
        doc.font("Helvetica").fontSize(7.5).fillColor("#BBBBBB").text(line.label, x, y, { width: labelW, lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(8).fillColor(line.colour ?? WHITE)
          .text(line.value, x + labelW, y, { width: COL / 2 - labelW - 20, lineBreak: false });
      });
    });

    doc.y = sy + sh + 10;
    doc.font("Helvetica").fontSize(7).fillColor(DGREY)
      .text(`TillFlow POS · Generated ${new Date().toLocaleString()} · Confidential — Owner Use Only`, LEFT, doc.y, { width: COL, align: "center", lineBreak: false });

    doc.end();
  });
}
