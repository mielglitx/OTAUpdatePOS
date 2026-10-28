/**
 * Module Description: ESC/POS Binary Command Builder & Hardware Dispatcher
 * Builds binary print job buffers for Customer Official Receipts, Server Slips,
 * Staff Crew Wi-Fi passes, and dedicated Karinderya Mode fast-service slips.
 * In compact fast-service mode, the store name, branding sub-headers, VAT breakdowns,
 * and footer taglines are completely omitted—printing only the order number, itemized order lines,
 * total amount, wide spaced Wi-Fi voucher code, and native ESC/POS QR auto-login code for maximum
 * counter throughput and thermal paper roll economy. Implements calibrated single-width typography (0x18)
 * for dense text blocks and wide, spaced double-width typography (0x38) for voucher codes.
 * Prioritizes native InAppWebView bridge dispatch with dual-engine Bluetooth routing:
 * Standard Classic RFCOMM (printRawBluetooth) vs Compatibility Mode BLE GATT (printRawBle)
 * with automatic KPrinter_fbce fallback detection, raw TCP sockets, and WebUSB streams.
 */

import { DB } from "./db.js";

export const Printer = {
  ip: localStorage.getItem("pos_printer_ip") || "192.168.1.100",
  port: parseInt(localStorage.getItem("pos_printer_port") || "9100", 10),

  setTarget(ip, port) {
    this.ip = ip;
    this.port = port;
    localStorage.setItem("pos_printer_ip", ip);
    localStorage.setItem("pos_printer_port", port);
  },

  /**
   * Splits a string into word-wrapped lines without breaking words
   * @param {string} text - Source string to wrap
   * @param {number} maxLen - Maximum character width per line
   * @returns {Array<string>}
   */
  wrapText(text, maxLen) {
    if (!text) return [""];
    const words = String(text).trim().split(/\s+/);
    const lines = [];
    let currentLine = "";

    for (const word of words) {
      if (!currentLine) {
        if (word.length > maxLen) {
          for (let i = 0; i < word.length; i += maxLen) {
            lines.push(word.substring(i, i + maxLen));
          }
        } else {
          currentLine = word;
        }
      } else if (currentLine.length + 1 + word.length <= maxLen) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        if (word.length > maxLen) {
          for (let i = 0; i < word.length; i += maxLen) {
            const chunk = word.substring(i, i + maxLen);
            if (i + maxLen < word.length) {
              lines.push(chunk);
            } else {
              currentLine = chunk;
            }
          }
        } else {
          currentLine = word;
        }
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines.length > 0 ? lines : [""];
  },

  /**
   * Helper to format alphanumeric voucher codes with wide character spacing
   * @param {string} code - Raw voucher code
   * @returns {string} Spaced alphanumeric code string
   */
  formatSpacedVoucherCode(code) {
    const raw = String(code || "").trim().toUpperCase();
    if (!raw) return "";
    return raw.length <= 5 ? raw.split("").join("  ") : raw.split("").join(" ");
  },

  /**
   * Helper to construct native ESC/POS Model 2 QR Code command bytes (Function 181)
   * @param {string} text - URL or string payload to encode
   * @param {number} [moduleSize=5] - QR dot size (1 to 16)
   * @returns {Array<number>} Raw ESC/POS byte sequence
   */
  buildEscPosQrBytes(text, moduleSize = 5) {
    if (!text) return [];

    const qrBytes = [];
    for (let i = 0; i < text.length; i++) {
      qrBytes.push(text.charCodeAt(i) & 0xff);
    }

    const len = qrBytes.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);

    const buffer = [
      // 1. Select QR Model (Model 2): GS ( k 4 0 49 65 50 0
      0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
      // 2. Set Module Size: GS ( k 3 0 49 67 n
      0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, Math.min(16, Math.max(1, moduleSize)),
      // 3. Set Error Correction Level M: GS ( k 3 0 49 69 49
      0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31,
      // 4. Store Data in Symbol Storage Area: GS ( k pL pH 49 80 48 ...
      0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30, ...qrBytes,
      // 5. Print Stored Symbol: GS ( k 3 0 49 81 48
      0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30,
      // Line feed
      0x0A
    ];

    return buffer;
  },

  /**
   * Dedicated Karinderya Fast-Service Receipt Formatter
   * Omits store name, logo, addresses, tax breakdowns, and footers.
   * Prints only: Order Number, Date & Time, Items Ordered, Total Amount, Spaced Voucher Code, and Login QR.
   * @param {Object} ticket - Calculated order details
   * @param {string} paperWidth - '58mm' or '80mm'
   * @returns {Promise<Uint8Array>}
   */
  async buildKarinderyaReceiptBytes(ticket, paperWidth = "58mm") {
    const is80mm = paperWidth === "80mm";
    const totalCols = is80mm ? 48 : 32;
    const divider = "-".repeat(totalCols) + "\n";
    const doubleDivider = "=".repeat(totalCols) + "\n";

    const store = await DB.getStoreSettings();
    const encoder = new TextEncoder();
    const buffer = [];

    const append = (bytes) => buffer.push(...bytes);
    const text = (str) => {
      const sanitized = str.replace(/₱/g, "P");
      append(encoder.encode(sanitized));
    };

    // 1. Initialize Printer (ESC @) & Code Page PC437
    append([0x1B, 0x40]);
    append([0x1B, 0x74, 0x00]);

    // 2. Compact Header: Order Number & Date Only (Store name omitted in Compact Mode)
    append([0x1B, 0x61, 0x01]);
    append([0x1B, 0x21, 0x18]);
    text(`ORDER: ${ticket.orderNumber || "ORD-000000"}\n`);
    append([0x1B, 0x21, 0x00]);
    text(`Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\n`);
    text(divider);

    // 3. Left Align Order Items (Multi-line word wrapping)
    append([0x1B, 0x61, 0x00]);

    const padRow = (col1, col2, col3) => {
      const c1Width = is80mm ? 24 : 16;
      const c2Width = is80mm ? 7 : 4;
      const c3Width = is80mm ? 15 : 10;

      const lines = this.wrapText(col1, c1Width);
      let output = "";

      lines.forEach((line, idx) => {
        const c1 = line.padEnd(c1Width, " ");
        const c2 = idx === 0 ? col2.padEnd(c2Width, " ") : " ".repeat(c2Width);
        const c3 = idx === 0 ? col3.padStart(c3Width, " ") : " ".repeat(c3Width);
        output += `${c1} ${c2} ${c3}\n`;
      });

      return output;
    };

    text(padRow("ITEM", "QTY", "TOTAL"));
    text(divider);

    if (Array.isArray(ticket.items)) {
      ticket.items.forEach((item) => {
        const name = item.name || "Item";
        const qty = `${item.qty}x`;
        const sub = `P${((item.price || 0) * (item.qty || 1)).toFixed(2)}`;
        text(padRow(name, qty, sub));
      });
    }

    text(divider);

    // 4. Right Align Total Amount Due (Bold)
    append([0x1B, 0x61, 0x02]);
    const total = typeof ticket.total === "number" ? ticket.total : 0;
    append([0x1B, 0x45, 0x01]);
    text(`TOTAL: P${total.toFixed(2)}\n`);
    append([0x1B, 0x45, 0x00]);

    // 5. Single-Use Wi-Fi Voucher & Auto-Login QR Code
    if (ticket.voucher) {
      text(doubleDivider);
      append([0x1B, 0x61, 0x01]);
      append([0x1B, 0x21, 0x18]);
      text("FREE CUSTOMER WI-FI\n");
      append([0x1B, 0x21, 0x00]);

      let host = (store.hotspotDomain || "").trim();
      if (!host || host.endsWith(".local") || host.includes(".lan")) {
        host = (store.hotspotRouterIp || "192.168.88.1").trim();
      }
      const qrUrl = ticket.voucher.qrUrl || `http://${host}/login?voucher=${encodeURIComponent(ticket.voucher.code)}`;
      const qrBytes = this.buildEscPosQrBytes(qrUrl, is80mm ? 6 : 5);
      append(qrBytes);

      append([0x1B, 0x45, 0x01]);
      text("VOUCHER CODE:\n");
      append([0x1B, 0x45, 0x00]);

      // Double-Width + Double-Height + Bold (ESC ! 0x38)
      append([0x1B, 0x21, 0x38]);
      const wideCode = this.formatSpacedVoucherCode(ticket.voucher.code);
      text(`${wideCode}\n`);
      append([0x1B, 0x21, 0x00]);

      const isUnlimited = String(ticket.voucher.sharedUsers) === "unlimited" || String(ticket.voucher.sharedUsers) === "0";
      const accessLabel = isUnlimited ? "Unlimited Devices" : "1 Device Only";
      text(`Access: ${ticket.voucher.uptime || "2 Hours"} (${accessLabel})\n`);
      text(doubleDivider);
    }

    // 6. Paper Feed & Partial Cut
    text("\n\n\n");
    append([0x1D, 0x56, 0x42, 0x00]);

    return new Uint8Array(buffer);
  },

  /**
   * Generates Customer Official Receipt ESC/POS bytes
   * Displays full store profile, prices, buzzer, 12% VAT, totals, and wide single-code Wi-Fi pass
   * @param {Object} ticket - Calculated ticket details
   * @param {string} paperWidth - Paper format ('58mm' or '80mm')
   * @returns {Promise<Uint8Array>}
   */
  async buildCustomerReceiptBytes(ticket, paperWidth = "58mm") {
    const is80mm = paperWidth === "80mm";
    const totalCols = is80mm ? 48 : 32;
    const divider = "-".repeat(totalCols) + "\n";
    const doubleDivider = "=".repeat(totalCols) + "\n";

    const store = await DB.getStoreSettings();

    const encoder = new TextEncoder();
    const buffer = [];

    const append = (bytes) => buffer.push(...bytes);
    const text = (str) => {
      const sanitized = str.replace(/₱/g, "P");
      append(encoder.encode(sanitized));
    };

    // 1. Initialize Printer (ESC @)
    append([0x1B, 0x40]);

    // 2. Select Standard Character Code Table PC437 (ESC t 0)
    append([0x1B, 0x74, 0x00]);

    // 3. Center Align (ESC a 1)
    append([0x1B, 0x61, 0x01]);

    // 4. Store Title: Double-Height + Bold, Single-Width (ESC ! 0x18) to fit 32 columns
    append([0x1B, 0x21, 0x18]);
    const storeTitle = (store.storeName || "DANIELA CAFE & CUISINE").toUpperCase();
    const titleLines = this.wrapText(storeTitle, totalCols);
    titleLines.forEach((tl) => text(`${tl}\n`));

    // 5. Reset Format (ESC ! 0x00) & Print Sub-Headers
    append([0x1B, 0x21, 0x00]);
    if (store.companyName) {
      const companyLines = this.wrapText(store.companyName, totalCols);
      companyLines.forEach((cl) => text(`${cl}\n`));
    }
    if (store.address) {
      const addrLines = this.wrapText(store.address, totalCols);
      addrLines.forEach((al) => text(`${al}\n`));
    }
    if (store.contactNumber) {
      text(`Tel: ${store.contactNumber}\n`);
    }

    text(doubleDivider);
    text("[ CUSTOMER OFFICIAL RECEIPT ]\n");
    text(`Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\n`);
    if (ticket.orderNumber) {
      text(`Order: ${ticket.orderNumber}\n`);
    }
    if (ticket.tableName) {
      text(`Table: ${ticket.tableName}${ticket.tableSection ? " (" + ticket.tableSection + ")" : ""}\n`);
    }
    if (ticket.cashierName) {
      text(`Cashier: ${ticket.cashierName}\n`);
    }

    if (ticket.pagerNumber) {
      text(divider);
      append([0x1B, 0x61, 0x01]);
      append([0x1B, 0x21, 0x18]);
      text(`BUZZER #${ticket.pagerNumber}\n`);
      append([0x1B, 0x21, 0x00]);
      append([0x1B, 0x61, 0x00]);
    }
    text(divider);

    // 6. Left Align (ESC a 0)
    append([0x1B, 0x61, 0x00]);

    // Multi-Line Word-Wrapping Table Formatter
    const padRow = (col1, col2, col3) => {
      const c1Width = is80mm ? 24 : 16;
      const c2Width = is80mm ? 7 : 4;
      const c3Width = is80mm ? 15 : 10;

      const lines = this.wrapText(col1, c1Width);
      let output = "";

      lines.forEach((line, idx) => {
        const c1 = line.padEnd(c1Width, " ");
        const c2 = idx === 0 ? col2.padEnd(c2Width, " ") : " ".repeat(c2Width);
        const c3 = idx === 0 ? col3.padStart(c3Width, " ") : " ".repeat(c3Width);
        output += `${c1} ${c2} ${c3}\n`;
      });

      return output;
    };

    text(padRow("ITEM", "QTY", "TOTAL"));
    text(divider);

    if (Array.isArray(ticket.items)) {
      ticket.items.forEach((item) => {
        const name = item.name || "Item";
        const qty = `${item.qty}x`;
        const sub = `P${((item.price || 0) * (item.qty || 1)).toFixed(2)}`;
        text(padRow(name, qty, sub));
      });
    }

    text(divider);

    // 7. Right Align Totals (ESC a 2)
    append([0x1B, 0x61, 0x02]);
    const vatable = typeof ticket.vatableSales === "number" ? ticket.vatableSales : 0;
    const vat = typeof ticket.vatAmount === "number" ? ticket.vatAmount : 0;
    const total = typeof ticket.total === "number" ? ticket.total : 0;

    text(`Vatable Sales: P${vatable.toFixed(2)}\n`);
    text(`VAT Amount (12%): P${vat.toFixed(2)}\n`);

    append([0x1B, 0x45, 0x01]);
    text(`TOTAL AMOUNT: P${total.toFixed(2)}\n`);
    append([0x1B, 0x45, 0x00]);

    if (ticket.paymentType) {
      text(`Payment Mode: ${ticket.paymentType}\n`);
    }
    if (ticket.amountTendered !== null && ticket.amountTendered !== undefined) {
      text(`Amount Tendered: P${Number(ticket.amountTendered).toFixed(2)}\n`);
    }
    if (ticket.changeAmount !== null && ticket.changeAmount !== undefined) {
      text(`Change: P${Number(ticket.changeAmount).toFixed(2)}\n`);
    }
    if (ticket.gcashRefNo) {
      text(`GCash Ref: ${ticket.gcashRefNo}\n`);
    }

    // =======================================================================
    // 8. SINGLE-USE WI-FI VOUCHER (WIDE & SPACED CODE FORMAT)
    // =======================================================================
    if (ticket.voucher) {
      text(doubleDivider);
      append([0x1B, 0x61, 0x01]);
      append([0x1B, 0x21, 0x18]);
      text("FREE CUSTOMER WI-FI\n");
      append([0x1B, 0x21, 0x00]);

      text("1. Connect to Store Wi-Fi\n");
      text("2. Scan QR or enter code at portal:\n");

      let host = (store.hotspotDomain || "").trim();
      if (!host || host.endsWith(".local") || host.includes(".lan")) {
        host = (store.hotspotRouterIp || "192.168.88.1").trim();
      }
      const qrUrl = ticket.voucher.qrUrl || `http://${host}/login?voucher=${encodeURIComponent(ticket.voucher.code)}`;
      const qrBytes = this.buildEscPosQrBytes(qrUrl, is80mm ? 6 : 5);
      append(qrBytes);

      append([0x1B, 0x61, 0x01]);
      append([0x1B, 0x45, 0x01]);
      text("VOUCHER CODE:\n");
      append([0x1B, 0x45, 0x00]);

      // Double-Width + Double-Height + Bold (ESC ! 0x38)
      append([0x1B, 0x21, 0x38]);
      const wideCode = this.formatSpacedVoucherCode(ticket.voucher.code);
      text(`${wideCode}\n`);
      append([0x1B, 0x21, 0x00]);

      const isUnlimited = String(ticket.voucher.sharedUsers) === "unlimited" || String(ticket.voucher.sharedUsers) === "0";
      const accessLabel = isUnlimited ? "Unlimited Devices" : "1 Device Only";
      const speedCap = ticket.voucher.rateLimit && ticket.voucher.rateLimit !== "Default"
        ? ` | Speed: ${ticket.voucher.rateLimit}`
        : "";

      text(`Access: ${ticket.voucher.uptime || "2 Hours"} (${accessLabel})\n`);
      if (speedCap) {
        text(`Speed Limit: ${ticket.voucher.rateLimit}\n`);
      }
      text("Single-use access voucher.\n");
    }

    text(doubleDivider);

    // 9. Center Footer (ESC a 1)
    append([0x1B, 0x61, 0x01]);
    if (store.tagline) {
      const taglineLines = this.wrapText(`"${store.tagline}"`, totalCols);
      taglineLines.forEach((tgl) => text(`${tgl}\n`));
    }
    text("Thank you for your purchase!\n");
    text("Please visit us again.\n\n\n\n");

    // 10. Partial Cut (GS V 66 0)
    append([0x1D, 0x56, 0x42, 0x00]);

    return new Uint8Array(buffer);
  },

  /**
   * Generates Voucher-Only Receipt ESC/POS bytes for Fast Mode
   * Omits item lines, subtotals, tax tables; prints only store header, order #, Wi-Fi login QR, and access voucher
   * @param {Object} ticket
   * @param {string} paperWidth - '58mm' or '80mm'
   * @returns {Promise<Uint8Array>}
   */
  async buildVoucherOnlyReceiptBytes(ticket, paperWidth = "58mm") {
    const is80mm = paperWidth === "80mm";
    const totalCols = is80mm ? 48 : 32;
    const divider = "-".repeat(totalCols) + "\n";
    const doubleDivider = "=".repeat(totalCols) + "\n";

    const store = await DB.getStoreSettings();
    const encoder = new TextEncoder();
    const buffer = [];

    const append = (bytes) => buffer.push(...bytes);
    const text = (str) => {
      const sanitized = str.replace(/₱/g, "P");
      append(encoder.encode(sanitized));
    };

    // 1. Initialize Printer (ESC @) & Code Table (ESC t 0)
    append([0x1B, 0x40]);
    append([0x1B, 0x74, 0x00]);

    // 2. Center Align (ESC a 1)
    append([0x1B, 0x61, 0x01]);

    // Double-Height Store Name
    append([0x1B, 0x21, 0x18]);
    const storeTitle = (store.storeName || "DANIELA CAFE & CUISINE").toUpperCase();
    const titleLines = this.wrapText(storeTitle, totalCols);
    titleLines.forEach((tl) => text(`${tl}\n`));
    append([0x1B, 0x21, 0x00]);

    text(divider);

    // Order Info & Cashier
    if (ticket.orderNumber) {
      append([0x1B, 0x45, 0x01]);
      text(`ORDER: #${ticket.orderNumber}\n`);
      append([0x1B, 0x45, 0x00]);
    }
    if (ticket.tableName) {
      text(`TABLE: ${ticket.tableName}\n`);
    }
    const cashier = ticket.cashierName || "Staff";
    text(`Cashier: ${cashier}\n`);
    text(`Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\n`);

    if (ticket.pagerNumber) {
      append([0x1B, 0x21, 0x18]);
      text(`BUZZER: #${ticket.pagerNumber}\n`);
      append([0x1B, 0x21, 0x00]);
    }

    text(doubleDivider);

    // Wi-Fi Voucher QR & Access Code
    if (ticket.voucher) {
      append([0x1B, 0x21, 0x18]);
      text("FREE CUSTOMER WI-FI\n");
      append([0x1B, 0x21, 0x00]);

      text("1. Connect to Store Wi-Fi\n");
      text("2. Scan QR or enter code at portal:\n");

      let host = (store.hotspotDomain || "").trim();
      if (!host || host.endsWith(".local") || host.includes(".lan")) {
        host = (store.hotspotRouterIp || "192.168.88.1").trim();
      }
      const qrUrl = ticket.voucher.qrUrl || `http://${host}/login?voucher=${encodeURIComponent(ticket.voucher.code)}`;
      const qrBytes = this.buildEscPosQrBytes(qrUrl, is80mm ? 6 : 5);
      append(qrBytes);

      append([0x1B, 0x61, 0x01]);
      append([0x1B, 0x45, 0x01]);
      text("VOUCHER CODE:\n");
      append([0x1B, 0x45, 0x00]);

      // Double-Width + Double-Height + Bold (ESC ! 0x38)
      append([0x1B, 0x21, 0x38]);
      const wideCode = this.formatSpacedVoucherCode(ticket.voucher.code);
      text(`${wideCode}\n`);
      append([0x1B, 0x21, 0x00]);

      const isUnlimited = String(ticket.voucher.sharedUsers) === "unlimited" || String(ticket.voucher.sharedUsers) === "0";
      const accessLabel = isUnlimited ? "Unlimited Devices" : "1 Device Only";
      const speedCap = ticket.voucher.rateLimit && ticket.voucher.rateLimit !== "Default"
        ? ` | Speed: ${ticket.voucher.rateLimit}`
        : "";

      text(`Access: ${ticket.voucher.uptime || "2 Hours"} (${accessLabel})\n`);
      if (speedCap) {
        text(`Speed Limit: ${ticket.voucher.rateLimit}\n`);
      }
      text("Single-use access voucher.\n");
    }

    text(doubleDivider);

    if (store.tagline) {
      const taglineLines = this.wrapText(`"${store.tagline}"`, totalCols);
      taglineLines.forEach((tgl) => text(`${tgl}\n`));
    }
    text("Thank you for your visit!\n\n\n\n");

    // Partial Cut (GS V 66 0)
    append([0x1D, 0x56, 0x42, 0x00]);

    return new Uint8Array(buffer);
  },

  /**
   * Generates Crew / Staff Wi-Fi Access Slip ESC/POS bytes
   * Displays high-visibility staff credentials with wide, spaced code formatting, duration, and gateway QR
   * @param {Object} voucher - Crew voucher entity
   * @param {string} paperWidth - '58mm' or '80mm'
   * @returns {Promise<Uint8Array>}
   */
  async buildCrewWifiSlipBytes(voucher, paperWidth = "58mm") {
    const is80mm = paperWidth === "80mm";
    const totalCols = is80mm ? 48 : 32;
    const divider = "-".repeat(totalCols) + "\n";
    const doubleDivider = "=".repeat(totalCols) + "\n";

    const store = await DB.getStoreSettings();
    const encoder = new TextEncoder();
    const buffer = [];

    const append = (bytes) => buffer.push(...bytes);
    const text = (str) => {
      const sanitized = str.replace(/₱/g, "P");
      append(encoder.encode(sanitized));
    };

    // 1. Initialize Printer
    append([0x1B, 0x40]);
    append([0x1B, 0x74, 0x00]);
    append([0x1B, 0x61, 0x01]);

    // 2. Store Header (Double-Height + Bold, Single-Width)
    append([0x1B, 0x21, 0x18]);
    const storeTitle = (store.storeName || "DANIELA CAFE & CUISINE").toUpperCase();
    const titleLines = this.wrapText(storeTitle, totalCols);
    titleLines.forEach((tl) => text(`${tl}\n`));
    append([0x1B, 0x21, 0x00]);

    text(doubleDivider);
    append([0x1B, 0x21, 0x18]);
    text("*** CREW WI-FI PASS ***\n");
    append([0x1B, 0x21, 0x00]);
    text("Official Staff / Crew Access Voucher\n");
    text(`Issued: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\n`);
    text(divider);

    text("1. Connect device to Store Wi-Fi\n");
    text("2. Scan QR or enter code at portal:\n");

    let host = (store.hotspotDomain || "").trim();
    if (!host || host.endsWith(".local") || host.includes(".lan")) {
      host = (store.hotspotRouterIp || "192.168.88.1").trim();
    }
    const qrUrl = voucher.qrUrl || `http://${host}/login?voucher=${encodeURIComponent(voucher.code)}`;
    const qrBytes = this.buildEscPosQrBytes(qrUrl, is80mm ? 6 : 5);
    append(qrBytes);

    append([0x1B, 0x61, 0x01]);
    append([0x1B, 0x45, 0x01]);
    text("CREW PASS CODE:\n");
    append([0x1B, 0x45, 0x00]);

    // Double-Width + Double-Height + Bold (ESC ! 0x38)
    append([0x1B, 0x21, 0x38]);
    const wideCrewCode = this.formatSpacedVoucherCode(voucher.code);
    text(`${wideCrewCode}\n`);
    append([0x1B, 0x21, 0x00]);

    text(`Duration: ${voucher.uptime || "12 Hours"}\n`);
    text("Device Limit: UNLIMITED CREW DEVICES\n");
    if (voucher.rateLimit && voucher.rateLimit !== "Default") {
      text(`Speed Limit: ${voucher.rateLimit}\n`);
    }
    text(divider);
    text("Internal Store Staff Use Only.\n");
    text("Shareable among on-duty crew.\n\n\n\n");
    append([0x1D, 0x56, 0x42, 0x00]);

    return new Uint8Array(buffer);
  },

  /**
   * Generates Admin Master Wi-Fi Access Slip ESC/POS bytes
   * Displays high-visibility master pass credentials with wide spaced code formatting, unlimited duration, and gateway QR
   * @param {Object} voucher - Admin voucher entity
   * @param {string} paperWidth - '58mm' or '80mm'
   * @returns {Promise<Uint8Array>}
   */
  async buildAdminWifiSlipBytes(voucher, paperWidth = "58mm") {
    const is80mm = paperWidth === "80mm";
    const totalCols = is80mm ? 48 : 32;
    const divider = "-".repeat(totalCols) + "\n";
    const doubleDivider = "=".repeat(totalCols) + "\n";

    const store = await DB.getStoreSettings();
    const encoder = new TextEncoder();
    const buffer = [];

    const append = (bytes) => buffer.push(...bytes);
    const text = (str) => {
      const sanitized = str.replace(/₱/g, "P");
      append(encoder.encode(sanitized));
    };

    // 1. Initialize Printer
    append([0x1B, 0x40]);
    append([0x1B, 0x74, 0x00]);
    append([0x1B, 0x61, 0x01]);

    // 2. Store Header
    append([0x1B, 0x21, 0x18]);
    const storeTitle = (store.storeName || "DANIELA CAFE & CUISINE").toUpperCase();
    const titleLines = this.wrapText(storeTitle, totalCols);
    titleLines.forEach((tl) => text(`${tl}\n`));
    append([0x1B, 0x21, 0x00]);

    text(doubleDivider);
    append([0x1B, 0x21, 0x18]);
    text("👑 ADMIN MASTER WI-FI 👑\n");
    append([0x1B, 0x21, 0x00]);
    text("Permanent Administrator Access Pass\n");
    text(`Issued: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\n`);
    text(divider);

    text("1. Connect device to Store Wi-Fi\n");
    text("2. Scan QR or enter code at portal:\n");

    let host = (store.hotspotDomain || "").trim();
    if (!host || host.endsWith(".local") || host.includes(".lan")) {
      host = (store.hotspotRouterIp || "192.168.88.1").trim();
    }
    const qrUrl = voucher.qrUrl || `http://${host}/login?voucher=${encodeURIComponent(voucher.code)}`;
    const qrBytes = this.buildEscPosQrBytes(qrUrl, is80mm ? 6 : 5);
    append(qrBytes);

    append([0x1B, 0x61, 0x01]);
    append([0x1B, 0x45, 0x01]);
    text("ADMIN PASS CODE:\n");
    append([0x1B, 0x45, 0x00]);

    // Double-Width + Double-Height + Bold (ESC ! 0x38)
    append([0x1B, 0x21, 0x38]);
    const wideAdminCode = this.formatSpacedVoucherCode(voucher.code);
    text(`${wideAdminCode}\n`);
    append([0x1B, 0x21, 0x00]);

    text("Duration: PERMANENT / UNLIMITED\n");
    text("Speed Limit: UNCAPPED (Full Line Speed)\n");
    text("Device Limit: UNLIMITED ADMIN DEVICES\n");
    text(divider);
    text("Strictly Confidential - Admin Use Only.\n");
    text("Unrestricted Hotspot Privileges.\n\n\n\n");
    append([0x1D, 0x56, 0x42, 0x00]);

    return new Uint8Array(buffer);
  },

  /**
   * Generates Server Order Slip ESC/POS bytes
   * Displays high-visibility item names, quantities, and buzzer numbers with multi-line word wrapping
   * @param {Object} ticket
   * @param {string} paperWidth
   * @returns {Uint8Array}
   */
  buildServerSlipBytes(ticket, paperWidth = "58mm") {
    const is80mm = paperWidth === "80mm";
    const totalCols = is80mm ? 48 : 32;
    const divider = "-".repeat(totalCols) + "\n";
    const doubleDivider = "=".repeat(totalCols) + "\n";

    const encoder = new TextEncoder();
    const buffer = [];

    const append = (bytes) => buffer.push(...bytes);
    const text = (str) => {
      const sanitized = str.replace(/₱/g, "P");
      append(encoder.encode(sanitized));
    };

    append([0x1B, 0x40]);
    append([0x1B, 0x74, 0x00]);
    append([0x1B, 0x61, 0x01]);
    append([0x1B, 0x21, 0x18]);
    text("*** SERVER SLIP ***\n");
    append([0x1B, 0x21, 0x00]);

    if (ticket.orderNumber) {
      append([0x1B, 0x45, 0x01]);
      text(`ORDER: ${ticket.orderNumber}\n`);
      append([0x1B, 0x45, 0x00]);
    }

    if (ticket.pagerNumber) {
      append([0x1B, 0x61, 0x01]);
      append([0x1B, 0x21, 0x18]);
      text(`BUZZER #${ticket.pagerNumber}\n`);
      append([0x1B, 0x21, 0x00]);
      append([0x1B, 0x61, 0x00]);
    }

    text(`Time: ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}\n`);
    if (ticket.tableName) {
      append([0x1B, 0x21, 0x18]);
      text(`TABLE: ${ticket.tableName}\n`);
      append([0x1B, 0x21, 0x00]);
    }
    if (ticket.cashierName) {
      text(`Server/Cashier: ${ticket.cashierName}\n`);
    }
    text(doubleDivider);

    append([0x1B, 0x61, 0x00]);

    const padServerRow = (qtyStr, nameStr) => {
      const qtyWidth = is80mm ? 10 : 6;
      const nameWidth = is80mm ? 38 : 26;

      const lines = this.wrapText(nameStr, nameWidth);
      let output = "";

      lines.forEach((line, idx) => {
        const c1 = idx === 0 ? qtyStr.padEnd(qtyWidth, " ") : " ".repeat(qtyWidth);
        const c2 = line.padEnd(nameWidth, " ");
        output += `${c1}${c2}\n`;
      });

      return output;
    };

    text(padServerRow("QTY", "ORDER DETAILS"));
    text(divider);

    let totalItemCount = 0;

    if (Array.isArray(ticket.items)) {
      ticket.items.forEach((item) => {
        const qty = item.qty || 1;
        totalItemCount += qty;

        append([0x1B, 0x45, 0x01]);
        text(padServerRow(`[ ${qty}x ]`, item.name || "Item"));
        append([0x1B, 0x45, 0x00]);
      });
    }

    text(divider);
    append([0x1B, 0x45, 0x01]);
    text(`TOTAL UNITS ORDERED: ${totalItemCount}\n`);
    append([0x1B, 0x45, 0x00]);
    text(doubleDivider);

    append([0x1B, 0x61, 0x01]);
    text("[ SERVER / PREPARATION COPY ]\n\n\n\n");
    append([0x1D, 0x56, 0x42, 0x00]);

    return new Uint8Array(buffer);
  },

  /**
   * Cash Drawer Kick Pulse (ESC p m t1 t2)
   * @returns {Uint8Array}
   */
  buildDrawerKickBytes() {
    return new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
  },

  /**
   * Native WebUSB dispatch for thermal receipt printers
   * @param {string} usbIdentifier 
   * @param {Uint8Array} bytes 
   * @returns {Promise<Object>}
   */
  async printWebUsb(usbIdentifier, bytes) {
    if (!navigator.usb) {
      throw new Error("WebUSB API is not supported in this browser or environment.");
    }

    const devices = await navigator.usb.getDevices();
    let targetDevice = null;

    if (usbIdentifier) {
      targetDevice = devices.find((d) => {
        const devId = `${d.vendorId}_${d.productId}`;
        return devId === usbIdentifier || (d.productName && d.productName.includes(usbIdentifier));
      });
    }

    if (!targetDevice && devices.length > 0) {
      targetDevice = devices[0];
    }

    if (!targetDevice) {
      throw new Error("No paired USB printer found. Click 'Pair USB' in Printer Settings.");
    }

    await targetDevice.open();

    if (!targetDevice.configuration) {
      await targetDevice.selectConfiguration(1);
    }

    let printerInterface = targetDevice.configuration.interfaces.find((iface) =>
      iface.alternates.some((alt) => alt.interfaceClass === 7 || alt.interfaceClass === 0 || alt.interfaceClass === 255)
    );

    const interfaceNumber = printerInterface ? printerInterface.interfaceNumber : 0;
    await targetDevice.claimInterface(interfaceNumber);

    const alternate = printerInterface ? printerInterface.alternates[0] : targetDevice.configuration.interfaces[0].alternates[0];
    const outEndpoint = alternate.endpoints.find((ep) => ep.direction === "out" && ep.type === "bulk") || alternate.endpoints.find((ep) => ep.direction === "out");

    if (!outEndpoint) {
      await targetDevice.releaseInterface(interfaceNumber);
      await targetDevice.close();
      throw new Error("Could not identify a USB bulk output endpoint on this printer.");
    }

    const chunkSize = 64;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      await targetDevice.transferOut(outEndpoint.endpointNumber, chunk);
    }

    await targetDevice.releaseInterface(interfaceNumber);
    await targetDevice.close();
    return { ok: true };
  },

  /**
   * Dispatches raw ESC/POS byte sequence to a specific target printer
   * Dynamically routes Bluetooth targets: Standard Classic SPP vs Compatibility Mode BLE GATT
   * with automatic fallback detection for dual-mode devices (e.g., KPrinter_fbce).
   * @param {Object} printer 
   * @param {Uint8Array} bytes 
   * @returns {Promise<Object>}
   */
  async dispatchToTarget(printer, bytes) {
    if (!printer) {
      return { ok: false, error: "No target printer specified" };
    }

    const byteList = Array.from(bytes);

    const targetBtStr = (printer.btName || "").toLowerCase();
    const targetNameStr = (printer.name || "").toLowerCase();
    const isBleDevice = Boolean(
      printer.isBle === true ||
      targetBtStr.includes("kprinter") ||
      targetBtStr.includes("fbce") ||
      targetBtStr.includes("fb:ce") ||
      targetNameStr.includes("kprinter") ||
      targetNameStr.includes("fbce")
    );

    // Native Flutter InAppWebView Bridge Dispatch
    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        // 1. Prioritize Explicit Bluetooth Target (Classic SPP vs Compatibility BLE)
        if (printer.type === "bluetooth") {
          const handler = isBleDevice ? "printRawBle" : "printRawBluetooth";
          const res = await window.flutter_inappwebview.callHandler(
            handler,
            printer.btName || "KPrinter_fbce",
            byteList
          );
          return res || { ok: false, error: `${isBleDevice ? "BLE" : "Bluetooth"} bridge returned empty response.` };
        }

        // 2. Explicit Network / LAN Target
        if (printer.type === "network") {
          const res = await window.flutter_inappwebview.callHandler(
            "printRawTcp",
            printer.address || this.ip,
            parseInt(printer.port, 10) || this.port,
            byteList
          );
          return res || { ok: false, error: "TCP bridge returned empty response." };
        }

        // 3. Explicit USB Target
        if (printer.type === "usb") {
          const res = await window.flutter_inappwebview.callHandler(
            "printRawUsb",
            printer.usbPort || "USB001",
            byteList
          );
          return res || { ok: false, error: "USB bridge returned empty response." };
        }

        // 4. Universal / All Interface Target (Smart Protocol Selection)
        if (printer.type === "all") {
          // Check USB Target if configured
          if (printer.usbPort && printer.usbPort.trim() !== "") {
            const res = await window.flutter_inappwebview.callHandler(
              "printRawUsb",
              printer.usbPort.trim(),
              byteList
            );
            if (res && res.ok) return res;
          }

          if (printer.btName && printer.btName.trim() !== "") {
            const handler = isBleDevice ? "printRawBle" : "printRawBluetooth";
            const res = await window.flutter_inappwebview.callHandler(
              handler,
              printer.btName.trim(),
              byteList
            );
            if (res && res.ok) return res;

            if ((!printer.address || printer.address === "192.168.1.100") && !printer.usbPort) {
              return res || { ok: false, error: `${isBleDevice ? "BLE" : "Bluetooth"} printing failed for "${printer.btName}".` };
            }
          }

          if (printer.address) {
            return await window.flutter_inappwebview.callHandler(
              "printRawTcp",
              printer.address,
              parseInt(printer.port, 10) || this.port,
              byteList
            );
          }
        }
      } catch (err) {
        console.error(`[Printer Bridge Error] Dispatch failed for ${printer.name}:`, err);
        return { ok: false, error: err.message || String(err) };
      }
    }

    // WebUSB Fallback for Chrome PWA / Desktop browser
    if (printer.type === "usb" && navigator.usb) {
      try {
        await this.printWebUsb(printer.usbPort, bytes);
        return { ok: true, webUsb: true };
      } catch (usbErr) {
        console.warn(`[WebUSB Driver] USB direct print error: ${usbErr.message}`);
        return { ok: false, error: usbErr.message };
      }
    }

    console.warn(`[Printer] No hardware bridge found for ${printer.name}.`);
    return { 
      ok: false, 
      error: `Printer interface "${printer.type.toUpperCase()}" is not supported or not running inside the mobile app.` 
    };
  },

  /**
   * Dual-Receipt Multi-Printer Concurrent Broadcast Pipeline
   * Selects buildKarinderyaReceiptBytes when karinderyaMode is active on ticket
   * @param {Array<Object>} enabledPrinters 
   * @param {Object} ticket 
   * @returns {Promise<Array<Object>>}
   */
  async broadcastReceipt(enabledPrinters, ticket) {
    const isKarinderya = Boolean(ticket && ticket.karinderyaMode);
    const isVoucherOnly = Boolean(ticket && ticket.karinderyaVoucherOnly && ticket.voucher);

    const getReceiptBytes = async (width) => {
      if (isVoucherOnly) {
        return await this.buildVoucherOnlyReceiptBytes(ticket, width);
      }
      if (isKarinderya) {
        return await this.buildKarinderyaReceiptBytes(ticket, width);
      }
      return await this.buildCustomerReceiptBytes(ticket, width);
    };

    if (!enabledPrinters || enabledPrinters.length === 0) {
      const fallbackBytes = await getReceiptBytes("58mm");

      return [
        await this.dispatchToTarget(
          {
            id: "DEFAULT-LAN",
            name: "Default Primary Printer",
            type: "network",
            role: "primary",
            address: this.ip,
            port: this.port,
            paperWidth: "58mm"
          },
          fallbackBytes
        )
      ];
    }

    const dispatchPromises = [];

    for (const printer of enabledPrinters) {
      const width = printer.paperWidth || "58mm";
      const role = printer.role || "primary";

      if (role === "primary") {
        const custBytes = await getReceiptBytes(width);
        dispatchPromises.push(this.dispatchToTarget(printer, custBytes));
      } else if (role === "secondary") {
        const serverBytes = this.buildServerSlipBytes(ticket, width);
        dispatchPromises.push(this.dispatchToTarget(printer, serverBytes));
      } else if (role === "both") {
        const custBytes = await getReceiptBytes(width);
        const serverBytes = this.buildServerSlipBytes(ticket, width);

        const combinedBytes = new Uint8Array(custBytes.length + serverBytes.length);
        combinedBytes.set(custBytes, 0);
        combinedBytes.set(serverBytes, custBytes.length);

        dispatchPromises.push(this.dispatchToTarget(printer, combinedBytes));
      }
    }

    return await Promise.allSettled(dispatchPromises);
  },

  /**
   * Dispatches a dedicated Admin Master Wi-Fi Pass to all enabled receipt printers
   * @param {Object} voucher 
   * @param {Array<Object>|null} [enabledPrinters=null]
   * @returns {Promise<Array<Object>>}
   */
  async printAdminSlip(voucher, enabledPrinters = null) {
    const printers = enabledPrinters || await DB.getEnabledPrinters();
    if (!printers || printers.length === 0) {
      const bytes = await this.buildAdminWifiSlipBytes(voucher, "58mm");
      return [await this.dispatch(bytes)];
    }

    const promises = printers.map(async (p) => {
      const width = p.paperWidth || "58mm";
      const bytes = await this.buildAdminWifiSlipBytes(voucher, width);
      return await this.dispatchToTarget(p, bytes);
    });

    return await Promise.allSettled(promises);
  },

  /**
   * Dispatches a dedicated Crew Wi-Fi Pass to all enabled receipt printers
   * @param {Object} voucher 
   * @param {Array<Object>|null} [enabledPrinters=null]
   * @returns {Promise<Array<Object>>}
   */
  async printCrewSlip(voucher, enabledPrinters = null) {
    const printers = enabledPrinters || await DB.getEnabledPrinters();
    if (!printers || printers.length === 0) {
      const bytes = await this.buildCrewWifiSlipBytes(voucher, "58mm");
      return [await this.dispatch(bytes)];
    }

    const promises = printers.map(async (p) => {
      const width = p.paperWidth || "58mm";
      const bytes = await this.buildCrewWifiSlipBytes(voucher, width);
      return await this.dispatchToTarget(p, bytes);
    });

    return await Promise.allSettled(promises);
  },


  /**
   * Generates Customer Bill Slip / Statement of Account (SOA) ESC/POS bytes for table dining
   * @param {Object} table - Table record { name, section, seatedAt }
   * @param {Array<Object>} items - Active ticket items
   * @param {string} paperWidth - Paper format ('58mm' or '80mm')
   * @returns {Promise<Uint8Array>}
   */
  async buildBillSlipBytes(table, items, paperWidth = "58mm") {
    const is80mm = paperWidth === "80mm";
    const totalCols = is80mm ? 48 : 32;
    const divider = "-".repeat(totalCols) + "\n";
    const doubleDivider = "=".repeat(totalCols) + "\n";

    const store = await DB.getStoreSettings();

    const encoder = new TextEncoder();
    const buffer = [];

    const append = (bytes) => buffer.push(...bytes);
    const text = (str) => {
      const sanitized = str.replace(/₱/g, "P");
      append(encoder.encode(sanitized));
    };

    // 1. Initialize Printer (ESC @)
    append([0x1B, 0x40]);

    // 2. Center Align (ESC a 1)
    append([0x1B, 0x61, 0x01]);

    // Store Name: Double Height & Bold
    append([0x1B, 0x21, 0x20]);
    text(`${store.storeName || "RESTAURANT & CAFE"}\n`);
    append([0x1B, 0x21, 0x00]);

    if (store.storeAddress) text(`${store.storeAddress}\n`);
    if (store.storeContact) text(`Tel: ${store.storeContact}\n`);

    text(doubleDivider);
    append([0x1B, 0x45, 0x01]);
    text("*** BILL SLIP / STATEMENT ***\n");
    append([0x1B, 0x45, 0x00]);
    text("(NOT AN OFFICIAL RECEIPT)\n");
    text(divider);

    // 3. Left Align Table Info
    append([0x1B, 0x61, 0x00]);
    append([0x1B, 0x45, 0x01]);
    text(`TABLE: ${table.name || "Table"}${table.section ? " (" + table.section + ")" : ""}\n`);
    append([0x1B, 0x45, 0x00]);

    const now = new Date();
    text(`Date: ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`);
    if (table.seatedAt) {
      const seated = new Date(table.seatedAt);
      text(`Seated: ${seated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`);
    }
    text(divider);

    // 4. Pad Row Formatter
    const padRow = (col1, col2, col3) => {
      const c1Width = is80mm ? 24 : 16;
      const c2Width = is80mm ? 7 : 4;
      const c3Width = is80mm ? 15 : 10;

      const lines = this.wrapText(col1, c1Width);
      let output = "";

      lines.forEach((line, idx) => {
        const c1 = line.padEnd(c1Width, " ");
        const c2 = idx === 0 ? col2.padEnd(c2Width, " ") : " ".repeat(c2Width);
        const c3 = idx === 0 ? col3.padStart(c3Width, " ") : " ".repeat(c3Width);
        output += `${c1} ${c2} ${c3}\n`;
      });

      return output;
    };

    text(padRow("ITEM", "QTY", "TOTAL"));
    text(divider);

    let total = 0;
    if (Array.isArray(items)) {
      items.forEach((item) => {
        const name = item.name || "Item";
        const qty = `${item.qty}x`;
        const itemSub = (item.price || 0) * (item.qty || 1);
        total += itemSub;
        text(padRow(name, qty, `P${itemSub.toFixed(2)}`));
      });
    }

    text(divider);

    // 5. Right Align Total
    append([0x1B, 0x61, 0x02]);
    append([0x1B, 0x21, 0x18]); // Double height bold total
    text(`TOTAL AMOUNT: P${total.toFixed(2)}\n`);
    append([0x1B, 0x21, 0x00]);
    text(divider);

    // 6. Center Footer & Paper Cut
    append([0x1B, 0x61, 0x01]);
    text("Please present this slip at cashier.\nThank you for dining with us!\n");
    text("\n\n\n");
    append([0x1D, 0x56, 0x42, 0x00]);

    return new Uint8Array(buffer);
  },

  /**
   * Dispatches a Bill Slip / SOA to all enabled primary receipt printers
   * @param {Object} table 
   * @param {Array<Object>} items 
   * @param {Array<Object>|null} [enabledPrinters=null]
   * @returns {Promise<Array<Object>>}
   */
  async printBillSlip(table, items = [], enabledPrinters = null) {
    const printers = enabledPrinters || await DB.getEnabledPrinters();
    if (!printers || printers.length === 0) {
      const bytes = await this.buildBillSlipBytes(table, items, "58mm");
      return [await this.dispatch(bytes)];
    }

    const primaryPrinters = printers.filter(
      (p) => p.role === "primary" || p.role === "both"
    );
    const targets = primaryPrinters.length > 0 ? primaryPrinters : printers;

    const promises = targets.map(async (p) => {
      const width = p.paperWidth || "58mm";
      const bytes = await this.buildBillSlipBytes(table, items, width);
      return await this.dispatchToTarget(p, bytes);
    });

    return await Promise.allSettled(promises);
  },

  /**
   * Cash Drawer Kick Multi-Dispatch
   * @param {Array<Object>} enabledPrinters 
   * @returns {Promise<Array<Object>>}
   */
  async kickDrawer(enabledPrinters) {
    const kickBytes = this.buildDrawerKickBytes();

    if (!enabledPrinters || enabledPrinters.length === 0) {
      return await this.dispatchToTarget(
        {
          id: "DEFAULT-LAN",
          name: "Default Printer",
          type: "network",
          address: this.ip,
          port: this.port
        },
        kickBytes
      );
    }

    const primaryPrinters = enabledPrinters.filter(
      (p) => (p.role === "primary" || p.role === "both") && (p.type === "network" || p.type === "usb" || p.type === "all")
    );
    const targets = primaryPrinters.length > 0 ? primaryPrinters : [enabledPrinters[0]];

    const kickPromises = targets.map((printer) => this.dispatchToTarget(printer, kickBytes));
    return await Promise.allSettled(kickPromises);
  },

  /**
   * Diagnostic test execution for a designated role
   * @param {Object} printer 
   * @param {string|null} roleOverride 
   * @returns {Promise<Object>}
   */
  async testPrint(printer, roleOverride = null) {
    const role = roleOverride || printer.role || "primary";
    const width = printer.paperWidth || "58mm";
    const store = await DB.getStoreSettings();

    const sampleTicket = {
      orderNumber: "TEST-0001",
      cashierName: "Admin Test",
      pagerNumber: "08",
      items: [
        { name: "Caramel Macchiato Large", qty: 2, price: 130.0 },
        { name: "Special Pork Sisig Rice Plate", qty: 1, price: 165.0 }
      ],
      vatableSales: 379.46,
      vatAmount: 45.54,
      total: 425.0,
      paymentType: "TEST PRINT",
      voucher: store.hotspotEnabled ? {
        code: "7K49A",
        pin: "7K49A",
        uptime: store.hotspotUptime || "2h",
        rateLimit: store.hotspotRateLimit || "2M/5M",
        sharedUsers: store.hotspotSharedUsers || "1",
        qrUrl: `http://${store.hotspotRouterIp || "192.168.88.1"}/login?voucher=7K49A`
      } : null
    };

    if (role === "secondary") {
      const bytes = this.buildServerSlipBytes(sampleTicket, width);
      return await this.dispatchToTarget(printer, bytes);
    } else if (role === "both") {
      const custBytes = await this.buildCustomerReceiptBytes(sampleTicket, width);
      const serverBytes = this.buildServerSlipBytes(sampleTicket, width);
      const combined = new Uint8Array(custBytes.length + serverBytes.length);
      combined.set(custBytes, 0);
      combined.set(serverBytes, custBytes.length);
      return await this.dispatchToTarget(printer, combined);
    } else {
      const bytes = await this.buildCustomerReceiptBytes(sampleTicket, width);
      return await this.dispatchToTarget(printer, bytes);
    }
  },

  async dispatch(bytes) {
    return await this.dispatchToTarget(
      {
        id: "DEFAULT-LAN",
        name: "Default Printer",
        type: "network",
        address: this.ip,
        port: this.port,
        paperWidth: "58mm"
      },
      bytes
    );
  }
};

// REMARK: PRINTER_JS_KARINDERYA_OMIT_STORE_NAME_COMPLETE