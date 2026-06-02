"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface Product {
  id: number;
  name: string;
  price: number;
  cost_price: number;
  stock: number;
  opening_stock: number;
  category: string;
  barcode: string;
  business_id?: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface SaleRecord {
  saleIds: number[];
  items: { name: string; quantity: number; total: number }[];
  grandTotal: number;
  payment: string;
  staffName: string;
  time: string;
  pending?: boolean;
}

const BUSINESS_ID: string | null = null;
const PRODUCT_CACHE_KEY = "tavern-pos-products";
const STAFF_CACHE_KEY = "tavern-pos-staff";
const SALE_QUEUE_KEY = "tavern-pos-pending-sales";

interface PendingSale {
  id: string;
  businessId: string | null;
  payment: "cash" | "card";
  staffName: string;
  createdAt: string;
  items: {
    productId: number;
    name: string;
    quantity: number;
    price: number;
  }[];
}

function readPendingSales(): PendingSale[] {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(localStorage.getItem(SALE_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writePendingSales(sales: PendingSale[]) {
  localStorage.setItem(SALE_QUEUE_KEY, JSON.stringify(sales));
}

export default function POS({ businessId }: { businessId?: string }) {
  const router = useRouter();
  const BIZ_ID = businessId ?? BUSINESS_ID;
// 🆕 cash modal control
const [showCashModal, setShowCashModal] = useState(false);
  const [staffName, setStaffName]     = useState<string | null>(null);
  const [isOnline, setIsOnline]       = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [products, setProducts]       = useState<Product[]>([]);
  const [search, setSearch]           = useState("");
  const [category, setCategory]       = useState("all");
  const [cart, setCart]               = useState<CartItem[]>([]);
  const [payment, setPayment]         = useState<"cash" | "card">("cash");
  const [undoHistory, setUndoHistory] = useState<SaleRecord[]>([]);
  const [showUndo, setShowUndo]       = useState(false);
  const [lastReceipt, setLastReceipt] = useState<SaleRecord | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
const [amountGiven, setAmountGiven] = useState("");

  const [barcode, setBarcode]         = useState("");
  const barcodeRef                    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    setPendingCount(readPendingSales().length);
    fetchStaffName();
    loadProducts();

    const handleOnline = () => {
      setIsOnline(true);
      syncPendingSales();
      loadProducts();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (navigator.onLine) {
      syncPendingSales();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchStaffName() {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) {
        const cached = localStorage.getItem(STAFF_CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          if (data.name) setStaffName(data.name);
          return;
        }

        router.replace("/login");
        return;
      }

      const data = await res.json();
      if (data.name) {
        localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(data));
        setStaffName(data.name);
      }
    } catch {
      const cached = localStorage.getItem(STAFF_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.name) setStaffName(data.name);
        return;
      }

      router.replace("/login");
    }
  }

  async function loadProducts() {
    try {
      let query = supabase.from("products").select("*").order("name", { ascending: true });
      if (BIZ_ID) query = query.eq("business_id", BIZ_ID);
      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(data));
        setProducts(data);
      }
    } catch (err) {
      const cached = localStorage.getItem(PRODUCT_CACHE_KEY);
      if (cached) {
        setProducts(JSON.parse(cached));
        return;
      }

      console.log("PRODUCT LOAD ERROR:", err);
    }
  }

  function logout() {
    fetch("/api/logout", { method: "POST" }).then(() => {
      window.location.href = "/login";
    });
  }

  async function handleScan(code: string) {
    const clean = code.trim();
    if (!clean) return;
    const localProduct = products.find(product => product.barcode === clean);

    if (localProduct) {
      addToCart(localProduct);
      setBarcode("");
      setTimeout(() => barcodeRef.current?.focus(), 50);
      return;
    }

    try {
      let query = supabase.from("products").select("*").eq("barcode", clean);
      if (BIZ_ID) query = query.eq("business_id", BIZ_ID);
      const { data } = await query.maybeSingle();
      if (!data) throw new Error("Product not found");

      addToCart(data);
      setBarcode("");
      setTimeout(() => barcodeRef.current?.focus(), 50);
    } catch {
      alert("Product not found for barcode: " + clean);
      setBarcode("");
      setTimeout(() => barcodeRef.current?.focus(), 50);
    }
  }

  function addToCart(product: Product) {
    if (product.stock <= 0) { alert(`${product.name} is out of stock`); return; }
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          alert(`Only ${product.stock} left in stock`);
          return prev;
        }
        return prev.map(i => i.product.id === product.id
          ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQty(productId: number, delta: number) {
    setCart(prev => prev
      .map(i => i.product.id === productId
        ? { ...i, quantity: Math.max(0, i.quantity + delta) }
        : i)
      .filter(i => i.quantity > 0)
    );
  }

  function removeFromCart(productId: number) {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  }

  function clearCart() { setCart([]); }

  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);

  // 🆕 confirm cash sale
