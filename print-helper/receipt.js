const {
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
} = require("./escpos");

function padLine(left, right, width) {
  left = String(left);
  right = String(right);
  const space = width - left.length - right.length;
  if (space <= 0) {
    const trimmed = left.slice(0, Math.max(0, width - right.length - 1));
    return `${trimmed} ${right}`;
  }
  return left + " ".repeat(space) + right;
}

function formatReceipt(data, width, businessName = "") {
  const {
    staffName = "",
    date = "",
    time = new Date().toLocaleString(),
    items = [],
    grandTotal = 0,
    payment = "cash",
    amountGiven = null,
    change = null,
  } = data;

  const chunks = [];
  chunks.push(init());
  chunks.push(alignCenter());
  chunks.push(doubleOn());
  chunks.push(line("Tillflow"));
  chunks.push(doubleOff());
  if (businessName) {
    chunks.push(line(businessName));
  }
  chunks.push(line(date ? `${date} ${time}` : String(time)));
  chunks.push(line(`Served by: ${staffName}`));
  chunks.push(alignLeft());
  chunks.push(line("-".repeat(width)));

  items.forEach((item) => {
    chunks.push(line(`${item.name} x${item.quantity}`));
    chunks.push(line(padLine("", `R${Number(item.total).toFixed(2)}`, width)));
  });

  chunks.push(line("-".repeat(width)));
  chunks.push(boldOn());
  chunks.push(line(padLine("TOTAL", `R${Number(grandTotal).toFixed(2)}`, width)));
  chunks.push(boldOff());
  chunks.push(line(`Paid by: ${String(payment).toUpperCase()}`));

  if (payment === "cash" && amountGiven !== null) {
    chunks.push(line(padLine("Amount given", `R${Number(amountGiven).toFixed(2)}`, width)));
    chunks.push(line(padLine("Change", `R${Number(change ?? 0).toFixed(2)}`, width)));
  }

  chunks.push(alignCenter());
  chunks.push(line(""));
  chunks.push(line("Thank you!"));
  chunks.push(feed(3));
  chunks.push(cut());

  if (payment === "cash") {
    chunks.push(openDrawerBytes());
  }

  return Buffer.concat(chunks);
}

module.exports = { formatReceipt, padLine };
