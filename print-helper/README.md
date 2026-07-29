# Tavern Print Helper

A tiny background service that runs on the tavern's PC and does the two
things a browser cannot do on its own: send raw commands to the USB
receipt printer, and kick the cash drawer that's wired into it.

The POS web app (running in Chrome/Edge on the same PC) talks to this
service over `http://localhost:7777` — it never talks to the printer
directly.

## One-time setup

### 1. Install the printer with the "Generic / Text Only" driver

This matters — a "smart" manufacturer driver will try to interpret the
raw ESC/POS bytes as text and print garbage. The generic text-only
driver passes bytes straight through, which is what a receipt printer
actually wants.

1. Plug in the receipt printer via USB, with the cash drawer's cable
   connected to the port on the back of the printer.
2. Windows Settings → **Bluetooth & devices → Printers & scanners → Add device**.
3. If Windows doesn't find it automatically, choose **"Select a shared
   printer by name"** or **"The printer that I want isn't listed"** →
   **"Add a local printer or network printer with manual settings"**.
4. Pick the port it installed on (usually a `USB00x` port).
5. Under manufacturer, choose **Generic**, and under printer choose
   **Generic / Text Only**.
6. Finish setup, and give it a clear name when prompted, e.g.
   `TavernReceiptPrinter`. **Write this name down exactly** — you'll need
   it in step 3 below.

### 2. Install Node.js (if not already installed)

Download and install the LTS version from nodejs.org. (If you'd rather
not install Node.js at all, see "Packaging as a standalone .exe" below —
someone can build that once and you just copy the .exe over instead.)

### 3. Configure

Open `config.json` in this folder in Notepad and set `printerName` to
**exactly** the name you gave the printer in step 1:

```json
{
  "port": 7777,
  "printerName": "TavernReceiptPrinter",
  "paperWidth": 42,
  "allowedOrigins": ["*"]
}
```

`paperWidth` is the number of text characters that fit on one line —
`42` for 80mm paper, `32` for 58mm paper. Check your printer/paper roll
if unsure.

### 4. Install dependencies and run it

Open a terminal (Command Prompt or PowerShell) in this folder and run:

```
npm install
npm start
```

You should see:

```
Tavern print helper listening on http://localhost:7777
Target printer: "TavernReceiptPrinter"
```

Leave this window open while the POS is in use — closing it stops
printing and drawer-opening from working (the rest of the POS keeps
working fine either way, printing just becomes unavailable).

### 5. Test it

With the service running, open a second terminal and run:

```
curl http://localhost:7777/health
```

You should get back `{"ok":true,...}`. Then test the actual hardware:

```
curl -X POST http://localhost:7777/open-drawer
```

The drawer should pop open. If it doesn't, double-check `printerName`
matches Windows exactly (case and spacing included), and that the
printer shows as "Ready" in Windows' printer queue.

## Keeping it running automatically

Right now you have to run `npm start` manually each time. To have it
start automatically when the PC boots:

1. Press `Win + R`, type `shell:startup`, press Enter — this opens your
   Startup folder.
2. Create a shortcut in that folder pointing to a small `.bat` file
   containing:
   ```
   cd /d "C:\path\to\tavern-pos\print-helper"
   npm start
   ```
3. Next time the PC restarts, the helper starts automatically (a
   terminal window will appear and should be left open/minimized).

## Packaging as a standalone .exe (optional)

If you'd rather not install Node.js on the tavern PC at all, this
project can be bundled into a single `.exe` on any machine that *does*
have Node.js (e.g. your own laptop), then just copied over:

```
npm install
npm run build:exe
```

This produces `dist/tavern-print-helper.exe`. Copy that file plus
`config.json` and `winprint.ps1` to the tavern PC (same folder), edit
`config.json` there, and double-click the `.exe` to run it — no Node.js
install needed on the tavern PC itself.

## API (for reference)

- `GET /health` — confirms the service is up and shows current config.
- `POST /open-drawer` — kicks the cash drawer immediately.
- `POST /print-receipt` — formats and prints a receipt, and also kicks
  the drawer if `payment` is `"cash"`. Body shape:
  ```json
  {
    "staffName": "Thabo",
    "time": "14:32:10",
    "items": [{ "name": "Amstel 660ML", "quantity": 2, "total": 46 }],
    "grandTotal": 46,
    "payment": "cash",
    "amountGiven": 50,
    "change": 4
  }
  ```

## Troubleshooting

- **Nothing prints, no error**: the printer name in `config.json` almost
  certainly doesn't match Windows exactly. Check Settings → Printers.
- **Garbled characters print**: the printer isn't using the "Generic /
  Text Only" driver — reinstall it per step 1.
- **`curl` / the POS says it can't reach the helper**: confirm the
  terminal window running `npm start` is still open, and that
  `http://localhost:7777/health` responds from a browser tab on the same
  PC.
- **Drawer doesn't open but receipts print fine**: confirm the drawer's
  cable is actually plugged into the printer's drawer-kick port (not
  just power), and that the drawer is a passive/RJ11-triggered type (the
  vast majority are).
