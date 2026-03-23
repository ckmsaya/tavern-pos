import { NextResponse } from "next/server";
import Twilio from "twilio";

export async function POST(req: Request){

  try{

    const { message } = await req.json();

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

  }catch(err:any){

    console.log("ERROR:",err.message);

    return NextResponse.json(
      { error: err.message },
      { status:500 }
    );

  }

}