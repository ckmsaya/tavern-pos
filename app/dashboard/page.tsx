"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";
import styles from "./dashboard.module.css";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function Dashboard() {
  const [staffStats, setStaffStats]     = useState<any>({});
  const [products, setProducts]         = useState<any[]>([]);
  const [sales, setSales]               = useState<any[]>([]);
  const [revenue, setRevenue]           = useState(0);
  const [cash, setCash]                 = useState(0);
  const [card, setCard]                 = useState(0);
  const [profit, setProfit]             = useState(0);
  const [alerted, setAlerted]           = useState<any>({});
  const [reportLoading, setReportLoading] = useState(false);
  const [addLoading, setAddLoading]     = useState(false);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [showRestock, setShowRestock]   = useState(false);
  const [restockProduct, setRestockProduct] = useState<any>(null);
  const [restockQty, setRestockQty]     = useState("");

  const [showCashDrawer, setShowCashDrawer] = useState(false);
  const [actualCash, setActualCash]     = useState("");

  const [showReset, setShowReset]       = useState(false);
  const [resetPin, setResetPin]         = useState("");
  const [resetError, setResetError]     = useState("");

  const RESET_PIN = "1234"; // Change this to your owner PIN

  const [newProduct, setNewProduct] = useState({
    name: "", price: "", cost_price: "", category: "", barcode: ""
  });

  const alertedRef = useRef<any>({});

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  // ── LOAD DATA ─────────────────────────────────────────────────────────────
  async function load() {
    try {
      const { data: prod } = await supabase
        .from("products")
        .select("*")
        .order("name", { ascending: true });

      const { data: salesData } = await supabase
        .from("sales")
        .select("*")
        .gte("created_at", new Date().toISOString().split("T")[0])
        .order("created_at", { ascending: false });
      // ✅ No .limit() — fetch ALL of today's sales

      if (!prod || !salesData) return;

      setProducts(prod);
      setSales(salesData);

      // Staff stats
      const stats: any = {};
      salesData.forEach((s: any) => {
        if (!stats[s.staff_name]) stats[s.staff_name] = 0;
        stats[s.staff_name] += s.total;
      });
      setStaffStats(stats);

      // Revenue
      let r = 0, c = 0, ca = 0;
      salesData.forEach((s: any) => {
        r += s.total;
        if (s.payment_method === "cash") c += s.total;
        if (s.payment_method === "card") ca += s.total;
      });
      setRevenue(r); setCash(c); setCard(ca);

      // Profit
      let p = 0;
      prod.forEach((pr: any) => {
        const sold = (pr.opening_stock ?? 0) - pr.stock;
        p += sold * ((pr.price ?? 0) - (pr.cost_price ?? 0));
      });
      setProfit(p);

      // ✅ Low stock alert — <= 5 not === 5
      const lowStock = prod.filter((p: any) => p.stock <= 5);
      lowStock.forEach(async (p: any) => {
        if (alertedRef.current[p.id]) return;
        alertedRef.current[p.id] = true;
        try {
          await fetch("/api/whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: `Tavern Alert\n${p.name} is running low\nStock left: ${p.stock}`
            })
          });
        } catch (err) {
          console.log("Alert skipped:", err);
        }
      });

    } catch (err) {
      console.log("LOAD ERROR:", err);
    }
  }

  // ── ADD PRODUCT ───────────────────────────────────────────────────────────
  async function addProduct() {
    if (!newProduct.name || !newProduct.barcode || !newProduct.price || !newProduct.cost_price) {
      alert("Fill all fields"); return;
    }
    setAddLoading(true);

    const { data: existing } = await supabase
      .from("products").select("*")
      .eq("barcode", newProduct.barcode).maybeSingle();

    if (existing) {
      alert("Product with this barcode already exists");
      setAddLoading(false); return;
    }

    const { error } = await supabase.from("products").insert({
      name:          newProduct.name,
      category:      newProduct.category || "other",
      price:         Number(newProduct.price),
      cost_price:    Number(newProduct.cost_price),
      stock:         0,
      opening_stock: 0,
      barcode:       newProduct.barcode
    });

    if (error) { alert("Error adding product"); console.log(error); setAddLoading(false); return; }

    alert("Product added!");
    setNewProduct({ name: "", price: "", cost_price: "", category: "", barcode: "" });
    setAddLoading(false);
    load();
  }

  // ── RESTOCK (modal) ───────────────────────────────────────────────────────
  function openRestock(product: any) {
    setRestockProduct(product);
    setRestockQty("");
    setShowRestock(true);
  }

  async function confirmRestock() {
    if (!restockProduct || !restockQty) return;
    const qty = Number(restockQty);
    if (isNaN(qty) || qty <= 0) { alert("Enter a valid quantity"); return; }

    await supabase.from("products").update({
      stock:         restockProduct.stock + qty,
      opening_stock: restockProduct.stock + qty
    }).eq("id", restockProduct.id);

    setShowRestock(false);
    setRestockProduct(null);
    setRestockQty("");
    load();
  }

  // ── CASH DRAWER (modal) ───────────────────────────────────────────────────
  const cashDiff = Number(actualCash) - cash;

  // ── RESET DAY (PIN modal) ─────────────────────────────────────────────────
  async function confirmReset() {
    if (resetPin !== RESET_PIN) {
      setResetError("Wrong PIN. Access denied.");
      setResetPin("");
      return;
    }

    await supabase.from("sales").delete().neq("id", 0);

    const { data: prods } = await supabase.from("products").select("*");
    if (!prods) return;

    for (const p of prods) {
      await supabase.from("products").update({ opening_stock: p.stock }).eq("id", p.id);
    }

    setShowReset(false);
    setResetPin("");
    alert("System reset for new day");
    location.reload();
  }

  // ── CLOSE DAY ─────────────────────────────────────────────────────────────
  async function closeDay() {
    setReportLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data: allSales } = await supabase.from("sales").select("*").gte("created_at", today);
      const allSalesData = allSales ?? [];

      let r = 0, c = 0, ca = 0;
      allSalesData.forEach((s: any) => {
        r += s.total;
        if (s.payment_method === "cash") c += s.total;
        if (s.payment_method === "card") ca += s.total;
      });

      const staffMap: any = {};
      allSalesData.forEach((s: any) => {
        if (!staffMap[s.staff_name]) staffMap[s.staff_name] = 0;
        staffMap[s.staff_name] += s.total;
      });
      const staffArray = Object.entries(staffMap).map(([name, total]) => ({ name, total: total as number }));

      const productsWithSold = products.map((p: any) => ({
        name: p.name, category: p.category, price: p.price,
        cost_price: p.cost_price, opening_stock: p.opening_stock ?? 0,
        stock: p.stock, sold: (p.opening_stock ?? 0) - p.stock
      }));

      let totalProfit = 0;
      productsWithSold.forEach((p: any) => { totalProfit += p.sold * (p.price - p.cost_price); });

      const payload = {
        date: today, revenue: r, cash: c, card: ca,
        profit: totalProfit, staff: staffArray,
        products: productsWithSold, sales: allSalesData
      };

      const res = await fetch("/api/daily-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) { const err = await res.json(); alert(`Report failed: ${err.error ?? "Unknown error"}`); return; }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `tavern_report_${payload.date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Close day error:", err);
      alert("Could not generate report.");
    } finally {
      setReportLoading(false);
    }
  }

  // ── CHART ─────────────────────────────────────────────────────────────────
  const chartData = {
    labels: sales.map((s: any) => new Date(s.created_at).toLocaleTimeString()),
    datasets: [{ label: "Sales", data: sales.map((s: any) => s.total), borderColor: "#d4af37", backgroundColor: "#d4af37", tension: 0.4 }]
  };

  const lowStockUI = products.filter((p: any) => p.stock <= 5);

  // ── MODAL STYLE ───────────────────────────────────────────────────────────
  const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
  const modal:   React.CSSProperties = { background: "#111", border: "1px solid #d4af37", borderRadius: 16, padding: 28, maxWidth: 380, width: "90%" };
  const inp:     React.CSSProperties = { width: "100%", padding: 10, background: "#1A1A1A", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 15, boxSizing: "border-box", marginBottom: 12 };

  return (
    <div className={styles.container}>

      <h1 className={styles.title}>Tavern Dashboard</h1>

      {/* ── ADD PRODUCT ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20, padding: 15, border: "1px solid #333", borderRadius: 10 }}>
        <h3 style={{ color: "#d4af37", marginBottom: 12 }}>Add New Product</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            { key: "barcode",    placeholder: "Scan or enter barcode" },
            { key: "name",       placeholder: "Product name" },
            { key: "cost_price", placeholder: "Cost price" },
            { key: "price",      placeholder: "Selling price" },
          ].map(f => (
            <input
              key={f.key}
              placeholder={f.placeholder}
              value={(newProduct as any)[f.key]}
              onChange={e => setNewProduct({ ...newProduct, [f.key]: e.target.value })}
              style={{ padding: 8, background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
            />
          ))}
          <select
            value={newProduct.category}
            onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
            style={{ padding: 8, background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
          >
            <option value="">Category</option>
            <option value="beer">Beer</option>
            <option value="cider">Cider</option>
            <option value="spirit">Spirit</option>
            <option value="wine">Wine</option>
            <option value="other">Other</option>
          </select>
          <button
            onClick={addProduct}
            disabled={addLoading}
            style={{ background: "#d4af37", color: "#000", padding: "10px 18px", border: "none", borderRadius: 8, fontWeight: "bold", cursor: addLoading ? "wait" : "pointer", opacity: addLoading ? 0.7 : 1 }}
          >
            {addLoading ? "Adding..." : "Add Product"}
          </button>
        </div>
      </div>

      {/* ── KPI CARDS ────────────────────────────────────────────────────── */}
      <div className={styles.cards}>
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Staff Performance</h3>
          {Object.entries(staffStats).sort((a: any, b: any) => b[1] - a[1]).map(([name, total]: any) => (
            <div key={name} className={styles.staffRow}>
              <span>{name}</span><span>R{total}</span>
            </div>
          ))}
        </div>
        <div className={styles.card}><p className={styles.cardLabel}>Revenue</p><h2 className={styles.cardValue}>R{revenue}</h2></div>
        <div className={styles.card}><p className={styles.cardLabel}>Cash</p><h2 className={styles.cardValue}>R{cash}</h2></div>
        <div className={styles.card}><p className={styles.cardLabel}>Card</p><h2 className={styles.cardValue}>R{card}</h2></div>
        <div className={styles.card}><p className={styles.cardLabel}>Profit</p><h2 className={styles.cardValue}>R{profit.toFixed(2)}</h2></div>
      </div>

      {/* ── ACTION BUTTONS ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <button className={styles.btn} onClick={() => { setActualCash(""); setShowCashDrawer(true); }}>Cash Drawer</button>
        <button className={styles.btn} onClick={closeDay} disabled={reportLoading} style={{ opacity: reportLoading ? 0.6 : 1, cursor: reportLoading ? "wait" : "pointer" }}>
          {reportLoading ? "Generating..." : "Close Day"}
        </button>
        <button className={styles.btn} onClick={() => { setResetPin(""); setResetError(""); setShowReset(true); }}>Reset Day</button>
      </div>

      {/* ── CHART + LOW STOCK ────────────────────────────────────────────── */}
      <div className={styles.row}>
        <div className={styles.chartPanel}>
          <h3 className={styles.panelTitle}>Sales Activity</h3>
          <div style={{ height: 180 }}><Line data={chartData} /></div>
          <div className={styles.activity}>
            {sales.map((s: any) => (
              <div key={s.id} className={styles.activityItem}>
                <span className={styles.staff}>{s.staff_name}</span>{" sold — "}
                <span className={styles.amount}>R{s.total}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.sidePanel}>
          <h3 className={styles.panelTitle}>Low Stock</h3>
          {lowStockUI.length === 0
            ? <p style={{ color: "#555", fontSize: 13 }}>All stock OK</p>
            : lowStockUI.map((p: any) => (
                <div key={p.id} className={styles.lowStock}>{p.name} — {p.stock} left</div>
              ))
          }
        </div>
      </div>

      {/* ── INVENTORY TABLE ──────────────────────────────────────────────── */}
      <div className={styles.inventory}>
        <h3 className={styles.panelTitle}>Inventory</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              {["Product","Category","Cost","Price","Opening","Stock","Sold","Profit","Restock"].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {products.map((p: any) => {
              const sold = (p.opening_stock ?? 0) - p.stock;
              const pr   = sold * ((p.price ?? 0) - (p.cost_price ?? 0));
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.category}</td>
                  <td>R{p.cost_price}</td>
                  <td>R{p.price}</td>
                  <td>{p.opening_stock}</td>
                  <td style={{ color: p.stock <= 5 ? "#ff4d4d" : undefined, fontWeight: p.stock <= 5 ? 700 : 400 }}>{p.stock}</td>
                  <td>{sold}</td>
                  <td>R{pr.toFixed(2)}</td>
                  <td><button className={styles.btn} onClick={() => openRestock(p)}>Restock</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── RESTOCK MODAL ────────────────────────────────────────────────── */}
      {showRestock && restockProduct && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ color: "#d4af37", marginBottom: 16 }}>Restock — {restockProduct.name}</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 12 }}>Current stock: {restockProduct.stock}</p>
            <input
              style={inp}
              placeholder="Enter quantity to add"
              type="number"
              value={restockQty}
              onChange={e => setRestockQty(e.target.value)}
              onKeyDown={e => e.key === "Enter" && confirmRestock()}
              autoFocus
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={confirmRestock} style={{ flex: 1, background: "#d4af37", color: "#000", border: "none", padding: "12px 0", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Confirm</button>
              <button onClick={() => setShowRestock(false)} style={{ flex: 1, background: "#1A1A1A", color: "#aaa", border: "1px solid #333", padding: "12px 0", borderRadius: 8, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CASH DRAWER MODAL ────────────────────────────────────────────── */}
      {showCashDrawer && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ color: "#d4af37", marginBottom: 16 }}>Cash Drawer Check</h3>
            <div style={{ background: "#1A1A1A", borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <p style={{ color: "#888", fontSize: 13 }}>System Cash</p>
              <p style={{ color: "#fff", fontSize: 22, fontWeight: 700 }}>R{cash.toFixed(2)}</p>
            </div>
            <input
              style={inp}
              placeholder="Enter actual cash counted"
              type="number"
              value={actualCash}
              onChange={e => setActualCash(e.target.value)}
              autoFocus
            />
            {actualCash && (
              <div style={{ background: cashDiff === 0 ? "#1A2A1A" : cashDiff > 0 ? "#1A2A1A" : "#2A1A1A", borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <p style={{ color: "#888", fontSize: 13 }}>Difference</p>
                <p style={{ color: cashDiff === 0 ? "#27AE60" : cashDiff > 0 ? "#27AE60" : "#ff4d4d", fontSize: 22, fontWeight: 700 }}>
                  {cashDiff > 0 ? "+" : ""}R{cashDiff.toFixed(2)}
                </p>
                <p style={{ color: "#888", fontSize: 12 }}>
                  {cashDiff === 0 ? "Perfect match" : cashDiff > 0 ? "Cash over" : "Cash short"}
                </p>
              </div>
            )}
            <button onClick={() => setShowCashDrawer(false)} style={{ width: "100%", background: "#d4af37", color: "#000", border: "none", padding: "12px 0", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Done</button>
          </div>
        </div>
      )}

      {/* ── RESET DAY MODAL (PIN protected) ──────────────────────────────── */}
      {showReset && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ color: "#ff4d4d", marginBottom: 8 }}>Reset Day</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 16 }}>This will delete all today's sales and reset opening stock. Enter owner PIN to continue.</p>
            <input
              style={inp}
              placeholder="Enter owner PIN"
              type="password"
              value={resetPin}
              onChange={e => { setResetPin(e.target.value); setResetError(""); }}
              onKeyDown={e => e.key === "Enter" && confirmReset()}
              autoFocus
            />
            {resetError && <p style={{ color: "#ff4d4d", fontSize: 13, marginBottom: 12 }}>{resetError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={confirmReset} style={{ flex: 1, background: "#ff4d4d", color: "#fff", border: "none", padding: "12px 0", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Reset</button>
              <button onClick={() => setShowReset(false)} style={{ flex: 1, background: "#1A1A1A", color: "#aaa", border: "1px solid #333", padding: "12px 0", borderRadius: 8, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
