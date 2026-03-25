"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";
import styles from "./pos.module.css";

export default function POS() {

  // 🔐 STAFF
  const [staffName, setStaffName] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  // 📦 DATA
  const [products, setProducts] = useState<any[]>([]);

  // 🔍 FILTERS
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  // 🔢 QUANTITY
  const [quantity, setQuantity] = useState(1);
  const [barcode, setBarcode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // 💳 PAYMENT
  const [payment, setPayment] = useState<"cash" | "card">("cash");

  // ↩️ UNDO
  const [lastSale, setLastSale] = useState<any>(null);

  // ✅ SELECTED PRODUCT
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  useEffect(() => {
  loadProducts();

  const saved = localStorage.getItem("staffName");
  if (saved) setStaffName(saved);

  inputRef.current?.focus(); // 👈 ADD THIS
}, []);

  async function loadProducts() {
    const { data } = await supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true });

    if (data) setProducts(data);
  }

  // 🔐 LOGIN
  function login() {
    if (pin === "1905") {
      setStaffName("Omphile");
      localStorage.setItem("staffName", "Omphile");
    } else if (pin === "1056") {
      setStaffName("Karabo");
      localStorage.setItem("staffName", "Karabo");
    } else {
      alert("Wrong PIN");
      return;
    }
    setPin("");
  }

  // 💸 SELL (ONLY AFTER SELECT + PAYMENT)
  async function quickSell(product: any) {

    if (!product) {
      alert("Select a product first");
      return;
    }

    if (product.stock < quantity) {
      alert("Not enough stock");
      return;
    }

    const { data, error } = await supabase
      .from("sales")
      .insert({
        payment_method: payment,
        total: product.price * quantity,
        staff_name: staffName
      })
      .select()
      .single();

    if (error) {
      alert("Sale failed");
      return;
    }

    await supabase
      .from("products")
      .update({ stock: product.stock - quantity })
      .eq("id", product.id);

    setLastSale({
      saleId: data.id,
      productId: product.id,
      quantity: quantity
    });

    setQuantity(1);
    setSelectedProduct(null);
    loadProducts();
  }

  // ↩️ UNDO SALE
  async function undoSale() {

    if (!lastSale) {
      alert("Nothing to undo");
      return;
    }

    await supabase
      .from("sales")
      .delete()
      .eq("id", lastSale.saleId);

    const { data } = await supabase
      .from("products")
      .select("stock")
      .eq("id", lastSale.productId)
      .single();

    if (!data) return;

    await supabase
      .from("products")
      .update({
        stock: data.stock + lastSale.quantity
      })
      .eq("id", lastSale.productId);

    setLastSale(null);
    loadProducts();
  }
async function handleScan(code: string) {

  const cleanCode = code.trim();

  if (!cleanCode) return;

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", cleanCode)
    .maybeSingle();

  if (error) {
    console.error("Scan error:", error);
    alert("Error scanning product");
    return;
  }

  if (data) {
    setSelectedProduct(data);
    setBarcode("");
  } else {
    alert("Product not found");
    setBarcode("");setTimeout(() => {
  inputRef.current?.focus();
}, 50);
  }
}
  // 🔍 FILTER
  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "all" || p.category === category;
    return matchesSearch && matchesCategory;
  });

  // 🔐 LOGIN SCREEN
  if (!staffName) {
    

    
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Staff Login</h1>

        <input
          className={styles.search}
          placeholder="Enter PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />

        <button className={styles.start} onClick={login}>
          Login
        </button>
      </div>
    );
  }

  // 🧾 MAIN POS
  return (
    <div className={styles.container}>

      <h1 className={styles.title}>POS System</h1>
      <p className={styles.staff}>Logged in: {staffName}</p>

      {/* 🔍 TOP BAR */}
      <div className={styles.topBar}>

        <input
          className={styles.search}
          placeholder="Search drink..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
<input
  ref={inputRef}
  placeholder="Scan barcode..."
  value={barcode}
  onChange={(e) => setBarcode(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      handleScan(barcode);
    }
  }}
  className={styles.search}
/>
        <select
          className={styles.select}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All</option>
          <option value="beer">Beer</option>
          <option value="cider">Cider</option>
          <option value="spirit">Spirit</option>
          <option value="wine">Wine</option>
        </select>

        <div className={styles.qtyBox}>
          <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>-</button>
          <span>{quantity}</span>
          <button onClick={() => setQuantity(quantity + 1)}>+</button>
        </div>

      </div>

      {/* 🍺 PRODUCTS */}
      <div className={styles.grid}>
        {filteredProducts.map((product) => (
          <div
            key={product.id}
            className={`${styles.card} ${
              selectedProduct?.id === product.id ? styles.selectedCard : ""
            }`}
            onClick={() => setSelectedProduct(product)}
          >
            <p className={styles.name}>{product.name}</p>
            <p className={styles.price}>R{product.price}</p>

            <p className={`${styles.stock} ${product.stock <= 5 ? styles.low : ""}`}>
              {product.stock} left
            </p>
          </div>
        ))}
      </div>

      {/* 🔻 BOTTOM BAR */}
      <div className={styles.bottomBar}>

        <div className={styles.selected}>
          {selectedProduct ? (
            <>
              <span>{selectedProduct.name}</span>
              <span>Qty: {quantity}</span>
              <span>Total: R{selectedProduct.price * quantity}</span>
            </>
          ) : (
            <span>Select a drink</span>
          )}
        </div>

        <div className={styles.actions}>

          <button
            className={`${styles.payBtn} ${payment === "cash" ? styles.active : ""}`}
            onClick={() => {
              setPayment("cash");
              quickSell(selectedProduct);
            }}
          >
            Cash
          </button>

          <button
            className={`${styles.payBtn} ${payment === "card" ? styles.active : ""}`}
            onClick={() => {
              setPayment("card");
              quickSell(selectedProduct);
            }}
          >
            Card
          </button>

          <button className={styles.undo} onClick={undoSale}>
            Undo
          </button>

        </div>

      </div>

    </div>
  );
}