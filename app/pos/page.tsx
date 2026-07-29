"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "./pos.module.css";

interface Product {
  id: string;
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
  saleIds: string[];
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
    productId: string;
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
  const [undoTarget, setUndoTarget]   = useState<SaleRecord | null>(null);
  const [ownerPinInput, setOwnerPinInput] = useState("");
  const [undoError, setUndoError]     = useState("");
  const [undoSubmitting, setUndoSubmitting] = useState(false);

  const [showCashCountModal, setShowCashCountModal] = useState(false);
  const [cashCountAmount, setCashCountAmount]       = useState("");
  const [cashCountError, setCashCountError]         = useState("");
  const [cashCountSubmitting, setCashCountSubmitting] = useState(false);
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
      const params = new URLSearchParams();
      if (BIZ_ID) params.set("businessId", BIZ_ID);

      const res = await fetch(`/api/products?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load products");
      const { products: data } = await res.json();

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

  function performLogout() {
    fetch("/api/logout", { method: "POST" }).then(() => {
      window.location.href = "/login";
    });
  }

  function requestLogout() {
    setCashCountAmount("");
    setCashCountError("");
    setShowCashCountModal(true);
  }

  async function submitCashCount() {
    const amount = Number(cashCountAmount);

    if (!cashCountAmount || !Number.isFinite(amount) || amount < 0) {
      setCashCountError("Enter the cash you counted");
      return;
    }

    setCashCountSubmitting(true);
    setCashCountError("");

    try {
      const res = await fetch("/api/cash-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counted_amount: amount }),
      });

      if (!res.ok) {
        const result = await res.json();
        setCashCountError(result.error ?? "Unable to submit cash count");
        return;
      }
    } catch {
      setCashCountError("Unable to submit cash count");
      return;
    } finally {
      setCashCountSubmitting(false);
    }

    setShowCashCountModal(false);
    performLogout();
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
      const params = new URLSearchParams({ barcode: clean });
      if (BIZ_ID) params.set("businessId", BIZ_ID);

      const res = await fetch(`/api/products?${params.toString()}`);
      const { products: data } = await res.json();
      const found = data?.[0];
      if (!found) throw new Error("Product not found");

      addToCart(found);
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

  function updateQty(productId: string, delta: number) {
    setCart(prev => prev
      .map(i => i.product.id === productId
        ? { ...i, quantity: Math.max(0, i.quantity + delta) }
        : i)
      .filter(i => i.quantity > 0)
    );
  }

  function removeFromCart(productId: string) {
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

    const saleIds: string[] = [];
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
      saleIds.push(`pending-${pendingSale.id}`);
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

  function undoSale(record: SaleRecord) {
    if (record.pending) {
      alert("This sale is still waiting to sync. It cannot be undone yet.");
      return;
    }

    setUndoTarget(record);
    setOwnerPinInput("");
    setUndoError("");
  }

  async function confirmUndoWithPin() {
    if (!undoTarget) return;

    if (!ownerPinInput.trim()) {
      setUndoError("Enter the owner PIN");
      return;
    }

    setUndoSubmitting(true);
    setUndoError("");

    try {
      const res = await fetch("/api/sales/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleIds: undoTarget.saleIds, ownerPin: ownerPinInput.trim() }),
      });

      if (!res.ok) {
        const result = await res.json();
        setUndoError(result.error ?? "Unable to undo sale");
        return;
      }
    } catch {
      setUndoError("Unable to undo sale");
      return;
    } finally {
      setUndoSubmitting(false);
    }

    setUndoHistory(prev => prev.filter(r => r.saleIds[0] !== undoTarget.saleIds[0]));
    setShowUndo(false);
    setUndoTarget(null);
    setOwnerPinInput("");
    loadProducts();
    alert("Sale undone successfully");
  }

  const filtered = products.filter(p => {
    const matchSearch   = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === "all" || p.category === category;
    return matchSearch && matchCategory;
  });

  // Show loading while fetching staff name
  if (!staffName) return (
    <div className={styles.loadingPage}>
      <p className={styles.loadingText}>Loading…</p>
    </div>
  );

  return (
    <div className={styles.page}>

      {/* HEADER */}
      <div className={styles.header}>
        <div className={styles.brandTitle}>TAVERN POS</div>
        <div className={styles.headerRight}>
          <span className={styles.statusPill}>
            <span className={styles.statusDot} style={{ background: isOnline ? "var(--green)" : "var(--red)" }} />
            {isOnline ? "Online" : "Offline"}{pendingCount ? ` · ${pendingCount} pending` : ""}
          </span>
          <span className={styles.staffPill}>👤 {staffName}</span>
          <button className="btn" onClick={() => setShowUndo(true)}>
            Undo History ({undoHistory.length})
          </button>
          <button className="btn btn-danger" onClick={requestLogout}>Logout</button>
        </div>
      </div>

      {/* FILTERS */}
      <div className={styles.filters}>
        <input className="input" placeholder="Search product…" value={search} onChange={e => setSearch(e.target.value)} />
        <input
          ref={barcodeRef}
          className="input"
          placeholder="Scan barcode…"
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleScan(barcode)}
        />
        <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
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
      <div className={styles.grid}>
        {filtered.map(product => (
          <div
            key={product.id}
            onClick={() => addToCart(product)}
            className={`${styles.productCard} ${product.stock <= 0 ? styles.productCardDisabled : ""}`}
          >
            <p className={styles.productName}>{product.name}</p>
            <p className={styles.productPrice}>R{product.price}</p>
            <p className={`${styles.productStock} ${product.stock <= 5 ? styles.productStockLow : ""}`}>
              {product.stock <= 0 ? "OUT OF STOCK" : `${product.stock} left`}
            </p>
          </div>
        ))}
      </div>

      {/* CART BAR */}
      <div className={styles.cartBar}>
        {cart.length > 0 && (
          <div className={styles.cartList}>
            {cart.map(item => (
              <div key={item.product.id} className={styles.cartItem}>
                <span className={styles.cartItemName}>{item.product.name}</span>
                <button className={styles.qtyBtn} onClick={() => updateQty(item.product.id, -1)}>−</button>
                <span className={styles.qtyValue}>{item.quantity}</span>
                <button className={styles.qtyBtn} onClick={() => updateQty(item.product.id, 1)}>+</button>
                <span className={styles.cartItemTotal}>R{(item.product.price * item.quantity).toFixed(2)}</span>
                <button className={styles.removeBtn} onClick={() => removeFromCart(item.product.id)}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.cartFooter}>
          <div className={styles.cartTotal}>
            {cart.length === 0 ? "Tap a product to add to cart" : `Total: R${cartTotal.toFixed(2)}`}
          </div>
          <div className={styles.cartActions}>
            {cart.length > 0 && (
              <button className="btn btn-ghost" onClick={clearCart}>Clear</button>
            )}
            <button
              className={payment === "cash" ? "btn btn-primary" : "btn"}
              onClick={() => {
                setPayment("cash");
                setAmountGiven("");
                setShowCashModal(true);
              }}
            >
              Cash
            </button>
            <button
              className={payment === "card" ? "btn btn-primary" : "btn"}
              onClick={() => { setPayment("card"); processSale("card"); }}
            >
              Card
            </button>
          </div>
        </div>
      </div>

      {/* RECEIPT MODAL */}
      {showReceipt && lastReceipt && (
        <div className="modal-overlay" onClick={() => setShowReceipt(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div className={styles.receiptIcon}>✅</div>
              <h2 style={{ color: "var(--gold)", marginBottom: 4, fontSize: 19 }}>Sale Complete</h2>
              <p style={{ color: "var(--text-faint)", fontSize: 13 }}>{lastReceipt.time} — {lastReceipt.staffName}</p>
            </div>
            {lastReceipt.items.map((item, i) => (
              <div key={i} className={styles.receiptRow}>
                <span style={{ color: "var(--text-muted)" }}>{item.name} x{item.quantity}</span>
                <span style={{ color: "var(--gold)" }}>R{item.total.toFixed(2)}</span>
              </div>
            ))}
            <div className={styles.receiptTotalRow}>
              <span>Total</span>
              <span style={{ color: "var(--gold)" }}>R{lastReceipt.grandTotal.toFixed(2)}</span>
            </div>
            <div style={{ textAlign: "center", marginTop: 4, color: "var(--text-faint)", fontSize: 13, marginBottom: 12 }}>
              Paid by {lastReceipt.payment.toUpperCase()}{lastReceipt.pending ? " · queued for sync" : ""}
            </div>
            {lastReceipt.payment === "cash" && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 8 }}>Amount given by customer:</p>
                <input
                  className="input"
                  type="number"
                  placeholder="e.g. 100"
                  value={amountGiven}
                  onChange={e => setAmountGiven(e.target.value)}
                  style={{ marginBottom: 10, fontSize: 16 }}
                  autoFocus
                />
                {amountGiven && Number(amountGiven) >= lastReceipt.grandTotal && (
                  <div className={`${styles.changeBox} ${styles.changeBoxPositive}`}>
                    <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 4 }}>CHANGE DUE</p>
                    <p style={{ color: "var(--green)", fontSize: 32, fontWeight: 900 }}>
                      R{(Number(amountGiven) - lastReceipt.grandTotal).toFixed(2)}
                    </p>
                  </div>
                )}
                {amountGiven && Number(amountGiven) < lastReceipt.grandTotal && (
                  <div className={`${styles.changeBox} ${styles.changeBoxNegative}`}>
                    <p style={{ color: "#ff8589", fontSize: 14, fontWeight: 700 }}>
                      Short by R{(lastReceipt.grandTotal - Number(amountGiven)).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            )}
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setShowReceipt(false)}>Done</button>
          </div>
        </div>
      )}

{/* CASH MODAL */}
{showCashModal && (
  <div className="modal-overlay" onClick={() => setShowCashModal(false)}>
    <div className="modal-box" onClick={e => e.stopPropagation()}>

      <h2 style={{ color: "var(--gold)", marginBottom: 10, fontSize: 19 }}>💰 Enter Amount</h2>

      <p style={{ color: "var(--text-muted)", marginBottom: 10 }}>
        Total: <b>R{cartTotal.toFixed(2)}</b>
      </p>

      <input
        className="input"
        type="number"
        placeholder="e.g. 100"
        value={amountGiven}
        onChange={e => setAmountGiven(e.target.value)}
        style={{ fontSize: 18, marginBottom: 12 }}
        autoFocus
      />

      {amountGiven && Number(amountGiven) >= cartTotal && (
        <div className={`${styles.changeBox} ${styles.changeBoxPositive}`}>
          <p style={{ color: "var(--text-faint)", fontSize: 12 }}>CHANGE</p>
          <p style={{ color: "var(--green)", fontSize: 30, fontWeight: 900 }}>
            R{(Number(amountGiven) - cartTotal).toFixed(2)}
          </p>
        </div>
      )}

      {amountGiven && Number(amountGiven) < cartTotal && (
        <div className={`${styles.changeBox} ${styles.changeBoxNegative}`}>
          <p style={{ color: "#ff8589", fontWeight: 700 }}>
            Short by R{(cartTotal - Number(amountGiven)).toFixed(2)}
          </p>
        </div>
      )}

      <button className="btn btn-primary" style={{ width: "100%", marginTop: 10 }} onClick={confirmCashSale}>
        Confirm Sale
      </button>

    </div>
  </div>
)}

      {/* UNDO HISTORY MODAL */}
      {showUndo && (
        <div className="modal-overlay" onClick={() => setShowUndo(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 style={{ color: "var(--gold)", marginBottom: 16, fontSize: 19 }}>Undo History</h2>
            {undoHistory.length === 0 ? (
              <p style={{ color: "var(--text-faint)" }}>No recent sales to undo.</p>
            ) : (
              undoHistory.map((record, i) => (
                <div key={i} className={styles.cartItem} style={{ flexDirection: "column", alignItems: "stretch", background: "var(--surface-2)", borderRadius: 10, padding: 14, marginBottom: 10, border: "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "var(--text-faint)", fontSize: 13 }}>{record.time} — {record.staffName}</span>
                    <span style={{ color: "var(--gold)", fontWeight: 700 }}>R{record.grandTotal.toFixed(2)}</span>
                  </div>
                  {record.items.map((item, j) => (
                    <p key={j} style={{ color: "var(--text-faint)", fontSize: 12, margin: "2px 0" }}>
                      {item.name} x{item.quantity}
                    </p>
                  ))}
                  <button className="btn btn-danger" style={{ marginTop: 10, width: "100%" }} onClick={() => undoSale(record)}>
                    Undo This Sale
                  </button>
                </div>
              ))
            )}
            <button className="btn btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => setShowUndo(false)}>Close</button>
          </div>
        </div>
      )}

      {/* OWNER PIN — AUTHORIZE UNDO MODAL */}
      {undoTarget && (
        <div className="modal-overlay" onClick={() => { setUndoTarget(null); setUndoError(""); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 style={{ color: "#ff8589", marginBottom: 8, fontSize: 19 }}>Authorize Undo</h2>
            <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
              Undo sale of R{undoTarget.grandTotal.toFixed(2)} from {undoTarget.time}? An owner must enter their PIN to approve this.
            </p>
            <input
              className="input"
              type="password"
              placeholder="Owner PIN"
              value={ownerPinInput}
              onChange={e => setOwnerPinInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && confirmUndoWithPin()}
              style={{ fontSize: 18, marginBottom: 12 }}
              autoFocus
            />
            {undoError && <p style={{ color: "#ff8589", fontSize: 13, marginBottom: 12 }}>{undoError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-danger-solid" style={{ flex: 1 }} disabled={undoSubmitting} onClick={confirmUndoWithPin}>
                {undoSubmitting ? "Checking…" : "Authorize Undo"}
              </button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setUndoTarget(null); setUndoError(""); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CASH COUNT — MANDATORY AT LOGOUT */}
      {showCashCountModal && (
        <div className="modal-overlay">
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 style={{ color: "var(--gold)", marginBottom: 8, fontSize: 19 }}>Count the Drawer</h2>
            <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
              Before logging out, enter the exact physical cash currently in the drawer. Count it yourself — this figure is checked against the system separately by the owner.
            </p>
            <input
              className="input"
              type="number"
              placeholder="Cash counted"
              value={cashCountAmount}
              onChange={e => setCashCountAmount(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submitCashCount()}
              style={{ fontSize: 18, marginBottom: 12 }}
              autoFocus
            />
            {cashCountError && <p style={{ color: "#ff8589", fontSize: 13, marginBottom: 12 }}>{cashCountError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={cashCountSubmitting} onClick={submitCashCount}>
                {cashCountSubmitting ? "Submitting…" : "Submit & Logout"}
              </button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowCashCountModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
