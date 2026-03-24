"use client";

import { useState } from "react";
import styles from "./login.module.css";

export default function Login() {

  const [pin, setPin] = useState("");

  function login() {

  if (pin === "1111") {
    localStorage.setItem("staffName", "Owner");
    localStorage.setItem("role", "owner");
    window.location.href = "/dashboard"; // 👈 owner goes to dashboard

  } else if (pin === "2222") {
    localStorage.setItem("staffName", "Omphile");
    localStorage.setItem("role", "staff");
    window.location.href = "/pos";

  } else if (pin === "3333") {
    localStorage.setItem("staffName", "Staff 1");
    localStorage.setItem("role", "staff");
    window.location.href = "/pos";

  } else {
    alert("Invalid PIN");
  }

  setPin("");
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

          /* 🔥 ENTER KEY LOGIN */
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              login();
            }
          }}

          className={styles.input}
        />

        <button className={styles.button} onClick={login}>
          Login
        </button>

      </div>

    </div>
  );
}