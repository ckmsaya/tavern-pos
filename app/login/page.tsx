// app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function Login() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function login() {
    if (!pin) return;
    setLoading(true);
    setError("");

    console.log("Sending PIN:", pin);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    console.log("Response status:", res.status);

    const data = await res.json();

    console.log("Response data:", data);

    if (!res.ok) {
      setError("Invalid PIN. Try again.");
      setPin("");
    } else {
      router.push(data.role === "owner" ? "/dashboard" : "/pos");
    }

    setLoading(false);
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Tavern Login</h1>

        <input
          type="password"
          placeholder="Enter PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()}
          className={styles.input}
          autoComplete="off"
        />

        {error && <p className={styles.error}>{error}</p>}

        <button
          className={styles.button}
          onClick={login}
          disabled={loading}
        >
          {loading ? "Checking..." : "Login"}
        </button>
      </div>
    </div>
  );
}