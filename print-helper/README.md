# Tavern Print Helper

A tiny background program that runs on the tavern's PC and does the two
things a browser cannot do on its own: send commands to the USB receipt
printer, and kick the cash drawer wired into it.

The POS web app (running in Chrome/Edge on that same PC) talks to this
program over `http://localhost:7777` — it never talks to the printer
directly.

It's already built as a single file, **`dist/tavern-print-helper.exe`** —
no Node.js install needed on the tavern PC, just copy that one file over
and double-click it.

---

## Step 1 — On your PC (nothing to build, already done)

The `.exe` is already built and sitting at:

```
print-helper/dist/tavern-print-helper.exe
```

Copy that one file onto a USB drive. That's the only file you need to
bring to the tavern.

*(If you ever change the receipt formatting in `receipt.js` or
`escpos.js` and need a new build, run `npm install` then
`npm run build:exe` in this folder — it'll produce a fresh
`dist/tavern-print-helper.exe`.)*

## Step 2 — At the tavern PC

### 2.1 Plug everything in

Plug the receipt printer into the PC via USB, with the cash drawer's
cable plugged into the port on the *back of the printer* (not the PC).

### 2.2 Install the printer with the "Generic / Text Only" driver

This part matters — a "smart" manufacturer driver tries to interpret the
raw commands we send as text and prints garbage. The generic text-only
driver passes them straight through, which is what a receipt printer
actually needs.

1. Windows Settings → **Bluetooth & devices → Printers & scanners → Add device**.
2. If Windows doesn't find it automatically: **"The printer that I want isn't listed"** → **"Add a local printer or network printer with manual settings"**.
3. Pick the port it's connected on (usually `USB00x`).
4. Manufacturer: **Generic**. Printer: **Generic / Text Only**.
5. When it asks for a printer name, give it something simple and
   memorable, e.g. `TavernReceiptPrinter`. **Write this down exactly** —
   capital letters and spacing matter for step 2.4.

### 2.3 Copy the .exe over and run it once

Copy `tavern-print-helper.exe` from your USB drive into any folder on
the tavern PC (e.g. `C:\TavernPrinter\`). Double-click it.

The first time it runs, it will create a `config.json` file right next
to itself and then close, printing something like:

```
No config.json found — created one with default values at:
  C:\TavernPrinter\config.json
Edit printerName in that file to match your printer's exact Windows name, then run this again.
```

### 2.4 Edit the config

Open the new `config.json` (in the same folder as the `.exe`) with
Notepad, and set `printerName` to **exactly** the name from step 2.2:

```json
{
  "port": 7777,
  "printerName": "TavernReceiptPrinter",
  "paperWidth": 42,
  "allowedOrigins": ["https://your-pos-deployment.example.com"]
}
```

`paperWidth` is the number of text characters that fit on one receipt
line — `42` for 80mm paper, `32` for 58mm paper (check your paper roll
if unsure).

`allowedOrigins` must list the exact URL(s) the POS is served from.
Don't set this to `["*"]` — this program accepts unauthenticated
requests to print and open the cash drawer, so a wildcard lets *any*
website open in a browser on this PC trigger those actions, not just
the POS.

### 2.5 Run it for real

Double-click `tavern-print-helper.exe` again. This time it should stay
open and show:

```
Tavern print helper listening on http://localhost:7777
Target printer: "TavernReceiptPrinter"
Keep this window open while the POS is in use. Press Ctrl+C to stop.
```

**Leave this window open** while the POS is in use — minimize it, don't
close it. Closing it stops printing/drawer-opening from working (the
rest of the POS keeps working fine either way; printing just becomes
unavailable until you reopen it).

### 2.6 Test it

Open the POS in Chrome or Edge on the tavern PC (the same one you use
day-to-day) and log in. In the header you should see a **"Printer
ready"** badge — if it says **"Printer offline"**, the program in step
2.5 either isn't running or the port doesn't match.

Click **Open Drawer** in the header — the drawer should pop open. Then
ring up a small test sale and confirm a receipt prints and (for a cash
sale) the drawer opens again automatically.

If the drawer doesn't open or nothing prints, see Troubleshooting below.

### 2.7 Make it start automatically on boot (recommended)

Otherwise someone has to remember to double-click it every morning.

**Recommended: Task Scheduler** — runs completely hidden (no window
anyone could accidentally close) and can auto-restart if it ever crashes.

1. Press `Win`, type **Task Scheduler**, open it.
2. Right panel → **Create Task...** (not "Create Basic Task").
3. **General** tab: name it `Tavern Print Helper`. Check **"Run whether
   user is logged on or not"**.
4. **Triggers** tab → New → Begin the task: **"At startup"**.
5. **Actions** tab → New → Start a program → browse to
   `tavern-print-helper.exe` → set "Start in" to the folder it's in.
6. **Conditions** tab: uncheck "Start the task only if the computer is
   on AC power".
7. **Settings** tab: check "If the task fails, restart every **1
   minute**", up to **3 times**.
8. Click OK — Windows will ask for the account password (needed for step
   3). Enter it, then test with right-click the task → **Run**.

**Simpler alternative**: `Win + R` → `shell:startup` → new shortcut to
`tavern-print-helper.exe`. No password needed, but a console window
appears on every boot that could get accidentally closed.

---

## API (for reference, not needed for normal use)

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

- **Nothing prints, no error, POS says "Printer offline"**: the program
  from step 2.5 isn't running, or something else is already using port
  7777. Close and reopen it.
- **"Printer ready" shows, but nothing actually prints/drawer doesn't
  open**: the `printerName` in `config.json` almost certainly doesn't
  match Windows exactly (check Settings → Printers, character for
  character).
- **Garbled characters print instead of a receipt**: the printer isn't
  using the "Generic / Text Only" driver — redo step 2.2.
- **Drawer doesn't open but receipts print fine**: confirm the drawer's
  cable is actually plugged into the printer's drawer-kick port (not
  just its power brick), and that it's a passive/RJ11-triggered drawer
  (the vast majority are).

## Running from source instead (only if you don't want the .exe)

If you'd rather run it with Node.js installed instead of the `.exe`:

```
npm install
npm start
```

This reads `config.json` from this project folder instead of from next
to an executable — otherwise it behaves identically.