function confirmCashSale() {
  const given = Number(amountGiven);

  if (!amountGiven || isNaN(given)) {
    alert("Enter valid amount");
    return;
  }

  if (given < cartTotal) {
    alert("Customer didn't pay enough");
    return;
  }

    setShowCashModal(false);
  processSale("cash");
}

  function reduceLocalStock(items: PendingSale["items"]) {
    setProducts(prev => {
      const next = prev.map(product => {
        const sold = items.find(item => item.productId === product.id);
        return sold ? { ...product, stock: product.stock - sold.quantity } : product;
      });
      localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function queueSale(sale: PendingSale) {
    const pending = [...readPendingSales(), sale];
    writePendingSales(pending);
    setPendingCount(pending.length);
  }

  async function syncPendingSales() {
    if (!navigator.onLine) return;

    const pending = readPendingSales();
    if (!pending.length) {
      setPendingCount(0);
      return;
    }

    const remaining: PendingSale[] = [];

    for (const sale of pending) {
      try {
        const res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId: sale.businessId,
            payment: sale.payment,
            items: sale.items,
          }),
        });

        if (!res.ok) {
          remaining.push(sale);
        }
      } catch {
        remaining.push(sale);
      }
    }

    writePendingSales(remaining);
    setPendingCount(remaining.length);

    if (remaining.length === 0) {
      loadProducts();
    }
  }

  async function processSale(selectedPayment: "cash" | "card" = payment) {
    if (cart.length === 0) { alert("Cart is empty"); return; }
    if (!staffName) return;

    for (const item of cart) {
      if (item.quantity > item.product.stock) {
        alert(`Not enough stock for ${item.product.name}. Only ${item.product.stock} left.`);
        return;
      }
    }

    const saleIds: number[] = [];
    const receiptItems: { name: string; quantity: number; total: number }[] = [];
    const saleItems = cart.map(item => ({
      productId: item.product.id,
      name: item.product.name,
      quantity: item.quantity,
      price: item.product.price,
    }));

    for (const item of cart) {
      receiptItems.push({
        name:     item.product.name,
        quantity: item.quantity,
        total:    item.product.price * item.quantity,
      });
    }

    const pendingSale: PendingSale = {
      id: crypto.randomUUID(),
      businessId: BIZ_ID,
      payment: selectedPayment,
      staffName,
      createdAt: new Date().toISOString(),
      items: saleItems,
    };

    let pending = !navigator.onLine;

    if (!pending) {
      try {
        const res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId: BIZ_ID,
            payment: selectedPayment,
            items: saleItems,
          }),
        });

        if (!res.ok) {
          const result = await res.json();
          if (res.status >= 500 || res.status === 408) {
            pending = true;
          } else {
            alert(result.error ?? "Sale failed");
            return;
          }
        } else {
          const result = await res.json();
          saleIds.push(...(result.saleIds ?? []));
        }
      } catch {
        pending = true;
      }
    }

    if (pending) {
      queueSale(pendingSale);
      saleIds.push(-Date.now());
    }

    reduceLocalStock(saleItems);

    const receipt: SaleRecord = {
      saleIds,
      items:      receiptItems,
      grandTotal: cartTotal,
      payment: selectedPayment,
      staffName,
      time:       new Date().toLocaleTimeString(),
      pending,
    };

    setUndoHistory(prev => [receipt, ...prev].slice(0, 10));
    setLastReceipt(receipt);
    setShowReceipt(true);
    setCart([]);
    if (!pending) {
      loadProducts();
    }
  }

  async function undoSale(record: SaleRecord) {
    if (record.pending) {
      alert("This sale is still waiting to sync. It cannot be undone yet.");
      return;
    }

    const confirm = window.confirm(`Undo sale of R${record.grandTotal} from ${record.time}?`);
    if (!confirm) return;

    for (const id of record.saleIds) {
      await supabase.from("sales").delete().eq("id", id);
    }

    for (const item of record.items) {
      const prod = products.find(p => p.name === item.name);
      if (prod) {
        await supabase.from("products")
          .update({ stock: prod.stock + item.quantity })
          .eq("id", prod.id);
      }
    }

    setUndoHistory(prev => prev.filter(r => r.saleIds[0] !== record.saleIds[0]));
    setShowUndo(false);
    loadProducts();
    alert("Sale undone successfully");
  }

  const filtered = products.filter(p => {
    const matchSearch   = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === "all" || p.category === category;
    return matchSearch && matchCategory;
  });

  const S = {
    container:    { padding: 20, paddingBottom: 160, background: "radial-gradient(circle at top, #111 0%, #000 60%)", color: "white", minHeight: "100vh", fontFamily: "Arial, sans-serif" } as React.CSSProperties,
    title:        { color: "#d4af37", marginBottom: 10, fontSize: 22, fontWeight: 700 } as React.CSSProperties,
    input:        { padding: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "white", borderRadius: 8, outline: "none", fontSize: 14 } as React.CSSProperties,
    btn:          { padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(212,175,55,0.3)", background: "#111", color: "#d4af37", cursor: "pointer", fontSize: 13, transition: "all .2s" } as React.CSSProperties,
    goldBtn:      { padding: "12px 24px", background: "#d4af37", color: "#000", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 15 } as React.CSSProperties,
    card:         { border: "1px solid rgba(255,255,255,0.08)", padding: 12, borderRadius: 12, cursor: "pointer", transition: "0.25s", background: "rgba(255,255,255,0.03)" } as React.CSSProperties,
    overlay:      { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
    modal:        { background: "#111", border: "1px solid #d4af37", borderRadius: 16, padding: 28, maxWidth: 420, width: "90%", maxHeight: "80vh", overflowY: "auto" as const },
  };

  // Show loading while fetching staff name
  if (!staffName) return (
    <div style={{ ...S.container, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#d4af37" }}>Loading...</p>
    </div>
  );

  return (
    <div style={S.container}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={S.title}>POS System</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ color: isOnline ? "#27AE60" : "#ff4d4d", fontSize: 12 }}>
            {isOnline ? "Online" : "Offline"}{pendingCount ? ` • ${pendingCount} pending` : ""}
          </span>
          <span style={{ color: "#aaa", fontSize: 13 }}>👤 {staffName}</span>
          <button style={S.btn} onClick={() => setShowUndo(true)}>
            Undo History ({undoHistory.length})
          </button>
          <button style={{ ...S.btn, color: "#ff4d4d" }} onClick={logout}>Logout</button>
        </div>
      </div>

      {/* FILTERS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
        <input style={S.input} placeholder="Search product..." value={search} onChange={e => setSearch(e.target.value)} />
        <input
          ref={barcodeRef}
          style={S.input}
          placeholder="Scan barcode..."
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleScan(barcode)}
        />
        <select style={S.input} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="all">All Categories</option>
          <option value="beer">Beer</option>
          <option value="cider">Cider</option>
          <option value="spirit">Spirit</option>
          <option value="wine">Wine</option>
          <option value="food">Food</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* PRODUCT GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
        {filtered.map(product => (
          <div
            key={product.id}
            onClick={() => addToCart(product)}
            style={{
              ...S.card,
              opacity: product.stock <= 0 ? 0.4 : 1,
              cursor: product.stock <= 0 ? "not-allowed" : "pointer",
            }}
          >
            <p style={{ fontSize: 13, marginBottom: 4 }}>{product.name}</p>
            <p style={{ color: "#d4af37", fontWeight: 700 }}>R{product.price}</p>
            <p style={{ fontSize: 12, color: product.stock <= 5 ? "#ff4d4d" : "#aaa" }}>
              {product.stock <= 0 ? "OUT OF STOCK" : `${product.stock} left`}
            </p>
          </div>
        ))}
      </div>

      {/* BOTTOM BAR */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(15px)", borderTop: "1px solid rgba(255,255,255,0.08)", padding: 12, zIndex: 50 }}>
        {cart.length > 0 && (
          <div style={{ maxHeight: 140, overflowY: "auto", marginBottom: 10 }}>
            {cart.map(item => (
              <div key={item.product.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #1A1A1A" }}>
                <span style={{ flex: 1, fontSize: 13, color: "#fff" }}>{item.product.name}</span>
                <button onClick={() => updateQty(item.product.id, -1)} style={{ background: "#222", color: "#fff", border: "none", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>-</button>
                <span style={{ color: "#d4af37", fontSize: 13, minWidth: 20, textAlign: "center" }}>{item.quantity}</span>
                <button onClick={() => updateQty(item.product.id, 1)} style={{ background: "#222", color: "#fff", border: "none", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>+</button>
                <span style={{ color: "#d4af37", fontSize: 13, minWidth: 60, textAlign: "right" }}>R{(item.product.price * item.quantity).toFixed(2)}</span>
                <button onClick={() => removeFromCart(item.product.id)} style={{ background: "rgba(255,0,0,0.2)", color: "#ff4d4d", border: "none", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ color: "#d4af37", fontSize: 16, fontWeight: 700 }}>
            {cart.length === 0 ? "Tap a product to add to cart" : `Total: R${cartTotal.toFixed(2)}`}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {cart.length > 0 && (
              <button onClick={clearCart} style={{ ...S.btn, color: "#ff4d4d", borderColor: "rgba(255,0,0,0.3)" }}>Clear</button>
            )}
            <button
              onClick={() => {
  setPayment("cash");
  setAmountGiven("");
  setShowCashModal(true); // 🆕 open modal instead of selling
}}
              style={{ ...S.goldBtn, background: payment === "cash" ? "#d4af37" : "#333", color: payment === "cash" ? "#000" : "#d4af37" }}
            >
              Cash
            </button>
            <button
              onClick={() => { setPayment("card"); processSale("card"); }}
              style={{ ...S.goldBtn, background: payment === "card" ? "#2980B9" : "#333", color: "#fff" }}
            >
              Card
            </button>
          </div>
        </div>
      </div>

      {/* RECEIPT MODAL */}
      {showReceipt && lastReceipt && (
        <div style={S.overlay} onClick={() => setShowReceipt(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <h2 style={{ color: "#d4af37", marginBottom: 4 }}>Sale Complete</h2>
              <p style={{ color: "#888", fontSize: 13 }}>{lastReceipt.time} — {lastReceipt.staffName}</p>
            </div>
            {lastReceipt.items.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #222" }}>
                <span style={{ color: "#ccc" }}>{item.name} x{item.quantity}</span>
                <span style={{ color: "#d4af37" }}>R{item.total.toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontWeight: 700, fontSize: 16 }}>
              <span>Total</span>
              <span style={{ color: "#d4af37" }}>R{lastReceipt.grandTotal.toFixed(2)}</span>
            </div>
            <div style={{ textAlign: "center", marginTop: 4, color: "#888", fontSize: 13, marginBottom: 12 }}>
              Paid by {lastReceipt.payment.toUpperCase()}{lastReceipt.pending ? " • queued for sync" : ""}
            </div>
            {lastReceipt.payment === "cash" && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: "#aaa", fontSize: 13, marginBottom: 8 }}>Amount given by customer:</p>
                <input
                  type="number"
                  placeholder="e.g. 100"
                  value={amountGiven}
                  onChange={e => setAmountGiven(e.target.value)}
                  style={{ width: "100%", padding: 10, background: "#1A1A1A", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 16, boxSizing: "border-box" as const, marginBottom: 10 }}
                  autoFocus
                />
                {amountGiven && Number(amountGiven) >= lastReceipt.grandTotal && (
                  <div style={{ background: "#0D2A0D", border: "1px solid #27AE60", borderRadius: 10, padding: 14, textAlign: "center" }}>
                    <p style={{ color: "#aaa", fontSize: 12, marginBottom: 4 }}>CHANGE DUE</p>
                    <p style={{ color: "#27AE60", fontSize: 32, fontWeight: 900 }}>
                      R{(Number(amountGiven) - lastReceipt.grandTotal).toFixed(2)}
                    </p>
                  </div>
                )}
                {amountGiven && Number(amountGiven) < lastReceipt.grandTotal && (
                  <div style={{ background: "#2A0D0D", border: "1px solid #ff4d4d", borderRadius: 10, padding: 14, textAlign: "center" }}>
                    <p style={{ color: "#ff4d4d", fontSize: 14, fontWeight: 700 }}>
                      Short by R{(lastReceipt.grandTotal - Number(amountGiven)).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            )}
            <button style={{ ...S.goldBtn, width: "100%" }} onClick={() => setShowReceipt(false)}>Done</button>
          </div>
        </div>
      )}





{/* 🆕 CASH MODAL */}
{showCashModal && (
  <div style={S.overlay} onClick={() => setShowCashModal(false)}>
    <div style={S.modal} onClick={e => e.stopPropagation()}>

      <h2 style={{ color: "#d4af37", marginBottom: 10 }}>💰 Enter Amount</h2>

      <p style={{ color: "#aaa", marginBottom: 10 }}>
        Total: <b>R{cartTotal.toFixed(2)}</b>
      </p>

      <input
        type="number"
        placeholder="e.g. 100"
        value={amountGiven}
        onChange={e => setAmountGiven(e.target.value)}
        style={{
          width: "100%",
          padding: 12,
          background: "#1A1A1A",
          border: "1px solid #333",
          borderRadius: 8,
          color: "#fff",
          fontSize: 18,
          marginBottom: 12
        }}
        autoFocus
      />

      {amountGiven && Number(amountGiven) >= cartTotal && (
        <div style={{
          background: "#0D2A0D",
          border: "1px solid #27AE60",
          borderRadius: 10,
          padding: 14,
          textAlign: "center",
          marginBottom: 10
        }}>
          <p style={{ color: "#aaa", fontSize: 12 }}>CHANGE</p>
          <p style={{ color: "#27AE60", fontSize: 30, fontWeight: 900 }}>
            R{(Number(amountGiven) - cartTotal).toFixed(2)}
          </p>
        </div>
      )}

      {amountGiven && Number(amountGiven) < cartTotal && (
        <div style={{
          background: "#2A0D0D",
          border: "1px solid #ff4d4d",
          borderRadius: 10,
          padding: 14,
          textAlign: "center",
          marginBottom: 10
        }}>
          <p style={{ color: "#ff4d4d", fontWeight: 700 }}>
            Short by R{(cartTotal - Number(amountGiven)).toFixed(2)}
          </p>
        </div>
      )}

      <button
        onClick={confirmCashSale}
        style={{ ...S.goldBtn, width: "100%", marginTop: 10 }}
      >
        Confirm Sale
      </button>

    </div>
  </div>
)}

      {/* UNDO HISTORY MODAL */}
      {showUndo && (
        <div style={S.overlay} onClick={() => setShowUndo(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: "#d4af37", marginBottom: 16 }}>Undo History</h2>
            {undoHistory.length === 0 ? (
              <p style={{ color: "#888" }}>No recent sales to undo.</p>
            ) : (
              undoHistory.map((record, i) => (
                <div key={i} style={{ background: "#1A1A1A", borderRadius: 10, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#aaa", fontSize: 13 }}>{record.time} — {record.staffName}</span>
                    <span style={{ color: "#d4af37", fontWeight: 700 }}>R{record.grandTotal.toFixed(2)}</span>
                  </div>
                  {record.items.map((item, j) => (
                    <p key={j} style={{ color: "#666", fontSize: 12, margin: "2px 0" }}>
                      {item.name} x{item.quantity}
                    </p>
                  ))}
                  <button
                    onClick={() => undoSale(record)}
                    style={{ marginTop: 10, background: "rgba(255,0,0,0.15)", color: "#ff4d4d", border: "1px solid rgba(255,0,0,0.3)", padding: "8px 16px", borderRadius: 8, cursor: "pointer", width: "100%" }}
                  >
                    Undo This Sale
                  </button>
                </div>
              ))
            )}
            <button style={{ ...S.btn, width: "100%", marginTop: 10 }} onClick={() => setShowUndo(false)}>Close</button>
          </div>
        </div>
      )}

    </div>
  );
}
