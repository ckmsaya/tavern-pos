"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function Dashboard() {

  const [products, setProducts] = useState<any[]>([]);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [transactions, setTransactions] = useState(0);

  const [weeklyRevenue, setWeeklyRevenue] = useState(0);
  const [weeklyTransactions, setWeeklyTransactions] = useState(0);

  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [monthlyTransactions, setMonthlyTransactions] = useState(0);

  const [topMonthly, setTopMonthly] = useState<any[]>([]);

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

    const today = new Date();
    const todayString = today.toISOString().split("T")[0];

    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);

    const monthAgo = new Date();
    monthAgo.setMonth(today.getMonth() - 1);

    const { data: todaySales } = await supabase
      .from("sales")
      .select("*")
      .gte("created_at", todayString);

    if (todaySales) {

      let revenue = 0;
      todaySales.forEach(s => revenue += s.total);

      setTodayRevenue(revenue);
      setTransactions(todaySales.length);

    }

    const { data: weekSales } = await supabase
      .from("sales")
      .select("*")
      .gte("created_at", weekAgo.toISOString());

    if (weekSales) {

      let revenue = 0;
      weekSales.forEach(s => revenue += s.total);

      setWeeklyRevenue(revenue);
      setWeeklyTransactions(weekSales.length);

    }

    const { data: monthSales } = await supabase
      .from("sales")
      .select("*")
      .gte("created_at", monthAgo.toISOString());

    if (monthSales) {

      let revenue = 0;
      monthSales.forEach(s => revenue += s.total);

      setMonthlyRevenue(revenue);
      setMonthlyTransactions(monthSales.length);

    }

    if (productData) {

      const ranked = productData
        .map(p => ({
          name: p.name,
          sold: (p.opening_stock ?? 0) - p.stock
        }))
        .sort((a, b) => b.sold - a.sold)
        .slice(0, 5);

      setTopMonthly(ranked);

    }

  }

  function downloadReport() {

    const report = `
TAVERN MONTHLY REPORT

Revenue: R${monthlyRevenue}
Transactions: ${monthlyTransactions}

Top Sellers
${topMonthly.map(p => `${p.name} - ${p.sold}`).join("\n")}
`;

    const blob = new Blob([report], { type: "text/plain" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = "tavern_monthly_report.txt";

    a.click();

  }

  const lowStock = products.filter(p => p.stock <= 10);

  return (

    <div style={{ padding: 30, fontFamily: "Arial" }}>

      <h1 style={{ marginBottom: 20 }}>🍻 Tavern Dashboard</h1>

      {/* REPORTS */}

      <div style={{ display: "flex", gap: 40, marginBottom: 30 }}>

        <div style={{ background: "#111", padding: 20, borderRadius: 10, width: 250 }}>
          <h3>Weekly Report</h3>
          <p>Revenue: <b>R{weeklyRevenue}</b></p>
          <p>Transactions: <b>{weeklyTransactions}</b></p>
        </div>

        <div style={{ background: "#111", padding: 20, borderRadius: 10, width: 250 }}>
          <h3>Monthly Report</h3>
          <p>Revenue: <b>R{monthlyRevenue}</b></p>
          <p>Transactions: <b>{monthlyTransactions}</b></p>

          <button
            onClick={downloadReport}
            style={{
              marginTop: 10,
              padding: "8px 14px",
              background: "#2c2c2c",
              color: "white",
              borderRadius: 6,
              border: "none",
              cursor: "pointer"
            }}
          >
            ⬇ Download Report
          </button>

        </div>

      </div>

      {/* ALERTS */}

      <div style={{ display: "flex", gap: 60, marginBottom: 30 }}>

        <div>

          <h3 style={{ color: "red" }}>⚠ Low Stock</h3>

          {lowStock.map(item => (

            <div key={item.id} style={{ marginBottom: 4 }}>
              {item.name} — {item.stock} left
            </div>

          ))}

        </div>

        <div>

          <h3 style={{ color: "#FFD700" }}>🔥 Top Sellers</h3>

          {topMonthly.map((item, i) => (

            <div key={i}>
              {item.name} — {item.sold}
            </div>

          ))}

        </div>

      </div>

      {/* INVENTORY TABLE */}

      <h2>Inventory</h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 10
        }}
      >

        <thead>

          <tr style={{ background: "#222", color: "white" }}>
            <th style={{ padding: 10 }}>Product</th>
            <th>Category</th>
            <th>Price</th>
            <th>Opening</th>
            <th>Stock</th>
            <th>Sold Today</th>
          </tr>

        </thead>

        <tbody>

          {products.map(p => {

            const soldToday = (p.opening_stock ?? 0) - p.stock;

            return (

              <tr key={p.id} style={{ borderBottom: "1px solid #333" }}>

                <td style={{ padding: 8 }}>{p.name}</td>
                <td style={{ textAlign: "center" }}>{p.category}</td>
                <td style={{ textAlign: "center" }}>R{p.price}</td>
                <td style={{ textAlign: "center" }}>{p.opening_stock}</td>
                <td style={{ textAlign: "center" }}>{p.stock}</td>
                <td style={{ textAlign: "center" }}>{soldToday}</td>

              </tr>

            );

          })}

        </tbody>

      </table>

    </div>

  );

}