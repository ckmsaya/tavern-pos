"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function POS() {

  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {

    const { data } = await supabase
      .from("products")
      .select("*");

    if (data) {
      setProducts(data);
    }

  }

  function addToCart(product: any) {

    const existing = cart.find((item) => item.id === product.id);

    if (existing) {

      const updated = cart.map((item) =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );

      setCart(updated);

    } else {

      setCart([
        ...cart,
        {
          ...product,
          quantity: 1
        }
      ]);

    }

  }

  function increaseQuantity(id: string) {

    const updated = cart.map((item) =>
      item.id === id
        ? { ...item, quantity: item.quantity + 1 }
        : item
    );

    setCart(updated);

  }

  function decreaseQuantity(id: string) {

    const updated = cart
      .map((item) =>
        item.id === id
          ? { ...item, quantity: item.quantity - 1 }
          : item
      )
      .filter((item) => item.quantity > 0);

    setCart(updated);

  }

  function clearOrder() {
    setCart([]);
  }

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  async function checkout(payment: string) {

    if (cart.length === 0) return;

    const staffName = localStorage.getItem("staffName");

    // Create sale
    const { data: saleData, error: saleError } = await supabase
      .from("sales")
      .insert({
        payment_method: payment,
        total: total,
        staff_name: staffName
      })
      .select()
      .single();

    if (saleError) {

      alert("Error saving sale");
      console.error(saleError);
      return;

    }

    const orderId = saleData.id;

    // Save items + update stock
    for (const item of cart) {

      await supabase
        .from("order_items")
        .insert({
          order_id: orderId,
          product_id: item.id,
          quantity: item.quantity
        });

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

  }

  return (
    <div style={{ padding: "20px" }}>

      <h1>POS</h1>

      <h2>Products</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "10px"
        }}
      >

        {products.map((product) => (

          <button
            key={product.id}
            onClick={() => addToCart(product)}
            style={{
              padding: "20px",
              borderRadius: "10px",
              backgroundColor: "#222",
              color: "white"
            }}
          >
            {product.name}
            <br />
            R{product.price}
          </button>

        ))}

      </div>

      <h2 style={{ marginTop: "30px" }}>Cart</h2>

      {cart.map((item) => (

        <div
          key={item.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "10px"
          }}
        >

          <div>
            {item.name} × {item.quantity}
          </div>

          <div>

            <button onClick={() => decreaseQuantity(item.id)}>
              −
            </button>

            <button onClick={() => increaseQuantity(item.id)}>
              +
            </button>

          </div>

        </div>

      ))}

      <h2>Total: R{total}</h2>

      <button
        onClick={() => checkout("cash")}
        style={{
          marginTop: "10px",
          padding: "12px",
          width: "100%"
        }}
      >
        Pay Cash
      </button>

      <button
        onClick={() => checkout("card")}
        style={{
          marginTop: "10px",
          padding: "12px",
          width: "100%"
        }}
      >
        Pay Card
      </button>

      <button
        onClick={clearOrder}
        style={{
          marginTop: "10px",
          padding: "12px",
          width: "100%",
          backgroundColor: "red",
          color: "white"
        }}
      >
        Clear Order
      </button>

    </div>
  );

}