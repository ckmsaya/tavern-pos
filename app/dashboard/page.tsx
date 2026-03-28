"use client";

import {useEffect,useState} from "react";
import {supabase} from "../../lib/supabase";
import styles from "./dashboard.module.css";

import {
Chart as ChartJS,
CategoryScale,
LinearScale,
PointElement,
LineElement,
Tooltip,
Legend
} from "chart.js";

import {Line} from "react-chartjs-2";

ChartJS.register(
CategoryScale,
LinearScale,
PointElement,
LineElement,
Tooltip,
Legend
);

export default function Dashboard(){
const [staffStats,setStaffStats] = useState<any>({});
const [products,setProducts]=useState<any[]>([]);
const [sales,setSales]=useState<any[]>([]);
const [revenue,setRevenue]=useState(0);
const [cash,setCash]=useState(0);
const [card,setCard]=useState(0);
const [profit,setProfit]=useState(0);
const [alerted,setAlerted]=useState<any>({});
const [reportLoading,setReportLoading]=useState(false);
const [newProduct, setNewProduct] = useState({
  
  name: "",
  price: "",
  cost_price: "",
  category: "",
  barcode: ""
});
useEffect(()=>{

  load();
  
  const interval=setInterval(load,5000);
  return()=>clearInterval(interval);
},[]);

async function resetDay(){

  const confirmReset = confirm("Reset all daily data?");

  if(!confirmReset) return;

  // 🔁 Reset all sales
  await supabase.from("sales").delete().neq("id",0);

  // 📦 Reset opening stock = current stock
  const { data: products } = await supabase.from("products").select("*");

if (!products) return; // 👈 STOP if null

for (const p of products) {

    await supabase
      .from("products")
      .update({
        opening_stock: p.stock
      })
      .eq("id", p.id);

  }

  alert("System reset for new day");

  location.reload();
}

async function addProduct(){
const { data: existing } = await supabase
  .from("products")
  .select("*")
  .eq("barcode", newProduct.barcode)
  .maybeSingle();

if(existing){
  alert("Product with this barcode already exists");
  return;
}
  if(!newProduct.name || !newProduct.barcode || !newProduct.price || !newProduct.cost_price){
  alert("Fill all fields");
  return;
}

  const { error } = await supabase
    .from("products")
    .insert({
      name: newProduct.name,
      category: newProduct.category || "other",
      price: Number(newProduct.price),
      cost_price: Number(newProduct.cost_price),
      stock: 0,
      opening_stock: 0,
      barcode: newProduct.barcode
    });

  if(error){
    alert("Error adding product");
    console.log(error);
    return;
  }

  alert("Product added ✅");

  setNewProduct({
  name: "",
  price: "",
  cost_price: "", // ✅ ADD THIS
  category: "",
  barcode: ""
});

  load(); // refresh dashboard
}

async function load(){

try{

const {data:prod}=await supabase
  .from("products")
  .select("*")
  .order("name",{ascending:true});
const {data:salesData}=await supabase
.from("sales")
.select("*")
.gte("created_at", new Date().toISOString().split("T")[0])
.order("created_at",{ascending:false})
.limit(20);

if(!prod||!salesData)return;

setProducts(prod);
setSales(salesData);
// 👥 STAFF PERFORMANCE
const stats:any = {};

salesData.forEach((s:any)=>{

  if(!stats[s.staff_name]){
    stats[s.staff_name] = 0;
  }

  stats[s.staff_name] += s.total;

});

setStaffStats(stats);
// 💰 revenue
let r=0, c=0, ca=0;

salesData.forEach((s:any)=>{
  r+=s.total;
  if(s.payment_method==="cash")c+=s.total;
  if(s.payment_method==="card")ca+=s.total;
});

setRevenue(r);
setCash(c);
setCard(ca);

// 💰 profit
let p=0;

prod.forEach((pr:any)=>{
  const sold=(pr.opening_stock??0)-pr.stock;
  const unit=(pr.price??0)-(pr.cost_price??0);
  p+=sold*unit;
});

setProfit(p);

// 🚨 LOW STOCK ALERT (SAFE VERSION)
const lowStock=prod.filter((p:any)=>p.stock === 5);

lowStock.forEach(async (p:any)=>{

  if(alerted[p.id]) return;

  try{
    await fetch("/api/whatsapp",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        message:`⚠ Tavern Alert

${p.name} is running low
Stock left: ${p.stock}`
      })
    });

    setAlerted((prev:any)=>({
      ...prev,
      [p.id]:true
    }));

  }catch(err){
    console.log("Alert skipped (dev or limit):",err);
  }

});

}catch(err){
  console.log("LOAD ERROR:",err);
}

}

