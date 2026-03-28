import { NextRequest, NextResponse } from "next/server";

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Product {
  name: string;
  category: string;
  price: number;
  cost_price: number;
  opening_stock: number;
  stock: number;
  sold: number;
}

interface Staff {
  name: string;
  total: number;
}

interface Sale {
  created_at: string;
  total: number;
  payment_method: string;
  staff_name: string;
}

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

// ─── PDF BUILDER (pure JS, no external deps) ─────────────────────────────────
function buildPDF(data: ReportData): Buffer | Uint8Array {
  const lines: string[] = [];
  const W = 595;   // A4 width  in pts
  const H = 842;   // A4 height in pts
  const pages: string[][] = [];

  let y = 0;
  let page: string[] = [];

  function newPage() {
    if (page.length) pages.push(page);
    page = [];
    y = 30;
  }

  function hex2rgb(hex: string) {
    const h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  }

  function setFill(hex: string) {
    const [r, g, b] = hex2rgb(hex);
    page.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
  }

  function setStroke(hex: string) {
    const [r, g, b] = hex2rgb(hex);
    page.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
  }

  function rect(x: number, py: number, w: number, h: number, fill: string, stroke?: string) {
    setFill(fill);
    if (stroke) { setStroke(stroke); page.push(`${x} ${py} ${w} ${h} re B`); }
    else page.push(`${x} ${py} ${w} ${h} re f`);
  }

  function text(str: string, x: number, py: number, size: number, colour: string, bold = false) {
    const safe = str
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      // Remove emoji and non-latin-1 chars
      .replace(/[^\x00-\xFF]/g, "")
      .trim();
    const font = bold ? "/F2" : "/F1";
    setFill(colour);
    page.push(`BT ${font} ${size} Tf ${x} ${py} Td (${safe}) Tj ET`);
  }

  function line(x1: number, y1: number, x2: number, y2: number, colour: string, width = 0.5) {
    setStroke(colour);
    page.push(`${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  }

  function checkPage(needed = 60) {
    if (y < needed) { newPage(); }
  }

  // ── PDF coords: y=0 is bottom, so we track from top ──────────────────────
  function py(topY: number) { return H - topY; }

  newPage();

  // ══════════════════════════════════════════════════════════════════════════
  //  HEADER
  // ══════════════════════════════════════════════════════════════════════════
  rect(20, py(20) - 60, W - 40, 65, DARK);
  text("TAVERN", 30, py(20) - 20, 28, GOLD, true);
  text("DAILY BUSINESS REPORT", 30, py(20) - 44, 13, WHITE, true);
  text(data.date ?? new Date().toISOString().split("T")[0], W - 160, py(20) - 44, 10, GOLD);
  y = 100;

  // ══════════════════════════════════════════════════════════════════════════
  //  KPI CARDS
  // ══════════════════════════════════════════════════════════════════════════
  const revenue = data.revenue ?? 0;
  const cash    = data.cash    ?? 0;
  const card    = data.card    ?? 0;
  const profit  = data.profit  ?? 0;
  const margin  = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "0.0";

  const kpis = [
    { label: "REVENUE",       value: `R${revenue.toFixed(2)}`,  colour: GOLD  },
    { label: "CASH",          value: `R${cash.toFixed(2)}`,     colour: GREEN },
    { label: "CARD",          value: `R${card.toFixed(2)}`,     colour: BLUE  },
    { label: "NET PROFIT",    value: `R${profit.toFixed(2)}`,   colour: profit >= 0 ? GREEN : RED },
    { label: "MARGIN",        value: `${margin}%`,              colour: parseFloat(margin) >= 20 ? GREEN : ORANGE },
  ];

  const kw = (W - 40) / 5;
  kpis.forEach((k, i) => {
    const kx = 20 + i * kw;
    rect(kx, py(y) - 52, kw - 4, 56, LGREY);
    text(k.label, kx + 6, py(y) - 18, 7, "#666666", true);
    // Truncate long values
    const val = k.value.length > 12 ? k.value.slice(0, 12) : k.value;
    text(val, kx + 6, py(y) - 40, 11, k.colour, true);
  });
  y += 70;

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION HELPER
  // ══════════════════════════════════════════════════════════════════════════
  function section(title: string) {
    y += 10;
    checkPage(80);
    line(20, py(y), W - 20, py(y), GOLD, 1);
    y += 4;
    text(title, 20, py(y) + 4, 11, GOLD, true);
    y += 18;
  }

  // ── TABLE HELPER ──────────────────────────────────────────────────────────
  function table(
    headers: string[],
    rows: string[][],
    colX: number[],
    colW: number[],
    colColours?: (string | null)[][]
  ) {
    const rowH = 18;
    const hdrH = 20;

    checkPage(hdrH + rowH * Math.min(rows.length, 3));

    // Header
    rect(20, py(y) - hdrH + 4, W - 40, hdrH, DARK);
    headers.forEach((h, i) => {
      text(h, colX[i], py(y) - 12, 7.5, GOLD, true);
    });
    y += hdrH;

    // Rows
    rows.forEach((row, ri) => {
      checkPage(rowH + 10);
      const bg = ri % 2 === 0 ? WHITE : LGREY;
      rect(20, py(y) - rowH + 4, W - 40, rowH, bg);

      row.forEach((cell, ci) => {
        const colour = colColours?.[ri]?.[ci] ?? DARK;
        // Truncate cell to fit column
        const maxChars = Math.floor(colW[ci] / 5.5);
        const safe = cell.length > maxChars ? cell.slice(0, maxChars - 1) + "" : cell;
        text(safe, colX[ci], py(y) - 12, 7.5, colour);
      });

      // Row border
      line(20, py(y) - rowH + 4, W - 20, py(y) - rowH + 4, MGREY, 0.3);
      y += rowH;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PAYMENT BREAKDOWN
  // ══════════════════════════════════════════════════════════════════════════
  section("PAYMENT BREAKDOWN");
  if (revenue > 0) {
    const cashPct = cash / revenue;
    const cardPct = card / revenue;
    const barW    = W - 40;
    rect(20,            py(y) - 16, barW * cashPct, 20, GREEN);
    rect(20 + barW * cashPct, py(y) - 16, barW * cardPct, 20, BLUE);
    text(`Cash R${cash.toFixed(2)} (${(cashPct*100).toFixed(1)}%)`, 24, py(y) - 11, 8, WHITE, true);
    text(`Card R${card.toFixed(2)} (${(cardPct*100).toFixed(1)}%)`, 20 + barW * cashPct + 4, py(y) - 11, 8, WHITE, true);
    y += 28;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  STAFF PERFORMANCE
  // ══════════════════════════════════════════════════════════════════════════
  section("STAFF PERFORMANCE");
  const staff = [...(data.staff ?? [])].sort((a, b) => b.total - a.total);
  if (staff.length) {
    const medals = ["1st", "2nd", "3rd"];
    const sRows = staff.map((s, i) => {
      const pct = revenue > 0 ? ((s.total / revenue) * 100).toFixed(1) : "0";
      return [
        `${medals[i] ?? `#${i+1}`}  ${s.name}`,
        `R${s.total.toFixed(2)}`,
        `${pct}% of revenue`,
      ];
    });
    const cx = [25, 220, 360];
    const cw = [190, 135, 150];
    table(["STAFF MEMBER", "SALES TOTAL", "REVENUE SHARE"], sRows, cx, cw);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  HOURLY BREAKDOWN
  // ══════════════════════════════════════════════════════════════════════════
  section("HOURLY SALES BREAKDOWN");
  const hourly: Record<string, { total: number; count: number }> = {};
  (data.sales ?? []).forEach(s => {
    const hour = s.created_at ? new Date(s.created_at).getHours().toString().padStart(2, "0") + ":00" : "Unknown";
    if (!hourly[hour]) hourly[hour] = { total: 0, count: 0 };
    hourly[hour].total += s.total ?? 0;
    hourly[hour].count += 1;
  });

  if (Object.keys(hourly).length) {
    const peakHour = Object.entries(hourly).sort((a, b) => b[1].total - a[1].total)[0][0];
    const hRows = Object.keys(hourly).sort().map(h => {
      const avg = hourly[h].total / hourly[h].count;
      return [
        h === peakHour ? `${h} PEAK` : h,
        hourly[h].count.toString(),
        `R${hourly[h].total.toFixed(2)}`,
        `R${avg.toFixed(2)}`,
      ];
    });
    const cx = [25, 175, 295, 415];
    const cw = [145, 115, 115, 115];
    const colours = hRows.map(r => [
      r[0].includes("PEAK") ? GOLD : DARK, DARK, GREEN, DARK
    ]);
    table(["HOUR", "TRANSACTIONS", "REVENUE", "AVG SALE"], hRows, cx, cw, colours);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PAGE 2 — PRODUCTS
  // ══════════════════════════════════════════════════════════════════════════
  newPage();

  // Re-draw mini header on page 2
  rect(20, py(20) - 28, W - 40, 32, DARK);
  text("TAVERN — PRODUCT PERFORMANCE", 30, py(20) - 18, 11, GOLD, true);
  text(data.date ?? "", W - 130, py(20) - 18, 9, WHITE);
  y = 65;

  section("FULL PRODUCT PERFORMANCE");

  const products = [...(data.products ?? [])].sort((a, b) => b.sold - a.sold);

  const pRows = products.map(p => {
    const sold    = p.sold ?? (p.opening_stock - p.stock);
    const margin2 = p.price - p.cost_price;
    const prof    = sold * margin2;
    const status  =
      sold === 0             ? "DEAD STOCK"  :
      p.stock <= 5           ? "LOW STOCK"   :
      sold >= p.opening_stock * 0.7 ? "FAST MOVER" : "Normal";
    return [
      p.name,
      p.category?.toUpperCase() ?? "",
      `R${p.cost_price?.toFixed(2)}`,
      `R${p.price?.toFixed(2)}`,
      str(p.opening_stock),
      str(p.stock),
      str(sold),
      `R${prof.toFixed(2)}`,
      status,
    ];
  });

  function str(v: any) { return v?.toString() ?? "0"; }

  const statusColour = (s: string) =>
    s === "DEAD STOCK" ? RED : s === "LOW STOCK" ? ORANGE : s === "FAST MOVER" ? GREEN : DARK;
  const profitColour = (s: string) => {
    const n = parseFloat(s.replace("R", ""));
    return n < 0 ? RED : n === 0 ? ORANGE : GREEN;
  };

  const pColours = pRows.map(r => [
    DARK, "#555555", DARK, DARK, DARK, DARK, DARK,
    profitColour(r[7]),
    statusColour(r[8]),
  ]);

  const pcx = [22, 148, 208, 253, 298, 333, 368, 403, 463];
  const pcw = [122, 56,  42,  42,  32,  32,  32,  57,  80];
  table(
    ["PRODUCT", "CATEGORY", "COST", "PRICE", "OPEN", "STOCK", "SOLD", "PROFIT", "STATUS"],
    pRows, pcx, pcw, pColours
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  LOW STOCK & RESTOCK
  // ══════════════════════════════════════════════════════════════════════════
  section("LOW STOCK & RESTOCK RECOMMENDATIONS");

  const low = products.filter(p => p.stock <= 5);
  if (low.length) {
    const lRows = low.map(p => {
      const rec     = Math.max((p.sold ?? 0) * 2, 24);
      const urgency = p.stock === 0 ? "CRITICAL" : p.stock <= 2 ? "URGENT" : "LOW";
      return [p.name, p.category?.toUpperCase() ?? "", str(p.stock), str(p.sold ?? 0), str(Math.round(rec)), urgency];
    });
    const urgColour = (u: string) => u === "CRITICAL" ? RED : u === "URGENT" ? ORANGE : "#B8860B";
    const lColours  = lRows.map(r => [DARK, DARK, DARK, DARK, DARK, urgColour(r[5])]);
    const lcx = [22, 192, 272, 322, 372, 452];
    const lcw = [166, 76,  46,  46,  76,  80];
    table(["PRODUCT", "CATEGORY", "STOCK", "SOLD", "REORDER QTY", "URGENCY"], lRows, lcx, lcw, lColours);
  } else {
    y += 4;
    text("All products are adequately stocked.", 22, py(y), 9, GREEN);
    y += 20;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DEAD STOCK
  // ══════════════════════════════════════════════════════════════════════════
  const dead = products.filter(p => (p.sold ?? 0) === 0);
  if (dead.length) {
    section("DEAD STOCK — NOTHING SOLD TODAY");
    const dRows = dead.map(p => [p.name, p.category?.toUpperCase() ?? "", str(p.stock), `R${(p.price - p.cost_price).toFixed(2)}`]);
    const dcx = [22, 232, 352, 432];
    const dcw = [206, 116, 76, 100];
    table(["PRODUCT", "CATEGORY", "STOCK", "MARGIN/UNIT"], dRows, dcx, dcw);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SUMMARY BOX
  // ══════════════════════════════════════════════════════════════════════════
  y += 16;
  checkPage(120);
  line(20, py(y), W - 20, py(y), GOLD, 1.5);
  y += 6;
  rect(20, py(y) - 90, W - 40, 94, DARK);

  const totalSold = products.reduce((s, p) => s + (p.sold ?? 0), 0);
  const best      = products[0]?.name ?? "N/A";
  const topStaff  = staff[0]?.name    ?? "N/A";

  const summLines = [
    ["END OF DAY SUMMARY", "", true],
    [`Total Revenue:     R${revenue.toFixed(2)}`, `Cash: R${cash.toFixed(2)}  |  Card: R${card.toFixed(2)}`, false],
    [`Net Profit:        R${profit.toFixed(2)}   (${margin}% margin)`, `Units Sold: ${totalSold}`, false],
    [`Best Seller:       ${best}`, `Top Staff: ${topStaff}`, false],
    [`Low Stock Items:   ${low.length}`, `Dead Stock Items: ${dead.length}`, false],
  ];

  summLines.forEach(([left, right, bold], i) => {
    text(left as string, 30, py(y) - 14 - i * 16, i === 0 ? 10 : 8, i === 0 ? GOLD : WHITE, bold as boolean);
    if (right) text(right as string, 320, py(y) - 14 - i * 16, 8, WHITE);
  });

  y += 100;

  // Footer
  const now = new Date().toLocaleString();
  text(`Generated: ${now}  |  Confidential — Owner Use Only`, 20, py(y), 7, "#888888");

  // Flush last page
  pages.push(page);

  // ══════════════════════════════════════════════════════════════════════════
  //  ASSEMBLE PDF BYTES
  // ══════════════════════════════════════════════════════════════════════════
  const objects: string[] = [];
  const offsets: number[] = [];
  let pos = 0;

  function addObj(content: string): number {
    const idx = objects.length + 1;
    offsets.push(pos);
    const obj = `${idx} 0 obj\n${content}\nendobj\n`;
    objects.push(obj);
    pos += Buffer.byteLength(obj, "latin1");
    return idx;
  }

  // Font objects
  const f1 = addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  const f2 = addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

  // Page objects
  const pageIds: number[] = [];
  const contentIds: number[] = [];

  pages.forEach(pg => {
    const stream = pg.join("\n");
    const cid = addObj(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    contentIds.push(cid);
  });

  // Pages need IDs reserved — we add placeholder then fix
  const pagesObjId = objects.length + 1 + pages.length;

  pages.forEach((_, i) => {
    const pid = addObj(
      `<< /Type /Page /Parent ${pagesObjId} 0 R /MediaBox [0 0 ${W} ${H}] ` +
      `/Contents ${contentIds[i]} 0 R ` +
      `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> >>`
    );
    pageIds.push(pid);
  });

  const pagesId = addObj(
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
  );

  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  // Header
  const header = "%PDF-1.4\n";
  const headerLen = Buffer.byteLength(header, "latin1");

  // XRef
  const xrefOffset = headerLen + pos;
  const totalObjs  = objects.length;

  let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => {
    xref += `${(o + headerLen).toString().padStart(10, "0")} 00000 n \n`;
  });

  const trailer =
    `trailer\n<< /Size ${totalObjs + 1} /Root ${catalogId} 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`;

  const parts = [header, ...objects, xref, trailer];
  return Buffer.from(parts.join(""), "latin1");
}

// ─── API ROUTE ────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const data: ReportData = await req.json();
    const pdf = buildPDF(data);

    return new NextResponse(pdf, {
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
