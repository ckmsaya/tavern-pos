import { NextResponse } from "next/server";
import Twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

export async function POST(){

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data:products } = await supabase.from("products").select("*");
  const { data:sales } = await supabase.from("sales").select("*");

  if(!products || !sales){
    return NextResponse.json({ error:"No data" },{ status:400 });
  }

  let revenue = 0;
  let profit = 0;

  sales.forEach((s:any)=>{
    revenue += s.total;
  });

  products.forEach((p:any)=>{
    const sold = (p.opening_stock ?? 0) - p.stock;
    const unit = (p.price ?? 0) - (p.cost_price ?? 0);
    profit += sold * unit;
  });

  const message = `
📊 Tavern Daily Summary

Revenue: R${revenue}
Profit: R${profit}
`;

  const client = Twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  await client.messages.create({
    from: "whatsapp:+14155238886",
    to: "whatsapp:+27646261102",
    body: message
  });

  return NextResponse.json({ success:true });

}