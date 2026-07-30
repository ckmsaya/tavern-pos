// Written out as config.json next to the executable on first run, if one
// doesn't already exist there. See the "printerName" comment in the README —
// that's the one value almost everyone needs to change.
module.exports = {
  port: 7777,
  printerName: "POS-80",
  paperWidth: 42,
  businessName: "Grace Tavern",
  allowedOrigins: ["*"],
};
