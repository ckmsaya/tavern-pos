// app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Invalid PIN. Try again.");
        setPin("");
      } else {
        router.push(data.role === "owner" ? "/dashboard" : "/pos");
      }
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <Image
            src="/logo.png"
            alt="TillFlow"
            width={112}
            height={112}
            className={styles.brandLogo}
            priority
          />
          <div className={styles.subtitle}>Staff Login</div>
        </div>

        <input
          type="password"
          inputMode="numeric"
          placeholder="Enter PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()}
          className={styles.input}
          autoComplete="off"
          autoFocus
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