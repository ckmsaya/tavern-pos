"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
};

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

export default function POS() {

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {

    const { data } = await supabase
      .from("products")
      .select("*");

    if (data) setProducts(data);
  }

  function addToCart(product: Product) {

    const existing = cart.find(item => item.id === product.id);

    if (existing) {

      const updated = cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );

      setCart(updated);

    } else {

      setCart([
        ...cart,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1
        }
      ]);

    }
  }

  function increaseQuantity(id: string) {

    const updated = cart.map(item =>
      item.id === id
        ? { ...item, quantity: item.quantity + 1 }
        : item
    );

    setCart(updated);
  }

  function decreaseQuantity(id: string) {

    const updated = cart
      .map(item =>
        item.id === id
          ? { ...item, quantity: item.quantity - 1 }
          : item
      )
      .filter(item => item.quantity > 0);

    setCart(updated);
  }

  function clearCart() {
    setCart([]);
  }

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  async function checkout(payment: string) {

    if (cart.length === 0) return;

    const staffName = localStorage.getItem("staffName");

    await supabase
      .from("sales")
      .insert({
        payment_method: payment,
        total: total,
        staff_name: staffName
      });

    for (const item of cart) {

      const { data } = await supabase
        .from("products")
        .select("stock")
        .eq("id", item.id)
        .single();

      if (data) {

        const newStock = data.stock - item.quantity;

        await supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", item.id);

      }

    }

    alert("Sale recorded!");
    setCart([]);
    fetchProducts();
  }

  return (
    <main style={{ padding: "40px", fontFamily: "sans-serif" }}>

      <h1>Tavern POS Terminal</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "40px",
          marginTop: "20px"
        }}
      >

        {/* PRODUCTS */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: "20px"
          }}
        >

          {products.map(product => (

            <div key={product.id}>

              <button
                onClick={() => addToCart(product)}
                style={{
                  padding: "20px",
                  fontSize: "18px",
                  borderRadius: "10px",
                  border: "none",
                  backgroundColor: "#222",
                  color: "white",
                  cursor: "pointer",
                  width: "100%"
                }}
              >
                {product.name}
                <br />
                R{product.price}
              </button>

              {product.stock <= 10 && (
                <p style={{ color: "red", fontSize: "12px" }}>
                  ⚠ Low Stock ({product.stock} left)
                </p>
              )}

            </div>

          ))}

        </div>

        {/* CART */}

        <div
          style={{
            border: "1px solid #ccc",
            padding: "20px",
            borderRadius: "10px"
          }}
        >

          <h2>Cart</h2>

          {cart.length === 0 && <p>No items yet</p>}

          {cart.map(item => (

            <div
              key={item.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "10px",
                alignItems: "center"
              }}
            >

              <span>{item.name}</span>

              <div>

                <button onClick={() => decreaseQuantity(item.id)}>
                  -
                </button>

                <span style={{ margin: "0 10px" }}>
                  {item.quantity}
                </span>

                <button onClick={() => increaseQuantity(item.id)}>
                  +
                </button>

              </div>

              <span>
                R{item.price * item.quantity}
              </span>

            </div>

          ))}

          <hr />

          <h3>Total: R{total}</h3>

          <button
            style={{
              marginTop: "10px",
              padding: "12px",
              width: "100%",
              backgroundColor: "green",
              color: "white",
              fontSize: "16px"
            }}
            onClick={() => checkout("cash")}
          >
            Pay Cash
          </button>

          <button
            style={{
              marginTop: "10px",
              padding: "12px",
              width: "100%",
              backgroundColor: "blue",
              color: "white",
              fontSize: "16px"
            }}
            onClick={() => checkout("card")}
          >
            Pay Card
          </button>

          <button
            style={{
              marginTop: "10px",
              padding: "12px",
              width: "100%"
            }}
            onClick={clearCart}
          >
            Clear Order
          </button>

        </div>

      </div>

    </main>
  );
}