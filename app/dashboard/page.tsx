"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

type Product = {
  id: number | string;
  name: string;
  category: string;
  price: number;
  cost_price: number;
  opening_stock: number;
  stock: number;
};

type Sale = {
  id: number | string;
  staff_name: string;
  total: number;
  payment_method: string;
  created_at: string;
};

type NewProduct = {
  barcode: string;
  name: string;
  cost_price: string;
  price: string;
  category: string;
};

type UndoLogEntry = {
  id: number | string;
  sale_id: string;
  quantity: number;
  total: number;
  staff_name: string;
  undone_by: string;
  approved_by: string;
  created_at: string;
};

type CashCount = {
  id: number | string;
  staff_name: string;
  counted_amount: number;
  expected_cash: number;
  status: "pending" | "confirmed" | "discrepancy";
  owner_amount: number | null;
  created_at: string;
};

type StaffMember = {
  id: number | string;
  name: string;
  role: string;
  created_at: string;
};

type StaffSession = {
  staffName: string;
  loginAt: string;
  logoutAt: string | null;
  hoursWorked: number;
  itemsSold: number;
  moneyMade: number;
};

export default function Dashboard() {
  const router = useRouter();
  const [staffStats, setStaffStats] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [cash, setCash] = useState(0);
  const [card, setCard] = useState(0);
  const [profit, setProfit] = useState(0);
  const [reportLoading, setReportLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [showRestock, setShowRestock] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState("");
  const [restockMode, setRestockMode] = useState<"add" | "remove">("add");

  const [showReset, setShowReset] = useState(false);
  const [resetError, setResetError] = useState("");

  const [undoLog, setUndoLog] = useState<UndoLogEntry[]>([]);
  const [cashCounts, setCashCounts] = useState<CashCount[]>([]);
  const [ownerRecount, setOwnerRecount] = useState<Record<string, string>>({});

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffSessions, setStaffSessions] = useState<StaffSession[]>([]);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<"staff" | "owner">("staff");
  const [newStaffPin, setNewStaffPin] = useState("");
  const [newStaffPinConfirm, setNewStaffPinConfirm] = useState("");
  const [addStaffLoading, setAddStaffLoading] = useState(false);
  const [pinResetTarget, setPinResetTarget] = useState<string | number | null>(null);
  const [pinResetValue, setPinResetValue] = useState("");
  const [pinResetConfirm, setPinResetConfirm] = useState("");

  const [newProduct, setNewProduct] = useState<NewProduct>({
    barcode: "",
    name: "",
    cost_price: "",
    price: "",
    category: ""
  });

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function init() {
      const res = await fetch("/api/me");
      if (!res.ok) {
        router.replace("/login");
        return;
      }

      async function loadAll() {
        await Promise.all([load(), loadUndoLog(), loadCashCounts(), loadStaff(), loadStaffSessions()]);
      }

      await loadAll();
      interval = setInterval(loadAll, 5000);
    }

    init();
    return () => clearInterval(interval);
  }, [router]);

  // ── LOAD DATA ─────────────────────────────────────────────────────────────
  async function load() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const [prodRes, salesRes] = await Promise.all([
        fetch("/api/products"),
        fetch(`/api/sales?since=${today}`),
      ]);

      if (!prodRes.ok || !salesRes.ok) return;

      const { products: prod } = await prodRes.json() as { products: Product[] | null };
      const { sales: salesData } = await salesRes.json() as { sales: Sale[] | null };
      // ✅ No .limit() — fetch ALL of today's sales

      if (!prod || !salesData) return;

      setProducts(prod);
      setSales(salesData);

      const stats: Record<string, number> = {};
      salesData.forEach((sale) => {
        stats[sale.staff_name] = (stats[sale.staff_name] ?? 0) + sale.total;
      });
      setStaffStats(stats);

      let r = 0;
      let c = 0;
      let ca = 0;
      salesData.forEach((sale) => {
        r += sale.total;
        if (sale.payment_method === "cash") c += sale.total;
        if (sale.payment_method === "card") ca += sale.total;
      });
      setRevenue(r);
      setCash(c);
      setCard(ca);

      let p = 0;
      prod.forEach((product) => {
        const sold = (product.opening_stock ?? 0) - product.stock;
        p += sold * ((product.price ?? 0) - (product.cost_price ?? 0));
      });
      setProfit(p);
    } catch (err) {
      console.log("LOAD ERROR:", err);
    }
  }

  // ── UNDO LOG ──────────────────────────────────────────────────────────────
  async function loadUndoLog() {
    try {
      const res = await fetch("/api/undo-log");
      if (!res.ok) return;
      const { entries } = await res.json() as { entries: UndoLogEntry[] | null };
      if (entries) setUndoLog(entries);
    } catch (err) {
      console.log("UNDO LOG LOAD ERROR:", err);
    }
  }

  // ── CASH RECONCILIATION ───────────────────────────────────────────────────
  async function loadCashCounts() {
    try {
      const res = await fetch("/api/cash-counts");
      if (!res.ok) return;
      const { counts } = await res.json() as { counts: CashCount[] | null };
      if (counts) setCashCounts(counts);
    } catch (err) {
      console.log("CASH COUNTS LOAD ERROR:", err);
    }
  }

  async function reviewCashCount(id: string | number, status: "confirmed" | "discrepancy") {
    const amountStr = ownerRecount[String(id)] ?? "";
    const ownerAmount = Number(amountStr);

    if (!amountStr || isNaN(ownerAmount) || ownerAmount < 0) {
      alert("Enter the amount you counted");
      return;
    }

    const res = await fetch(`/api/cash-counts/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerAmount, status }),
    });

    if (!res.ok) {
      const result = await res.json();
      alert(result.error ?? "Unable to submit review");
      return;
    }

    setOwnerRecount(prev => {
      const next = { ...prev };
      delete next[String(id)];
      return next;
    });
    loadCashCounts();
  }

  // ── STAFF MANAGEMENT ──────────────────────────────────────────────────────
  async function loadStaff() {
    try {
      const res = await fetch("/api/staff");
      if (!res.ok) return;
      const { staff } = await res.json() as { staff: StaffMember[] | null };
      if (staff) setStaffList(staff);
    } catch (err) {
      console.log("STAFF LOAD ERROR:", err);
    }
  }

  async function loadStaffSessions() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/staff-sessions?since=${today}`);
      if (!res.ok) return;
      const { sessions } = await res.json() as { sessions: StaffSession[] | null };
      if (sessions) setStaffSessions(sessions);
    } catch (err) {
      console.log("STAFF SESSIONS LOAD ERROR:", err);
    }
  }

  async function addStaff() {
    if (!newStaffName.trim()) { alert("Enter a staff name"); return; }
    if (!/^\d{4,12}$/.test(newStaffPin)) { alert("PIN must be 4-12 digits"); return; }
    if (newStaffPin !== newStaffPinConfirm) { alert("PINs do not match"); return; }

    setAddStaffLoading(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newStaffName.trim(), role: newStaffRole, pin: newStaffPin }),
      });

      if (!res.ok) {
        const result = await res.json();
        alert(result.error ?? "Unable to add staff member");
        return;
      }

      setNewStaffName("");
      setNewStaffRole("staff");
      setNewStaffPin("");
      setNewStaffPinConfirm("");
      loadStaff();
    } finally {
      setAddStaffLoading(false);
    }
  }

  function openPinReset(id: string | number) {
    setPinResetTarget(id);
    setPinResetValue("");
    setPinResetConfirm("");
  }

  async function submitPinReset() {
    if (!pinResetTarget) return;
    if (!/^\d{4,12}$/.test(pinResetValue)) { alert("PIN must be 4-12 digits"); return; }
    if (pinResetValue !== pinResetConfirm) { alert("PINs do not match"); return; }

    const res = await fetch(`/api/staff/${pinResetTarget}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pinResetValue }),
    });

    if (!res.ok) {
      const result = await res.json();
      alert(result.error ?? "Unable to reset PIN");
      return;
    }

    setPinResetTarget(null);
    setPinResetValue("");
    setPinResetConfirm("");
    alert("PIN reset successfully");
  }

  // ── ADD PRODUCT ───────────────────────────────────────────────────────────
  async function addProduct() {
    if (!newProduct.name || !newProduct.barcode || !newProduct.price || !newProduct.cost_price) {
      alert("Fill all fields"); return;
    }
    setAddLoading(true);

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProduct),
      });
      const result = await res.json();

      if (!res.ok) {
        alert(result.error ?? "Error adding product");
        return;
      }

      alert("Product added!");
      setNewProduct({ name: "", price: "", cost_price: "", category: "", barcode: "" });
      load();
    } catch (err) {
      console.log("ADD PRODUCT ERROR:", err);
      alert("Error adding product");
    } finally {
      setAddLoading(false);
    }
  }

  // ── RESTOCK (modal) ───────────────────────────────────────────────────────
  function openRestock(product: Product) {
    setRestockProduct(product);
    setRestockQty("");
    setRestockMode("add");
    setShowRestock(true);
  }

  async function confirmRestock() {
    if (!restockProduct || !restockQty) return;
    const qty = Number(restockQty);
    if (!Number.isInteger(qty) || qty <= 0) { alert("Enter a valid quantity"); return; }

    const delta = restockMode === "add" ? qty : -qty;
    if (restockMode === "remove" && qty > restockProduct.stock) {
      alert(`Cannot remove more than the current stock (${restockProduct.stock}).`);
      return;
    }

    const res = await fetch(`/api/products/${restockProduct.id}/restock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta }),
    });

    if (!res.ok) {
      const result = await res.json();
      alert(result.error ?? "Unable to adjust stock");
      return;
    }

    setShowRestock(false);
    setRestockProduct(null);
    setRestockQty("");
    load();
  }

  // ── RESET DAY (PIN modal) ─────────────────────────────────────────────────
  async function confirmReset() {
    setResetError("");

    const res = await fetch("/api/reset-day", { method: "POST" });
    if (!res.ok) {
      const result = await res.json();
      setResetError(result.error ?? "Unable to reset day.");
      return;
    }

    setShowReset(false);
    alert("System reset for new day");
    location.reload();
  }

  // ── CLOSE DAY ─────────────────────────────────────────────────────────────
  async function closeDay() {
    setReportLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const [salesRes, sessionsRes] = await Promise.all([
        fetch(`/api/sales?since=${today}`),
        fetch(`/api/staff-sessions?since=${today}`),
      ]);
      const { sales: allSales } = await salesRes.json() as { sales: Sale[] | null };
      const { sessions: staffSessions } = await sessionsRes.json() as { sessions: unknown[] | null };
      const allSalesData: Sale[] = allSales ?? [];

      let r = 0;
      let c = 0;
      let ca = 0;
      allSalesData.forEach((sale) => {
        r += sale.total;
        if (sale.payment_method === "cash") c += sale.total;
        if (sale.payment_method === "card") ca += sale.total;
      });

      const staffMap: Record<string, number> = {};
      allSalesData.forEach((sale) => {
        staffMap[sale.staff_name] = (staffMap[sale.staff_name] ?? 0) + sale.total;
      });
      const staffArray = Object.entries(staffMap).map(([name, total]) => ({ name, total }));

      const productsWithSold = products.map((product) => ({
        name: product.name,
        category: product.category,
        price: product.price,
        cost_price: product.cost_price,
        opening_stock: product.opening_stock ?? 0,
        stock: product.stock,
        sold: (product.opening_stock ?? 0) - product.stock,
      }));

      let totalProfit = 0;
      productsWithSold.forEach((product) => {
        totalProfit += product.sold * (product.price - product.cost_price);
      });

      const payload = {
        date: today, revenue: r, cash: c, card: ca,
        profit: totalProfit, staff: staffArray,
        products: productsWithSold, sales: allSalesData,
        staffSessions: staffSessions ?? [],
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
    labels: sales.map((sale) => new Date(sale.created_at).toLocaleTimeString()),
    datasets: [
      {
        label: "Sales",
        data: sales.map((sale) => sale.total),
        borderColor: "#d4af37",
        backgroundColor: "#d4af37",
        tension: 0.4,
      },
    ],
  };

  const lowStockUI = products.filter((product) => product.stock <= 5);
  const formFields: Array<{ key: keyof NewProduct; placeholder: string }> = [
    { key: "barcode", placeholder: "Scan or enter barcode" },
    { key: "name", placeholder: "Product name" },
    { key: "cost_price", placeholder: "Cost price" },
    { key: "price", placeholder: "Selling price" },
  ];

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
          {formFields.map((field) => (
            <input
              key={field.key}
              placeholder={field.placeholder}
              value={newProduct[field.key]}
              onChange={(e) => setNewProduct({ ...newProduct, [field.key]: e.target.value })}
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
          {Object.entries(staffStats)
            .sort(([, a], [, b]) => b - a)
            .map(([name, total]) => (
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
        <button className={styles.btn} onClick={closeDay} disabled={reportLoading} style={{ opacity: reportLoading ? 0.6 : 1, cursor: reportLoading ? "wait" : "pointer" }}>
          {reportLoading ? "Generating..." : "Close Day"}
        </button>
        <button className={styles.btn} onClick={() => { setResetError(""); setShowReset(true); }}>Reset Day</button>
      </div>

      {/* ── CHART + LOW STOCK ────────────────────────────────────────────── */}
      <div className={styles.row}>
        <div className={styles.chartPanel}>
          <h3 className={styles.panelTitle}>Sales Activity</h3>
          <div style={{ height: 180 }}><Line data={chartData} /></div>
          <div className={styles.activity}>
            {sales.map((sale) => (
              <div key={sale.id} className={styles.activityItem}>
                <span className={styles.staff}>{sale.staff_name}</span>{" sold — "}
                <span className={styles.amount}>R{sale.total}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.sidePanel}>
          <h3 className={styles.panelTitle}>Low Stock</h3>
          {lowStockUI.length === 0 ? (
            <p style={{ color: "#555", fontSize: 13 }}>All stock OK</p>
          ) : (
            lowStockUI.map((product) => (
              <div key={product.id} className={styles.lowStock}>{product.name} — {product.stock} left</div>
            ))
          )}
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
            {products.map((product) => {
              const sold = (product.opening_stock ?? 0) - product.stock;
              const pr = sold * ((product.price ?? 0) - (product.cost_price ?? 0));
              return (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.category}</td>
                  <td>R{product.cost_price}</td>
                  <td>R{product.price}</td>
                  <td>{product.opening_stock}</td>
                  <td style={{ color: product.stock <= 5 ? "#ff4d4d" : undefined, fontWeight: product.stock <= 5 ? 700 : 400 }}>{product.stock}</td>
                  <td>{sold}</td>
                  <td>R{pr.toFixed(2)}</td>
                  <td><button className={styles.btn} onClick={() => openRestock(product)}>Restock</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── CASH RECONCILIATION ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 20, padding: 15, border: "1px solid #333", borderRadius: 10 }}>
        <h3 style={{ color: "#d4af37", marginBottom: 12 }}>Cash Reconciliation</h3>
        {cashCounts.length === 0 ? (
          <p style={{ color: "#555", fontSize: 13 }}>No cash counts submitted yet.</p>
        ) : (
          cashCounts.map((count) => {
            const variance = count.counted_amount - count.expected_cash;
            const recountValue = ownerRecount[String(count.id)] ?? "";
            return (
              <div key={count.id} style={{ background: "#1A1A1A", borderRadius: 8, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "#aaa", fontSize: 13 }}>{count.staff_name} — {new Date(count.created_at).toLocaleString()}</span>
                  <span style={{
                    color: count.status === "confirmed" ? "#27AE60" : count.status === "discrepancy" ? "#ff4d4d" : "#d4af37",
                    fontWeight: 700, fontSize: 12, textTransform: "uppercase"
                  }}>{count.status}</span>
                </div>
                <div style={{ display: "flex", gap: 20, marginBottom: 8, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ color: "#888", fontSize: 12 }}>Staff counted</p>
                    <p style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>R{count.counted_amount.toFixed(2)}</p>
                  </div>
                  <div>
                    <p style={{ color: "#888", fontSize: 12 }}>System expected</p>
                    <p style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>R{count.expected_cash.toFixed(2)}</p>
                  </div>
                  <div>
                    <p style={{ color: "#888", fontSize: 12 }}>Variance</p>
                    <p style={{ color: variance === 0 ? "#27AE60" : "#ff4d4d", fontSize: 16, fontWeight: 700 }}>
                      {variance > 0 ? "+" : ""}R{variance.toFixed(2)}
                    </p>
                  </div>
                </div>
                {count.status === "pending" ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="number"
                      placeholder="Your own recount"
                      value={recountValue}
                      onChange={e => setOwnerRecount(prev => ({ ...prev, [String(count.id)]: e.target.value }))}
                      style={{ flex: 1, minWidth: 140, padding: 8, background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
                    />
                    <button onClick={() => reviewCashCount(count.id, "confirmed")} style={{ background: "#27AE60", color: "#000", border: "none", padding: "8px 14px", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>Confirm Match</button>
                    <button onClick={() => reviewCashCount(count.id, "discrepancy")} style={{ background: "#ff4d4d", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>Flag Discrepancy</button>
                  </div>
                ) : count.owner_amount !== null && (
                  <p style={{ color: "#888", fontSize: 12 }}>Owner recount: R{count.owner_amount.toFixed(2)}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── UNDO LOG ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20, padding: 15, border: "1px solid #333", borderRadius: 10 }}>
        <h3 style={{ color: "#d4af37", marginBottom: 12 }}>Undo Log</h3>
        {undoLog.length === 0 ? (
          <p style={{ color: "#555", fontSize: 13 }}>No sales have been undone.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {["Time", "Original Staff", "Undone By", "Approved By", "Amount"].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {undoLog.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.created_at).toLocaleString()}</td>
                  <td>{entry.staff_name}</td>
                  <td>{entry.undone_by}</td>
                  <td>{entry.approved_by}</td>
                  <td>R{Number(entry.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MANAGE STAFF ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20, padding: 15, border: "1px solid #333", borderRadius: 10 }}>
        <h3 style={{ color: "#d4af37", marginBottom: 12 }}>Manage Staff</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <input
            placeholder="Staff name"
            value={newStaffName}
            onChange={e => setNewStaffName(e.target.value)}
            style={{ padding: 8, background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
          />
          <select
            value={newStaffRole}
            onChange={e => setNewStaffRole(e.target.value === "owner" ? "owner" : "staff")}
            style={{ padding: 8, background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
          >
            <option value="staff">Staff</option>
            <option value="owner">Owner</option>
          </select>
          <input
            placeholder="PIN (4-12 digits)"
            type="password"
            value={newStaffPin}
            onChange={e => setNewStaffPin(e.target.value)}
            style={{ padding: 8, background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
          />
          <input
            placeholder="Confirm PIN"
            type="password"
            value={newStaffPinConfirm}
            onChange={e => setNewStaffPinConfirm(e.target.value)}
            style={{ padding: 8, background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
          />
          <button
            onClick={addStaff}
            disabled={addStaffLoading}
            style={{ background: "#d4af37", color: "#000", padding: "10px 18px", border: "none", borderRadius: 8, fontWeight: "bold", cursor: addStaffLoading ? "wait" : "pointer", opacity: addStaffLoading ? 0.7 : 1 }}
          >
            {addStaffLoading ? "Adding..." : "Add Staff"}
          </button>
        </div>

        {staffList.length === 0 ? (
          <p style={{ color: "#555", fontSize: 13 }}>No staff members yet.</p>
        ) : (
          staffList.map((member) => (
            <div key={member.id} style={{ background: "#1A1A1A", borderRadius: 8, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#fff" }}>{member.name} <span style={{ color: "#888", fontSize: 12 }}>({member.role})</span></span>
                <button
                  onClick={() => openPinReset(member.id)}
                  style={{ background: "#1A1A1A", color: "#d4af37", border: "1px solid #333", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                >
                  Reset PIN
                </button>
              </div>
              {pinResetTarget === member.id && (
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <input
                    placeholder="New PIN"
                    type="password"
                    value={pinResetValue}
                    onChange={e => setPinResetValue(e.target.value)}
                    style={{ flex: 1, minWidth: 120, padding: 8, background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
                  />
                  <input
                    placeholder="Confirm new PIN"
                    type="password"
                    value={pinResetConfirm}
                    onChange={e => setPinResetConfirm(e.target.value)}
                    style={{ flex: 1, minWidth: 120, padding: 8, background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 6 }}
                  />
                  <button onClick={submitPinReset} style={{ background: "#27AE60", color: "#000", border: "none", padding: "8px 14px", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>Save</button>
                  <button onClick={() => setPinResetTarget(null)} style={{ background: "#1A1A1A", color: "#aaa", border: "1px solid #333", padding: "8px 14px", borderRadius: 6, cursor: "pointer" }}>Cancel</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── STAFF ACTIVITY ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20, padding: 15, border: "1px solid #333", borderRadius: 10 }}>
        <h3 style={{ color: "#d4af37", marginBottom: 12 }}>Staff Activity (Today)</h3>
        {staffSessions.length === 0 ? (
          <p style={{ color: "#555", fontSize: 13 }}>No staff activity recorded today.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {["Staff", "Login", "Logout", "Hours", "Items Sold", "Money Made"].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {staffSessions.map((session, i) => (
                <tr key={i}>
                  <td>{session.staffName}</td>
                  <td>{new Date(session.loginAt).toLocaleTimeString()}</td>
                  <td>{session.logoutAt ? new Date(session.logoutAt).toLocaleTimeString() : "Active"}</td>
                  <td>{session.hoursWorked.toFixed(1)}</td>
                  <td>{session.itemsSold}</td>
                  <td>R{session.moneyMade.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── RESTOCK MODAL ────────────────────────────────────────────────── */}
      {showRestock && restockProduct && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ color: "#d4af37", marginBottom: 16 }}>Adjust Stock — {restockProduct.name}</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 12 }}>Current stock: {restockProduct.stock}</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <button
                onClick={() => setRestockMode("add")}
                style={{ flex: 1, background: restockMode === "add" ? "#27AE60" : "#1A1A1A", color: restockMode === "add" ? "#000" : "#aaa", border: "1px solid #333", padding: "10px 0", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}
              >
                + Add Stock
              </button>
              <button
                onClick={() => setRestockMode("remove")}
                style={{ flex: 1, background: restockMode === "remove" ? "#ff4d4d" : "#1A1A1A", color: restockMode === "remove" ? "#000" : "#aaa", border: "1px solid #333", padding: "10px 0", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}
              >
                − Remove Stock
              </button>
            </div>
            <input
              style={inp}
              placeholder={restockMode === "add" ? "Quantity to add" : "Quantity to remove"}
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

      {/* ── RESET DAY MODAL ──────────────────────────────────────────────── */}
      {showReset && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ color: "#ff4d4d", marginBottom: 8 }}>Reset Day</h3>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 16 }}>{"This will delete all today\'s sales and reset opening stock. Owner access is required."}</p>
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