// 🧾 CASH DRAWER
function cashDrawerCheck(){

const actual=prompt("Enter cash counted in drawer");
if(!actual)return;

const diff=Number(actual)-cash;

alert(`
Cash Drawer Report

System Cash: R${cash}
Actual Cash: R${actual}

Difference: R${diff}
`);

}

// 📊 CLOSE DAY
async function closeDay(){setReportLoading(true);try{const today=new Date().toISOString().split("T")[0];const{data:allSales}=await supabase.from("sales").select("*").gte("created_at",today);const allSalesData=allSales??[];let r=0,c=0,ca=0;allSalesData.forEach((s:any)=>{r+=s.total;if(s.payment_method==="cash")c+=s.total;if(s.payment_method==="card")ca+=s.total;});const staffMap:any={};allSalesData.forEach((s:any)=>{if(!staffMap[s.staff_name])staffMap[s.staff_name]=0;staffMap[s.staff_name]+=s.total;});const staffArray=Object.entries(staffMap).map(([name,total])=>({name,total:total as number}));const productsWithSold=products.map((p:any)=>({name:p.name,category:p.category,price:p.price,cost_price:p.cost_price,opening_stock:p.opening_stock??0,stock:p.stock,sold:(p.opening_stock??0)-p.stock}));let totalProfit=0;productsWithSold.forEach((p:any)=>{totalProfit+=p.sold*(p.price-p.cost_price);});const payload={date:today,revenue:r,cash:c,card:ca,profit:totalProfit,staff:staffArray,products:productsWithSold,sales:allSalesData};const res=await fetch("/api/daily-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(!res.ok){const err=await res.json();alert(`Report failed: ${err.error??"Unknown error"}`);return;}const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`tavern_report_${payload.date}.pdf`;a.click();URL.revokeObjectURL(url);}catch(err){console.error("Close day error:",err);alert("Could not generate report.");}finally{setReportLoading(false);}}

async function closeDay_DELETED(){

let report=`TAVERN DAILY REPORT\n\n`;

report+=`Revenue: R${revenue}\n`;
report+=`Cash Sales: R${cash}\n`;
report+=`Card Sales: R${card}\n`;
report+=`Total Profit: R${profit}\n\n`;

report+=`LOW STOCK\n`;

const lowStock=products.filter((p:any)=>p.stock<=5);

lowStock.forEach((p:any)=>{
report+=`${p.name} — ${p.stock} left\n`;
});

report+=`\nSALES PER PRODUCT\n`;

products.forEach((p:any)=>{
const sold=(p.opening_stock??0)-p.stock;
const pr=sold*((p.price??0)-(p.cost_price??0));
report+=`${p.name} — Sold ${sold} — Profit R${pr}\n`;
});

const blob=new Blob([report],{type:"text/plain"});
const url=URL.createObjectURL(blob);

const a=document.createElement("a");
a.href=url;
a.download="tavern_daily_report.txt";
a.click();

}

// 📦 RESTOCK
async function restockProduct(product:any){

const amount=prompt(`Enter stock amount for ${product.name}`);
if(!amount)return;

const qty=Number(amount);

await supabase
.from("products")
.update({
  stock:product.stock+qty,
  opening_stock:product.stock+qty
})
.eq("id",product.id);

load();

}

// 📈 CHART
const chartData={
labels:sales.map((s:any)=>new Date(s.created_at).toLocaleTimeString()),
datasets:[{
label:"Sales",
data:sales.map((s:any)=>s.total),
borderColor:"#d4af37",
backgroundColor:"#d4af37",
tension:0.4
}]
};

const lowStockUI=products.filter((p:any)=>p.stock<=5);



return(


<div className={styles.container}>

<h1 className={styles.title}>Tavern Dashboard</h1>
<div style={{
  marginBottom:20,
  padding:15,
  border:"1px solid #333",
  borderRadius:10
}}>

  <h3 style={{color:"#d4af37"}}>➕ Add New Product</h3>

  <input
    placeholder="Scan or enter barcode"
    value={newProduct.barcode}
    onChange={(e)=>setNewProduct({...newProduct, barcode:e.target.value})}
    style={{marginRight:10, padding:8}}
  />

  <input
    placeholder="Product name"
    value={newProduct.name}
    onChange={(e)=>setNewProduct({...newProduct, name:e.target.value})}
    style={{marginRight:10, padding:8}}
  />

  <select
  value={newProduct.category}
  onChange={(e)=>setNewProduct({...newProduct, category:e.target.value})}
  style={{
    marginRight:10,
    padding:8,
    background:"#111",
    color:"#fff",
    border:"1px solid #333",
    borderRadius:6
  }}
>
  <option value="">Select category</option>
  <option value="beer">Beer</option>
  <option value="cider">Cider</option>
  <option value="spirit">Spirit</option>
  <option value="wine">Wine</option>
</select>
<input
  placeholder="Cost price"
  value={newProduct.cost_price}
  onChange={(e)=>setNewProduct({...newProduct, cost_price:e.target.value})}
  style={{marginRight:10, padding:8}}
/>
  <input
    placeholder="Price"
    value={newProduct.price}
    onChange={(e)=>setNewProduct({...newProduct, price:e.target.value})}
    style={{marginRight:10, padding:8}}
  />

  <button
  onClick={addProduct}
  style={{
    background:"#d4af37",
    color:"#000",
    padding:"10px 18px",
    border:"none",
    borderRadius:8,
    fontWeight:"bold",
    cursor:"pointer",
    transition:"0.2s"
  }}
>
  ➕ Add Product
</button>

</div>
<div className={styles.cards}>
<div className={styles.panel}>

  <h3 className={styles.panelTitle}>🏆 Staff Performance</h3>

  {Object.entries(staffStats)
    .sort((a:any,b:any)=> b[1]-a[1])
    .map(([name,total]:any)=>(
      
      <div key={name} className={styles.staffRow}>
        <span>{name}</span>
        <span>R{total}</span>
      </div>

  ))}

</div>

<div className={styles.card}>
<p className={styles.cardLabel}>Revenue</p>
<h2 className={styles.cardValue}>R{revenue}</h2>
</div>

<div className={styles.card}>
<p className={styles.cardLabel}>Cash</p>
<h2 className={styles.cardValue}>R{cash}</h2>
</div>

<div className={styles.card}>
<p className={styles.cardLabel}>Card</p>
<h2 className={styles.cardValue}>R{card}</h2>
</div>

<div className={styles.card}>
<p className={styles.cardLabel}>Profit</p>
<h2 className={styles.cardValue}>R{profit.toFixed(2)}</h2>
</div>

</div>

<div style={{marginBottom:20}}>
<button className={styles.btn} onClick={cashDrawerCheck}>Cash Drawer</button>
<button className={styles.btn} onClick={closeDay} disabled={reportLoading} style={{opacity:reportLoading?0.6:1,cursor:reportLoading?"wait":"pointer"}}>{reportLoading?"Generating...":"Close Day"}</button>
<button className={styles.btn} onClick={resetDay}>
Reset Day
</button>
</div>

<div className={styles.row}>

<div className={styles.chartPanel}>
<h3 className={styles.panelTitle}>Sales Activity</h3>

<div style={{height:180}}>
<Line data={chartData}/>
</div>

<div className={styles.activity}>
{sales.map((s:any)=>(
<div key={s.id} className={styles.activityItem}>
<span className={styles.staff}>{s.staff_name}</span>
{" sold drink — "}
<span className={styles.amount}>R{s.total}</span>
</div>
))}
</div>

</div>

<div className={styles.sidePanel}>
<h3 className={styles.panelTitle}>⚠ Low Stock</h3>

{lowStockUI.map((p:any)=>(
<div key={p.id} className={styles.lowStock}>
{p.name} — {p.stock} left
</div>
))}
</div>

</div> 

<div className={styles.inventory}>

<h3 className={styles.panelTitle}>Inventory</h3>

<table className={styles.table}>

<thead>
<tr>
<th>Product</th>
<th>Category</th>
<th>Cost</th>
<th>Price</th>
<th>Opening</th>
<th>Stock</th>
<th>Sold</th>
<th>Profit</th>
<th>Restock</th>
</tr>
</thead>

<tbody>

{products.map((p:any)=>{

const sold=(p.opening_stock??0)-p.stock;
const pr=sold*((p.price??0)-(p.cost_price??0));

return(
<tr key={p.id}>
<td>{p.name}</td>
<td>{p.category}</td>
<td>R{p.cost_price}</td>
<td>R{p.price}</td>
<td>{p.opening_stock}</td>
<td>{p.stock}</td>
<td>{sold}</td>
<td>R{pr.toFixed(2)}</td>
<td>
<button className={styles.btn} onClick={()=>restockProduct(p)}>
Restock
</button>
</td>
</tr>
);

})}

</tbody>

</table>

</div>

</div>

);

}