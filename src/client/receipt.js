// Order receipt as a picture (PNG), drawn on a canvas in the customer's browser.
// The customer can save it to the gallery or share it on WhatsApp. Nothing is uploaded.
import { formatDateIST, formatINR, PAYMENT_LABELS } from "../shared/order.js";

const W = 1080;
const PAD = 72;
const LIME = "#c6ff00";
const INK = "#0a0a0a";
const FONT = 'Inter, "Segoe UI", Roboto, Arial, sans-serif';

function wrap(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draws the receipt. Returns the canvas (two passes: measure height, then draw).
export function drawReceipt(order, shop) {
  const c = order.customer || {};
  const lines = order.lines || [];
  const items = lines.map((l) => ({
    name: [
      l.brand && l.name && !l.name.startsWith(l.brand)
        ? l.brand + " " + l.name
        : l.name || l.brand,
    ].join(""),
    detail: [l.size, l.flavour].filter(Boolean).join(" · "),
    qty: l.qty,
    total: formatINR(l.lineTotal ?? l.price * l.qty),
  }));
  const address =
    c.fulfilment === "pickup"
      ? ["Pickup from the shop"]
      : [
          c.address,
          c.landmark ? "Landmark: " + c.landmark : "",
          [c.area, c.pincode].filter(Boolean).join(" – "),
        ].filter(Boolean);
  const payLabel = (PAYMENT_LABELS[order.method] || order.method || "").replace(
    / \(.*\)$/,
    "",
  );

  const render = (ctx, draw) => {
    let y = 0;
    const text = (
      s,
      x,
      yy,
      {
        size = 30,
        weight = 400,
        color = INK,
        align = "left",
        italic = false,
      } = {},
    ) => {
      ctx.font = `${italic ? "italic " : ""}${weight} ${size}px ${FONT}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      if (draw) ctx.fillText(s, x, yy);
    };
    const inner = W - PAD * 2;

    // Header band
    const headH = 300;
    if (draw) {
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, W, headH);
    }
    ctx.font = `italic 900 64px ${FONT}`;
    const oneW = ctx.measureText("one").width;
    text("one", PAD, 120, {
      size: 64,
      weight: 900,
      color: "#ffffff",
      italic: true,
    });
    text("MORE", PAD + oneW, 120, {
      size: 64,
      weight: 900,
      color: LIME,
      italic: true,
    });
    text("ORDER RECEIPT", W - PAD, 108, {
      size: 26,
      weight: 800,
      color: LIME,
      align: "right",
    });
    text(order.id, PAD, 210, { size: 58, weight: 900, color: "#ffffff" });
    text(formatDateIST(order.created), PAD, 258, {
      size: 28,
      color: "#a6a6a1",
    });
    // status chip
    if (draw) {
      const chip = "Order placed";
      ctx.font = `800 26px ${FONT}`;
      const cw = ctx.measureText(chip).width + 48;
      ctx.fillStyle = LIME;
      roundRect(ctx, W - PAD - cw, 180, cw, 52, 26);
      ctx.fill();
      text(chip, W - PAD - cw / 2, 215, {
        size: 26,
        weight: 800,
        color: INK,
        align: "center",
      });
    }
    y = headH + 70;

    // Items
    text("ITEMS", PAD, y, { size: 24, weight: 800, color: "#8a8a85" });
    y += 24;
    for (const it of items) {
      y += 30;
      ctx.font = `700 32px ${FONT}`;
      const nameLines = wrap(ctx, `${it.qty} × ${it.name}`, inner - 220);
      nameLines.forEach((ln, i) => {
        text(ln, PAD, y + 36 + i * 42, { size: 32, weight: 700 });
      });
      text(it.total, W - PAD, y + 36, {
        size: 32,
        weight: 800,
        align: "right",
      });
      y += 36 + (nameLines.length - 1) * 42;
      if (it.detail) {
        text(it.detail, PAD, y + 40, { size: 26, color: "#6b6b66" });
        y += 40;
      }
      y += 28;
      if (draw) {
        ctx.fillStyle = "#ececea";
        ctx.fillRect(PAD, y, inner, 2);
      }
    }

    // Totals
    y += 56;
    text("Subtotal", PAD, y, { size: 28, color: "#6b6b66" });
    text(formatINR(order.subtotal), W - PAD, y, {
      size: 28,
      color: "#6b6b66",
      align: "right",
    });
    y += 46;
    text(c.fulfilment === "pickup" ? "Store pickup" : "Delivery", PAD, y, {
      size: 28,
      color: "#6b6b66",
    });
    text(
      c.fulfilment === "pickup"
        ? "Free"
        : order.deliveryFee
          ? formatINR(order.deliveryFee)
          : "Free",
      W - PAD,
      y,
      { size: 28, color: "#6b6b66", align: "right" },
    );
    y += 34;
    if (draw) {
      ctx.fillStyle = INK;
      roundRect(ctx, PAD - 24, y, inner + 48, 104, 20);
      ctx.fill();
    }
    text("Total", PAD + 8, y + 66, { size: 36, weight: 800, color: "#ffffff" });
    text(formatINR(order.total), W - PAD - 8, y + 68, {
      size: 48,
      weight: 900,
      color: LIME,
      align: "right",
    });
    y += 104 + 64;

    // Payment + delivery boxes
    const boxTop = y;
    const colW = (inner - 32) / 2;
    const boxHeight = (rows) => {
      let h = 68;
      rows.forEach((r, i) => {
        ctx.font = `${i === 0 ? 800 : 400} ${i === 0 ? 30 : 26}px ${FONT}`;
        h += wrap(ctx, r, colW - 64).length * (i === 0 ? 46 : 38);
      });
      return h + 40;
    };
    const box = (x, title, rows) => {
      let yy = boxTop + 56;
      text(title, x + 32, yy, { size: 22, weight: 800, color: "#8a8a85" });
      yy += 12;
      rows.forEach((r, i) => {
        ctx.font = `${i === 0 ? 800 : 400} ${i === 0 ? 30 : 26}px ${FONT}`;
        wrap(ctx, r, colW - 64).forEach((ln) => {
          yy += i === 0 ? 46 : 38;
          text(ln, x + 32, yy, {
            size: i === 0 ? 30 : 26,
            weight: i === 0 ? 800 : 400,
            color: i === 0 ? INK : "#3a3a37",
          });
        });
      });
    };
    const payRows = [
      payLabel,
      order.method === "cod"
        ? "Pay when your order arrives"
        : order.method === "shop"
          ? "Pay at the counter"
          : "Payment pending – we confirm on WhatsApp",
    ];
    const delRows = [c.name || "", "+91 " + (c.phone || ""), ...address];
    const bh = Math.max(boxHeight(payRows), boxHeight(delRows));
    if (draw) {
      ctx.fillStyle = "#f4f4f1";
      roundRect(ctx, PAD, boxTop, colW, bh, 20);
      ctx.fill();
      roundRect(ctx, PAD + colW + 32, boxTop, colW, bh, 20);
      ctx.fill();
    }
    box(PAD, "PAYMENT", payRows);
    box(
      PAD + colW + 32,
      c.fulfilment === "pickup" ? "PICKUP" : "DELIVER TO",
      delRows,
    );
    y = boxTop + bh + 72;

    // Thank-you + contact
    text("Thank you for shopping with oneMore!", W / 2, y, {
      size: 34,
      weight: 800,
      align: "center",
    });
    y += 50;
    text("We will confirm your order on WhatsApp shortly.", W / 2, y, {
      size: 26,
      color: "#6b6b66",
      align: "center",
    });
    y += 70;
    const footH = 150;
    if (draw) {
      ctx.fillStyle = INK;
      ctx.fillRect(0, y, W, footH);
    }
    const contact = [
      shop.phoneDisplay,
      shop.email && !/^\[/.test(shop.email) ? shop.email : "",
    ]
      .filter(Boolean)
      .join("  ·  ");
    text(contact, W / 2, y + 62, {
      size: 26,
      color: "#ffffff",
      align: "center",
    });
    text((shop.siteUrl || "").replace(/^https?:\/\//, ""), W / 2, y + 106, {
      size: 26,
      weight: 800,
      color: LIME,
      align: "center",
    });
    y += footH;
    return y;
  };

  const canvas = document.createElement("canvas");
  const m = canvas.getContext("2d");
  const height = Math.ceil(render(m, false));
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, height);
  render(ctx, true);
  return canvas;
}

export function receiptBlob(order, shop) {
  const canvas = drawReceipt(order, shop);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
