const express = require("express");
const cors = require("cors");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { formatReceipt } = require("./receipt");
const { openDrawerBytes } = require("./escpos");
const winprintScript = require("./winprint-script");
const defaultConfig = require("./default-config");

// When bundled into a standalone .exe (pkg), __dirname points inside a
// virtual snapshot filesystem, not a real folder next to the .exe — so
// config.json needs to live next to the actual executable instead
// (process.execPath), or edits to it would silently be ignored. In normal
// `node server.js` dev mode, execPath is just node.exe itself, so we fall
// back to this project folder instead.
const isPackaged = Boolean(process.pkg);
const configDir = isPackaged ? path.dirname(process.execPath) : __dirname;
const configPath = path.join(configDir, "config.json");

let config;
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} else {
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log(`No config.json found — created one with default values at:\n  ${configPath}`);
  console.log("Edit printerName in that file to match your printer's exact Windows name, then run this again.");
  process.exit(0);
}

const app = express();

// winprint-script.js is a plain JS string (not a file read via __dirname)
// for the same reason config.json needs special handling above: PowerShell
// is a separate OS process and can't see pkg's virtual snapshot filesystem,
// so it needs a real file on disk — written out once here at startup.
const scriptPath = path.join(os.tmpdir(), "tavern-winprint.ps1");
fs.writeFileSync(scriptPath, winprintScript);

if (config.allowedOrigins.includes("*")) {
  console.warn(
    "WARNING: allowedOrigins is set to \"*\" in config.json — any website " +
    "open in a browser on this PC can trigger printing and open the cash " +
    "drawer. Set allowedOrigins to your POS's actual URL(s) instead."
  );
}

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
    const buffer = formatReceipt(req.body ?? {}, config.paperWidth || 42, config.businessName || "");
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
