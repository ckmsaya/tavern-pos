"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function Dashboard() {

  const [products, setProducts] = useState<any[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [transactions, setTransactions] = useState(0);

  useEffect(() => {

    loadDashboard();

    const interval = setInterval(() => {
      loadDashboard();
    }, 8000);

    return () => clearInterval(interval);

  }, []);

  async function loadDashboard() {

    const { data: productData } = await supabase
      .from("products")
      .select("*")
      .order("name");

    if (productData) setProducts(productData);

    const { data: sales } = await supabase
      .from("sales")
      .select("*");

    if (!sales) return;

    let totalRevenue = 0;

    sales.forEach(s => totalRevenue += s.total);

    setRevenue(totalRevenue);
    setTransactions(sales.length);

  }

  async function restockProduct(product:any) {

    const amount = prompt("Enter quantity to add");

    if (!amount) return;

    const quantity = Number(amount);

    const newStock = product.stock + quantity;

    await supabase
      .from("products")
      .update({
        stock: newStock,
        opening_stock: newStock,
        last_restock: new Date()
      })
      .eq("id", product.id);

    alert("Stock updated");

    loadDashboard();

  }

  async function downloadRestockReport() {

    const { data: sales } = await supabase
      .from("sales")
      .select("*");

    const { data: products } = await supabase
      .from("products")
      .select("*");

    if (!sales || !products) return;

    let revenue = 0;

    sales.forEach(s => revenue += s.total);

    let report = `
TAVERN SALES REPORT

Revenue: R${revenue}
Transactions: ${sales.length}

Products Sold
`;

    products.forEach(p => {

      const sold = (p.opening_stock ?? 0) - p.stock;

      report += `\n${p.name} — ${sold}`;

    });

    const blob = new Blob([report], { type: "text/plain" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = "tavern_sales_report.txt";

    a.click();

  }

  const lowStock = products.filter(p => p.stock <= 10);

  const topSellers = [...products]
    .map(p => ({
      name: p.name,
      sold: (p.opening_stock ?? 0) - p.stock
    }))
    .sort((a,b)=>b.sold-a.sold)
    .slice(0,5);

  return (

    <div style={{ padding: 30, fontFamily:"Arial" }}>

      <h1>🍻 Tavern Dashboard</h1>

      <div style={{ marginBottom:30 }}>

        <h3>Total Revenue: R{revenue}</h3>
        <h3>Total Transactions: {transactions}</h3>

        <button
          onClick={downloadRestockReport}
          style={{
            padding:"10px 14px",
            background:"black",
            color:"white",
            borderRadius:6,
            cursor:"pointer",
            marginTop:10
          }}
        >
        ⬇ Download Sales Report
        </button>

      </div>

      <div style={{ display:"flex", gap:60, marginBottom:30 }}>

        <div>

          <h3 style={{ color:"red" }}>⚠ Low Stock</h3>

          {lowStock.map(item => (

            <div key={item.id}>
              {item.name} — {item.stock} left
            </div>

          ))}

        </div>

        <div>

          <h3 style={{ color:"#FFD700" }}>🔥 Top Sellers</h3>

          {topSellers.map((item,i)=>(
            <div key={i}>
              {item.name} — {item.sold}
            </div>
          ))}

        </div>

      </div>

      <h2>Inventory</h2>

      <table
        style={{
          width:"100%",
          borderCollapse:"collapse",
          marginTop:10
        }}
      >

        <thead>

          <tr style={{ background:"#222", color:"white" }}>
            <th style={{ padding:10 }}>Product</th>
            <th>Category</th>
            <th>Price</th>
            <th>Opening</th>
            <th>Stock</th>
            <th>Sold</th>
            <th>Restock</th>
          </tr>

        </thead>

        <tbody>

          {products.map(p=>{

            const sold = (p.opening_stock ?? 0) - p.stock;

            return(

              <tr key={p.id} style={{ borderBottom:"1px solid #333" }}>

                <td style={{ padding:8 }}>{p.name}</td>
                <td style={{ textAlign:"center" }}>{p.category}</td>
                <td style={{ textAlign:"center" }}>R{p.price}</td>
                <td style={{ textAlign:"center" }}>{p.opening_stock}</td>
                <td style={{ textAlign:"center" }}>{p.stock}</td>
                <td style={{ textAlign:"center" }}>{sold}</td>

                <td style={{ textAlign:"center" }}>

                  <button
                    onClick={()=>restockProduct(p)}
                    style={{
                      padding:"6px 10px",
                      background:"green",
                      color:"white",
                      border:"none",
                      borderRadius:6,
                      cursor:"pointer"
                    }}
                  >
                    Restock
                  </button>

                </td>

              </tr>

            )

          })}

        </tbody>

      </table>

    </div>

  );

}