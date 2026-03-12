"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function Login() {

  const router = useRouter();

  const [pin, setPin] = useState("");

  async function handleLogin() {

    const { data, error } = await supabase
  .from("users")
  .select("*")
  .eq("pin", pin.trim())
  .single();

    if (error || !data) {
      alert("Invalid PIN");
      return;
    }

    // Save staff name locally
    localStorage.setItem("staffName", data.name);

    // CLOCK IN
    await supabase
      .from("staff_shifts")
      .insert({
        staff_name: data.name,
        clock_in: new Date()
      });

    if (data.role === "owner") {
      router.push("/dashboard");
    } else {
      router.push("/pos");
    }

  }

  return (
    <main style={{ padding: "40px", fontFamily: "sans-serif" }}>

      <h1>Tavern Login</h1>

      <input
        type="password"
        placeholder="Enter PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        style={{
          padding: "10px",
          marginTop: "20px",
          display: "block"
        }}
      />

      <button
        onClick={handleLogin}
        style={{
          marginTop: "10px",
          padding: "10px",
          backgroundColor: "black",
          color: "white"
        }}
      >
        Login
      </button>

    </main>
  );
}