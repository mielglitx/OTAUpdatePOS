/**
 * Module Description: Checkout, Print Preview, Payment Processing & Granular Karinderya UI Controller
 * Orchestrates multi-ticket tab navigation, single-code MikroTik Wi-Fi voucher issuance
 * (with generous network timeouts preventing false-negative voucher drops on GCash and Cash sales),
 * granular Karinderya Mode workflows (independent execution for exact cash tender bypass,
 * GCash reference verification bypass, calling buzzer suppression, and compact thermal receipts
 * that omit store branding to conserve paper and expedite transactions), dynamic GCash QR generation,
 * on-screen voucher code displays, dual-screen customer display sync, non-blocking background
 * thermal printing dispatch, and programmatic virtual soft keyboard suppression on transaction resets.
 */

import { DB } from "./db.js";
import { Cart } from "./cart.js";
import { Session } from "./session.js";
import { GCashEMVCo } from "./gcash-emvco.js";
import { Printer } from "./printer.js";
import { Sync } from "./sync.js";
import { Bus } from "./bus.js";
import { MikrotikSync } from "./mikrotik-sync.js";

export const CheckoutUI = {
  elements: {},
  currentBill: null,
  selectedPagerNumber: null,
  customerDisplayWindow: null,
  previewPaperWidth: "58mm",
  initialized: false,

  /**
   * Initializes DOM selections and binds payment buttons, modal events, and listeners
   */
  init() {
    this.elements = {
      btnPayCash: document.getElementById("btn-pay-cash"),
      btnPayGCash: document.getElementById("btn-pay-gcash"),
      btnCustomerDisplay: document.getElementById("btn-customer-display"),
      btnPreviewTicket: document.getElementById("btn-preview-ticket"),
      ticketTabsList: document.getElementById("ticket-tabs-list"),
      btnNewTicket: document.getElementById("btn-new-ticket"),
      ticketIdLabel: document.getElementById("ticket-id"),

      // GCash Express QR Modal Elements
      modalGCash: document.getElementById("modal-gcash"),
      gcashQrWrapper: document.getElementById("gcash-qr-wrapper"),
      gcashUploadedQrImg: document.getElementById("gcash-uploaded-qr-img"),
      gcashMerchantNameLabel: document.getElementById("gcash-merchant-name-label"),
      gcashMerchantNumberLabel: document.getElementById("gcash-merchant-number-label"),
      qrContainer: document.getElementById("gcash-qrcode"),
      gcashAmountLabel: document.getElementById("gcash-amount-label"),
      btnCloseGCash: document.getElementById("btn-close-gcash"),
      btnConfirmGCash: document.getElementById("btn-confirm-gcash"),

      // Cash Confirmation Modal Elements
      modalCashConfirm: document.getElementById("modal-cash-confirm"),
      cashDueAmount: document.getElementById("cash-due-amount"),
      cashTenderedInput: document.getElementById("cash-tendered-input"),
      cashChangeAmount: document.getElementById("cash-change-amount"),
      cashErrorMsg: document.getElementById("cash-error-msg"),
      btnCancelCash: document.getElementById("btn-cancel-cash"),
      btnCancelCashX: document.getElementById("btn-cancel-cash-x"),
      btnFinalizeCash: document.getElementById("btn-finalize-cash"),
      quickCashButtons: document.querySelectorAll(".btn-quick-cash"),
      cashPagerContainer: document.getElementById("cash-pager-container"),
      cashPagerGrid: document.getElementById("cash-pager-grid"),
      cashPagerSelectedLabel: document.getElementById("cash-pager-selected-label"),

      // Post-Payment Cash Change Due & Voucher Result Modal Elements
      modalCashChangeResult: document.getElementById("modal-cash-change-result"),
      changeResultAmount: document.getElementById("change-result-amount"),
      changeResultTotal: document.getElementById("change-result-total"),
      changeResultTendered: document.getElementById("change-result-tendered"),
      changeResultPager: document.getElementById("change-result-pager"),
      changeResultPagerRow: document.getElementById("change-result-pager-row"),
      changeResultVoucherRow: document.getElementById("change-result-voucher-row"),
      changeResultVoucherCode: document.getElementById("change-result-voucher-code"),
      changeResultVoucherPin: document.getElementById("change-result-voucher-pin"),
      changeResultVoucherUptime: document.getElementById("change-result-voucher-uptime"),
      btnCloseChangeResult: document.getElementById("btn-close-change-result"),

      // GCash Verification Modal Elements
      modalGCashConfirm: document.getElementById("modal-gcash-confirm"),
      gcashRefInput: document.getElementById("gcash-ref-input"),
      gcashAmountPaidInput: document.getElementById("gcash-amount-paid-input"),
      gcashPaymentDateInput: document.getElementById("gcash-payment-date-input"),
      gcashConfirmError: document.getElementById("gcash-confirm-error"),
      btnCancelGCashConfirmX: document.getElementById("btn-cancel-gcash-confirm-x"),
      btnBackGCashConfirm: document.getElementById("btn-back-gcash-confirm"),
      btnFinalizeGCash: document.getElementById("btn-finalize-gcash"),
      gcashPagerContainer: document.getElementById("gcash-pager-container"),
      gcashPagerGrid: document.getElementById("gcash-pager-grid"),
      gcashPagerSelectedLabel: document.getElementById("gcash-pager-selected-label"),

      // Thermal Print Preview Modal Elements
      modalPrintPreview: document.getElementById("modal-print-preview"),
      previewCustomerReceipt: document.getElementById("preview-customer-receipt"),
      previewServerSlip: document.getElementById("preview-server-slip"),
      previewWidthSelect: document.getElementById("preview-width-select"),
      btnClosePreview: document.getElementById("btn-close-preview"),
      btnClosePreviewX: document.getElementById("btn-close-preview-x"),
      btnPrintFromPreview: document.getElementById("btn-print-from-preview")
    };

    // 1. Multiple Ticket Tabs Navigation
    if (this.elements.btnNewTicket) {
      this.elements.btnNewTicket.onclick = () => {
        Cart.createTicket();
      };
    }

    Bus.on("cart:tickets-changed", (data) => {
      this.renderTicketTabs(data);
    });

    // 2. Dual Monitor Customer Display Launcher
    if (this.elements.btnCustomerDisplay) {
      this.elements.btnCustomerDisplay.onclick = () => this.openCustomerDisplay();
    }

    // 3. Thermal Print Preview Workflow
    if (this.elements.btnPreviewTicket) {
      this.elements.btnPreviewTicket.onclick = () => this.openPrintPreview();
    }

    if (this.elements.btnClosePreview) {
      this.elements.btnClosePreview.onclick = () => this.closePrintPreview();
    }

    if (this.elements.btnClosePreviewX) {
      this.elements.btnClosePreviewX.onclick = () => this.closePrintPreview();
    }

    if (this.elements.previewWidthSelect) {
      this.elements.previewWidthSelect.onchange = () => {
        this.previewPaperWidth = this.elements.previewWidthSelect.value || "58mm";
        this.renderPrintPreview(this.previewPaperWidth);
      };
    }

    if (this.elements.btnPrintFromPreview) {
      this.elements.btnPrintFromPreview.onclick = async () => {
        const bill = Cart.items.length > 0 ? Cart.calculate() : null;
        if (!bill || bill.items.length === 0) {
          alert("Cart is empty. Please add items to ticket to print physically.");
          return;
        }
        const activeCashier = Session.get() || { id: "STAFF-01", name: "Cashier" };
        const enabledPrinters = await DB.getEnabledPrinters();
        const store = await DB.getStoreSettings();

        let previewVoucher = null;
        if (store.hotspotEnabled) {
          const sampleCode = "7K49A";
          const host = (store.hotspotDomain || store.hotspotRouterIp || "hotspot.danielacafecuisine.local").trim();
          previewVoucher = {
            code: sampleCode,
            pin: sampleCode,
            uptime: store.hotspotUptime || "2h",
            qrUrl: `http://${host}/login?voucher=${sampleCode}`
          };
        }

        const isCompact = Boolean(store.karinderyaMode && store.karinderyaCompactReceipt !== false);

        Printer.broadcastReceipt(enabledPrinters, {
          ...bill,
          orderNumber: `PREV-${Date.now().toString().slice(-4)}`,
          cashierName: activeCashier.name,
          paymentType: "TEST PRINT",
          pagerNumber: this.selectedPagerNumber || "01",
          voucher: previewVoucher,
          karinderyaMode: isCompact
        }).catch((err) => console.warn("[Print Preview Error]:", err));

        alert("Preview receipt sent to paired printers.");
      };
    }

    // 4. Cash Payment Workflow
    if (this.elements.btnPayCash) {
      this.elements.btnPayCash.onclick = () => this.openCashConfirmationModal();
    }

    if (this.elements.btnCancelCash) {
      this.elements.btnCancelCash.onclick = () => this.closeCashConfirmationModal();
    }

    if (this.elements.btnCancelCashX) {
      this.elements.btnCancelCashX.onclick = () => this.closeCashConfirmationModal();
    }

    if (this.elements.cashTenderedInput) {
      this.elements.cashTenderedInput.oninput = () => this.calculateCashChange();
      this.elements.cashTenderedInput.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.handleCashFinalize(false);
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.closeCashConfirmationModal();
        }
      };
    }

    if (this.elements.quickCashButtons) {
      this.elements.quickCashButtons.forEach((btn) => {
        btn.onclick = () => this.handleQuickCashClick(btn.dataset.val);
      });
    }

    if (this.elements.btnFinalizeCash) {
      this.elements.btnFinalizeCash.onclick = () => this.handleCashFinalize(false);
    }

    // 5. Post-Payment Cash Change Result Modal Dismissal
    if (this.elements.btnCloseChangeResult) {
      this.elements.btnCloseChangeResult.onclick = () => this.closeChangeResultModal();
    }

    // 6. GCash QR Code Workflow
    if (this.elements.btnPayGCash) {
      this.elements.btnPayGCash.onclick = () => this.openGCashModal();
    }

    if (this.elements.btnCloseGCash) {
      this.elements.btnCloseGCash.onclick = () => this.closeGCashModal();
    }

    if (this.elements.btnConfirmGCash) {
      this.elements.btnConfirmGCash.onclick = async () => {
        const store = await DB.getStoreSettings();
        const isAutoGCash = Boolean(store.karinderyaMode && store.karinderyaAutoGCash !== false);

        if (isAutoGCash) {
          await this.handleGCashFinalize(true);
        } else {
          this.openGCashVerificationModal();
        }
      };
    }

    // 7. GCash Verification Workflow
    if (this.elements.btnCancelGCashConfirmX) {
      this.elements.btnCancelGCashConfirmX.onclick = () => this.closeGCashVerificationModal();
    }

    if (this.elements.btnBackGCashConfirm) {
      this.elements.btnBackGCashConfirm.onclick = () => {
        this.closeGCashVerificationModal();
        if (this.elements.modalGCash && typeof this.elements.modalGCash.showModal === "function") {
          this.elements.modalGCash.showModal();
        }
      };
    }

    if (this.elements.btnFinalizeGCash) {
      this.elements.btnFinalizeGCash.onclick = () => this.handleGCashFinalize(false);
    }

    if (this.elements.gcashRefInput) {
      this.elements.gcashRefInput.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.handleGCashFinalize(false);
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.closeGCashVerificationModal();
        }
      };
    }

    if (this.initialized) return;
    this.initialized = true;

    Cart.emitTicketsChanged();

    // Global keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      if (this.elements.modalCashChangeResult && this.elements.modalCashChangeResult.open) {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          this.closeChangeResultModal();
          return;
        }
      }

      const loginScreen = document.getElementById("login-screen");
      const isLocked = loginScreen && !loginScreen.classList.contains("hidden");
      if (isLocked) return;

      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      if (activeTag === "input" || activeTag === "select" || activeTag === "textarea") return;

      if (e.key === "F8") {
        e.preventDefault();
        this.openCashConfirmationModal();
      } else if (e.key === "F9") {
        e.preventDefault();
        this.openGCashModal();
      }
    });
  },

  /**
   * Renders the horizontal ticket tab strip in the ticket panel
   * @param {Object} data - { tickets, activeTicketId, activeLabel }
   */
  renderTicketTabs(data) {
    if (!this.elements.ticketTabsList) return;

    if (this.elements.ticketIdLabel && data.activeLabel) {
      this.elements.ticketIdLabel.textContent = data.activeLabel;
    }

    this.elements.ticketTabsList.innerHTML = data.tickets.map((t) => {
      const activeClass = t.isActive ? "active" : "";
      const countPill = t.itemCount > 0 ? `<span class="ticket-tab-count">${t.itemCount}</span>` : "";
      const closeBtn = data.tickets.length > 1
        ? `<span class="ticket-tab-close" data-close-id="${t.id}" title="Close tab">×</span>`
        : "";

      return `
        <button type="button" class="ticket-tab ${activeClass}" data-ticket-id="${t.id}">
          <span class="ticket-tab-title">${t.label}</span>
          ${countPill}
          ${closeBtn}
        </button>
      `;
    }).join("");

    this.elements.ticketTabsList.querySelectorAll(".ticket-tab").forEach((tabBtn) => {
      tabBtn.onclick = (e) => {
        const closeTarget = e.target.closest(".ticket-tab-close");
        if (closeTarget) {
          e.stopPropagation();
          const targetId = closeTarget.dataset.closeId;
          if (confirm("Close this order tab? Unsaved items will be removed.")) {
            Cart.closeTicket(targetId);
          }
          return;
        }
        Cart.switchTicket(tabBtn.dataset.ticketId);
      };
    });
  },

  /**
   * Closes the transaction completion result modal.
   * Suppresses the mobile soft keyboard while keeping the barcode input focused for hardware scanning.
   */
  closeChangeResultModal() {
    if (this.elements.modalCashChangeResult && this.elements.modalCashChangeResult.open) {
      this.elements.modalCashChangeResult.close();
    }
    const barcodeInput = document.getElementById("barcode-input");
    if (barcodeInput) {
      // Ensure inputmode is set to none so Android and iOS soft keyboards do not pop up
      if (!barcodeInput.dataset.manualInput) {
        barcodeInput.setAttribute("inputmode", "none");
      }
      barcodeInput.focus({ preventScroll: true });
    }
  },

  async openCustomerDisplay() {
    if (this.customerDisplayWindow && !this.customerDisplayWindow.closed) {
      this.customerDisplayWindow.focus();
      return;
    }

    const w = 1024;
    const h = 768;
    const left = window.screen.availLeft + (window.screen.availWidth || 1920);
    const top = 50;

    this.customerDisplayWindow = window.open(
      "customer-display.html",
      "CustomerDisplayWindow",
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );

    const store = await DB.getStoreSettings();
    setTimeout(() => {
      Cart.broadcastToCustomer({
        type: "store:updated",
        data: store
      });
      Cart.notify();
    }, 600);
  },

  async openPrintPreview() {
    if (!this.elements.modalPrintPreview) return;

    if (this.elements.previewWidthSelect) {
      this.previewPaperWidth = this.elements.previewWidthSelect.value || "58mm";
    }

    await this.renderPrintPreview(this.previewPaperWidth);

    if (typeof this.elements.modalPrintPreview.showModal === "function") {
      this.elements.modalPrintPreview.showModal();
    }
  },

  closePrintPreview() {
    if (this.elements.modalPrintPreview && this.elements.modalPrintPreview.open) {
      this.elements.modalPrintPreview.close();
    }
  },

  async renderPrintPreview(paperWidth = "58mm") {
    if (!this.elements.previewCustomerReceipt || !this.elements.previewServerSlip) return;

    const is80mm = paperWidth === "80mm";
    const store = await DB.getStoreSettings();
    const activeCashier = Session.get() || { id: "STAFF-01", name: "Cashier" };
    const host = (store.hotspotDomain || store.hotspotRouterIp || "hotspot.danielacafecuisine.local").trim();
    const isCompact = Boolean(store.karinderyaMode && store.karinderyaCompactReceipt !== false);

    let ticket = Cart.items.length > 0 ? Cart.calculate() : null;
    let isSample = false;

    if (!ticket || ticket.items.length === 0) {
      isSample = true;
      ticket = {
        orderNumber: "ORD-984210",
        cashierName: activeCashier.name || "Cashier",
        timestamp: new Date().toISOString(),
        items: [
          { name: "Caramel Macchiato", qty: 2, price: 130.0 },
          { name: "Pork Sisig Rice", qty: 1, price: 165.0 },
          { name: "Choco Crinkles", qty: 3, price: 75.0 }
        ],
        vatableSales: 580.36,
        vatAmount: 69.64,
        total: 650.0,
        paymentType: "CASH",
        amountTendered: 1000.0,
        changeAmount: 350.0,
        pagerNumber: this.selectedPagerNumber || "07",
        voucher: store.hotspotEnabled ? {
          code: "7K49A",
          pin: "7K49A",
          uptime: store.hotspotUptime || "2h",
          qrUrl: `http://${host}/login?voucher=7K49A`
        } : null,
        karinderyaMode: isCompact
      };
    } else {
      ticket = {
        ...ticket,
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
        cashierName: activeCashier.name,
        paymentType: "CASH",
        amountTendered: this.elements.cashTenderedInput ? parseFloat(this.elements.cashTenderedInput.value) || ticket.total : ticket.total,
        changeAmount: this.elements.cashTenderedInput ? Math.max(0, (parseFloat(this.elements.cashTenderedInput.value) || 0) - ticket.total) : 0,
        pagerNumber: this.selectedPagerNumber || (store.useNumberPager ? "01" : null),
        voucher: store.hotspotEnabled ? {
          code: "8M22X",
          pin: "8M22X",
          uptime: store.hotspotUptime || "2h",
          qrUrl: `http://${host}/login?voucher=8M22X`
        } : null,
        karinderyaMode: isCompact
      };
    }

    const containerWidthClass = is80mm ? "thermal-paper-80mm" : "thermal-paper-58mm";
    this.elements.previewCustomerReceipt.className = `thermal-paper-slip ${containerWidthClass}`;
    this.elements.previewServerSlip.className = `thermal-paper-slip ${containerWidthClass}`;

    this.elements.previewCustomerReceipt.innerHTML = this.formatCustomerReceiptHtml(ticket, store, is80mm, isSample);
    this.elements.previewServerSlip.innerHTML = this.formatServerSlipHtml(ticket, is80mm, isSample);
  },

  formatCustomerReceiptHtml(ticket, store, is80mm, isSample) {
    const totalCols = is80mm ? 48 : 32;
    const divider = "-".repeat(totalCols);
    const dblDivider = "=".repeat(totalCols);

    const padRow = (name, qty, total) => {
      const nMax = is80mm ? 24 : 16;
      const qMax = is80mm ? 7 : 4;
      const tMax = is80mm ? 15 : 10;
      const c1 = (name || "Item").padEnd(nMax, " ").slice(0, nMax);
      const c2 = String(qty).padStart(qMax, " ").slice(0, qMax);
      const c3 = String(total).padStart(tMax, " ").slice(0, tMax);
      return `${c1} ${c2} ${c3}`;
    };

    let itemsHtml = "";
    if (Array.isArray(ticket.items)) {
      itemsHtml = ticket.items.map((i) => {
        const lineTotal = `₱${((Number(i.price) || 0) * (i.qty || 1)).toFixed(2)}`;
        return padRow(i.name, `${i.qty}x`, lineTotal);
      }).join("\n");
    }

    let wifiVoucherHtml = "";
    if (ticket.voucher) {
      const host = (store.hotspotDomain || store.hotspotRouterIp || "hotspot.danielacafecuisine.local").trim();
      const qrTarget = ticket.voucher.qrUrl || `http://${host}/login?voucher=${encodeURIComponent(ticket.voucher.code)}`;

      wifiVoucherHtml = `
<div class="receipt-divider">${dblDivider}</div>
<div class="receipt-center receipt-dbl-height"><b>FREE CUSTOMER WI-FI</b></div>
<div class="receipt-center">Scan QR with camera or enter code:</div>
<div class="receipt-center receipt-qr-box">
  <div class="receipt-sim-qr">[ QR: ONE-TOUCH LOGIN ]</div>
  <div class="receipt-qr-caption">${qrTarget}</div>
</div>
<div class="receipt-voucher-details">
  <div style="font-size:1.15em; margin: 4px 0;">Voucher Code : <b>${ticket.voucher.code}</b></div>
  <div>Duration     : ${ticket.voucher.uptime || "2 Hours"} (1 Device)</div>
</div>
<div class="receipt-center receipt-small-hint">Valid for 1 device. Single-use access pass.</div>
`;
    }

    // COMPACT RECEIPT FORMAT: Store name, branding logo, tax breakdowns, and footers omitted
    if (ticket.karinderyaMode) {
      return `
${isSample ? '<div class="receipt-sample-tag">[ COMPACT PREVIEW ]</div>' : ''}
<div class="receipt-center receipt-dbl-height"><b>ORDER: ${ticket.orderNumber || "ORD-000000"}</b></div>
<div class="receipt-center">Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
<div class="receipt-divider">${divider}</div>
<div>${padRow("ITEM", "QTY", "TOTAL")}</div>
<div class="receipt-divider">${divider}</div>
<pre class="receipt-items-pre">${itemsHtml}</pre>
<div class="receipt-divider">${divider}</div>
<div class="receipt-right receipt-total-line"><b>TOTAL AMOUNT: ₱${Number(ticket.total || 0).toFixed(2)}</b></div>
${wifiVoucherHtml}
<div class="receipt-cut-line">┈┈┈┈┈┈┈┈┈┈┈ [ CUT PAPER ] ┈┈┈┈┈┈┈┈┈┈┈</div>
`;
    }

    // STANDARD OFFICIAL RECEIPT FORMAT
    const buzzerCallout = ticket.pagerNumber ? `
<div class="receipt-divider">${divider}</div>
<div class="receipt-center receipt-pager-box">
  <span class="receipt-dbl-height">BUZZER #${ticket.pagerNumber}</span>
</div>` : "";

    const logoHtml = store.logoBase64
      ? `<div class="receipt-center"><img src="${store.logoBase64}" class="receipt-logo-img" alt="Logo" /></div>`
      : "";

    return `
${isSample ? '<div class="receipt-sample-tag">[ SAMPLE PREVIEW ]</div>' : ''}
${logoHtml}
<div class="receipt-center receipt-dbl-height"><b>${(store.storeName || "DANIELA CAFE & CUISINE").toUpperCase()}</b></div>
${store.companyName ? `<div class="receipt-center">${store.companyName}</div>` : ''}
${store.address ? `<div class="receipt-center">${store.address}</div>` : ''}
${store.contactNumber ? `<div class="receipt-center">Tel: ${store.contactNumber}</div>` : ''}
<div class="receipt-divider">${dblDivider}</div>
<div class="receipt-center"><b>[ CUSTOMER OFFICIAL RECEIPT ]</b></div>
<div>Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
<div>Order: ${ticket.orderNumber || "ORD-000000"}</div>
<div>Cashier: ${ticket.cashierName || "Cashier"}</div>
${buzzerCallout}
<div class="receipt-divider">${divider}</div>
<div>${padRow("ITEM", "QTY", "TOTAL")}</div>
<div class="receipt-divider">${divider}</div>
<pre class="receipt-items-pre">${itemsHtml}</pre>
<div class="receipt-divider">${divider}</div>
<div class="receipt-right">Vatable Sales: ₱${Number(ticket.vatableSales || 0).toFixed(2)}</div>
<div class="receipt-right">VAT Amount (12%): ₱${Number(ticket.vatAmount || 0).toFixed(2)}</div>
<div class="receipt-right receipt-total-line"><b>TOTAL AMOUNT: ₱${Number(ticket.total || 0).toFixed(2)}</b></div>
<div class="receipt-right">Payment Mode: ${ticket.paymentType || "CASH"}</div>
${ticket.amountTendered ? `<div class="receipt-right">Amount Tendered: ₱${Number(ticket.amountTendered).toFixed(2)}</div>` : ''}
${ticket.changeAmount !== null && ticket.changeAmount !== undefined ? `<div class="receipt-right">Change: ₱${Number(ticket.changeAmount).toFixed(2)}</div>` : ''}
${wifiVoucherHtml}
<div class="receipt-divider">${dblDivider}</div>
${store.tagline ? `<div class="receipt-center">"${store.tagline}"</div>` : ''}
<div class="receipt-center">Thank you for your purchase!</div>
<div class="receipt-center">Please visit us again.</div>
<div class="receipt-cut-line">┈┈┈┈┈┈┈┈┈┈┈ [ CUT PAPER ] ┈┈┈┈┈┈┈┈┈┈┈</div>
`;
  },

  formatServerSlipHtml(ticket, is80mm, isSample) {
    const totalCols = is80mm ? 48 : 32;
    const divider = "-".repeat(totalCols);
    const dblDivider = "=".repeat(totalCols);

    let totalUnits = 0;
    const padServerRow = (qtyStr, nameStr) => {
      const qMax = is80mm ? 10 : 6;
      const nMax = is80mm ? 38 : 26;
      const c1 = qtyStr.padEnd(qMax, " ").slice(0, qMax);
      const c2 = nameStr.padEnd(nMax, " ").slice(0, nMax);
      return `${c1}${c2}`;
    };

    let itemsHtml = "";
    if (Array.isArray(ticket.items)) {
      itemsHtml = ticket.items.map((i) => {
        const qty = i.qty || 1;
        totalUnits += qty;
        return padServerRow(`[ ${qty}x ]`, i.name || "Item");
      }).join("\n");
    }

    const buzzerCallout = ticket.pagerNumber ? `
<div class="receipt-divider">${divider}</div>
<div class="receipt-center receipt-pager-box">
  <span class="receipt-dbl-height">BUZZER #${ticket.pagerNumber}</span>
</div>` : "";

    return `
${isSample ? '<div class="receipt-sample-tag">[ SAMPLE PREVIEW ]</div>' : ''}
<div class="receipt-center receipt-dbl-height"><b>*** SERVER SLIP ***</b></div>
<div class="receipt-center"><b>ORDER: ${ticket.orderNumber || "ORD-000000"}</b></div>
${buzzerCallout}
<div>Time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
<div>Server/Cashier: ${ticket.cashierName || "Cashier"}</div>
<div class="receipt-divider">${dblDivider}</div>
<div>${padServerRow("QTY", "ORDER DETAILS")}</div>
<div class="receipt-divider">${divider}</div>
<pre class="receipt-items-pre receipt-bold-items">${itemsHtml}</pre>
<div class="receipt-divider">${divider}</div>
<div class="receipt-center receipt-bold-items">TOTAL UNITS ORDERED: ${totalUnits}</div>
<div class="receipt-divider">${dblDivider}</div>
<div class="receipt-center">[ SERVER / PREPARATION COPY ]</div>
<div class="receipt-cut-line">┈┈┈┈┈┈┈┈┈┈┈ [ CUT PAPER ] ┈┈┈┈┈┈┈┈┈┈┈</div>
`;
  },

  async renderPagerGrid(containerEl, gridEl, labelEl) {
    if (!containerEl || !gridEl) return;
    const store = await DB.getStoreSettings();

    // Granular buzzer suppression: active only when karinderyaMode AND karinderyaSuppressPager are enabled
    const isPagerSuppressed = Boolean(store.karinderyaMode && store.karinderyaSuppressPager !== false);

    if (isPagerSuppressed || !store.useNumberPager) {
      containerEl.classList.add("hidden");
      gridEl.innerHTML = "";
      this.selectedPagerNumber = null;
      if (labelEl) labelEl.textContent = "None";
      return;
    }

    containerEl.classList.remove("hidden");
    const totalBuzzers = Math.max(1, parseInt(store.pagerCount, 10) || 24);
    let buttonsHtml = "";

    for (let i = 1; i <= totalBuzzers; i++) {
      const numStr = String(i).padStart(2, "0");
      buttonsHtml += `<button type="button" class="btn-pager-num" data-val="${numStr}">${numStr}</button>`;
    }
    gridEl.innerHTML = buttonsHtml;

    gridEl.querySelectorAll(".btn-pager-num").forEach((btn) => {
      btn.onclick = () => {
        const val = btn.dataset.val;
        if (this.selectedPagerNumber === val) {
          this.selectedPagerNumber = null;
          btn.classList.remove("active");
          if (labelEl) labelEl.textContent = "None";
        } else {
          this.selectedPagerNumber = val;
          gridEl.querySelectorAll(".btn-pager-num").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          if (labelEl) labelEl.textContent = `#${val}`;
        }

        Cart.broadcastToCustomer({
          type: "checkout:updated",
          data: {
            pagerNumber: this.selectedPagerNumber
          }
        });
      };
    });
  },

  async openCashConfirmationModal() {
    const bill = Cart.calculate();
    if (bill.total <= 0) {
      alert("Cart is empty. Add products first.");
      return;
    }

    this.currentBill = bill;
    this.selectedPagerNumber = null;

    const store = await DB.getStoreSettings();
    const isAutoCash = Boolean(store.karinderyaMode && store.karinderyaAutoCash !== false);

    // Granular Fast-Cash: Auto-finalize assuming exact cash without showing tender dialog
    if (isAutoCash) {
      await this.handleCashFinalize(true);
      return;
    }

    if (this.elements.cashDueAmount) {
      this.elements.cashDueAmount.textContent = `₱${bill.total.toFixed(2)}`;
    }

    if (this.elements.cashTenderedInput) {
      this.elements.cashTenderedInput.value = "";
    }

    if (this.elements.cashChangeAmount) {
      this.elements.cashChangeAmount.textContent = "₱0.00";
    }

    if (this.elements.cashErrorMsg) {
      this.elements.cashErrorMsg.textContent = "";
    }

    if (this.elements.cashPagerSelectedLabel) {
      this.elements.cashPagerSelectedLabel.textContent = "None";
    }

    await this.renderPagerGrid(
      this.elements.cashPagerContainer,
      this.elements.cashPagerGrid,
      this.elements.cashPagerSelectedLabel
    );

    Cart.broadcastToCustomer({
      type: "checkout:updated",
      data: {
        pagerNumber: null,
        tendered: null,
        change: null
      }
    });

    if (this.elements.modalCashConfirm && typeof this.elements.modalCashConfirm.showModal === "function") {
      this.elements.modalCashConfirm.showModal();
      setTimeout(() => {
        if (this.elements.cashTenderedInput) {
          this.elements.cashTenderedInput.focus();
        }
      }, 100);
    }
  },

  closeCashConfirmationModal() {
    if (this.elements.modalCashConfirm && this.elements.modalCashConfirm.open) {
      this.elements.modalCashConfirm.close();
    }
    this.currentBill = null;
    this.selectedPagerNumber = null;
  },

  handleQuickCashClick(value) {
    if (!this.currentBill) return;

    if (value === "exact") {
      this.elements.cashTenderedInput.value = this.currentBill.total.toFixed(2);
    } else {
      const denom = parseFloat(value);
      if (!isNaN(denom)) {
        this.elements.cashTenderedInput.value = denom.toFixed(2);
      }
    }

    this.calculateCashChange();
  },

  calculateCashChange() {
    if (!this.currentBill) return;

    const due = this.currentBill.total;
    const tendered = parseFloat(this.elements.cashTenderedInput.value) || 0;
    const change = tendered - due;

    if (this.elements.cashErrorMsg) {
      this.elements.cashErrorMsg.textContent = "";
    }

    if (change >= 0) {
      this.elements.cashChangeAmount.textContent = `₱${change.toFixed(2)}`;
      this.elements.cashChangeAmount.style.color = "#15803d";
    } else {
      this.elements.cashChangeAmount.textContent = "₱0.00";
      this.elements.cashChangeAmount.style.color = "#b91c1c";
    }

    Cart.broadcastToCustomer({
      type: "checkout:updated",
      data: {
        pagerNumber: this.selectedPagerNumber,
        tendered: tendered > 0 ? tendered : null,
        change: change >= 0 ? change : 0
      }
    });
  },

  /**
   * Fast-Path Cash Finalize:
   * Commits to IndexedDB and triggers Change Due UI in <50ms.
   * Printing, cash drawer kick, and cloud sync run concurrently in the background.
   * @param {boolean} isExact - When true, assumes exact cash tendered without prompts
   */
  async handleCashFinalize(isExact = false) {
    if (!this.currentBill) {
      this.currentBill = Cart.calculate();
    }

    const bill = this.currentBill;
    const store = await DB.getStoreSettings();
    const isAutoCash = isExact || Boolean(store.karinderyaMode && store.karinderyaAutoCash !== false);
    const isCompactReceipt = Boolean(store.karinderyaMode && store.karinderyaCompactReceipt !== false);
    const isVoucherOnly = Boolean(store.karinderyaMode && store.karinderyaVoucherOnly);

    let tendered = 0;
    if (isAutoCash) {
      tendered = bill.total;
    } else {
      tendered = parseFloat(this.elements.cashTenderedInput.value);
      if (isNaN(tendered) || tendered < bill.total) {
        if (this.elements.cashErrorMsg) {
          this.elements.cashErrorMsg.textContent = "Tendered cash is insufficient to cover the total amount due.";
        }
        if (this.elements.cashTenderedInput) {
          this.elements.cashTenderedInput.focus();
        }
        return;
      }
    }

    const change = isAutoCash ? 0.0 : Math.max(0, tendered - bill.total);
    const activeCashier = Session.get() || { id: "STAFF-01", name: "Cashier" };
    const isPagerSuppressed = Boolean(store.karinderyaMode && store.karinderyaSuppressPager !== false);
    const pagerNumber = isPagerSuppressed ? null : (this.selectedPagerNumber || null);
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

    // 1. Resilient voucher resolution: Allows up to 3500ms for RouterOS REST before fallback to offline pool
    let voucher = null;
    if (store.hotspotEnabled) {
      try {
        const livePromise = MikrotikSync.issueHybridVoucher(orderNumber, null, store.hotspotSharedUsers);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3500));
        voucher = await Promise.race([livePromise, timeoutPromise]);
      } catch (e) {
        const pooled = await DB.getNextAvailableVoucher();
        if (pooled) {
          voucher = await DB.consumeLocalVoucher(pooled.code, orderNumber);
          const isUnl = String(store.hotspotSharedUsers || "1") === "unlimited" || String(store.hotspotSharedUsers || "1") === "0";
          voucher.sharedUsers = isUnl ? "unlimited" : "1";
          voucher.source = "POOL";
        } else {
          const { code } = MikrotikSync.generateVoucherCredentials();
          const qrUrl = MikrotikSync.buildAutoLoginUrl(store, code);
          const isUnl = String(store.hotspotSharedUsers || "1") === "unlimited" || String(store.hotspotSharedUsers || "1") === "0";
          voucher = {
            id: `VOUCH-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            code,
            pin: code,
            qrUrl,
            uptime: store.hotspotUptime || "2h",
            rateLimit: store.hotspotRateLimit || "Default",
            sharedUsers: isUnl ? "unlimited" : "1",
            status: "CONSUMED",
            orderNumber,
            source: "LOCAL_FALLBACK",
            createdAt: new Date().toISOString(),
            consumedAt: new Date().toISOString()
          };
          await DB.instance.vouchers.put(voucher);
        }
      }
    }

    try {
      const activeTicket = Cart.getActiveTicket();
      const tableId = bill.tableId || (activeTicket ? activeTicket.tableId : null);
      const tableName = bill.tableName || (activeTicket ? activeTicket.tableName : null);
      const tableSection = bill.tableSection || (activeTicket ? activeTicket.tableSection : null);

      // 2. Commit transaction to local IndexedDB
      const savedOrder = await DB.saveOrder({
        orderNumber,
        cashierId: activeCashier.id,
        cashierName: activeCashier.name,
        items: bill.items,
        vatableSales: bill.vatableSales,
        vatAmount: bill.vatAmount,
        total: bill.total,
        paymentType: "CASH",
        amountTendered: tendered,
        changeAmount: change,
        pagerNumber,
        voucher,
        tableId,
        tableName,
        tableSection
      });

      // 3. Immediately refresh inventory UI & active cart ticket
      Bus.emit("inventory:updated");

      const receiptTicket = {
        ...bill,
        orderNumber: savedOrder.orderNumber,
        cashierName: activeCashier.name,
        paymentType: "CASH",
        amountTendered: tendered,
        changeAmount: change,
        pagerNumber,
        voucher,
        tableId,
        tableName,
        tableSection,
        karinderyaMode: isCompactReceipt,
        karinderyaVoucherOnly: isVoucherOnly
      };

      // 4. Detached background dispatch: Hardware printing & drawer kick run without blocking UI
      (async () => {
        try {
          const enabledPrinters = await DB.getEnabledPrinters();
          const localDrawer = localStorage.getItem("pos_auto_open_drawer");

          // Strict cash drawer kick authorization:
          // If store.autoOpenDrawer is explicitly disabled, or localDrawer is explicitly disabled,
          // DO NOT kick the drawer under any circumstances.
          const isStoreDisabled = 
            store.autoOpenDrawer === false || 
            store.autoOpenDrawer === "false" || 
            store.autoOpenDrawer === 0 || 
            store.autoOpenDrawer === "0";

          const isLocalDisabled = 
            localDrawer === "false" || 
            localDrawer === "0" || 
            localDrawer === false;

          let shouldKickDrawer = true;
          if (isStoreDisabled || isLocalDisabled) {
            shouldKickDrawer = false;
          } else if (localDrawer === "true" || localDrawer === true) {
            shouldKickDrawer = true;
          } else {
            shouldKickDrawer = store.autoOpenDrawer !== false && store.autoOpenDrawer !== "false";
          }

          console.log(`[Cash Checkout] Drawer kick decision: ${shouldKickDrawer} (store.autoOpenDrawer=${store.autoOpenDrawer}, localDrawer=${localDrawer})`);

          const tasks = [Printer.broadcastReceipt(enabledPrinters, receiptTicket)];
          if (shouldKickDrawer) {
            tasks.push(Printer.kickDrawer(enabledPrinters));
          }
          await Promise.allSettled(tasks);
        } catch (printErr) {
          console.warn("[Background Print Dispatch Warning]:", printErr);
        }
        Sync.pushPendingOrders({ silent: true }).catch(() => {});
      })();

      // 5. Broadcast to customer display
      Cart.broadcastToCustomer({
        type: "checkout:updated",
        data: {
          pagerNumber,
          tendered,
          change: Math.max(0, change)
        }
      });

      // 6. Dismiss input modal & open Change Due Result Modal instantly
      this.closeCashConfirmationModal();

      if (this.elements.changeResultAmount) {
        this.elements.changeResultAmount.textContent = `₱${change.toFixed(2)}`;
      }
      if (this.elements.changeResultTotal) {
        this.elements.changeResultTotal.textContent = `₱${bill.total.toFixed(2)}`;
      }
      if (this.elements.changeResultTendered) {
        this.elements.changeResultTendered.textContent = `₱${tendered.toFixed(2)}${isAutoCash ? " (Fast Mode Cash)" : ""}`;
      }
      if (this.elements.changeResultPager) {
        if (pagerNumber) {
          this.elements.changeResultPager.textContent = `#${pagerNumber}`;
          if (this.elements.changeResultPagerRow) {
            this.elements.changeResultPagerRow.classList.remove("hidden");
          }
        } else if (this.elements.changeResultPagerRow) {
          this.elements.changeResultPagerRow.classList.add("hidden");
        }
      }

      if (voucher) {
        if (this.elements.changeResultVoucherRow) this.elements.changeResultVoucherRow.classList.remove("hidden");
        if (this.elements.changeResultVoucherCode) this.elements.changeResultVoucherCode.textContent = voucher.code;
        if (this.elements.changeResultVoucherPin) this.elements.changeResultVoucherPin.textContent = voucher.code;
        if (this.elements.changeResultVoucherUptime) this.elements.changeResultVoucherUptime.textContent = voucher.uptime || "2h";
      } else if (this.elements.changeResultVoucherRow) {
        this.elements.changeResultVoucherRow.classList.add("hidden");
      }

      if (this.elements.modalCashChangeResult && typeof this.elements.modalCashChangeResult.showModal === "function") {
        this.elements.modalCashChangeResult.showModal();
        setTimeout(() => {
          if (this.elements.btnCloseChangeResult) {
            this.elements.btnCloseChangeResult.focus();
          }
        }, 100);
      }

      // 7. Clear or advance active ticket
      const activeTicketId = Cart.activeTicketId;
      if (Cart.tickets.length > 1) {
        Cart.closeTicket(activeTicketId);
      } else {
        Cart.clear();
      }

      // Auto-clear table occupancy if enabled
      if (tableId) {
        try {
          const tableSettings = await DB.getTableSettings();
          if (tableSettings.autoClearOnPayment !== false) {
            await DB.clearTable(tableId);
            Bus.emit("tables:updated");
          }
        } catch (tblErr) {
          console.warn("[Table Auto-Clear Notice]:", tblErr);
        }
      }

      setTimeout(() => {
        Cart.broadcastToCustomer({
          type: "checkout:cleared",
          data: {}
        });
      }, 7000);
    } catch (err) {
      console.error("[Checkout Error] Failed to finalize cash transaction:", err);
      if (this.elements.cashErrorMsg) {
        this.elements.cashErrorMsg.textContent = `Transaction failed: ${err.message}`;
      }
    }
  },

  async openGCashModal() {
    const bill = Cart.calculate();
    if (bill.total <= 0) {
      alert("Cart is empty. Add products first.");
      return;
    }

    // Check if an official GCash QR Code has been uploaded by the admin/tech
    const store = await DB.getStoreSettings();
    const isAutoGCash = Boolean(store.karinderyaMode && store.karinderyaAutoGCash !== false);
    const hasGcashQr = Boolean(store && ((store.gcashQrBase64 && store.gcashQrBase64.trim()) || (store.gcashQrPayload && store.gcashQrPayload.trim())));

    // Cash fallback when no QR code is uploaded ONLY applies if GCash Prompt Bypass is disabled
    if (!hasGcashQr && !isAutoGCash) {
      alert("No GCash QR Code uploaded in Store Settings. Proceeding to Cash payment.");
      this.openCashConfirmationModal();
      return;
    }

    this.currentBill = bill;

    if (this.elements.gcashAmountLabel) {
      this.elements.gcashAmountLabel.textContent = `₱${bill.total.toFixed(2)}`;
    }

    if (this.elements.gcashQrWrapper) {
      this.elements.gcashQrWrapper.style.display = hasGcashQr ? "inline-block" : "none";
    }

    if (this.elements.gcashUploadedQrImg) {
      if (hasGcashQr) {
        let qrSrc = store.gcashQrBase64 || "";

        // If a stripped QR payload exists, dynamically generate clean dynamic QR with the exact bill amount!
        if (store.gcashQrPayload && store.gcashQrPayload.trim()) {
          try {
            GCashEMVCo.setBasePayload(store.gcashQrPayload.trim());
            let payloadToRender = store.gcashQrPayload.trim();
            // If EMVCo format, inject exact amount
            if (payloadToRender.includes("6304")) {
              payloadToRender = GCashEMVCo.generateDynamicPayload(bill.total);
            }
            const cleanDynamicQr = await GCashEMVCo.generateCleanQrDataUrl(payloadToRender, 240);
            if (cleanDynamicQr) {
              qrSrc = cleanDynamicQr;
            }
          } catch (e) {
            console.warn("[CheckoutUI] Failed generating dynamic QR, falling back to static clean QR:", e);
          }
        }

        this.elements.gcashUploadedQrImg.src = qrSrc;
        this.elements.gcashUploadedQrImg.style.display = "block";
      } else {
        this.elements.gcashUploadedQrImg.src = "";
        this.elements.gcashUploadedQrImg.style.display = "none";
      }
    }

    if (this.elements.gcashMerchantNameLabel) {
      this.elements.gcashMerchantNameLabel.textContent = store.gcashName || store.storeName || "GCASH MERCHANT";
    }

    if (this.elements.gcashMerchantNumberLabel) {
      if (store.gcashNumber && store.gcashNumber.trim()) {
        this.elements.gcashMerchantNumberLabel.textContent = `GCash No: ${store.gcashNumber.trim()}`;
        this.elements.gcashMerchantNumberLabel.style.display = "block";
      } else {
        this.elements.gcashMerchantNumberLabel.style.display = "none";
      }
    }

    if (this.elements.modalGCash && typeof this.elements.modalGCash.showModal === "function") {
      this.elements.modalGCash.showModal();
    }
  },

  closeGCashModal() {
    if (this.elements.modalGCash && this.elements.modalGCash.open) {
      this.elements.modalGCash.close();
    }
  },

  async openGCashVerificationModal() {
    if (!this.currentBill) {
      this.currentBill = Cart.calculate();
    }

    this.closeGCashModal();
    this.selectedPagerNumber = null;

    if (this.elements.gcashAmountPaidInput) {
      this.elements.gcashAmountPaidInput.value = this.currentBill.total.toFixed(2);
    }

    if (this.elements.gcashRefInput) {
      this.elements.gcashRefInput.value = "";
    }

    if (this.elements.gcashPaymentDateInput) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const localIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      this.elements.gcashPaymentDateInput.value = localIso;
    }

    if (this.elements.gcashConfirmError) {
      this.elements.gcashConfirmError.textContent = "";
    }

    if (this.elements.gcashPagerSelectedLabel) {
      this.elements.gcashPagerSelectedLabel.textContent = "None";
    }

    await this.renderPagerGrid(
      this.elements.gcashPagerContainer,
      this.elements.gcashPagerGrid,
      this.elements.gcashPagerSelectedLabel
    );

    if (this.elements.modalGCashConfirm && typeof this.elements.modalGCashConfirm.showModal === "function") {
      this.elements.modalGCashConfirm.showModal();
      setTimeout(() => {
        if (this.elements.gcashRefInput) {
          this.elements.gcashRefInput.focus();
        }
      }, 100);
    }
  },

  closeGCashVerificationModal() {
    if (this.elements.modalGCashConfirm && this.elements.modalGCashConfirm.open) {
      this.elements.modalGCashConfirm.close();
    }
    this.selectedPagerNumber = null;

    Cart.broadcastToCustomer({
      type: "checkout:cleared",
      data: {}
    });
    Cart.notify();
  },

  /**
   * Fast-Path GCash Finalize:
   * Commits to IndexedDB, creates Wi-Fi voucher with real-time RouterOS fallback,
   * dispatches physical ESC/POS thermal printing, and shows confirmation modal with voucher code.
   * @param {boolean} isQuick - When true, auto-generates reference and skips confirmation prompts
   */
  async handleGCashFinalize(isQuick = false) {
    if (!this.currentBill) {
      this.currentBill = Cart.calculate();
    }

    const bill = this.currentBill;
    const store = await DB.getStoreSettings();
    const isAutoGCash = isQuick || Boolean(store.karinderyaMode && store.karinderyaAutoGCash !== false);
    const isCompactReceipt = Boolean(store.karinderyaMode && store.karinderyaCompactReceipt !== false);
    const isVoucherOnly = Boolean(store.karinderyaMode && store.karinderyaVoucherOnly);

    let refNo = "";
    let amountPaid = bill.total;
    let paymentDate = new Date().toISOString();

    if (isAutoGCash) {
      refNo = `GCASH-${Date.now().toString().slice(-6)}`;
      amountPaid = bill.total;
    } else {
      refNo = this.elements.gcashRefInput ? this.elements.gcashRefInput.value.trim() : "";
      amountPaid = parseFloat(this.elements.gcashAmountPaidInput.value);
      paymentDate = this.elements.gcashPaymentDateInput ? this.elements.gcashPaymentDateInput.value : "";

      if (!refNo) {
        if (this.elements.gcashConfirmError) {
          this.elements.gcashConfirmError.textContent = "Please enter the customer GCash reference number.";
        }
        if (this.elements.gcashRefInput) this.elements.gcashRefInput.focus();
        return;
      }

      if (isNaN(amountPaid) || amountPaid <= 0) {
        if (this.elements.gcashConfirmError) {
          this.elements.gcashConfirmError.textContent = "Please provide a valid GCash amount paid.";
        }
        if (this.elements.gcashAmountPaidInput) this.elements.gcashAmountPaidInput.focus();
        return;
      }

      if (amountPaid < bill.total) {
        if (this.elements.gcashConfirmError) {
          this.elements.gcashConfirmError.textContent = `Amount paid (₱${amountPaid.toFixed(2)}) is less than total due (₱${bill.total.toFixed(2)}).`;
        }
        return;
      }
    }

    const isPagerSuppressed = Boolean(store.karinderyaMode && store.karinderyaSuppressPager !== false);
    const pagerNumber = isPagerSuppressed ? null : (this.selectedPagerNumber || null);
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    const activeCashier = Session.get() || { id: "STAFF-01", name: "Cashier" };

    // 1. Resilient voucher resolution: Allows up to 3500ms for RouterOS REST before fallback to offline pool
    let voucher = null;
    if (store.hotspotEnabled) {
      try {
        const livePromise = MikrotikSync.issueHybridVoucher(orderNumber, null, store.hotspotSharedUsers);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3500));
        voucher = await Promise.race([livePromise, timeoutPromise]);
      } catch (e) {
        const pooled = await DB.getNextAvailableVoucher();
        if (pooled) {
          voucher = await DB.consumeLocalVoucher(pooled.code, orderNumber);
          const isUnl = String(store.hotspotSharedUsers || "1") === "unlimited" || String(store.hotspotSharedUsers || "1") === "0";
          voucher.sharedUsers = isUnl ? "unlimited" : "1";
          voucher.source = "POOL";
        } else {
          const { code } = MikrotikSync.generateVoucherCredentials();
          const qrUrl = MikrotikSync.buildAutoLoginUrl(store, code);
          const isUnl = String(store.hotspotSharedUsers || "1") === "unlimited" || String(store.hotspotSharedUsers || "1") === "0";
          voucher = {
            id: `VOUCH-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            code,
            pin: code,
            qrUrl,
            uptime: store.hotspotUptime || "2h",
            rateLimit: store.hotspotRateLimit || "Default",
            sharedUsers: isUnl ? "unlimited" : "1",
            status: "CONSUMED",
            orderNumber,
            source: "LOCAL_FALLBACK",
            createdAt: new Date().toISOString(),
            consumedAt: new Date().toISOString()
          };
          await DB.instance.vouchers.put(voucher);
        }
      }
    }

    try {
      const activeTicket = Cart.getActiveTicket();
      const tableId = bill.tableId || (activeTicket ? activeTicket.tableId : null);
      const tableName = bill.tableName || (activeTicket ? activeTicket.tableName : null);
      const tableSection = bill.tableSection || (activeTicket ? activeTicket.tableSection : null);

      // 2. Commit transaction to local IndexedDB
      const savedOrder = await DB.saveOrder({
        orderNumber,
        cashierId: activeCashier.id,
        cashierName: activeCashier.name,
        items: bill.items,
        vatableSales: bill.vatableSales,
        vatAmount: bill.vatAmount,
        total: bill.total,
        paymentType: "GCASH_DYNAMIC_QR",
        amountTendered: amountPaid,
        changeAmount: 0.0,
        gcashRefNo: refNo,
        gcashAmountPaid: amountPaid,
        gcashPaymentDate: paymentDate || new Date().toISOString(),
        pagerNumber,
        voucher,
        tableId,
        tableName,
        tableSection
      });

      // 3. Immediately refresh inventory UI & active cart ticket
      Bus.emit("inventory:updated");

      const receiptTicket = {
        ...bill,
        orderNumber: savedOrder.orderNumber,
        cashierName: activeCashier.name,
        paymentType: "GCASH QR Ph",
        amountTendered: amountPaid,
        changeAmount: 0.0,
        gcashRefNo: refNo,
        gcashAmountPaid: amountPaid,
        gcashPaymentDate: paymentDate || new Date().toISOString(),
        pagerNumber,
        voucher,
        tableId,
        tableName,
        tableSection,
        karinderyaMode: isCompactReceipt,
        karinderyaVoucherOnly: isVoucherOnly
      };

      // 4. Detached background dispatch: Hardware thermal printing
      (async () => {
        try {
          const enabledPrinters = await DB.getEnabledPrinters();
          await Printer.broadcastReceipt(enabledPrinters, receiptTicket);
        } catch (printErr) {
          console.warn("[Background Print Dispatch Warning]:", printErr);
        }
        Sync.pushPendingOrders({ silent: true }).catch(() => {});
      })();

      // 5. Broadcast to customer display
      Cart.broadcastToCustomer({
        type: "checkout:updated",
        data: {
          pagerNumber,
          tendered: amountPaid,
          change: 0.0
        }
      });

      // 6. Dismiss modals and display result modal with voucher code
      this.closeGCashModal();
      this.closeGCashVerificationModal();
      this.currentBill = null;

      if (this.elements.changeResultAmount) {
        this.elements.changeResultAmount.textContent = "₱0.00";
      }
      if (this.elements.changeResultTotal) {
        this.elements.changeResultTotal.textContent = `₱${bill.total.toFixed(2)}`;
      }
      if (this.elements.changeResultTendered) {
        this.elements.changeResultTendered.textContent = `₱${amountPaid.toFixed(2)} (GCash Ref: ${refNo})`;
      }
      if (this.elements.changeResultPager) {
        if (pagerNumber) {
          this.elements.changeResultPager.textContent = `#${pagerNumber}`;
          if (this.elements.changeResultPagerRow) {
            this.elements.changeResultPagerRow.classList.remove("hidden");
          }
        } else if (this.elements.changeResultPagerRow) {
          this.elements.changeResultPagerRow.classList.add("hidden");
        }
      }

      if (voucher) {
        if (this.elements.changeResultVoucherRow) this.elements.changeResultVoucherRow.classList.remove("hidden");
        if (this.elements.changeResultVoucherCode) this.elements.changeResultVoucherCode.textContent = voucher.code;
        if (this.elements.changeResultVoucherPin) this.elements.changeResultVoucherPin.textContent = voucher.code;
        if (this.elements.changeResultVoucherUptime) this.elements.changeResultVoucherUptime.textContent = voucher.uptime || "2h";
      } else if (this.elements.changeResultVoucherRow) {
        this.elements.changeResultVoucherRow.classList.add("hidden");
      }

      if (this.elements.modalCashChangeResult && typeof this.elements.modalCashChangeResult.showModal === "function") {
        this.elements.modalCashChangeResult.showModal();
        setTimeout(() => {
          if (this.elements.btnCloseChangeResult) {
            this.elements.btnCloseChangeResult.focus();
          }
        }, 100);
      }

      // 7. Clear or advance active ticket
      const activeTicketId = Cart.activeTicketId;
      if (Cart.tickets.length > 1) {
        Cart.closeTicket(activeTicketId);
      } else {
        Cart.clear();
      }

      // Auto-clear table occupancy if enabled
      if (tableId) {
        try {
          const tableSettings = await DB.getTableSettings();
          if (tableSettings.autoClearOnPayment !== false) {
            await DB.clearTable(tableId);
            Bus.emit("tables:updated");
          }
        } catch (tblErr) {
          console.warn("[Table Auto-Clear Notice]:", tblErr);
        }
      }

      setTimeout(() => {
        Cart.broadcastToCustomer({
          type: "checkout:cleared",
          data: {}
        });
      }, 7000);
    } catch (err) {
      console.error("[Checkout Error] Failed to finalize GCash transaction:", err);
      if (this.elements.gcashConfirmError) {
        this.elements.gcashConfirmError.textContent = `Confirmation failed: ${err.message}`;
      }
    }
  }
};

// REMARK: CHECKOUT_UI_JS_KEYBOARD_SUPPRESSION_AND_COMPACT_NO_STORE_NAME_COMPLETE