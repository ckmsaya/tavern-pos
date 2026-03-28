import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";

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

interface Product {
  name: string;
  category: string;
  price: number;
  cost_price: number;
  opening_stock: number;
  stock: number;
  sold: number;
}
interface Staff   { name: string; total: number; }
interface Sale    { created_at: string; total: number; payment_method: string; staff_name: string; }
interface ReportData {
  date: string;
  revenue: number;
  cash: number;
  card: number;
  profit: number;
  staff: Staff[];
  products: Product[];
  sales: Sale[];
}

function n(v: any): number { return Number(v) || 0; }
function fmt(v: number)    { return `R${v.toFixed(2)}`; }

async function buildPDF(data: ReportData): Promise<Buffer> {
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
      colWidths: number[],
      colAligns: ("left"|"right"|"center")[],
      rowColours?: (string|null)[][]
    ) {
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
      if (doc.y + HDR_H + ROW_H * 2 > doc.page.height - 40) {
        doc.addPage();
        doc.y = 30;
      }

      let ry = drawHeader(doc.y);

      rows.forEach((row, ri) => {
        if (ry + ROW_H > doc.page.height - 30) {
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
          const colour = rowColours?.[ri]?.[ci] ?? "#111111";
          const bold   = colour !== "#111111" && colour !== DGREY && colour !== WHITE;
          doc.font(bold ? "Helvetica-Bold" : "Helvetica")
            .fontSize(7).fillColor(colour)
            .text(cell ?? "", cx, ry + 5, {
              width: colWidths[ci] - PAD * 2,
              align: colAligns[ci] ?? "left",
              lineBreak: false,
            });
          cx += colWidths[ci];
        });

        ry += ROW_H;
      });

      doc.y = ry + 6;
    }

    // ════════════════════════════════════════════════════════════════════
    //  PAGE 1 — HEADER
    // ════════════════════════════════════════════════════════════════════
    doc.save().rect(LEFT, 20, COL, 55).fill(DARK).restore();
    doc.font("Helvetica-Bold").fontSize(26).fillColor(GOLD).text("TAVERN", LEFT + 10, 28);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(WHITE).text("DAILY BUSINESS REPORT", LEFT + 10, 58);
    doc.font("Helvetica").fontSize(9).fillColor(GOLD)
      .text(data.date ?? new Date().toISOString().split("T")[0], RIGHT - 110, 58, { width: 100, align: "right" });
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
      const kx = LEFT + i * kw;
      doc.save().rect(kx, ky, kw - 2, 44).fill(LGREY).restore();
      doc.save().rect(kx, ky, kw - 2, 44).strokeColor(MGREY).lineWidth(0.5).stroke().restore();
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(DGREY).text(k.label, kx + 5, ky + 7, { width: kw - 10 });
      doc.font("Helvetica-Bold").fontSize(11).fillColor(k.colour).text(k.value, kx + 5, ky + 22, { width: kw - 10 });
    });
    doc.y = ky + 52;

    // ── PAYMENT BAR ──────────────────────────────────────────────────────
    sectionTitle("PAYMENT BREAKDOWN");
    if (revenue > 0) {
      const by    = doc.y;
      const cashW = COL * (cash / revenue);
      const cardW = COL * (card / revenue);
      doc.save().rect(LEFT, by, cashW, 18).fill(GREEN).restore();
      doc.save().rect(LEFT + cashW, by, cardW, 18).fill(BLUE).restore();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE)
        .text(`Cash ${fmt(cash)} (${(cash/revenue*100).toFixed(1)}%)`, LEFT + 5, by + 5, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE)
        .text(`Card ${fmt(card)} (${(card/revenue*100).toFixed(1)}%)`, LEFT + cashW + 5, by + 5, { lineBreak: false });
      doc.y = by + 26;
    } else {
      doc.font("Helvetica").fontSize(8).fillColor(DGREY).text("No sales recorded yet.", LEFT);
      doc.moveDown(0.3);
    }

    // ── STAFF PERFORMANCE ────────────────────────────────────────────────
    sectionTitle("STAFF PERFORMANCE");
    const staff = [...(data.staff ?? [])].sort((a, b) => n(b.total) - n(a.total));
    if (staff.length) {
      const medals   = ["1st", "2nd", "3rd"];
      const topTotal = n(staff[0]?.total) || 1;
      const sRows    = staff.map((s, i) => {
        const pct = revenue > 0 ? (n(s.total) / revenue * 100).toFixed(1) : "0.0";
        const bar = "I".repeat(Math.round(n(s.total) / topTotal * 25));
        return [`${medals[i] ?? "#"+(i+1)}  ${s.name}`, fmt(n(s.total)), `${pct}%`, bar];
      });
      const sColours = sRows.map((_, i) => [
        i === 0 ? GOLD : i === 1 ? "#999999" : "#CD7F32",
        GREEN, DGREY, GOLD,
      ]);
      drawTable(
        ["STAFF MEMBER","SALES TOTAL","REVENUE %","PERFORMANCE"],
        sRows,
        [200, 120, 80, 155],
        ["left","right","right","left"],
        sColours
      );
    } else {
      doc.font("Helvetica").fontSize(8).fillColor(DGREY).text("No staff sales recorded.", LEFT);
      doc.moveDown(0.3);
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
        r[0].includes("PEAK") ? GOLD : "#111111", "#111111", GREEN, "#111111"
      ]);
      drawTable(
        ["HOUR","TRANSACTIONS","REVENUE","AVG SALE"],
        hRows,
        [140,120,140,155],
        ["left","center","right","right"],
        hColours
      );
    } else {
      doc.font("Helvetica").fontSize(8).fillColor(DGREY).text("No hourly data available.", LEFT);
      doc.moveDown(0.3);
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

    const statusOf = (p: Product) => {
      const sold = n(p.sold);
      if (sold === 0)                       return "DEAD STOCK";
      if (n(p.stock) <= 5)                  return "LOW STOCK";
      if (sold >= n(p.opening_stock) * 0.7) return "FAST MOVER";
      return "Normal";
    };
    const statusColour = (s: string) =>
      s === "DEAD STOCK" ? RED : s === "LOW STOCK" ? ORANGE : s === "FAST MOVER" ? GREEN : "#111111";
    const profitColour = (v: number) => v < 0 ? RED : v === 0 ? ORANGE : GREEN;

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
        "#111111", DGREY, "#111111", "#111111", "#111111",
        "#111111", "#111111", "#111111",
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
      const lColours  = lRows.map(r => ["#111111","#111111","#111111","#111111","#111111", urgColour(r[5])]);
      drawTable(
        ["PRODUCT","CATEGORY","STOCK LEFT","SOLD TODAY","REORDER QTY","URGENCY"],
        lRows,
        [160,80,65,65,90,95],
        ["left","center","center","center","center","center"],
        lColours
      );
    } else {
      doc.font("Helvetica").fontSize(8).fillColor(GREEN).text("All products adequately stocked.", LEFT);
      doc.moveDown(0.3);
    }

    // ── DEAD STOCK ────────────────────────────────────────────────────────
    const dead = products.filter(p => n(p.sold) === 0);
    if (dead.length) {
      sectionTitle("DEAD STOCK — NOTHING SOLD TODAY");
      const dRows    = dead.map(p => [p.name ?? "", (p.category ?? "").toUpperCase(), String(n(p.stock)), fmt(n(p.price) - n(p.cost_price))]);
      const dColours = dRows.map(() => ["#111111", DGREY, "#111111", ORANGE]);
      drawTable(["PRODUCT","CATEGORY","STOCK","MARGIN/UNIT"], dRows, [220,120,100,115], ["left","center","center","right"], dColours);
    }

    // ── FAST MOVERS ───────────────────────────────────────────────────────
    const fast = products.filter(p => n(p.sold) >= n(p.opening_stock) * 0.5 && n(p.sold) > 0);
    if (fast.length) {
      sectionTitle("FAST MOVERS — 50%+ OF OPENING STOCK SOLD");
      const fRows    = fast.map(p => [p.name ?? "", (p.category ?? "").toUpperCase(), String(n(p.sold)), fmt(n(p.sold) * (n(p.price) - n(p.cost_price)))]);
      const fColours = fRows.map(() => ["#111111", DGREY, GREEN, GREEN]);
      drawTable(["PRODUCT","CATEGORY","SOLD","PROFIT"], fRows, [220,120,100,115], ["left","center","center","right"], fColours);
    }

    // ── SUMMARY BOX ───────────────────────────────────────────────────────
    doc.moveDown(0.5);
    if (doc.y + 110 > doc.page.height - 20) doc.addPage();
    hline(doc.y, GOLD, 1.5);
    doc.moveDown(0.3);

    const sy  = doc.y;
    const sh  = 100;
    doc.save().rect(LEFT, sy, COL, sh).fill(DARK).restore();

    const totalSold = products.reduce((s,p) => s + n(p.sold), 0);
    const best      = products[0]?.name ?? "N/A";
    const topStaff  = staff[0]?.name    ?? "N/A";

    doc.font("Helvetica-Bold").fontSize(10).fillColor(GOLD).text("END OF DAY SUMMARY", LEFT + 12, sy + 10);

    const sl = [`Total Revenue:    ${fmt(revenue)}`, `Net Profit:       ${fmt(profit)}  (${margin}% margin)`, `Best Seller:      ${best}`, `Low Stock Items:  ${low.length}`];
    const sr = [`Cash: ${fmt(cash)}  |  Card: ${fmt(card)}`, `Units Sold: ${totalSold}`, `Top Staff: ${topStaff}`, `Dead Stock Items: ${dead.length}`];

    sl.forEach((line, i) => {
      doc.font("Helvetica").fontSize(8).fillColor(WHITE).text(line, LEFT + 12, sy + 26 + i * 16, { lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor(WHITE).text(sr[i] ?? "", LEFT + COL/2, sy + 26 + i * 16, { lineBreak: false });
    });

    doc.y = sy + sh + 8;
    doc.font("Helvetica").fontSize(7).fillColor(DGREY)
      .text(`Generated: ${new Date().toLocaleString()}  |  Confidential — Owner Use Only`, LEFT, doc.y, { align: "center" });

    doc.end();
  });
}

export async function POST(req: NextRequest) {
  try {
    const data: ReportData = await req.json();
    const pdf  = await buildPDF(data);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="tavern_report_${data.date ?? "today"}.pdf"`,
        "Content-Length":      pdf.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("Report error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
