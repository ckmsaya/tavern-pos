// Written out as config.json next to the executable on first run, if one
// doesn't already exist there. See the "printerName" comment in the README —
// that's the one value almost everyone needs to change.
//
// allowedOrigins deliberately does NOT default to "*": this server accepts
// unauthenticated requests to open the cash drawer and print, so a wildcard
// would let ANY website open in the same browser (not just the POS tab)
// trigger those actions. Add the POS's actual URL(s) here instead.
module.exports = {
  port: 7777,
  printerName: "POS-80",
  paperWidth: 42,
  businessName: "Grace Tavern",
  allowedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
};
