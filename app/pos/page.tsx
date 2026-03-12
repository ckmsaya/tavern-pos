"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function POS() {

  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [weekendMode, setWeekendMode] = useState(false);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [lastSale, setLastSale] = useState<any>(null);

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

  const filteredProducts = products.filter(p => {

    const categoryMatch =
      category === "all" || p.category === category;

    const searchMatch =
      p.name.toLowerCase().includes(search.toLowerCase());

    return categoryMatch && searchMatch;

  });

  function addToCart(product:any) {

    const existing = cart.find(p => p.id === product.id);

    if (existing) {

      setCart(cart.map(p =>
        p.id === product.id
          ? { ...p, quantity: p.quantity + 1 }
          : p
      ));

    } else {

      setCart([...cart, { ...product, quantity: 1 }]);

    }

  }

  function removeFromCart(id:any) {

    setCart(cart.filter(item => item.id !== id));

  }

  async function quickSell(product:any) {

    const staffName = localStorage.getItem("staffName");

    const { data, error } = await supabase
      .from("sales")
      .insert({
        payment_method: "cash",
        total: product.price,
        staff_name: staffName
      })
      .select()
      .single();

    if (error) return;

    const newStock = product.stock - 1;

    await supabase
      .from("products")
      .update({ stock: newStock })
      .eq("id", product.id);

    setLastSale({
      saleId: data.id,
      productId: product.id
    });

    loadProducts();

  }

  async function undoSale() {

    if (!lastSale) return;

    await supabase
      .from("sales")
      .delete()
      .eq("id", lastSale.saleId);

    const { data } = await supabase
      .from("products")
      .select("stock")
      .eq("id", lastSale.productId)
      .single();

    const newStock = data.stock + 1;

    await supabase
      .from("products")
      .update({ stock: newStock })
      .eq("id", lastSale.productId);

    setLastSale(null);

    loadProducts();

  }

  async function checkout(payment:string) {

    if (cart.length === 0) return;

    const staffName = localStorage.getItem("staffName");

    let total = 0;

    cart.forEach(item => {
      total += item.price * item.quantity;
    });

    await supabase
      .from("sales")
      .insert({
        payment_method: payment,
        total: total,
        staff_name: staffName
      });

    for (const item of cart) {

      const newStock = item.stock - item.quantity;

      await supabase
        .from("products")
        .update({ stock: newStock })
        .eq("id", item.id);

    }

    setCart([]);

    loadProducts();

  }

  function restock(product:any) {

    const amount = prompt("Add stock amount");

    if (!amount) return;

    const newStock = product.stock + Number(amount);

    supabase
      .from("products")
      .update({ stock: newStock })
      .eq("id", product.id)
      .then(loadProducts);

  }

  return (

    <div style={{ padding: 30 }}>

      <h1>🍻 Tavern POS</h1>

      <button
        onClick={() => setWeekendMode(!weekendMode)}
        style={{
          padding: "10px 20px",
          background: weekendMode ? "orange" : "black",
          color: "white",
          borderRadius: 6,
          marginBottom: 20
        }}
      >
        Weekend Mode: {weekendMode ? "ON" : "OFF"}
      </button>

      {/* SEARCH */}

      <input
        type="text"
        placeholder="Search drink..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          padding: 10,
          marginBottom: 20,
          width: 250
        }}
      />

      {/* CATEGORY */}

      <div style={{ marginBottom: 20 }}>

        <button onClick={() => setCategory("all")} style={{marginRight:10}}>All</button>
        <button onClick={() => setCategory("beer")} style={{marginRight:10}}>Beer</button>
        <button onClick={() => setCategory("cider")} style={{marginRight:10}}>Cider</button>
        <button onClick={() => setCategory("spirit")} style={{marginRight:10}}>Spirit</button>
        <button onClick={() => setCategory("wine")}>Wine</button>

      </div>

      {/* PRODUCTS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 10
        }}
      >

        {filteredProducts.map(product => (

          <div
            key={product.id}
            style={{
              padding: 20,
              background: "#222",
              borderRadius: 10,
              textAlign: "center"
            }}
          >

            <div>{product.name}</div>
            <div>R{product.price}</div>
            <div>Stock: {product.stock}</div>

            {weekendMode ? (

              <button
                onClick={() => quickSell(product)}
                style={{
                  marginTop: 10,
                  padding: "10px",
                  background: "green",
                  color: "white",
                  border: "none",
                  borderRadius: 6
                }}
              >
                Quick Sell
              </button>

            ) : (

              <button
                onClick={() => addToCart(product)}
                style={{
                  marginTop: 10,
                  padding: "10px",
                  background: "#444",
                  color: "white",
                  border: "none",
                  borderRadius: 6
                }}
              >
                Add
              </button>

            )}

            <button
              onClick={() => restock(product)}
              style={{
                marginTop: 6,
                padding: "6px",
                background: "blue",
                color: "white",
                border: "none",
                borderRadius: 6
              }}
            >
              Restock
            </button>

          </div>

        ))}

      </div>

      <h2 style={{ marginTop: 40 }}>Cart</h2>

      {cart.map(item => (

        <div key={item.id} style={{marginBottom:5}}>

          {item.name} x{item.quantity}

          <button
            onClick={() => removeFromCart(item.id)}
            style={{
              marginLeft:10,
              background:"red",
              color:"white",
              border:"none",
              borderRadius:4,
              padding:"4px 8px"
            }}
          >
            Remove
          </button>

        </div>

      ))}

      <div style={{ marginTop: 20 }}>

        <button
          onClick={() => checkout("cash")}
          style={{
            padding: "12px",
            background: "green",
            color: "white",
            marginRight: 10
          }}
        >
          Pay Cash
        </button>

        <button
          onClick={() => checkout("card")}
          style={{
            padding: "12px",
            background: "purple",
            color: "white",
            marginRight: 10
          }}
        >
          Pay Card
        </button>

        <button
          onClick={undoSale}
          style={{
            padding: "12px",
            background: "red",
            color: "white"
          }}
        >
          Undo Last Sale
        </button>

      </div>

    </div>

  );

}