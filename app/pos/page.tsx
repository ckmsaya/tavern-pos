"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";

// ─── TYPES ────────────────────────────────────────────────────────────────────
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
}

// ─── CHANGE THIS FOR TAVERN-POS (remove business_id filter from queries) ─────
const BUSINESS_ID: string | null = null; // Set to null for tavern-pos, fill in for TillFlow

export default function POS({ businessId }: { businessId?: string }) {
  const BIZ_ID = businessId ?? BUSINESS_ID;

  // Auth
  const [staffName, setStaffName]   = useState<string | null>(null);
  const [pin, setPin]               = useState("");
  const [pinError, setPinError]     = useState("");
  const [staffList, setStaffList]   = useState<any[]>([]);

  // Data
  const [products, setProducts]     = useState<Product[]>([]);

  // Filters
  const [search, setSearch]         = useState("");
  const [category, setCategory]     = useState("all");

  // Cart
  const [cart, setCart]             = useState<CartItem[]>([]);

  // Payment
  const [payment, setPayment]       = useState<"cash" | "card">("cash");

  // Undo history (last 10 sales)
  const [undoHistory, setUndoHistory] = useState<SaleRecord[]>([]);
  const [showUndo, setShowUndo]     = useState(false);

  // Confirmation
  const [lastReceipt, setLastReceipt] = useState<SaleRecord | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // Barcode
  const [barcode, setBarcode]       = useState("");
  const barcodeRef                  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProducts();
    loadStaff();
    const saved = localStorage.getItem("tillflow_staff");
    if (saved) setStaffName(saved);
  }, []);

  async function loadProducts() {
    let query = supabase.from("products").select("*").order("name", { ascending: true });
    if (BIZ_ID) query = query.eq("business_id", BIZ_ID);
    const { data } = await query;
    if (data) setProducts(data);
  }

  async function loadStaff() {
    let query = supabase.from("staff").select("*");
    if (BIZ_ID) query = query.eq("business_id", BIZ_ID);
    const { data } = await query;
    if (data) setStaffList(data);
  }

  // ── STAFF LOGIN ─────────────────────────────────────────────────────────────
  async function login() {
    setPinError("");
    if (!pin || pin.length < 4) { setPinError("Enter your PIN"); return; }

    // Check against Supabase staff table
    let query = supabase.from("staff").select("*").eq("pin", pin);
    if (BIZ_ID) query = query.eq("business_id", BIZ_ID);
    const { data } = await query.maybeSingle();

    if (data) {
      setStaffName(data.name);
      localStorage.setItem("tillflow_staff", data.name);
      setPin("");
    } else {
      setPinError("Wrong PIN. Try again.");
      setPin("");
    }
  }

  function logout() {
    setStaffName(null);
    localStorage.removeItem("tillflow_staff");
    setCart([]);
  }

  // ── BARCODE SCAN ────────────────────────────────────────────────────────────
  async function handleScan(code: string) {
    const clean = code.trim();
    if (!clean) return;

    let query = supabase.from("products").select("*").eq("barcode", clean);
    if (BIZ_ID) query = query.eq("business_id", BIZ_ID);
    const { data } = await query.maybeSingle();

    if (data) {
      addToCart(data);
      setBarcode("");
      setTimeout(() => barcodeRef.current?.focus(), 50);
    } else {
      alert("Product not found for barcode: " + clean);
      setBarcode("");
      setTimeout(() => barcodeRef.current?.focus(), 50);
    }
  }

  // ── CART ────────────────────────────────────────────────────────────────────
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

  // ── PROCESS SALE ────────────────────────────────────────────────────────────
  async function processSale() {
    if (cart.length === 0) { alert("Cart is empty"); return; }
    if (!staffName) return;

    // Check stock for all items
    for (const item of cart) {
      if (item.quantity > item.product.stock) {
        alert(`Not enough stock for ${item.product.name}. Only ${item.product.stock} left.`);
        return;
      }
    }

    const saleIds: number[] = [];
    const receiptItems: { name: string; quantity: number; total: number }[] = [];

    for (const item of cart) {
      // Insert sale
      const { data: sale, error } = await supabase.from("sales").insert({
        ...(BIZ_ID ? { business_id: BIZ_ID } : {}),
        payment_method: payment,
        total:          item.product.price * item.quantity,
        staff_name:     staffName,
        product_id:     item.product.id,
      }).select().single();

      if (error) { alert("Sale failed: " + error.message); return; }
      saleIds.push(sale.id);

      // Update stock
      await supabase.from("products")
        .update({ stock: item.product.stock - item.quantity })
        .eq("id", item.product.id);

      receiptItems.push({
        name:     item.product.name,
        quantity: item.quantity,
        total:    item.product.price * item.quantity,
      });
    }

    // Build receipt
    const receipt: SaleRecord = {
      saleIds,
      items:      receiptItems,
      grandTotal: cartTotal,
      payment,
      staffName,
      time:       new Date().toLocaleTimeString(),
    };

    // Add to undo history (keep last 10)
    setUndoHistory(prev => [receipt, ...prev].slice(0, 10));
    setLastReceipt(receipt);
    setShowReceipt(true);
    setCart([]);
    loadProducts();
  }

  // ── UNDO SALE ───────────────────────────────────────────────────────────────
  async function undoSale(record: SaleRecord) {
    const confirm = window.confirm(`Undo sale of R${record.grandTotal} from ${record.time}?`);
    if (!confirm) return;

    // Delete all sale records
    for (const id of record.saleIds) {
      await supabase.from("sales").delete().eq("id", id);
    }

    // Restore stock for each item
    for (const item of record.items) {
      const prod = products.find(p => p.name === item.name);
      if (prod) {
        await supabase.from("products")
          .update({ stock: prod.stock + item.quantity })
          .eq("id", prod.id);
      }
    }

    // Remove from history
    setUndoHistory(prev => prev.filter(r => r.saleIds[0] !== record.saleIds[0]));
    setShowUndo(false);
    loadProducts();
    alert("Sale undone successfully");
  }

  // ── FILTERS ─────────────────────────────────────────────────────────────────
  const filtered = products.filter(p => {
    const matchSearch   = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === "all" || p.category === category;
    return matchSearch && matchCategory;
  });

  // ── STYLES (inline for portability) ─────────────────────────────────────────
  const S = {
    container: { padding: 20, paddingBottom: 160, background: "radial-gradient(circle at top, #111 0%, #000 60%)", color: "white", minHeight: "100vh", fontFamily: "Arial, sans-serif" } as React.CSSProperties,
    title:     { color: "#d4af37", marginBottom: 10, fontSize: 22, fontWeight: 700 } as React.CSSProperties,
    input:     { padding: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "white", borderRadius: 8, outline: "none", fontSize: 14 } as React.CSSProperties,
    btn:       { padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(212,175,55,0.3)", background: "#111", color: "#d4af37", cursor: "pointer", fontSize: 13, transition: "all .2s" } as React.CSSProperties,
    goldBtn:   { padding: "12px 24px", background: "#d4af37", color: "#000", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 15 } as React.CSSProperties,
    card:      { border: "1px solid rgba(255,255,255,0.08)", padding: 12, borderRadius: 12, cursor: "pointer", transition: "0.25s", background: "rgba(255,255,255,0.03)" } as React.CSSProperties,
    selectedCard: { border: "2px solid #d4af37", background: "rgba(212,175,55,0.08)", boxShadow: "0 0 10px rgba(212,175,55,0.2)" } as React.CSSProperties,
    overlay:   { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
    modal:     { background: "#111", border: "1px solid #d4af37", borderRadius: 16, padding: 28, maxWidth: 420, width: "90%", maxHeight: "80vh", overflowY: "auto" as const },
  };

  // ── LOGIN SCREEN ─────────────────────────────────────────────────────────────
  if (!staffName) return (
    <div style={S.container}>
      <h1 style={S.title}>Staff Login</h1>
      <div style={{ maxWidth: 300 }}>
        <input
          style={{ ...S.input, width: "100%", marginBottom: 12, boxSizing: "border-box" as const, fontSize: 20, letterSpacing: 6, textAlign: "center" }}
          placeholder="Enter PIN"
          type="password"
          value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()}
        />
        {pinError && <p style={{ color: "#ff4d4d", fontSize: 13, marginBottom: 10 }}>{pinError}</p>}
        <button style={{ ...S.goldBtn, width: "100%" }} onClick={login}>Login</button>

        {/* PIN PAD */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 20 }}>
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
            <button key={i} onClick={() => {
              if (k === "⌫") setPin(p => p.slice(0, -1));
              else if (k) setPin(p => p + k);
            }} style={{ padding: "16px 0", background: k ? "#1A1A1A" : "transparent", border: "1px solid #333", color: "#fff", borderRadius: 8, fontSize: 18, cursor: k ? "pointer" : "default" }}>
              {k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── MAIN POS ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.container}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={S.title}>POS System</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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

      {/* BOTTOM BAR — CART */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(15px)", borderTop: "1px solid rgba(255,255,255,0.08)", padding: 12, zIndex: 50 }}>

        {/* CART ITEMS */}
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

        {/* TOTAL + PAYMENT */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ color: "#d4af37", fontSize: 16, fontWeight: 700 }}>
            {cart.length === 0 ? "Tap a product to add to cart" : `Total: R${cartTotal.toFixed(2)}`}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {cart.length > 0 && (
              <button onClick={clearCart} style={{ ...S.btn, color: "#ff4d4d", borderColor: "rgba(255,0,0,0.3)" }}>Clear</button>
            )}
            <button
              onClick={() => { setPayment("cash"); processSale(); }}
              style={{ ...S.goldBtn, background: payment === "cash" ? "#d4af37" : "#333", color: payment === "cash" ? "#000" : "#d4af37" }}
            >
              Cash
            </button>
            <button
              onClick={() => { setPayment("card"); processSale(); }}
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
            <div style={{ textAlign: "center", marginTop: 4, color: "#888", fontSize: 13, marginBottom: 16 }}>
              Paid by {lastReceipt.payment.toUpperCase()}
            </div>
            <button style={{ ...S.goldBtn, width: "100%" }} onClick={() => setShowReceipt(false)}>
              Done
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
