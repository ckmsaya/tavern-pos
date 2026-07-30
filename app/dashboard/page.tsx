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

  async function clearCashCounts() {
    if (!confirm("Clear all cash reconciliation history? This cannot be undone.")) return;
    const res = await fetch("/api/cash-counts", { method: "DELETE" });
    if (!res.ok) {
      const result = await res.json();
      alert(result.error ?? "Unable to clear cash counts");
      return;
    }
    loadCashCounts();
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

  async function clearUndoLog() {
    if (!confirm("Clear the entire undo log? This cannot be undone.")) return;
    const res = await fetch("/api/undo-log", { method: "DELETE" });
    if (!res.ok) {
      const result = await res.json();
      alert(result.error ?? "Unable to clear undo log");
      return;
    }
    loadUndoLog();
  }

  async function clearStaffSessions() {
    if (!confirm("Clear all recorded staff activity? This cannot be undone.")) return;
    const res = await fetch("/api/staff-sessions", { method: "DELETE" });
    if (!res.ok) {
      const result = await res.json();
      alert(result.error ?? "Unable to clear staff activity");
      return;
    }
    loadStaffSessions();
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

  async function removeStaff(member: StaffMember) {
    if (!confirm(`Remove ${member.name} from staff? They will no longer be able to log in.`)) return;

    const res = await fetch(`/api/staff/${member.id}`, { method: "DELETE" });
    if (!res.ok) {
      const result = await res.json();
      alert(result.error ?? "Unable to remove staff member");
      return;
    }

    loadStaff();
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

  async function removeProduct(product: Product) {
    if (!confirm(`Remove "${product.name}" from inventory? This cannot be undone.`)) return;

    const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    if (!res.ok) {
      const result = await res.json();
      alert(result.error ?? "Unable to remove product");
      return;
    }

    load();
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

  function logout() {
    fetch("/api/logout", { method: "POST" }).then(() => {
      window.location.href = "/login";
    });
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

  return (
    <div className={styles.page}>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <div className={styles.brandTitle}>Tavern Dashboard</div>
          <div className={styles.brandSubtitle}>Owner Control Centre</div>
        </div>
        <button className="btn btn-ghost" onClick={logout}>Logout</button>
      </div>

      {/* ── ADD PRODUCT ──────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>Add New Product</h3>
        </div>
        <div className={styles.formRow}>
          {formFields.map((field) => (
            <input
              key={field.key}
              className="input"
              placeholder={field.placeholder}
              value={newProduct[field.key]}
              onChange={(e) => setNewProduct({ ...newProduct, [field.key]: e.target.value })}
            />
          ))}
          <select
            className="input"
            value={newProduct.category}
            onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
          >
            <option value="">Category</option>
            <option value="beer">Beer</option>
            <option value="cider">Cider</option>
            <option value="spirit">Spirit</option>
            <option value="wine">Wine</option>
            <option value="other">Other</option>
          </select>
          <button className="btn btn-primary" onClick={addProduct} disabled={addLoading}>
            {addLoading ? "Adding…" : "Add Product"}
          </button>
        </div>
      </div>

      {/* ── KPI CARDS ────────────────────────────────────────────────────── */}
      <div className={styles.cards}>
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Staff Performance</h3>
          {Object.entries(staffStats).length === 0 ? (
            <p className={styles.emptyState}>No sales yet today.</p>
          ) : (
            Object.entries(staffStats)
              .sort(([, a], [, b]) => b - a)
              .map(([name, total]) => (
                <div key={name} className={styles.staffRow}>
                  <span>{name}</span><span>R{total}</span>
                </div>
              ))
          )}
        </div>
        <div className={styles.card} style={{ "--accent": "var(--gold)" } as React.CSSProperties}>
          <p className={styles.cardLabel}>Revenue</p><h2 className={styles.cardValue}>R{revenue}</h2>
        </div>
        <div className={styles.card} style={{ "--accent": "var(--green)" } as React.CSSProperties}>
          <p className={styles.cardLabel}>Cash</p><h2 className={styles.cardValue}>R{cash}</h2>
        </div>
        <div className={styles.card} style={{ "--accent": "var(--blue)" } as React.CSSProperties}>
          <p className={styles.cardLabel}>Card</p><h2 className={styles.cardValue}>R{card}</h2>
        </div>
        <div className={styles.card} style={{ "--accent": profit >= 0 ? "var(--green)" : "var(--red)" } as React.CSSProperties}>
          <p className={styles.cardLabel}>Profit</p><h2 className={styles.cardValue}>R{profit.toFixed(2)}</h2>
        </div>
        <div className={styles.card} style={{ "--accent": "var(--orange)" } as React.CSSProperties}>
          <p className={styles.cardLabel}>Cost of Goods Sold</p><h2 className={styles.cardValue}>R{(revenue - profit).toFixed(2)}</h2>
        </div>
      </div>

      {/* ── ACTION BUTTONS ───────────────────────────────────────────────── */}
      <div className={styles.actionBar}>
        <button className="btn btn-primary" onClick={closeDay} disabled={reportLoading}>
          {reportLoading ? "Generating…" : "Close Day · Generate Report"}
        </button>
        <button className="btn btn-danger" onClick={() => { setResetError(""); setShowReset(true); }}>Reset Day</button>
      </div>

      {/* ── CHART + LOW STOCK ────────────────────────────────────────────── */}
      <div className={styles.row}>
        <div className={styles.panel}>
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
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Low Stock</h3>
          {lowStockUI.length === 0 ? (
            <p className={styles.emptyState}>All stock OK</p>
          ) : (
            lowStockUI.map((product) => (
              <div key={product.id} className={styles.lowStock}>
                <span>{product.name}</span>
                <span className="badge badge-red">{product.stock} left</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── INVENTORY TABLE ──────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>Inventory</h3>
          <span className={styles.sectionHint}>{products.length} products</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {["Product","Category","Cost","Price","Opening","Stock","Sold","Profit","Restock","Remove"].map(h => <th key={h}>{h}</th>)}
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
                    <td>
                      {product.stock <= 5
                        ? <span className="badge badge-red">{product.stock}</span>
                        : product.stock}
                    </td>
                    <td>{sold}</td>
                    <td>R{pr.toFixed(2)}</td>
                    <td><button className="btn btn-sm" onClick={() => openRestock(product)}>Restock</button></td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => removeProduct(product)}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CASH RECONCILIATION ──────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>Cash Reconciliation</h3>
          {cashCounts.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={clearCashCounts}>Clear History</button>
          )}
        </div>
        {cashCounts.length === 0 ? (
          <p className={styles.emptyState}>No cash counts submitted yet.</p>
        ) : (
          cashCounts.map((count) => {
            const variance = count.counted_amount - count.expected_cash;
            const recountValue = ownerRecount[String(count.id)] ?? "";
            const badgeClass = count.status === "confirmed" ? "badge-green" : count.status === "discrepancy" ? "badge-red" : "badge-gold";
            return (
              <div key={count.id} className={styles.listRow}>
                <div className={styles.listRowHead}>
                  <span className={styles.metaText}>{count.staff_name} — {new Date(count.created_at).toLocaleString()}</span>
                  <span className={`badge ${badgeClass}`}>{count.status}</span>
                </div>
                <div className={styles.statGrid}>
                  <div>
                    <p className={styles.statLabel}>Staff counted</p>
                    <p className={styles.statValue}>R{count.counted_amount.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className={styles.statLabel}>System expected</p>
                    <p className={styles.statValue}>R{count.expected_cash.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className={styles.statLabel}>Variance</p>
                    <p className={styles.statValue} style={{ color: variance === 0 ? "var(--green)" : "#ff8589" }}>
                      {variance > 0 ? "+" : ""}R{variance.toFixed(2)}
                    </p>
                  </div>
                </div>
                {count.status === "pending" ? (
                  <div className={styles.formRow}>
                    <input
                      className="input"
                      type="number"
                      placeholder="Your own recount"
                      value={recountValue}
                      onChange={e => setOwnerRecount(prev => ({ ...prev, [String(count.id)]: e.target.value }))}
                    />
                    <button className="btn btn-success" onClick={() => reviewCashCount(count.id, "confirmed")}>Confirm Match</button>
                    <button className="btn btn-danger" onClick={() => reviewCashCount(count.id, "discrepancy")}>Flag Discrepancy</button>
                  </div>
                ) : count.owner_amount !== null && (
                  <p className={styles.metaText}>Owner recount: R{count.owner_amount.toFixed(2)}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── UNDO LOG ──────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>Undo Log</h3>
          {undoLog.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={clearUndoLog}>Clear History</button>
          )}
        </div>
        {undoLog.length === 0 ? (
          <p className={styles.emptyState}>No sales have been undone.</p>
        ) : (
          <div className={styles.tableWrap}>
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
          </div>
        )}
      </div>

      {/* ── MANAGE STAFF ─────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>Manage Staff</h3>
        </div>
        <div className={styles.formRow} style={{ marginBottom: 18 }}>
          <input
            className="input"
            placeholder="Staff name"
            value={newStaffName}
            onChange={e => setNewStaffName(e.target.value)}
          />
          <select
            className="input"
            value={newStaffRole}
            onChange={e => setNewStaffRole(e.target.value === "owner" ? "owner" : "staff")}
          >
            <option value="staff">Staff</option>
            <option value="owner">Owner</option>
          </select>
          <input
            className="input"
            placeholder="PIN (4-12 digits)"
            type="password"
            value={newStaffPin}
            onChange={e => setNewStaffPin(e.target.value)}
          />
          <input
            className="input"
            placeholder="Confirm PIN"
            type="password"
            value={newStaffPinConfirm}
            onChange={e => setNewStaffPinConfirm(e.target.value)}
          />
          <button className="btn btn-primary" onClick={addStaff} disabled={addStaffLoading}>
            {addStaffLoading ? "Adding…" : "Add Staff"}
          </button>
        </div>

        {staffList.length === 0 ? (
          <p className={styles.emptyState}>No staff members yet.</p>
        ) : (
          staffList.map((member) => (
            <div key={member.id} className={styles.listRow}>
              <div className={styles.listRowHead}>
                <span>{member.name} <span className={styles.metaText}>({member.role})</span></span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => openPinReset(member.id)}>Reset PIN</button>
                  <button className="btn btn-sm btn-danger" onClick={() => removeStaff(member)}>Remove</button>
                </div>
              </div>
              {pinResetTarget === member.id && (
                <div className={styles.formRow} style={{ marginTop: 10 }}>
                  <input
                    className="input"
                    placeholder="New PIN"
                    type="password"
                    value={pinResetValue}
                    onChange={e => setPinResetValue(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Confirm new PIN"
                    type="password"
                    value={pinResetConfirm}
                    onChange={e => setPinResetConfirm(e.target.value)}
                  />
                  <button className="btn btn-success" onClick={submitPinReset}>Save</button>
                  <button className="btn btn-ghost" onClick={() => setPinResetTarget(null)}>Cancel</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── STAFF ACTIVITY ───────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>Staff Activity</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={styles.sectionHint}>Today</span>
            {staffSessions.length > 0 && (
              <button className="btn btn-sm btn-ghost" onClick={clearStaffSessions}>Clear History</button>
            )}
          </div>
        </div>
        {staffSessions.length === 0 ? (
          <p className={styles.emptyState}>No staff activity recorded today.</p>
        ) : (
          <div className={styles.tableWrap}>
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
                    <td>{session.logoutAt ? new Date(session.logoutAt).toLocaleTimeString() : <span className="badge badge-green">Active</span>}</td>
                    <td>{session.hoursWorked.toFixed(1)}</td>
                    <td>{session.itemsSold}</td>
                    <td>R{session.moneyMade.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── RESTOCK MODAL ────────────────────────────────────────────────── */}
      {showRestock && restockProduct && (
        <div className="modal-overlay" onClick={() => setShowRestock(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "var(--gold)", marginBottom: 6, fontSize: 18 }}>Adjust Stock</h3>
            <p className={styles.metaText} style={{ marginBottom: 16 }}>{restockProduct.name} — current stock: {restockProduct.stock}</p>
            <div className={styles.toggleGroup}>
              <button
                onClick={() => setRestockMode("add")}
                className={`${styles.toggleBtn} ${restockMode === "add" ? styles.toggleActiveAdd : ""}`}
              >
                + Add Stock
              </button>
              <button
                onClick={() => setRestockMode("remove")}
                className={`${styles.toggleBtn} ${restockMode === "remove" ? styles.toggleActiveRemove : ""}`}
              >
                − Remove Stock
              </button>
            </div>
            <input
              className="input"
              style={{ marginBottom: 16 }}
              placeholder={restockMode === "add" ? "Quantity to add" : "Quantity to remove"}
              type="number"
              value={restockQty}
              onChange={e => setRestockQty(e.target.value)}
              onKeyDown={e => e.key === "Enter" && confirmRestock()}
              autoFocus
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmRestock}>Confirm</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowRestock(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESET DAY MODAL ──────────────────────────────────────────────── */}
      {showReset && (
        <div className="modal-overlay" onClick={() => setShowReset(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "#ff8589", marginBottom: 8, fontSize: 18 }}>Reset Day</h3>
            <p className={styles.metaText} style={{ marginBottom: 16 }}>This will delete all today&apos;s sales and reset opening stock. Owner access is required.</p>
            {resetError && <p style={{ color: "#ff8589", fontSize: 13, marginBottom: 12 }}>{resetError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-danger-solid" style={{ flex: 1 }} onClick={confirmReset}>Reset</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowReset(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
