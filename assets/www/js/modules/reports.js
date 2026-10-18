/**
 * Module Description: ESC/POS Financial Reporting & Shift Z-Reading Module
 * Generates thermal-formatted end-of-day sales summary reports, cash drawer reconciliations
 * (Initial Cash Float + Cash Sales = Expected Gross Cash in Drawer), non-cash GCash splits,
 * and statutory 12% VAT tax ledgers. Implements calibrated single-width typography (0x18)
 * to prevent line overflow on 58mm/80mm thermal mechanisms and dynamic word-boundary wrapping
 * to keep monetary figures and descriptive titles aligned without clipping.
 */

export const Reports = {
  /**
   * Splits a string into word-wrapped lines without breaking words
   * @param {string} text - Source text to wrap
   * @param {number} maxLen - Maximum character line width
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
   * Formats daily sales summary report into ESC/POS thermal command bytes
   * @param {Object} summary - Aggregated sales statistics { orderCount, grossSales, totalVat, cashSales, gcashSales, initialCash, grossCashDrawer }
   * @param {Object} activeUser - Generating cashier or manager record { id, name, role }
   * @param {string} paperWidth - Target printer paper width ('58mm' or '80mm')
   * @returns {Uint8Array}
   */
  buildDailyReportBytes(summary, activeUser, paperWidth = "58mm") {
    const is80mm = paperWidth === "80mm";
    const totalCols = is80mm ? 48 : 32;
    const divider = "-".repeat(totalCols) + "\n";
    const doubleDivider = "=".repeat(totalCols) + "\n";

    const encoder = new TextEncoder();
    const bytes = [];

    const append = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        bytes.push(arr[i]);
      }
    };

    const text = (str) => {
      const sanitized = str.replace(/₱/g, "P");
      append(encoder.encode(sanitized));
    };

    const ESC = 0x1b;
    const GS = 0x1d;

    // 1. Initialize printer (ESC @)
    append([ESC, 0x40]);

    // 2. Select Standard Character Code Table PC437 (ESC t 0)
    append([ESC, 0x74, 0x00]);

    // 3. Center alignment (ESC a 1)
    append([ESC, 0x61, 0x01]);

    // 4. Header: Double-Height + Bold, Single-Width (ESC ! 0x18) to fit 32 columns cleanly
    append([ESC, 0x21, 0x18]);
    text("DAILY SALES REPORT\n");

    // Reset Format (ESC ! 0x00)
    append([ESC, 0x21, 0x00]);
    text("POS REGISTER SUMMARY\n");
    text(doubleDivider);

    // 5. Left alignment (ESC a 0)
    append([ESC, 0x61, 0x00]);
    const now = new Date();
    text(`Date: ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\n`);
    
    const staffName = activeUser && activeUser.name ? activeUser.name : "System Administrator";
    const staffLines = this.wrapText(`Staff/Cashier: ${staffName}`, totalCols);
    staffLines.forEach((sl) => text(`${sl}\n`));

    if (summary && summary.shift && summary.shift.id) {
      text(`Shift ID: ${summary.shift.id}\n`);
    }
    text(divider);

    // Dynamic Multi-Line Formatter for Label-Value Pairs
    const formatMetricRow = (label, valStr) => {
      const valueFormatted = ` ${valStr}`;
      const availLabelWidth = Math.max(10, totalCols - valueFormatted.length);
      const labelLines = this.wrapText(label, availLabelWidth);
      let out = "";

      labelLines.forEach((l, idx) => {
        if (idx === 0) {
          const spaceCount = Math.max(0, totalCols - l.length - valueFormatted.length);
          out += l + " ".repeat(spaceCount) + valueFormatted + "\n";
        } else {
          out += l + "\n";
        }
      });

      return out;
    };

    const orderCount = summary && summary.orderCount ? summary.orderCount : 0;
    const grossSales = summary && typeof summary.grossSales === "number" ? summary.grossSales : 0;
    const totalVat = summary && typeof summary.totalVat === "number" ? summary.totalVat : 0;
    const vatableNet = Math.max(0, grossSales - totalVat);
    const cashSales = summary && typeof summary.cashSales === "number" ? summary.cashSales : 0;
    const gcashSales = summary && typeof summary.gcashSales === "number" ? summary.gcashSales : 0;
    const initialFloat = summary && typeof summary.initialCash === "number" ? summary.initialCash : 0;
    const grossDrawer = summary && typeof summary.grossCashDrawer === "number" 
      ? summary.grossCashDrawer 
      : (initialFloat + cashSales);

    // Sales Metrics Section
    text(formatMetricRow("Total Completed Orders:", String(orderCount)));
    text(formatMetricRow("Gross Sales (Net Voids):", `P${grossSales.toFixed(2)}`));
    text(formatMetricRow("VAT Collections (12%):", `P${totalVat.toFixed(2)}`));
    text(formatMetricRow("Vatable Net Sales:", `P${vatableNet.toFixed(2)}`));
    text(divider);

    // Payment Collections Breakdown
    text(formatMetricRow("Cash Sales Collected:", `P${cashSales.toFixed(2)}`));
    text(formatMetricRow("GCash Electronic Sales:", `P${gcashSales.toFixed(2)}`));
    text(divider);

    // Cash Drawer Reconciliation Breakdown
    text(formatMetricRow("Initial Cashier Float:", `P${initialFloat.toFixed(2)}`));
    
    append([ESC, 0x45, 0x01]); // Turn on bold
    text(formatMetricRow("Gross Cash in Drawer:", `P${grossDrawer.toFixed(2)}`));
    append([ESC, 0x45, 0x00]); // Turn off bold
    text(doubleDivider);

    // 6. Center Alignment Footer (ESC a 1)
    append([ESC, 0x61, 0x01]);
    text("[ END OF FINANCIAL REPORT ]\n\n\n\n");

    // 7. Partial Cut (GS V 66 0)
    append([GS, 0x56, 0x42, 0x00]);

    return new Uint8Array(bytes);
  }
};

// REMARK: REPORTS_JS_WORD_WRAP_AND_FONT_SCALING_COMPLETE