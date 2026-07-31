"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
  date: string;
  time: string;
  pending?: boolean;
}

const BUSINESS_ID: string | null = null;
const PRODUCT_CACHE_KEY = "tavern-pos-products";
const STAFF_CACHE_KEY = "tavern-pos-staff";
const SALE_QUEUE_KEY = "tavern-pos-pending-sales";
const PRINT_ENABLED_KEY = "tavern-pos-print-enabled";
const PRINT_HELPER_URL = "http://localhost:7777";

interface UndoableSale {
  id: string;
  product_id: string | null;
  quantity: number;
  total: number;
  payment_method: string;
  created_at: string;
}

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

function readPrintEnabled(): boolean {
  if (typeof window === "undefined") return true;

  try {
    return localStorage.getItem(PRINT_ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

function writePrintEnabled(enabled: boolean) {
  try {
    localStorage.setItem(PRINT_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // ignore — worst case the preference doesn't persist across reloads
  }
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
  const [showUndo, setShowUndo]       = useState(false);
  const [myLoginAt, setMyLoginAt]     = useState<string | null>(null);
  const [undoableSales, setUndoableSales] = useState<UndoableSale[]>([]);
  const [selectedUndoIds, setSelectedUndoIds] = useState<Set<string>>(new Set());
  const [undoSubmitting, setUndoSubmitting] = useState(false);
  const [printEnabled, setPrintEnabled] = useState(true);

  const [showCashCountModal, setShowCashCountModal] = useState(false);
  const [cashCountAmount, setCashCountAmount]       = useState("");
  const [cashCountError, setCashCountError]         = useState("");
  const [cashCountSubmitting, setCashCountSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<SaleRecord | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
const [amountGiven, setAmountGiven] = useState("");

  const [barcode, setBarcode]         = useState("");
  const barcodeRef                    = useRef<HTMLInputElement>(null);
  const [printerOnline, setPrinterOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    setPendingCount(readPendingSales().length);
    setPrintEnabled(readPrintEnabled());
    fetchStaffName();
    loadProducts();
    checkPrinterHealth();

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

    const printerCheckInterval = setInterval(checkPrinterHealth, 15000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(printerCheckInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Catches barcode scanner input even when focus isn't on the barcode box —
  // scanners act like a keyboard typing very fast, then Enter. If the
  // cashier is typing in any real input (search, amount, PIN, etc.) this
  // gets out of the way entirely so it never double-handles a real scan or
  // interferes with normal typing.
  useEffect(() => {
    let buffer = "";
    let lastKeyTime = 0;

    function handleGlobalKeydown(e: KeyboardEvent) {
      const active = document.activeElement;
      const isTyping =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement;
      if (isTyping) return;

      const now = Date.now();
      if (now - lastKeyTime > 100) {
        buffer = "";
      }
      lastKeyTime = now;

      if (e.key === "Enter") {
        if (buffer.length >= 4) {
          handleScan(buffer);
        }
        buffer = "";
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
      }
    }

    document.addEventListener("keydown", handleGlobalKeydown);
    return () => document.removeEventListener("keydown", handleGlobalKeydown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  async function checkPrinterHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${PRINT_HELPER_URL}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      setPrinterOnline(res.ok);
    } catch {
      setPrinterOnline(false);
    }
  }

  async function printReceipt(record: SaleRecord, given?: number, change?: number) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${PRINT_HELPER_URL}/print-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          staffName: record.staffName,
          date: record.date,
          time: record.time,
          items: record.items,
          grandTotal: record.grandTotal,
          payment: record.payment,
          amountGiven: given ?? null,
          change: change ?? null,
        }),
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  function togglePrintEnabled() {
    setPrintEnabled(prev => {
      const next = !prev;
      writePrintEnabled(next);
      return next;
    });
  }

  async function openDrawer() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${PRINT_HELPER_URL}/open-drawer`, {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) alert("Unable to open the drawer. Is the print helper running?");
    } catch {
      alert("Unable to reach the print helper. Is it running on this PC?");
    }
  }

  async function fetchStaffName() {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) {
        const cached = localStorage.getItem(STAFF_CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          if (data.name) setStaffName(data.name);
          setMyLoginAt(data.loginAt ?? null);
          return;
        }

        router.replace("/login");
        return;
      }

      const data = await res.json();
      if (data.name) {
        localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(data));
        setStaffName(data.name);
        setMyLoginAt(data.loginAt ?? null);
      }
    } catch {
      const cached = localStorage.getItem(STAFF_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.name) setStaffName(data.name);
        setMyLoginAt(data.loginAt ?? null);
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
      date:       new Date().toLocaleDateString(),
      time:       new Date().toLocaleTimeString(),
      pending,
    };

    setLastReceipt(receipt);
    setShowReceipt(true);
    setCart([]);
    if (!pending) {
      loadProducts();
    }

    if (!pending) {
      const given = selectedPayment === "cash" ? Number(amountGiven) || cartTotal : undefined;
      const change = selectedPayment === "cash" && given !== undefined ? given - cartTotal : undefined;
      if (printEnabled) {
        printReceipt(receipt, given, change);
      } else if (selectedPayment === "cash") {
        // Printing is off to save paper, but the drawer still needs to kick
        // for a cash sale — normally that happens as a side effect of the
        // receipt print job, so open it directly instead.
        openDrawer();
      }
    }
  }

  async function loadUndoableSales() {
    if (!myLoginAt) return;

    try {
      const params = new URLSearchParams({ since: myLoginAt });
      if (BIZ_ID) params.set("businessId", BIZ_ID);

      const res = await fetch(`/api/sales?${params.toString()}`);
      if (!res.ok) return;
      const { sales } = await res.json();
      setUndoableSales(sales ?? []);
    } catch {
      // leave whatever list is already showing
    }
  }

  function openUndoModal() {
    setSelectedUndoIds(new Set());
    setShowUndo(true);
    loadUndoableSales();
  }

  function toggleUndoSelection(id: string) {
    setSelectedUndoIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const selectedUndoTotal = undoableSales
    .filter(sale => selectedUndoIds.has(sale.id))
    .reduce((sum, sale) => sum + Number(sale.total), 0);

  async function confirmUndoSelected() {
    if (selectedUndoIds.size === 0) return;

    if (!confirm(`Undo ${selectedUndoIds.size} selected item(s) totaling R${selectedUndoTotal.toFixed(2)}? This is logged and cannot be undone.`)) {
      return;
    }

    setUndoSubmitting(true);

    try {
      const res = await fetch("/api/sales/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleIds: Array.from(selectedUndoIds) }),
      });

      if (!res.ok) {
        const result = await res.json();
        alert(result.error ?? "Unable to undo sale");
        return;
      }
    } catch {
      alert("Unable to undo sale");
      return;
    } finally {
      setUndoSubmitting(false);
    }

    setUndoableSales(prev => prev.filter(sale => !selectedUndoIds.has(sale.id)));
    setSelectedUndoIds(new Set());
    loadProducts();
    alert("Sale(s) undone successfully");
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
        <div className={styles.brandGroup}>
          <Image src="/logo-mark.png" alt="TillFlow" width={36} height={36} className={styles.brandLogo} />
          <div className={styles.brandTitle}>TAVERN POS</div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.statusPill}>
            <span className={styles.statusDot} style={{ background: isOnline ? "var(--green)" : "var(--red)" }} />
            {isOnline ? "Online" : "Offline"}{pendingCount ? ` · ${pendingCount} pending` : ""}
          </span>
          <span className={styles.statusPill} title={printerOnline ? "Print helper connected" : "Print helper not reachable — receipts won't print and the drawer won't open"}>
            <span className={styles.statusDot} style={{ background: printerOnline ? "var(--green)" : "var(--red)" }} />
            {printerOnline ? "Printer ready" : "Printer offline"}
          </span>
          <span className={styles.staffPill}>👤 {staffName}</span>
          <button className="btn" onClick={togglePrintEnabled} title="Toggle automatic receipt printing to save paper — the drawer still opens on cash sales either way">
            🖨️ Receipts: {printEnabled ? "ON" : "OFF"}
          </button>
          <button className="btn" onClick={openDrawer}>Open Drawer</button>
          <button className="btn" onClick={openUndoModal}>Undo History</button>
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
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={() => {
                  const given = lastReceipt.payment === "cash" && amountGiven ? Number(amountGiven) : undefined;
                  const change = given !== undefined ? given - lastReceipt.grandTotal : undefined;
                  printReceipt(lastReceipt, given, change);
                }}
              >
                Reprint
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowReceipt(false)}>Done</button>
            </div>
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
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h2 style={{ color: "var(--gold)", marginBottom: 6, fontSize: 19 }}>Undo History</h2>
            <p style={{ color: "var(--text-faint)", fontSize: 12.5, marginBottom: 14 }}>
              Your sold items since you logged in. Select any to undo — every undo is recorded in the owner&apos;s undo log.
            </p>
            {!myLoginAt ? (
              <p style={{ color: "var(--text-faint)" }}>Unable to determine your shift start. Try logging out and back in.</p>
            ) : undoableSales.length === 0 ? (
              <p style={{ color: "var(--text-faint)" }}>No sold items to undo.</p>
            ) : (
              <div style={{ maxHeight: 340, overflowY: "auto", marginBottom: 14 }}>
                {undoableSales.map(sale => {
                  const name = products.find(p => p.id === sale.product_id)?.name ?? "Unknown item";
                  const checked = selectedUndoIds.has(sale.id);
                  return (
                    <label
                      key={sale.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: "var(--surface-2)",
                        borderRadius: 10,
                        padding: "10px 12px",
                        marginBottom: 8,
                        cursor: "pointer",
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleUndoSelection(sale.id)} />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "var(--text-primary)", fontSize: 13.5 }}>{name} x{sale.quantity}</div>
                        <div style={{ color: "var(--text-faint)", fontSize: 11.5 }}>
                          {new Date(sale.created_at).toLocaleTimeString()} · {sale.payment_method.toUpperCase()}
                        </div>
                      </div>
                      <span style={{ color: "var(--gold)", fontWeight: 700 }}>R{Number(sale.total).toFixed(2)}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-danger"
                style={{ flex: 1 }}
                disabled={selectedUndoIds.size === 0 || undoSubmitting}
                onClick={confirmUndoSelected}
              >
                {undoSubmitting
                  ? "Undoing…"
                  : selectedUndoIds.size > 0
                    ? `Undo Selected (${selectedUndoIds.size}) — R${selectedUndoTotal.toFixed(2)}`
                    : "Undo Selected"}
              </button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowUndo(false)}>Close</button>
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
