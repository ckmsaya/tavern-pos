"use client";

import { useEffect, useState } from "react";
import { Pie, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function ReportPage(){

  const [data,setData] = useState<any>(null);

  useEffect(()=>{
    const stored = localStorage.getItem("reportData");
    if(stored){
      setData(JSON.parse(stored));
    }
  },[]);

  if(!data) return <div style={{padding:40,color:"#fff"}}>Loading report...</div>;

  const { revenue, cash, card, profit, damage, expired, products } = data;

  // 🥧 PIE
  const pieData = {
    labels: ["Revenue", "Damage", "Expired"],
    datasets: [{
      data: [revenue, damage, expired],
      backgroundColor: ["#00ff88","#ff4d4d","#ffaa00"]
    }]
  };

  // 📊 BAR
  const productSales = products.map((p:any)=>{
    const sold = (p.opening_stock ?? 0) - p.stock;
    return { name: p.name, sold };
  });

 const barData = {
  labels: productSales.map((p:any) => p.name),
  datasets: [
    {
      label: "Units Sold",
      data: productSales.map((p:any) => p.sold),
      backgroundColor: "#d4af37"
    }
  ]
};

  return(
    <div style={{
      background:"linear-gradient(135deg,#0a0a0a,#111)",
      color:"#fff",
      minHeight:"100vh",
      padding:30,
      fontFamily:"sans-serif"
    }}>

      {/* 🔥 TITLE */}
      <h1 style={{
        color:"#d4af37",
        fontSize:32,
        marginBottom:20
      }}>
        🔥 Tavern Premium Report
      </h1>

      {/* 💰 CARDS */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(4,1fr)",
        gap:20
      }}>
        {[
          {label:"Revenue",value:revenue,color:"#00ff88"},
          {label:"Cash",value:cash,color:"#00ffcc"},
          {label:"Card",value:card,color:"#3399ff"},
          {label:"Profit",value:profit,color:"#d4af37"}
        ].map((item,i)=>(
          <div key={i} style={{
            background:"rgba(255,255,255,0.05)",
            backdropFilter:"blur(10px)",
            padding:20,
            borderRadius:12,
            border:"1px solid rgba(255,255,255,0.1)"
          }}>
            <p style={{opacity:0.7}}>{item.label}</p>
            <h2 style={{color:item.color}}>R{Number(item.value).toFixed(2)}</h2>
          </div>
        ))}
      </div>

      {/* 📊 CHARTS ROW */}
      <div style={{
        display:"flex",
        gap:40,
        marginTop:50,
        flexWrap:"wrap"
      }}>

        {/* PIE */}
        <div style={{
          flex:1,
          minWidth:300,
          background:"rgba(255,255,255,0.05)",
          padding:20,
          borderRadius:12
        }}>
          <h3>📊 Loss vs Revenue</h3>
          <Pie data={pieData}/>
        </div>

        {/* BAR */}
        <div style={{
          flex:2,
          minWidth:400,
          background:"rgba(255,255,255,0.05)",
          padding:20,
          borderRadius:12
        }}>
          <h3>📈 Product Sales</h3>
          <Bar data={barData}/>
        </div>

      </div>

      {/* 📋 TABLE */}
      <div style={{
        marginTop:50,
        background:"rgba(255,255,255,0.05)",
        padding:20,
        borderRadius:12
      }}>
        <h3>📦 Product Performance</h3>

        <table style={{
          width:"100%",
          borderCollapse:"collapse",
          marginTop:10
        }}>
          <thead>
            <tr style={{borderBottom:"1px solid #333"}}>
              <th style={{textAlign:"left",padding:10}}>Name</th>
              <th style={{padding:10}}>Sold</th>
              <th style={{padding:10}}>Profit</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p:any)=>{
              const sold = (p.opening_stock ?? 0) - p.stock;
              const pr = sold * ((p.price ?? 0) - (p.cost_price ?? 0));

              return(
                <tr key={p.id} style={{borderBottom:"1px solid #222"}}>
                  <td style={{padding:10}}>{p.name}</td>
                  <td style={{textAlign:"center"}}>{sold}</td>
                  <td style={{textAlign:"center",color:"#00ff88"}}>
                    R{pr.toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ⚠ INSIGHTS */}
      <div style={{
        marginTop:40,
        display:"flex",
        gap:20
      }}>
        <div style={{
          background:"rgba(255,0,0,0.1)",
          padding:20,
          borderRadius:10
        }}>
          🔻 Damage: {damage}
        </div>

        <div style={{
          background:"rgba(255,165,0,0.1)",
          padding:20,
          borderRadius:10
        }}>
          ⚠ Expired: {expired}
        </div>
      </div>

    </div>
  );
}