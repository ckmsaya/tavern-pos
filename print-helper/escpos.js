// Minimal ESC/POS command builder — just the handful of commands a receipt
// and a cash-drawer kick actually need. No printer-specific SDK required.

const ESC = 0x1b;
const GS = 0x1d;

const init = () => Buffer.from([ESC, 0x40]); // ESC @
const boldOn = () => Buffer.from([ESC, 0x45, 0x01]);
const boldOff = () => Buffer.from([ESC, 0x45, 0x00]);
const alignLeft = () => Buffer.from([ESC, 0x61, 0x00]);
const alignCenter = () => Buffer.from([ESC, 0x61, 0x01]);
const doubleOn = () => Buffer.from([GS, 0x21, 0x11]); // double width + height
const doubleOff = () => Buffer.from([GS, 0x21, 0x00]);
const cut = () => Buffer.from([GS, 0x56, 0x42, 0x00]); // partial cut, feed first
const feed = (n = 3) => Buffer.from(Array(n).fill(0x0a));
const line = (str) => Buffer.from(`${str}\n`, "latin1");

// ESC p 0 25 250 — kick pin 2, standard drawer-open pulse most RJ11 drawers use.
const openDrawerBytes = () => Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]);

module.exports = {
  init,
  boldOn,
  boldOff,
  alignLeft,
  alignCenter,
  doubleOn,
  doubleOff,
  cut,
  feed,
  line,
  openDrawerBytes,
};
