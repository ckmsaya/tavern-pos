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
      .select("*")
      .order("name");

    if (data) setProducts(data);
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
      setCart([...cart, { ...product, quantity: 1 }]);
    }

  }

  function increase(id: string) {
    setCart(
      cart.map((item) =>
        item.id === id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  }

  function decrease(id: string) {
    setCart(
      cart
        .map((item) =>
          item.id === id
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
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

    // create sale
    const { data: sale, error } = await supabase
      .from("sales")
      .insert({
        payment_method: payment,
        total: total,
        staff_name: staffName
      })
      .select()
      .single();

    if (error) {
      alert("Error saving sale");
      console.error(error);
      return;
    }

    const orderId = sale.id;

    for (const item of cart) {

      // insert order items
      await supabase.from("order_items").insert({
        order_id: orderId,
        product_id: item.id,
        quantity: item.quantity,
        price: item.price
      });

      // update stock
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

    alert("Sale recorded");

    setCart([]);

    loadProducts();

  }

  return (
    <div style={{ padding: 20 }}>

      <h1>POS</h1>

      <h2>Products</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
          gap: 10
        }}
      >
        {products.map((p) => (

          <button
            key={p.id}
            onClick={() => addToCart(p)}
            style={{
              padding: 20,
              background: "#222",
              color: "white",
              borderRadius: 10
            }}
          >
            {p.name}
            <br />
            R{p.price}

            {p.stock <= 10 && (
              <div style={{ color: "orange", fontSize: 12 }}>
                ⚠ Low stock ({p.stock})
              </div>
            )}

          </button>

        ))}
      </div>

      <h2 style={{ marginTop: 30 }}>Cart</h2>

      {cart.map((item) => (

        <div
          key={item.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10
          }}
        >

          <div>
            {item.name} × {item.quantity}
          </div>

          <div>

            <button onClick={() => decrease(item.id)}>−</button>

            <button onClick={() => increase(item.id)}>+</button>

          </div>

        </div>

      ))}

      <h2>Total: R{total}</h2>

      <button
        onClick={() => checkout("cash")}
        style={{ marginTop: 10, width: "100%", padding: 12 }}
      >
        Pay Cash
      </button>

      <button
        onClick={() => checkout("card")}
        style={{ marginTop: 10, width: "100%", padding: 12 }}
      >
        Pay Card
      </button>

      <button
        onClick={clearOrder}
        style={{
          marginTop: 10,
          width: "100%",
          padding: 12,
          background: "red",
          color: "white"
        }}
      >
        Clear Order
      </button>

    </div>
  );

}