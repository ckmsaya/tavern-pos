"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  name: string;
  stock: number;
};

type Sale = {
  payment_method: string;
  total: number;
  staff_name: string;
  items: any[];
  created_at: string;
};

export default function Dashboard() {

  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [soldToday, setSoldToday] = useState<Record<string, number>>({});
  const [staffTotals, setStaffTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchProducts();
    fetchSales();
  }, []);

  async function fetchProducts() {

    const { data } = await supabase
      .from("products")
      .select("id,name,stock")
      .order("name");

    if (data) setProducts(data);

  }

  async function fetchSales() {

    const today = new Date();
    today.setHours(0,0,0,0);

    const { data } = await supabase
      .from("sales")
      .select("*")
      .gte("created_at", today.toISOString());

    if (!data) return;

    setSales(data);

    const counts: Record<string, number> = {};
    const staff: Record<string, number> = {};

    data.forEach((sale: any) => {

      if (!staff[sale.staff_name]) {
        staff[sale.staff_name] = 0;
      }

      staff[sale.staff_name] += sale.total;

      if (!sale.items) return;

      sale.items.forEach((item: any) => {

        if (!counts[item.id]) {
          counts[item.id] = 0;
        }

        counts[item.id] += item.quantity;

      });

    });

    setSoldToday(counts);
    setStaffTotals(staff);

  }

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);

  const cashTotal = sales
    .filter(s => s.payment_method === "cash")
    .reduce((sum, s) => sum + s.total, 0);

  const cardTotal = sales
    .filter(s => s.payment_method === "card")
    .reduce((sum, s) => sum + s.total, 0);

  return (
    <main style={{ padding: "40px", fontFamily: "sans-serif" }}>

      <h1>Tavern Dashboard</h1>

      <h2 style={{ marginTop: "20px" }}>
        Today's Revenue: R{totalRevenue}
      </h2>

      <p>Cash Sales: R{cashTotal}</p>
      <p>Card Sales: R{cardTotal}</p>
      <p>Total Transactions: {sales.length}</p>

      <h2 style={{ marginTop: "40px" }}>
        Staff Performance
      </h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: "20px"
        }}
      >

        <thead>
          <tr>
            <th style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
              Staff
            </th>
            <th style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
              Sales Today
            </th>
          </tr>
        </thead>

        <tbody>

          {Object.entries(staffTotals).map(([staff, total]) => (

            <tr key={staff}>
              <td>{staff}</td>
              <td>R{total}</td>
            </tr>

          ))}

        </tbody>

      </table>

      <h2 style={{ marginTop: "40px" }}>
        Inventory
      </h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: "20px"
        }}
      >

        <thead>
          <tr>
            <th style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
              Product
            </th>
            <th style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
              Stock Left
            </th>
            <th style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
              Sold Today
            </th>
          </tr>
        </thead>

        <tbody>

          {products.map(product => (

            <tr key={product.id}>

              <td>{product.name}</td>

              <td>{product.stock}</td>

              <td>{soldToday[product.id] || 0}</td>

            </tr>

          ))}

        </tbody>

      </table>

    </main>
  );
}