const express = require("express");
const cors = require("cors");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { formatReceipt } = require("./receipt");
const { openDrawerBytes } = require("./escpos");
const config = require("./config.json");

const app = express();

app.use(
  cors({
    origin: config.allowedOrigins.includes("*") ? true : config.allowedOrigins,
  })
);
app.use(express.json({ limit: "256kb" }));

function sendRawToPrinter(buffer) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `tavern-print-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);

    try {
      fs.writeFileSync(tmpFile, buffer);
    } catch (err) {
      reject(err);
      return;
    }

    const scriptPath = path.join(__dirname, "winprint.ps1");

    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-PrinterName", config.printerName, "-FilePath", tmpFile],
      (error, stdout, stderr) => {
        fs.unlink(tmpFile, () => {});

        if (error) {
          reject(new Error(stderr?.trim() || error.message));
          return;
        }

        resolve(stdout.trim());
      }
    );
  });
}

app.get("/health", (req, res) => {
  res.json({ ok: true, printerName: config.printerName, port: config.port });
});

app.post("/print-receipt", async (req, res) => {
  try {
    const buffer = formatReceipt(req.body ?? {}, config.paperWidth || 42);
    await sendRawToPrinter(buffer);
    res.json({ success: true });
  } catch (err) {
    console.error("Print failed:", err);
    res.status(500).json({ error: "Print failed", details: String(err.message || err) });
  }
});

app.post("/open-drawer", async (req, res) => {
  try {
    await sendRawToPrinter(openDrawerBytes());
    res.json({ success: true });
  } catch (err) {
    console.error("Open drawer failed:", err);
    res.status(500).json({ error: "Open drawer failed", details: String(err.message || err) });
  }
});

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Tavern print helper listening on http://localhost:${config.port}`);
  console.log(`Target printer: "${config.printerName}"`);
  console.log("Keep this window open while the POS is in use. Press Ctrl+C to stop.");
});
