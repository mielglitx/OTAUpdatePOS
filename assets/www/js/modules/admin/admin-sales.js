/**
 * Module Description: Admin Sales & Transaction Ledger Sub-Module
 * Handles sales metric aggregations (Gross Sales, Completed Orders, VAT Collected,
 * Cash vs. GCash splits), Cash Drawer Float reconciliation (Initial Cashier Money + Cash Sales
 * = Gross Cash in Drawer), active cashier shift lifecycle tracking and end-of-shift closing,
 * admin-side drawer float calibration, shift filtering, Daily Z-Reading thermal print dispatching
 * with adaptive 58mm/80mm column calibration, UTF-8 BOM CSV financial ledger generation, and void workflows.
 */

import { DB } from "../db.js";
import { Session } from "../session.js";
import { Reports } from "../reports.js";
import { Printer } from "../printer.js";
import { Sync } from "../sync.js";
import { Bus } from "../bus.js";

export const AdminSales = {
  elements: {},
  callbacks: {},
  initialized: false,
  currentShiftFilter: "active",

  /**
   * Initializes DOM selections and binds reporting, shift, and void event triggers
   * @param {Object} callbacks - External hooks
   */
  init(callbacks = {}) {
    this.callbacks = callbacks;

    this.elements = {
      // Metric Display Cards
      statGrossSales: document.getElementById("stat-gross-sales"),
      statTotalOrders: document.getElementById("stat-total-orders"),
      statTotalVat: document.getElementById("stat-total-vat"),
      statPaymentSplit: document.getElementById("stat-payment-split"),
      statInitialCash: document.getElementById("stat-initial-cash"),
      statDrawerCash: document.getElementById("stat-drawer-cash"),

      // Shift Filter, Status & Float Controls
      selectSalesShift: document.getElementById("select-sales-shift"),
      shiftStatusPill: document.getElementById("shift-status-pill"),
      inputAdminInitialFloat: document.getElementById("input-admin-initial-float"),
      btnSaveShiftFloat: document.getElementById("btn-save-shift-float"),
      btnCloseShift: document.getElementById("btn-close-shift"),

      // Table & Reporting Controls
      salesTbody: document.getElementById("sales-tbody"),
      btnPrintSalesReport: document.getElementById("btn-print-sales-report"),
      btnGenerateSalesReport: document.getElementById("btn-generate-sales-report"),

      // Export Sales Report Dialog Controls
      modalExportSales: document.getElementById("modal-export-sales"),
      btnCloseExportSalesModal: document.getElementById("btn-close-export-sales-modal"),
      btnDoneExportSales: document.getElementById("btn-done-export-sales"),
      btnExportSalesPdf: document.getElementById("btn-export-sales-pdf"),
      btnExportSalesXls: document.getElementById("btn-export-sales-xls"),
      btnExportSalesCsv: document.getElementById("btn-export-sales-csv"),
      btnCopySalesData: document.getElementById("btn-copy-sales-data"),
      printableSalesReport: document.getElementById("printable-sales-report"),

      // In-App Void Order Modal Elements
      modalVoidOrder: document.getElementById("modal-void-order"),
      voidOrderNumberLabel: document.getElementById("void-order-number-label"),
      voidOrderIdInput: document.getElementById("void-order-id-input"),
      voidOrderNumInput: document.getElementById("void-order-num-input"),
      voidOrderReasonInput: document.getElementById("void-order-reason-input"),
      voidOrderErrorMsg: document.getElementById("void-order-error-msg"),
      btnCancelVoidOrder: document.getElementById("btn-cancel-void-order"),
      btnCloseVoidOrderX: document.getElementById("btn-close-void-order-x"),
      btnConfirmVoidOrder: document.getElementById("btn-confirm-void-order"),

      // Clear Transactions Modal Elements
      btnOpenClearTransactions: document.getElementById("btn-open-clear-transactions"),
      modalClearTransactions: document.getElementById("modal-clear-transactions"),
      btnCloseClearTransactionsX: document.getElementById("btn-close-clear-transactions-x"),
      btnCancelClearTransactions: document.getElementById("btn-cancel-clear-transactions"),
      btnConfirmClearTransactions: document.getElementById("btn-confirm-clear-transactions"),
      clearAffectedCountPill: document.getElementById("clear-affected-count-pill"),
      clearScopeRadios: document.querySelectorAll("input[name='clear-scope']")
    };

    if (this.initialized) return;
    this.initialized = true;

    // 1. Shift Filter Dropdown Listener
    if (this.elements.selectSalesShift) {
      this.elements.selectSalesShift.onchange = async () => {
        this.currentShiftFilter = this.elements.selectSalesShift.value;
        await this.loadSalesReport();
      };
    }

    // 2. Admin Set / Update Initial Cashier Money (Starting Float)
    if (this.elements.btnSaveShiftFloat) {
      this.elements.btnSaveShiftFloat.onclick = async () => {
        const raw = this.elements.inputAdminInitialFloat ? this.elements.inputAdminInitialFloat.value : "1000";
        const newFloat = Math.max(0, parseFloat(raw) || 0.0);

        // Update default store initial cash for future shifts
        await DB.saveStoreSettings({ defaultInitialCash: newFloat });

        // Update current active shift initial float if one is open
        const activeShift = await DB.getActiveShift();
        if (activeShift) {
          activeShift.initialCash = newFloat;
          await DB.instance.shifts.put(activeShift);
        }

        await this.loadSalesReport();
        alert(`Initial Cashier Money set to ₱${newFloat.toFixed(2)}.`);
      };
    }

    // 3. End Cashier Shift Action (Closes Shift & Prompts Z-Reading Print)
    if (this.elements.btnCloseShift) {
      this.elements.btnCloseShift.onclick = async () => {
        const activeShift = await DB.getActiveShift();
        if (!activeShift) {
          alert("No cashier work shift is currently open.");
          return;
        }

        const summary = await DB.getSalesSummary(activeShift.id);
        const confirmClose = confirm(
          `End work shift for "${activeShift.cashierName}"?\n\n` +
          `• Initial Cashier Money (Float): ₱${summary.initialCash.toFixed(2)}\n` +
          `• Cash Sales Collected: ₱${summary.cashSales.toFixed(2)}\n` +
          `• Total Expected Cash in Drawer: ₱${summary.grossCashDrawer.toFixed(2)}\n` +
          `• GCash Non-Cash Sales: ₱${summary.gcashSales.toFixed(2)}\n\n` +
          `Confirm to conclude shift and print shift Z-reading summary?`
        );

        if (!confirmClose) return;

        await DB.closeShift(activeShift.id, "Shift concluded from Admin");

        // Print Shift Closing Z-Reading Slip
        try {
          const enabled = await DB.getEnabledPrinters();
          const paperWidth = enabled.length > 0 && enabled[0].paperWidth ? enabled[0].paperWidth : "58mm";
          const reportBytes = Reports.buildDailyReportBytes(summary, Session.get(), paperWidth);

          if (enabled.length > 0) {
            await Promise.allSettled(enabled.map((p) => Printer.dispatchToTarget(p, reportBytes)));
          } else {
            await Printer.dispatch(reportBytes);
          }
        } catch (printErr) {
          console.warn("[Shift Print Notice]:", printErr);
        }

        await this.loadSalesReport();
        Bus.emit("shift:ended");
        alert(`Shift ended successfully.\n\nGross Cash in Drawer: ₱${summary.grossCashDrawer.toFixed(2)}`);
      };
    }

    // 4. Thermal Sales Report Print Trigger
    if (this.elements.btnPrintSalesReport) {
      this.elements.btnPrintSalesReport.onclick = async () => {
        const summary = await DB.getSalesSummary(this.currentShiftFilter);
        const enabled = await DB.getEnabledPrinters();
        const paperWidth = enabled.length > 0 && enabled[0].paperWidth ? enabled[0].paperWidth : "58mm";
        const reportBytes = Reports.buildDailyReportBytes(summary, Session.get(), paperWidth);

        if (enabled.length > 0) {
          await Promise.allSettled(enabled.map((p) => Printer.dispatchToTarget(p, reportBytes)));
        } else {
          await Printer.dispatch(reportBytes);
        }
        alert("Sales summary report dispatched to active printer(s).");
      };
    }

    // 5. Sales Report Export Modal & Multi-Format Actions (PDF, XLS, CSV, Clipboard)
    if (this.elements.btnGenerateSalesReport) {
      this.elements.btnGenerateSalesReport.onclick = async () => {
        await this.openExportSalesModal();
      };
    }

    if (this.elements.btnCloseExportSalesModal) {
      this.elements.btnCloseExportSalesModal.onclick = () => this.closeExportSalesModal();
    }

    if (this.elements.btnDoneExportSales) {
      this.elements.btnDoneExportSales.onclick = () => this.closeExportSalesModal();
    }

    if (this.elements.btnExportSalesPdf) {
      this.elements.btnExportSalesPdf.onclick = () => this.exportPdf();
    }

    if (this.elements.btnExportSalesXls) {
      this.elements.btnExportSalesXls.onclick = () => this.exportXls();
    }

    if (this.elements.btnExportSalesCsv) {
      this.elements.btnExportSalesCsv.onclick = () => this.exportCsv();
    }

    if (this.elements.btnCopySalesData) {
      this.elements.btnCopySalesData.onclick = () => this.copySalesData();
    }

    // 6. In-App Order Void Modal Action Triggers
    if (this.elements.btnCancelVoidOrder) {
      this.elements.btnCancelVoidOrder.onclick = () => this.closeVoidOrderModal();
    }

    if (this.elements.btnCloseVoidOrderX) {
      this.elements.btnCloseVoidOrderX.onclick = () => this.closeVoidOrderModal();
    }

    if (this.elements.btnConfirmVoidOrder) {
      this.elements.btnConfirmVoidOrder.onclick = async () => {
        const ordId = parseInt(this.elements.voidOrderIdInput.value, 10);
        const reason = (this.elements.voidOrderReasonInput.value || "").trim();

        if (!reason) {
          if (this.elements.voidOrderErrorMsg) {
            this.elements.voidOrderErrorMsg.textContent = "Please provide a reason for voiding this sale.";
          }
          if (this.elements.voidOrderReasonInput) {
            this.elements.voidOrderReasonInput.focus();
          }
          return;
        }

        const activeManager = Session.get() || { id: "ADM-001", name: "Manager" };

        try {
          await DB.voidOrder(ordId, activeManager, reason);
          this.closeVoidOrderModal();
          await this.loadSalesReport();
          Bus.emit("inventory:updated");

          Sync.pushPendingOrders({ silent: true }).catch((err) => {
            console.warn("[Admin Void Sync] Background sync queued:", err.message);
          });
        } catch (err) {
          console.error("[Admin Sales Void Error]:", err);
          if (this.elements.voidOrderErrorMsg) {
            this.elements.voidOrderErrorMsg.textContent = `Failed: ${err.message}`;
          }
        }
      };
    }

    // 7. Clear Transactions Modal & Scope Trigger
    if (this.elements.btnOpenClearTransactions) {
      this.elements.btnOpenClearTransactions.onclick = async () => {
        await this.openClearTransactionsModal();
      };
    }

    if (this.elements.btnCloseClearTransactionsX) {
      this.elements.btnCloseClearTransactionsX.onclick = () => this.closeClearTransactionsModal();
    }

    if (this.elements.btnCancelClearTransactions) {
      this.elements.btnCancelClearTransactions.onclick = () => this.closeClearTransactionsModal();
    }

    if (this.elements.clearScopeRadios) {
      this.elements.clearScopeRadios.forEach((radio) => {
        radio.onchange = async () => {
          await this.updateClearScopeCount();
        };
      });
    }

    if (this.elements.btnConfirmClearTransactions) {
      this.elements.btnConfirmClearTransactions.onclick = async () => {
        await this.handleConfirmClearTransactions();
      };
    }
  },

  /**
   * Retrieves currently selected radio scope
   * @returns {'today'|'week'|'month'|'all'}
   */
  getSelectedClearScope() {
    const selected = document.querySelector("input[name='clear-scope']:checked");
    return selected ? selected.value : "today";
  },

  /**
   * Recalculates and updates the count pill in the clear transactions modal
   */
  async updateClearScopeCount() {
    const scope = this.getSelectedClearScope();
    const count = await DB.getOrderCountByScope(scope);
    if (this.elements.clearAffectedCountPill) {
      this.elements.clearAffectedCountPill.textContent = `${count} order${count === 1 ? "" : "s"}`;
    }
    return count;
  },

  /**
   * Opens Clear Transactions modal with pre-computed counts
   */
  async openClearTransactionsModal() {
    if (!this.elements.modalClearTransactions) return;
    await this.updateClearScopeCount();
    this.elements.modalClearTransactions.showModal();
  },

  /**
   * Closes Clear Transactions modal
   */
  closeClearTransactionsModal() {
    if (!this.elements.modalClearTransactions) return;
    this.elements.modalClearTransactions.close();
  },

  /**
   * Confirms and executes order deletion by scope
   */
  async handleConfirmClearTransactions() {
    const scope = this.getSelectedClearScope();
    const count = await DB.getOrderCountByScope(scope);

    if (count === 0) {
      alert("No completed transactions found matching the selected time range.");
      return;
    }

    const scopeNames = {
      today: "Today's transactions",
      week: "This week's transactions",
      month: "This month's transactions",
      all: "ALL lifetime transactions"
    };
    const scopeDesc = scopeNames[scope] || scope;

    const confirmed = confirm(
      `⚠️ WARNING: Are you sure you want to permanently delete ${count} order(s) for [${scopeDesc}]?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    if (this.elements.btnConfirmClearTransactions) {
      this.elements.btnConfirmClearTransactions.disabled = true;
      this.elements.btnConfirmClearTransactions.textContent = "Clearing...";
    }

    try {
      const result = await DB.clearOrdersByScope(scope);
      this.closeClearTransactionsModal();
      await this.loadSalesReport();
      Bus.emit("sales:cleared", result);
      alert(`✅ Successfully cleared ${result.deletedCount} transaction(s). Sales metrics refreshed.`);
    } catch (err) {
      console.error("[Clear Transactions Error]:", err);
      alert(`Failed to clear transactions: ${err.message}`);
    } finally {
      if (this.elements.btnConfirmClearTransactions) {
        this.elements.btnConfirmClearTransactions.disabled = false;
        this.elements.btnConfirmClearTransactions.textContent = "🗑️ Confirm & Clear";
      }
    }
  },

  /**
   * Populates the shift filter dropdown with active, all, and past shifts
   */
  async populateShiftDropdown() {
    if (!this.elements.selectSalesShift) return;

    const currentVal = this.elements.selectSalesShift.value || this.currentShiftFilter;
    const shifts = await DB.getShifts();

    let optionsHtml = `
      <option value="active" ${currentVal === "active" ? "selected" : ""}>Active Shift (Current Cashier)</option>
      <option value="all" ${currentVal === "all" ? "selected" : ""}>All Shifts / Full History</option>
    `;

    if (shifts.length > 0) {
      optionsHtml += `<optgroup label="Past Recorded Shifts">`;
      shifts.forEach((s) => {
        const start = new Date(s.startTime);
        const dateLabel = `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        const statusLabel = s.status === "OPEN" ? "🟢 OPEN" : "CLOSED";
        optionsHtml += `
          <option value="${s.id}" ${currentVal === s.id ? "selected" : ""}>
            ${s.cashierName} (${dateLabel}) [${statusLabel}]
          </option>
        `;
      });
      optionsHtml += `</optgroup>`;
    }

    this.elements.selectSalesShift.innerHTML = optionsHtml;
  },

  /**
   * Filters order list according to the designated shift filter
   * @param {string} filter 
   * @returns {Promise<Array>}
   */
  async getFilteredOrders(filter = "active") {
    let allOrders = await DB.getAllOrders();

    if (filter === "all") {
      return allOrders;
    }

    let targetShift = null;
    if (filter === "active") {
      targetShift = await DB.getActiveShift();
    } else {
      targetShift = await DB.getShiftById(filter);
    }

    if (!targetShift) {
      return allOrders;
    }

    return allOrders.filter((ord) => {
      if (ord.shiftId && ord.shiftId === targetShift.id) {
        return true;
      }
      if (ord.cashierId === targetShift.cashierId) {
        const ordTime = ord.timestamp;
        if (ordTime >= targetShift.startTime) {
          return !targetShift.endTime || ordTime <= targetShift.endTime;
        }
      }
      return false;
    });
  },

  /**
   * Opens the in-app confirmation modal for order voiding
   */
  openVoidOrderModal(ordId, ordNum) {
    if (!this.elements.modalVoidOrder) return;

    if (this.elements.voidOrderIdInput) this.elements.voidOrderIdInput.value = ordId;
    if (this.elements.voidOrderNumInput) this.elements.voidOrderNumInput.value = ordNum;
    if (this.elements.voidOrderNumberLabel) this.elements.voidOrderNumberLabel.textContent = ordNum;
    if (this.elements.voidOrderReasonInput) this.elements.voidOrderReasonInput.value = "";
    if (this.elements.voidOrderErrorMsg) this.elements.voidOrderErrorMsg.textContent = "";

    if (typeof this.elements.modalVoidOrder.showModal === "function") {
      this.elements.modalVoidOrder.showModal();
    }

    setTimeout(() => {
      if (this.elements.voidOrderReasonInput) {
        this.elements.voidOrderReasonInput.focus();
      }
    }, 100);
  },

  /**
   * Closes the in-app void modal
   */
  closeVoidOrderModal() {
    if (this.elements.modalVoidOrder && this.elements.modalVoidOrder.open) {
      this.elements.modalVoidOrder.close();
    }
  },

  /**
   * Loads sales summary cards, drawer cash reconciliations, and transaction table
   */
  async loadSalesReport() {
    await this.populateShiftDropdown();

    const summary = await DB.getSalesSummary(this.currentShiftFilter);
    const orders = await this.getFilteredOrders(this.currentShiftFilter);
    const activeShift = await DB.getActiveShift();
    const store = await DB.getStoreSettings();

    // 1. Shift Status Indicator Pill & Initial Float Input Field
    if (this.elements.shiftStatusPill) {
      if (activeShift) {
        this.elements.shiftStatusPill.textContent = `🟢 Shift Active: ${activeShift.cashierName}`;
        this.elements.shiftStatusPill.style.color = "#16a34a";
      } else {
        this.elements.shiftStatusPill.textContent = `⚪ No Active Shift`;
        this.elements.shiftStatusPill.style.color = "#94a3b8";
      }
    }

    if (this.elements.inputAdminInitialFloat) {
      const currentFloat = activeShift ? activeShift.initialCash : (store.defaultInitialCash || 1000.0);
      this.elements.inputAdminInitialFloat.value = Number(currentFloat).toFixed(2);
    }

    // 2. Financial Metrics Reconciliation Cards
    if (this.elements.statGrossSales) {
      this.elements.statGrossSales.textContent = `₱${summary.grossSales.toFixed(2)}`;
    }
    if (this.elements.statTotalOrders) {
      this.elements.statTotalOrders.textContent = String(summary.orderCount);
    }
    if (this.elements.statTotalVat) {
      this.elements.statTotalVat.textContent = `₱${summary.totalVat.toFixed(2)}`;
    }
    if (this.elements.statPaymentSplit) {
      this.elements.statPaymentSplit.textContent = `₱${summary.gcashSales.toFixed(0)} / ₱${summary.cashSales.toFixed(0)}`;
    }
    if (this.elements.statInitialCash) {
      this.elements.statInitialCash.textContent = `₱${(summary.initialCash || 0).toFixed(2)}`;
    }
    if (this.elements.statDrawerCash) {
      this.elements.statDrawerCash.textContent = `₱${(summary.grossCashDrawer || 0).toFixed(2)}`;
    }

    // 3. Transactions Ledger Table
    if (this.elements.salesTbody) {
      if (orders.length === 0) {
        this.elements.salesTbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center" style="padding: 24px; color: #64748b;">
              No transactions recorded for the selected shift filter.
            </td>
          </tr>
        `;
        return;
      }

      this.elements.salesTbody.innerHTML = orders.map((ord) => {
        const d = new Date(ord.timestamp);
        const dateFormatted = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        const isVoided = ord.status === "VOIDED";

        let statusBadge = "";
        let actionBtn = "";

        if (isVoided) {
          statusBadge = `<span class="badge badge-status-out">VOIDED</span>`;
          actionBtn = `<small style="color:var(--text-muted);">Voided by ${ord.voidedBy || "Manager"}</small>`;
        } else {
          statusBadge = `<span class="badge badge-status-ok">COMPLETED</span>`;
          actionBtn = `<button type="button" class="btn-action-sm btn-action-del btn-void-order" data-id="${ord.id}" data-ord="${ord.orderNumber}">Void Sale</button>`;
        }

        return `
          <tr style="${isVoided ? 'opacity: 0.6; text-decoration: line-through;' : ''}">
            <td><b>${ord.orderNumber}</b></td>
            <td>${dateFormatted}</td>
            <td>${ord.cashierName || ord.cashierId}</td>
            <td>
              <span class="badge ${ord.paymentType === "CASH" ? "" : "badge-admin"}">${ord.paymentType}</span>
              ${statusBadge}
            </td>
            <td class="text-right"><b>₱${Number(ord.total || 0).toFixed(2)}</b></td>
            <td class="text-center" style="text-decoration: none;">
              ${actionBtn}
            </td>
          </tr>
        `;
      }).join("");

      this.elements.salesTbody.querySelectorAll(".btn-void-order").forEach((btn) => {
        btn.onclick = () => {
          const ordNum = btn.dataset.ord;
          const ordId = parseInt(btn.dataset.id, 10);
          this.openVoidOrderModal(ordId, ordNum);
        };
      });
    }
  },

  /**
   * Generates formatted CSV content string with UTF-8 BOM, including Drawer Cash Float
   */
  generateCSVReport(summary, orders, activeUser) {
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();

    let csv = "\uFEFF";
    csv += `"POS REG-01 - SALES & FINANCIAL DRAWER REPORT"\n`;
    csv += `"Generated:","${dateStr} ${timeStr}"\n`;
    csv += `"Generated By:","${activeUser ? activeUser.name : "System"}"\n`;
    csv += `"Active Shift:","${summary.shift ? summary.shift.cashierName + " (" + summary.shift.id + ")" : "Lifetime / Multi-Shift"}"\n\n`;

    csv += `"FINANCIAL & CASH DRAWER RECONCILIATION"\n`;
    csv += `"Metric","Value"\n`;
    csv += `"Initial Cashier Money (Starting Drawer Float)","PHP ${(summary.initialCash || 0).toFixed(2)}"\n`;
    csv += `"Cash Sales Collected","PHP ${summary.cashSales.toFixed(2)}"\n`;
    csv += `"Gross Cash in Drawer (Float + Cash Sales)","PHP ${(summary.grossCashDrawer || 0).toFixed(2)}"\n`;
    csv += `"GCash QR Electronic Sales","PHP ${summary.gcashSales.toFixed(2)}"\n`;
    csv += `"Total Orders Completed","${summary.orderCount}"\n`;
    csv += `"Total Orders Voided","${summary.voidedCount || 0}"\n`;
    csv += `"Gross Sales (Net of Voids)","PHP ${summary.grossSales.toFixed(2)}"\n`;
    csv += `"VAT Collected (12%)","PHP ${summary.totalVat.toFixed(2)}"\n`;
    csv += `"Vatable Net Sales","PHP ${(summary.grossSales - summary.totalVat).toFixed(2)}"\n\n`;

    csv += `"TRANSACTION HISTORY LEDGER"\n`;
    csv += `"Order #","Date & Time","Status","Cashier / User","Payment Method","Items Summary","Vatable Sales (PHP)","VAT 12% (PHP)","Total Amount (PHP)","Void Details"\n`;

    for (const ord of orders) {
      const d = new Date(ord.timestamp);
      const ts = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      const itemsSummary = (ord.items || [])
        .map((i) => `${i.name} (x${i.qty})`)
        .join("; ");
      const voidInfo = ord.status === "VOIDED"
        ? `Voided by ${ord.voidedBy || "Manager"} (${ord.voidReason || "No Reason"})`
        : "";

      csv += `"${ord.orderNumber}",`;
      csv += `"${ts}",`;
      csv += `"${ord.status || "COMPLETED"}",`;
      csv += `"${(ord.cashierName || ord.cashierId || "").replace(/"/g, '""')}",`;
      csv += `"${ord.paymentType}",`;
      csv += `"${itemsSummary.replace(/"/g, '""')}",`;
      csv += `"${(ord.vatableSales || 0).toFixed(2)}",`;
      csv += `"${(ord.vatAmount || 0).toFixed(2)}",`;
      csv += `"${(ord.total || 0).toFixed(2)}",`;
      csv += `"${voidInfo.replace(/"/g, '""')}"\n`;
    }

    return csv;
  },

  /**
   * Opens the multi-format sales report export modal with live preview
   */
  async openExportSalesModal() {
    const summary = await DB.getSalesSummary(this.currentShiftFilter);
    const orders = await this.getFilteredOrders(this.currentShiftFilter);
    const activeUser = Session.get();
    const store = await DB.getStoreSettings();

    this.currentExportData = { summary, orders, activeUser, store };

    if (this.elements.printableSalesReport) {
      this.elements.printableSalesReport.innerHTML = this.renderReportHtml(summary, orders, activeUser, store);
    }

    if (this.elements.modalExportSales && typeof this.elements.modalExportSales.showModal === "function") {
      this.elements.modalExportSales.showModal();
    }
  },

  /**
   * Dismisses the sales report export modal
   */
  closeExportSalesModal() {
    if (this.elements.modalExportSales && this.elements.modalExportSales.open) {
      this.elements.modalExportSales.close();
    }
  },

  /**
   * Formats the visual sales report HTML for on-screen review and PDF printing
   */
  renderReportHtml(summary, orders, activeUser, store) {
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const shiftText = summary.shift ? `${summary.shift.cashierName} (${summary.shift.id})` : "Lifetime / Multi-Shift";
    const vatableNet = Math.max(0, (summary.grossSales || 0) - (summary.totalVat || 0));

    return `
      <div style="border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
          <div>
            <h2 style="margin: 0; color: #0369a1; font-size: 1.35rem; font-weight: 900; text-transform: uppercase;">
              ${store.storeName || "LOKALEX STORE"}
            </h2>
            <div style="font-size: 0.84rem; color: #475569; margin-top: 2px;">
              ${store.companyName ? `${store.companyName} • ` : ""}${store.address || "Camiling, Tarlac"}
            </div>
            ${store.contactNumber ? `<div style="font-size: 0.8rem; color: #64748b;">Contact: ${store.contactNumber}</div>` : ""}
          </div>
          <div style="text-align: right;">
            <span style="background: #0284c7; color: #ffffff; font-size: 0.72rem; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">
              Official Sales Report
            </span>
            <div style="font-size: 0.8rem; color: #64748b; margin-top: 6px;">
              <b>Generated:</b> ${dateStr} ${timeStr}
            </div>
            <div style="font-size: 0.8rem; color: #64748b;">
              <b>Staff:</b> ${activeUser ? activeUser.name : "Admin"} • <b>Shift:</b> ${shiftText}
            </div>
          </div>
        </div>
      </div>

      <!-- Financial Reconciliation KPI Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 16px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; text-align: center;">
          <div style="font-size: 0.7rem; color: #64748b; font-weight: 700; text-transform: uppercase;">Total Orders</div>
          <div style="font-size: 1.2rem; font-weight: 900; color: #0f172a; margin-top: 2px;">${summary.orderCount || 0}</div>
        </div>
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 10px; text-align: center;">
          <div style="font-size: 0.7rem; color: #1d4ed8; font-weight: 700; text-transform: uppercase;">Gross Sales</div>
          <div style="font-size: 1.2rem; font-weight: 900; color: #1e40af; margin-top: 2px;">₱${(summary.grossSales || 0).toFixed(2)}</div>
        </div>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 10px; text-align: center;">
          <div style="font-size: 0.7rem; color: #15803d; font-weight: 700; text-transform: uppercase;">Cash Sales</div>
          <div style="font-size: 1.2rem; font-weight: 900; color: #166534; margin-top: 2px;">₱${(summary.cashSales || 0).toFixed(2)}</div>
        </div>
        <div style="background: #fdf4ff; border: 1px solid #f5d0fe; border-radius: 6px; padding: 8px 10px; text-align: center;">
          <div style="font-size: 0.7rem; color: #a21caf; font-weight: 700; text-transform: uppercase;">GCash Sales</div>
          <div style="font-size: 1.2rem; font-weight: 900; color: #86198f; margin-top: 2px;">₱${(summary.gcashSales || 0).toFixed(2)}</div>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 10px; text-align: center;">
          <div style="font-size: 0.7rem; color: #b45309; font-weight: 700; text-transform: uppercase;">Gross in Drawer</div>
          <div style="font-size: 1.2rem; font-weight: 900; color: #92400e; margin-top: 2px;">₱${(summary.grossCashDrawer || 0).toFixed(2)}</div>
        </div>
      </div>

      <!-- Financial Breakdown Table -->
      <div style="margin-bottom: 16px;">
        <h4 style="margin: 0 0 6px 0; color: #1e293b; font-size: 0.88rem; text-transform: uppercase;">Tax & Float Reconciliation</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
          <tr style="background: #f1f5f9;"><th style="padding: 6px 8px; text-align: left; border: 1px solid #e2e8f0;">Metric Item</th><th style="padding: 6px 8px; text-align: right; border: 1px solid #e2e8f0;">Amount (PHP)</th></tr>
          <tr><td style="padding: 5px 8px; border: 1px solid #e2e8f0;">Initial Cashier Float (Starting Drawer Money)</td><td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">₱${(summary.initialCash || 0).toFixed(2)}</td></tr>
          <tr><td style="padding: 5px 8px; border: 1px solid #e2e8f0;">Cash Tendered Collected</td><td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">₱${(summary.cashSales || 0).toFixed(2)}</td></tr>
          <tr style="font-weight: 800; background: #fafaf9;"><td style="padding: 5px 8px; border: 1px solid #e2e8f0;">Expected Cash in Drawer (Float + Cash)</td><td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">₱${(summary.grossCashDrawer || 0).toFixed(2)}</td></tr>
          <tr><td style="padding: 5px 8px; border: 1px solid #e2e8f0;">12% Value Added Tax (VAT Collected)</td><td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">₱${(summary.totalVat || 0).toFixed(2)}</td></tr>
          <tr><td style="padding: 5px 8px; border: 1px solid #e2e8f0;">Net Vatable Sales (Gross - VAT)</td><td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">₱${vatableNet.toFixed(2)}</td></tr>
        </table>
      </div>

      <!-- Orders Transaction Ledger -->
      <div>
        <h4 style="margin: 0 0 6px 0; color: #1e293b; font-size: 0.88rem; text-transform: uppercase;">Order Transactions Ledger (${orders.length})</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem;">
          <thead>
            <tr style="background: #0284c7; color: #ffffff;">
              <th style="padding: 6px 8px; text-align: left;">Order #</th>
              <th style="padding: 6px 8px; text-align: left;">Time</th>
              <th style="padding: 6px 8px; text-align: left;">Cashier</th>
              <th style="padding: 6px 8px; text-align: center;">Payment</th>
              <th style="padding: 6px 8px; text-align: right;">Total (PHP)</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map((o) => {
              const od = new Date(o.timestamp);
              const t = `${od.toLocaleDateString()} ${od.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
              const isV = o.status === "VOIDED";
              return `
                <tr style="${isV ? 'background:#fee2e2; color:#991b1b; text-decoration:line-through;' : ''}">
                  <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0;"><b>${o.orderNumber}</b></td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0;">${t}</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0;">${o.cashierName || o.cashierId}</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${o.paymentType} ${isV ? '(VOID)' : ''}</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: right;"><b>₱${(o.total || 0).toFixed(2)}</b></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>

      <!-- Sign-off Block for Audit -->
      <div style="display: flex; justify-content: space-between; margin-top: 26px; font-size: 0.8rem; color: #475569;">
        <div>Prepared By: _________________________</div>
        <div>Verified By: _________________________</div>
      </div>
    `;
  },

  /**
   * Generates formatted Excel (.xls) spreadsheet string
   */
  generateXLSReport(summary, orders, activeUser, store) {
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();

    return `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" /><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sales Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body>
  <table border="1">
    <tr><th colspan="5" style="font-size:16pt;font-weight:bold;text-align:center;background:#0284c7;color:#ffffff;">${store.storeName || "LOKALEX STORE"} - SALES REPORT</th></tr>
    <tr><td colspan="5" style="text-align:center;">Generated: ${dateStr} ${timeStr} | Staff: ${activeUser ? activeUser.name : "System"}</td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td></tr>
    <tr style="background:#f1f5f9;font-weight:bold;"><td colspan="3">FINANCIAL RECONCILIATION</td><td colspan="2">AMOUNT (PHP)</td></tr>
    <tr><td colspan="3">Initial Cashier Float (Starting Drawer Money)</td><td colspan="2">${(summary.initialCash || 0).toFixed(2)}</td></tr>
    <tr><td colspan="3">Cash Sales Collected</td><td colspan="2">${(summary.cashSales || 0).toFixed(2)}</td></tr>
    <tr style="font-weight:bold;background:#fafaf9;"><td colspan="3">Gross Cash in Drawer (Float + Cash)</td><td colspan="2">${(summary.grossCashDrawer || 0).toFixed(2)}</td></tr>
    <tr><td colspan="3">GCash Electronic Sales</td><td colspan="2">${(summary.gcashSales || 0).toFixed(2)}</td></tr>
    <tr><td colspan="3">Total Orders Completed</td><td colspan="2">${summary.orderCount || 0}</td></tr>
    <tr><td colspan="3">Gross Sales (Net Voids)</td><td colspan="2">${(summary.grossSales || 0).toFixed(2)}</td></tr>
    <tr><td colspan="3">12% Value Added Tax (VAT)</td><td colspan="2">${(summary.totalVat || 0).toFixed(2)}</td></tr>
    <tr><td colspan="3">Net Vatable Sales</td><td colspan="2">${((summary.grossSales || 0) - (summary.totalVat || 0)).toFixed(2)}</td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td></tr>
    <tr style="background:#0284c7;color:#ffffff;font-weight:bold;">
      <th>Order #</th><th>Date & Time</th><th>Cashier</th><th>Payment</th><th>Total (PHP)</th>
    </tr>
    ${orders.map((o) => `
      <tr>
        <td>${o.orderNumber}</td>
        <td>${new Date(o.timestamp).toLocaleString()}</td>
        <td>${o.cashierName || o.cashierId}</td>
        <td>${o.paymentType}</td>
        <td>${(o.total || 0).toFixed(2)}</td>
      </tr>
    `).join("")}
  </table>
</body>
</html>
    `.trim();
  },

  /**
   * Universal file saving helper supporting Flutter native bridge and browser fallback
   */
  async saveFileUniversal(filename, content, mimeType) {
    if (typeof window !== "undefined" && window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        const res = await window.flutter_inappwebview.callHandler("saveFileNative", filename, content);
        if (res && res.ok) {
          alert(`✅ Sales Report saved successfully to Downloads:\n${res.path || filename}`);
          return true;
        }
      } catch (err) {
        console.warn("[AdminSales] Flutter bridge save error:", err);
      }
    }

    // Fallback using Blob URL
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      alert(`Sales report download initiated: ${filename}`);
      return true;
    } catch (err) {
      alert(`Could not save file: ${err.message}. Use "Copy to Clipboard" instead.`);
      return false;
    }
  },

  /**
   * Triggers system Print-to-PDF
   */
  async exportPdf() {
    if (typeof window !== "undefined" && window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        const res = await window.flutter_inappwebview.callHandler("printToPdf");
        if (res && res.ok) return;
      } catch (err) {
        console.warn("[AdminSales] Flutter print error:", err);
      }
    }
    window.print();
  },

  /**
   * Exports report as formatted Excel (.xls) file
   */
  async exportXls() {
    if (!this.currentExportData) return;
    const { summary, orders, activeUser, store } = this.currentExportData;
    const now = new Date();
    const filename = `sales_report_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.xls`;
    const xlsContent = this.generateXLSReport(summary, orders, activeUser, store);
    await this.saveFileUniversal(filename, xlsContent, "application/vnd.ms-excel;charset=utf-8;");
  },

  /**
   * Exports report as standard CSV (.csv) file
   */
  async exportCsv() {
    if (!this.currentExportData) return;
    const { summary, orders, activeUser } = this.currentExportData;
    const now = new Date();
    const filename = `sales_report_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.csv`;
    const csvContent = this.generateCSVReport(summary, orders, activeUser);
    await this.saveFileUniversal(filename, csvContent, "text/csv;charset=utf-8;");
  },

  /**
   * Copies CSV report content to clipboard
   */
  async copySalesData() {
    if (!this.currentExportData) return;
    const { summary, orders, activeUser } = this.currentExportData;
    const csvContent = this.generateCSVReport(summary, orders, activeUser);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(csvContent);
        alert("✅ Sales report CSV data copied to clipboard!");
        return;
      }
    } catch (_) {}
    const ta = document.createElement("textarea");
    ta.value = csvContent;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("✅ Sales report CSV data copied to clipboard!");
  }
};

// REMARK: ADMIN_SALES_JS_DIRECT_DRAWER_FLOAT_CALIBRATION_COMPLETE