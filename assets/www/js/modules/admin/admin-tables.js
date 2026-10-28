/**
 * Module Description: Dining & Floor Plan Table Layout Management Sub-Module
 * Provides manual visual 2D floor plan drawing and layouting of dining areas
 * using basic shapes (square, round, rectangle, counter, wall), customizable table
 * numbering and seat capacities, real-time interactive cashier floor plan picker,
 * full table order details inspection, live bill totals, itemized check printing,
 * direct pay checkout, and automatic table release upon payment.
 */

import { DB } from "../db.js";
import { Bus } from "../bus.js";
import { Cart } from "../cart.js";
import { Printer } from "../printer.js";
import { CheckoutUI } from "../checkout-ui.js";

export const AdminTables = {
  initialized: false,
  settings: {},
  tables: [],
  activeSection: "all",
  pickerSection: "all",
  editingTableId: null,
  activeDetailTable: null,
  adminViewMode: "canvas", // "canvas" | "cards"
  cashierViewMode: "canvas", // "canvas" | "grid"

  elements: {},

  /**
   * Initializes DOM element bindings and event hooks
   */
  async init() {
    this.elements = {
      // Admin Navigation & Pane
      tabBtnTables: document.getElementById("tab-btn-tables"),
      paneTables: document.getElementById("pane-tables"),

      // Admin Settings Controls
      cbTablesEnabled: document.getElementById("cb-tables-enabled"),
      cbAutoClearPayment: document.getElementById("cb-tables-auto-clear"),
      selectLayoutPreset: document.getElementById("select-table-layout-preset"),
      btnApplyLayoutPreset: document.getElementById("btn-apply-table-preset"),
      btnAdminAddTable: document.getElementById("btn-admin-add-table"),
      btnAdminAddSection: document.getElementById("btn-admin-add-section"),
      selectAdminSection: document.getElementById("select-admin-table-section"),
      sectionsTagsContainer: document.getElementById("admin-sections-tags"),

      // Drawing Shapes Toolbar & View Switchers
      btnDrawSquare: document.getElementById("btn-draw-square"),
      btnDrawRound: document.getElementById("btn-draw-round"),
      btnDrawRect: document.getElementById("btn-draw-rect"),
      btnDrawCounter: document.getElementById("btn-draw-counter"),
      btnDrawWall: document.getElementById("btn-draw-wall"),
      btnTabViewCanvas: document.getElementById("btn-tab-view-canvas"),
      btnTabViewCards: document.getElementById("btn-tab-view-cards"),
      btnAdminSaveLayout: document.getElementById("btn-admin-save-layout"),

      // Admin 2D Visual Canvas & Grid
      adminCanvasView: document.getElementById("admin-canvas-view"),
      adminFloorCanvasWrap: document.getElementById("admin-floor-canvas-wrap"),
      adminFloorCanvas: document.getElementById("admin-floor-canvas"),
      adminTablesGrid: document.getElementById("admin-tables-grid"),

      // Stats Badges
      statTotalTables: document.getElementById("stat-total-tables"),
      statAvailableTables: document.getElementById("stat-available-tables"),
      statOccupiedTables: document.getElementById("stat-occupied-tables"),

      // Cashier Floor Plan Picker & Ticket Elements
      btnToggleTables: document.getElementById("btn-toggle-tables"),
      ticketTableBadge: document.getElementById("ticket-table-badge"),
      modalTablePicker: document.getElementById("modal-table-picker"),
      pickerSectionsBar: document.getElementById("picker-sections-bar"),
      btnCashierViewCanvas: document.getElementById("btn-cashier-view-canvas"),
      btnCashierViewGrid: document.getElementById("btn-cashier-view-grid"),
      cashierCanvasView: document.getElementById("cashier-canvas-view"),
      cashierFloorCanvasWrap: document.getElementById("cashier-floor-canvas-wrap"),
      cashierFloorCanvas: document.getElementById("cashier-floor-canvas"),
      pickerTablesGrid: document.getElementById("picker-tables-grid"),
      btnClosePicker: document.getElementById("btn-close-table-picker"),
      btnClearTicketTable: document.getElementById("btn-clear-ticket-table"),

      // Table Add/Edit Modal
      modalTableForm: document.getElementById("modal-table-form"),
      formTableId: document.getElementById("form-table-id"),
      formTableName: document.getElementById("form-table-name"),
      formTableSection: document.getElementById("form-table-section"),
      formTableSeats: document.getElementById("form-table-seats"),
      formTableShape: document.getElementById("form-table-shape"),
      formTableNotes: document.getElementById("form-table-notes"),
      btnSaveTable: document.getElementById("btn-save-table-form"),
      btnCancelTableForm: document.getElementById("btn-cancel-table-form"),
      btnDeleteTableForm: document.getElementById("btn-delete-table-form"),

      // Order Details & Bill Inspector Modal
      modalTableOrderDetails: document.getElementById("modal-table-order-details"),
      orderDetailsTableName: document.getElementById("order-details-table-name"),
      orderDetailsStatusBadge: document.getElementById("order-details-status-badge"),
      orderDetailsMeta: document.getElementById("order-details-meta"),
      orderDetailsTotal: document.getElementById("order-details-total"),
      orderDetailsItemCount: document.getElementById("order-details-item-count"),
      orderDetailsTbody: document.getElementById("order-details-tbody"),
      btnTableOrderAdd: document.getElementById("btn-table-order-add"),
      btnTableOrderPay: document.getElementById("btn-table-order-pay"),
      btnTableOrderPrintBill: document.getElementById("btn-table-order-print-bill"),
      btnTableOrderClear: document.getElementById("btn-table-order-clear"),
      btnCloseTableDetails: document.getElementById("btn-close-table-details")
    };

    if (this.initialized) return;
    this.initialized = true;

    // 1. Admin Master Toggles
    if (this.elements.cbTablesEnabled) {
      this.elements.cbTablesEnabled.onchange = async () => {
        await DB.saveTableSettings({ enabled: this.elements.cbTablesEnabled.checked });
        this.updateCashierVisibility();
      };
    }

    if (this.elements.cbAutoClearPayment) {
      this.elements.cbAutoClearPayment.onchange = async () => {
        await DB.saveTableSettings({ autoClearOnPayment: this.elements.cbAutoClearPayment.checked });
      };
    }

    // 2. Preset Reset Handler
    if (this.elements.btnApplyLayoutPreset) {
      this.elements.btnApplyLayoutPreset.onclick = async () => {
        const preset = this.elements.selectLayoutPreset ? this.elements.selectLayoutPreset.value : "restaurant";
        const label = preset.toUpperCase();
        if (confirm(`Reset table layout with the default ${label} floor plan? Current tables will be replaced.`)) {
          await DB.resetTableLayoutTemplate(preset);
          await this.loadData();
          alert(`Table setup reset to ${label} template.`);
        }
      };
    }

    // 3. Add Section Handler
    if (this.elements.btnAdminAddSection) {
      this.elements.btnAdminAddSection.onclick = async () => {
        const name = prompt("Enter new dining section name (e.g. Garden Terrace, 2nd Floor, VIP Bar):");
        if (!name || !name.trim()) return;
        const cleanName = name.trim();
        const settings = await DB.getTableSettings();
        const sections = Array.isArray(settings.sections) ? [...settings.sections] : ["Main Dining"];
        if (sections.includes(cleanName)) {
          alert("Section already exists.");
          return;
        }
        sections.push(cleanName);
        await DB.saveTableSettings({ sections });
        await this.loadData();
      };
    }

    // 4. Admin Section Filter
    if (this.elements.selectAdminSection) {
      this.elements.selectAdminSection.onchange = () => {
        this.activeSection = this.elements.selectAdminSection.value;
        this.renderAdminCanvas();
        this.renderAdminTables();
      };
    }

    // 5. Basic Shape Palette Buttons (Quick Draw)
    if (this.elements.btnDrawSquare) {
      this.elements.btnDrawSquare.onclick = () => this.addShape("square");
    }
    if (this.elements.btnDrawRound) {
      this.elements.btnDrawRound.onclick = () => this.addShape("round");
    }
    if (this.elements.btnDrawRect) {
      this.elements.btnDrawRect.onclick = () => this.addShape("rectangle");
    }
    if (this.elements.btnDrawCounter) {
      this.elements.btnDrawCounter.onclick = () => this.addShape("counter");
    }
    if (this.elements.btnDrawWall) {
      this.elements.btnDrawWall.onclick = () => this.addShape("wall");
    }

    // 6. Admin View Mode Switchers
    if (this.elements.btnTabViewCanvas) {
      this.elements.btnTabViewCanvas.onclick = () => {
        this.adminViewMode = "canvas";
        this.elements.btnTabViewCanvas.classList.add("active");
        if (this.elements.btnTabViewCards) this.elements.btnTabViewCards.classList.remove("active");
        if (this.elements.adminCanvasView) this.elements.adminCanvasView.classList.remove("hidden");
        if (this.elements.adminTablesGrid) this.elements.adminTablesGrid.classList.add("hidden");
        this.renderAdminCanvas();
      };
    }

    if (this.elements.btnTabViewCards) {
      this.elements.btnTabViewCards.onclick = () => {
        this.adminViewMode = "cards";
        this.elements.btnTabViewCards.classList.add("active");
        if (this.elements.btnTabViewCanvas) this.elements.btnTabViewCanvas.classList.remove("active");
        if (this.elements.adminCanvasView) this.elements.adminCanvasView.classList.add("hidden");
        if (this.elements.adminTablesGrid) this.elements.adminTablesGrid.classList.remove("hidden");
        this.renderAdminTables();
      };
    }

    if (this.elements.btnAdminSaveLayout) {
      this.elements.btnAdminSaveLayout.onclick = async () => {
        for (const t of this.tables) {
          await DB.saveTable(t);
        }
        alert("Floor plan layout positions saved.");
      };
    }

    // 7. Add Table Form Trigger
    if (this.elements.btnAdminAddTable) {
      this.elements.btnAdminAddTable.onclick = () => {
        this.openTableModal(null);
      };
    }

    // 8. Modal Form Actions
    if (this.elements.btnSaveTable) {
      this.elements.btnSaveTable.onclick = async () => {
        await this.saveTableFromForm();
      };
    }

    if (this.elements.btnCancelTableForm) {
      this.elements.btnCancelTableForm.onclick = () => {
        if (this.elements.modalTableForm) this.elements.modalTableForm.close();
      };
    }

    if (this.elements.btnDeleteTableForm) {
      this.elements.btnDeleteTableForm.onclick = async () => {
        if (this.editingTableId) {
          if (confirm("Are you sure you want to permanently delete this table?")) {
            await DB.deleteTable(this.editingTableId);
            if (this.elements.modalTableForm) this.elements.modalTableForm.close();
            await this.loadData();
          }
        }
      };
    }

    // 9. Cashier Register Floor Plan Trigger
    if (this.elements.btnToggleTables) {
      this.elements.btnToggleTables.onclick = async () => {
        await this.openTablePicker();
      };
    }

    if (this.elements.ticketTableBadge) {
      this.elements.ticketTableBadge.onclick = async () => {
        await this.openTablePicker();
      };
    }

    if (this.elements.btnClosePicker) {
      this.elements.btnClosePicker.onclick = () => {
        if (this.elements.modalTablePicker) this.elements.modalTablePicker.close();
      };
    }

    // Cashier View Switchers
    if (this.elements.btnCashierViewCanvas) {
      this.elements.btnCashierViewCanvas.onclick = () => {
        this.cashierViewMode = "canvas";
        this.elements.btnCashierViewCanvas.classList.add("active");
        if (this.elements.btnCashierViewGrid) this.elements.btnCashierViewGrid.classList.remove("active");
        if (this.elements.cashierCanvasView) this.elements.cashierCanvasView.classList.remove("hidden");
        if (this.elements.pickerTablesGrid) this.elements.pickerTablesGrid.classList.add("hidden");
        this.renderCashierCanvas();
      };
    }

    if (this.elements.btnCashierViewGrid) {
      this.elements.btnCashierViewGrid.onclick = () => {
        this.cashierViewMode = "grid";
        this.elements.btnCashierViewGrid.classList.add("active");
        if (this.elements.btnCashierViewCanvas) this.elements.btnCashierViewCanvas.classList.remove("active");
        if (this.elements.cashierCanvasView) this.elements.cashierCanvasView.classList.add("hidden");
        if (this.elements.pickerTablesGrid) this.elements.pickerTablesGrid.classList.remove("hidden");
        this.renderPickerGrid();
      };
    }

    if (this.elements.btnClearTicketTable) {
      this.elements.btnClearTicketTable.onclick = async () => {
        const activeTicket = Cart.getActiveTicket();
        if (activeTicket.tableId) {
          await DB.setTableStatus(activeTicket.tableId, "available", {
            activeOrderId: null,
            orderTotal: 0
          });
        }
        delete activeTicket.tableId;
        delete activeTicket.tableName;
        delete activeTicket.tableSection;
        Cart.notify();
        this.updateCashierBadge();
        if (this.elements.modalTablePicker) this.elements.modalTablePicker.close();
      };
    }

    // 10. Table Order Details Modal Actions
    if (this.elements.btnCloseTableDetails) {
      this.elements.btnCloseTableDetails.onclick = () => {
        if (this.elements.modalTableOrderDetails) this.elements.modalTableOrderDetails.close();
      };
    }

    if (this.elements.btnTableOrderAdd) {
      this.elements.btnTableOrderAdd.onclick = () => {
        if (!this.activeDetailTable) return;
        Cart.loadOrder(
          this.activeDetailTable.activeOrderItems || [],
          this.activeDetailTable.id,
          this.activeDetailTable.name,
          this.activeDetailTable.section
        );
        if (this.elements.modalTableOrderDetails) this.elements.modalTableOrderDetails.close();
        if (this.elements.modalTablePicker) this.elements.modalTablePicker.close();
        this.updateCashierBadge();
      };
    }

    if (this.elements.btnTableOrderPay) {
      this.elements.btnTableOrderPay.onclick = () => {
        if (!this.activeDetailTable) return;
        Cart.loadOrder(
          this.activeDetailTable.activeOrderItems || [],
          this.activeDetailTable.id,
          this.activeDetailTable.name,
          this.activeDetailTable.section
        );
        if (this.elements.modalTableOrderDetails) this.elements.modalTableOrderDetails.close();
        if (this.elements.modalTablePicker) this.elements.modalTablePicker.close();
        this.updateCashierBadge();
        CheckoutUI.openCashConfirmationModal();
      };
    }

    if (this.elements.btnTableOrderPrintBill) {
      this.elements.btnTableOrderPrintBill.onclick = async () => {
        if (!this.activeDetailTable) return;
        const items = this.activeDetailTable.activeOrderItems || [];
        try {
          await Printer.printBillSlip(this.activeDetailTable, items);
          alert(`🖨️ Bill slip sent to thermal printer for ${this.activeDetailTable.name}.`);
        } catch (err) {
          alert("Error printing bill slip: " + err.message);
        }
      };
    }

    if (this.elements.btnTableOrderClear) {
      this.elements.btnTableOrderClear.onclick = async () => {
        if (!this.activeDetailTable) return;
        if (confirm(`Clear ${this.activeDetailTable.name}? Occupancy and active order items will be released.`)) {
          await DB.clearTable(this.activeDetailTable.id);
          if (this.elements.modalTableOrderDetails) this.elements.modalTableOrderDetails.close();
          await this.loadData();
          if (this.elements.modalTablePicker && this.elements.modalTablePicker.open) {
            this.renderCashierCanvas();
            this.renderPickerGrid();
          }
        }
      };
    }

    // 11. Event Bus Hooks
    Bus.on("cart:updated", () => {
      this.updateCashierBadge();
    });

    Bus.on("tables:updated", async () => {
      await this.loadData();
    });

    // Initial Load
    await this.loadData();
  },

  /**
   * Loads settings and table data from Dexie IndexedDB
   */
  async loadData() {
    this.settings = await DB.getTableSettings();
    this.tables = await DB.getTables();

    // Populate Master Checkbox
    if (this.elements.cbTablesEnabled) {
      this.elements.cbTablesEnabled.checked = this.settings.enabled !== false;
    }
    if (this.elements.cbAutoClearPayment) {
      this.elements.cbAutoClearPayment.checked = this.settings.autoClearOnPayment !== false;
    }
    if (this.elements.selectLayoutPreset) {
      this.elements.selectLayoutPreset.value = this.settings.layoutType || "restaurant";
    }

    this.populateSectionSelects();
    this.renderAdminCanvas();
    this.renderAdminTables();
    this.updateStats();
    this.updateCashierVisibility();
    this.updateCashierBadge();
  },

  /**
   * Populates section dropdown options and tag list
   */
  populateSectionSelects() {
    const sections = Array.isArray(this.settings.sections) && this.settings.sections.length > 0
      ? this.settings.sections
      : ["Main Dining"];

    // Admin filter select
    if (this.elements.selectAdminSection) {
      const currentVal = this.elements.selectAdminSection.value || "all";
      this.elements.selectAdminSection.innerHTML = `
        <option value="all">All Sections (${this.tables.length})</option>
        ${sections.map((s) => `<option value="${s}">${s}</option>`).join("")}
      `;
      this.elements.selectAdminSection.value = currentVal;
    }

    // Modal form section select
    if (this.elements.formTableSection) {
      this.elements.formTableSection.innerHTML = sections.map((s) => `
        <option value="${s}">${s}</option>
      `).join("");
    }

    // Admin sections tags with delete action
    if (this.elements.sectionsTagsContainer) {
      this.elements.sectionsTagsContainer.innerHTML = sections.map((sec) => `
        <span class="badge" style="background: var(--bg-alt); border: var(--border); color: var(--text); padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px; font-size: 0.76rem;">
          ${sec}
          ${sections.length > 1 ? `<button type="button" class="btn-delete-section" data-section="${sec}" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.8rem; padding: 0;" title="Delete Section">✖</button>` : ""}
        </span>
      `).join("");

      this.elements.sectionsTagsContainer.querySelectorAll(".btn-delete-section").forEach((btn) => {
        btn.onclick = async () => {
          const sec = btn.dataset.section;
          if (confirm(`Delete section "${sec}"? Tables in this section will be moved to "${sections[0]}".`)) {
            const updatedSections = sections.filter((s) => s !== sec);
            for (const t of this.tables.filter((t) => t.section === sec)) {
              t.section = updatedSections[0];
              await DB.saveTable(t);
            }
            await DB.saveTableSettings({ sections: updatedSections });
            await this.loadData();
          }
        };
      });
    }
  },

  /**
   * Adds a basic shape to the dining area with automatic next numbering
   * @param {string} shape - 'square' | 'round' | 'rectangle' | 'counter' | 'wall'
   */
  async addShape(shape) {
    let maxNum = 0;
    this.tables.forEach((t) => {
      const match = (t.name || "").match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    const nextNum = maxNum + 1;

    let defaultName = `Table ${nextNum}`;
    let defaultSeats = 4;
    if (shape === "counter") {
      defaultName = `Counter ${nextNum}`;
      defaultSeats = 2;
    } else if (shape === "wall") {
      defaultName = `Divider ${nextNum}`;
      defaultSeats = 0;
    } else if (shape === "rectangle") {
      defaultSeats = 6;
    }

    const count = this.tables.length;
    const posX = 30 + ((count % 6) * 140);
    const posY = 30 + (Math.floor(count / 6) * 100);

    const defaultSection = (this.activeSection !== "all" && this.activeSection) 
      ? this.activeSection 
      : (this.settings.sections?.[0] || "Main Dining");

    const newTable = {
      id: `TBL-${Date.now().toString().slice(-5)}`,
      name: defaultName,
      section: defaultSection,
      seats: defaultSeats,
      shape: shape,
      status: "available",
      posX: posX,
      posY: posY,
      activeOrderId: null,
      orderTotal: 0
    };

    await DB.saveTable(newTable);
    await this.loadData();
  },

  /**
   * Renders the 2D Visual Floor Plan Designer Canvas for Admin
   */
  renderAdminCanvas() {
    if (!this.elements.adminFloorCanvas) return;
    this.elements.adminFloorCanvas.innerHTML = "";

    let filtered = this.tables;
    if (this.activeSection && this.activeSection !== "all") {
      filtered = this.tables.filter((t) => t.section === this.activeSection);
    }

    filtered.forEach((table) => {
      const token = document.createElement("div");
      token.className = `floor-token floor-token-${table.shape || 'square'} status-${table.status || 'available'}`;
      token.dataset.id = table.id;

      const posX = typeof table.posX === "number" ? table.posX : 30;
      const posY = typeof table.posY === "number" ? table.posY : 30;
      token.style.left = `${posX}px`;
      token.style.top = `${posY}px`;

      if (table.shape === "wall") {
        token.innerHTML = `<span style="font-weight: 700; letter-spacing: 0.5px;">🧱 ${table.name}</span>`;
      } else if (table.shape === "counter") {
        token.innerHTML = `
          <div style="font-size: 0.8rem; font-weight: 800; display: flex; align-items: center; gap: 4px;">
            <span>☕</span> <span>${table.name}</span>
          </div>
          <small style="font-size: 0.65rem; opacity: 0.85;">${table.seats} Seats</small>
        `;
      } else {
        const isOccupied = table.status === "occupied" || table.status === "billed";
        const statusBadge = isOccupied
          ? `<span class="badge" style="background: #ef4444; color: #fff; font-size: 0.62rem; padding: 1px 4px; margin-top: 2px;">₱${Number(table.orderTotal || 0).toFixed(0)}</span>`
          : `<span class="badge" style="background: #22c55e; color: #fff; font-size: 0.62rem; padding: 1px 4px; margin-top: 2px;">${table.seats} 🪑</span>`;

        token.innerHTML = `
          <b style="font-size: 0.88rem; line-height: 1.1;">${table.name}</b>
          ${statusBadge}
        `;
      }

      // Pointer Drag-and-Drop Handler
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;
      let hasMoved = false;

      token.onpointerdown = (e) => {
        // Prevent default text selection during drag
        e.preventDefault();
        token.setPointerCapture(e.pointerId);

        isDragging = true;
        hasMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = parseInt(token.style.left, 10) || 0;
        initialTop = parseInt(token.style.top, 10) || 0;
        token.classList.add("dragging");
      };

      token.onpointermove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (Math.hypot(dx, dy) > 5) {
          hasMoved = true;
        }

        let newX = Math.round((initialLeft + dx) / 10) * 10;
        let newY = Math.round((initialTop + dy) / 10) * 10;

        newX = Math.max(10, Math.min(newX, 900));
        newY = Math.max(10, Math.min(newY, 560));

        token.style.left = `${newX}px`;
        token.style.top = `${newY}px`;
        table.posX = newX;
        table.posY = newY;
      };

      const handlePointerEnd = async (e) => {
        if (!isDragging) return;
        isDragging = false;
        token.classList.remove("dragging");
        try {
          token.releasePointerCapture(e.pointerId);
        } catch (_) {}

        if (hasMoved) {
          await DB.saveTable(table);
        } else {
          // Click: Open edit modal
          this.openTableModal(table);
        }
      };

      token.onpointerup = handlePointerEnd;
      token.onpointercancel = handlePointerEnd;

      this.elements.adminFloorCanvas.appendChild(token);
    });
  },

  /**
   * Renders table cards inside the Admin Management Pane (Alternative View)
   */
  renderAdminTables() {
    if (!this.elements.adminTablesGrid) return;

    let filtered = this.tables;
    if (this.activeSection && this.activeSection !== "all") {
      filtered = this.tables.filter((t) => t.section === this.activeSection);
    }

    if (filtered.length === 0) {
      this.elements.adminTablesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 36px 12px; background: var(--bg-alt); border: var(--border); border-radius: var(--radius); color: var(--text-muted);">
          🪑 No tables found in this section.<br/>
          Use the <b>🎨 Draw Elements</b> buttons above to place tables on your floor plan.
        </div>
      `;
      return;
    }

    const shapeIcons = {
      square: "⬛",
      round: "⚪",
      rectangle: "▬",
      counter: "☕",
      wall: "🧱"
    };

    const statusColors = {
      available: "#22c55e",
      occupied: "#f59e0b",
      billed: "#3b82f6",
      reserved: "#8b5cf6"
    };

    this.elements.adminTablesGrid.innerHTML = filtered.map((t) => {
      const icon = shapeIcons[t.shape] || "⬛";
      const statusColor = statusColors[t.status] || "#22c55e";

      return `
        <div class="table-admin-card" style="background: var(--bg-card); border: var(--border); border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; gap: 8px; position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-weight: 800; font-size: 1rem; color: var(--text); display: flex; align-items: center; gap: 6px;">
                <span>${icon}</span>
                <span>${t.name}</span>
              </div>
              <small style="color: var(--text-muted); font-size: 0.72rem;">${t.section} • ${t.seats} Seats</small>
            </div>
            <span class="badge" style="background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">
              ${t.status}
            </span>
          </div>

          ${t.status === "occupied" ? `
            <div style="font-size: 0.75rem; background: var(--bg-alt); padding: 6px 8px; border-radius: 4px; display: flex; justify-content: space-between;">
              <span>Bill: <b>₱${Number(t.orderTotal || 0).toFixed(2)}</b></span>
              <span>Guests: <b>${t.guestCount || 0}</b></span>
            </div>
          ` : ""}

          <div style="display: flex; gap: 6px; margin-top: auto;">
            <button type="button" class="btn-tool btn-sm btn-edit-table" data-id="${t.id}" style="flex: 1;">✏️ Edit</button>
            ${t.status === "occupied" ? `
              <button type="button" class="btn-tool btn-danger-outline btn-sm btn-clear-table" data-id="${t.id}" title="Clear Table">🧹 Clear</button>
            ` : ""}
          </div>
        </div>
      `;
    }).join("");

    this.elements.adminTablesGrid.querySelectorAll(".btn-edit-table").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const table = this.tables.find((t) => t.id === id);
        if (table) this.openTableModal(table);
      };
    });

    this.elements.adminTablesGrid.querySelectorAll(".btn-clear-table").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        if (confirm("Clear table occupancy and set back to Available?")) {
          await DB.clearTable(id);
          await this.loadData();
        }
      };
    });
  },

  /**
   * Updates occupancy and total table metric counters
   */
  updateStats() {
    const total = this.tables.length;
    const available = this.tables.filter((t) => t.status === "available").length;
    const occupied = this.tables.filter((t) => t.status === "occupied" || t.status === "billed").length;

    if (this.elements.statTotalTables) this.elements.statTotalTables.textContent = `${total} Tables`;
    if (this.elements.statAvailableTables) this.elements.statAvailableTables.textContent = `${available} Available`;
    if (this.elements.statOccupiedTables) this.elements.statOccupiedTables.textContent = `${occupied} Occupied`;
  },

  /**
   * Shows or hides table buttons on the cashier register based on settings
   */
  updateCashierVisibility() {
    const isEnabled = this.settings.enabled !== false;
    if (this.elements.btnToggleTables) {
      this.elements.btnToggleTables.classList.toggle("hidden", !isEnabled);
    }
    if (this.elements.ticketTableBadge) {
      this.elements.ticketTableBadge.classList.toggle("hidden", !isEnabled);
    }
  },

  /**
   * Updates the cashier topbar and ticket badge with active table name
   */
  updateCashierBadge() {
    const activeTicket = Cart.getActiveTicket();
    const hasTable = activeTicket && activeTicket.tableName;

    if (this.elements.btnToggleTables) {
      this.elements.btnToggleTables.textContent = hasTable ? `🪑 ${activeTicket.tableName}` : "🪑 Table";
      this.elements.btnToggleTables.style.background = hasTable ? "var(--accent)" : "";
      this.elements.btnToggleTables.style.color = hasTable ? "#ffffff" : "";
    }

    if (this.elements.ticketTableBadge) {
      if (hasTable) {
        this.elements.ticketTableBadge.textContent = `🪑 ${activeTicket.tableName}`;
        this.elements.ticketTableBadge.style.display = "inline-block";
        this.elements.ticketTableBadge.title = `Table: ${activeTicket.tableName} (${activeTicket.tableSection || 'Dining'}) - Click to change`;
      } else {
        this.elements.ticketTableBadge.textContent = "🪑 Assign Table";
        this.elements.ticketTableBadge.style.display = this.settings.enabled !== false ? "inline-block" : "none";
        this.elements.ticketTableBadge.title = "Click to assign order to a dining table";
      }
    }
  },

  /**
   * Opens the Table Add/Edit Modal
   */
  openTableModal(table = null) {
    if (!this.elements.modalTableForm) return;

    if (table) {
      this.editingTableId = table.id;
      if (this.elements.formTableId) this.elements.formTableId.value = table.id;
      if (this.elements.formTableName) this.elements.formTableName.value = table.name || "";
      if (this.elements.formTableSection) this.elements.formTableSection.value = table.section || "Main Dining";
      if (this.elements.formTableSeats) this.elements.formTableSeats.value = table.seats || 4;
      if (this.elements.formTableShape) this.elements.formTableShape.value = table.shape || "square";
      if (this.elements.formTableNotes) this.elements.formTableNotes.value = table.notes || "";
      if (this.elements.btnDeleteTableForm) this.elements.btnDeleteTableForm.classList.remove("hidden");
    } else {
      this.editingTableId = null;
      const nextNum = this.tables.length + 1;
      if (this.elements.formTableId) this.elements.formTableId.value = "";
      if (this.elements.formTableName) this.elements.formTableName.value = `Table ${nextNum}`;
      if (this.elements.formTableSeats) this.elements.formTableSeats.value = 4;
      if (this.elements.formTableShape) this.elements.formTableShape.value = "square";
      if (this.elements.formTableNotes) this.elements.formTableNotes.value = "";
      if (this.elements.btnDeleteTableForm) this.elements.btnDeleteTableForm.classList.add("hidden");
    }

    this.elements.modalTableForm.showModal();
    if (this.elements.formTableName) this.elements.formTableName.focus();
  },

  /**
   * Commits table additions/edits from modal form
   */
  async saveTableFromForm() {
    const name = this.elements.formTableName ? this.elements.formTableName.value.trim() : "";
    if (!name) {
      alert("Please enter a table name or number.");
      return;
    }

    const payload = {
      id: this.editingTableId || `TBL-${Date.now().toString().slice(-4)}`,
      name,
      section: this.elements.formTableSection ? this.elements.formTableSection.value : "Main Dining",
      seats: Number(this.elements.formTableSeats ? this.elements.formTableSeats.value : 4) || 0,
      shape: this.elements.formTableShape ? this.elements.formTableShape.value : "square",
      notes: this.elements.formTableNotes ? this.elements.formTableNotes.value.trim() : ""
    };

    if (this.editingTableId) {
      const existing = this.tables.find((t) => t.id === this.editingTableId);
      if (existing) {
        payload.status = existing.status;
        payload.activeOrderId = existing.activeOrderId;
        payload.guestCount = existing.guestCount;
        payload.orderTotal = existing.orderTotal;
        payload.posX = existing.posX;
        payload.posY = existing.posY;
        payload.activeOrderItems = existing.activeOrderItems;
        payload.seatedAt = existing.seatedAt;
      }
    }

    await DB.saveTable(payload);
    if (this.elements.modalTableForm) this.elements.modalTableForm.close();
    await this.loadData();
  },

  /**
   * =============================================================
   * CASHIER INTERACTIVE FLOOR PLAN PICKER & ORDER INSPECTOR
   * =============================================================
   */
  async openTablePicker() {
    if (!this.elements.modalTablePicker) return;
    await this.loadData();
    this.pickerSection = "all";

    this.renderPickerSectionsBar();
    if (this.cashierViewMode === "canvas") {
      this.renderCashierCanvas();
    } else {
      this.renderPickerGrid();
    }

    this.elements.modalTablePicker.showModal();
  },

  renderPickerSectionsBar() {
    const sections = Array.isArray(this.settings.sections) && this.settings.sections.length > 0
      ? this.settings.sections
      : ["Main Dining"];

    if (this.elements.pickerSectionsBar) {
      this.elements.pickerSectionsBar.innerHTML = `
        <button type="button" class="btn-tool btn-sm btn-picker-sec ${this.pickerSection === 'all' ? 'active' : ''}" data-sec="all">
          All Areas (${this.tables.length})
        </button>
        ${sections.map((s) => `
          <button type="button" class="btn-tool btn-sm btn-picker-sec ${this.pickerSection === s ? 'active' : ''}" data-sec="${s}">
            ${s}
          </button>
        `).join("")}
      `;

      this.elements.pickerSectionsBar.querySelectorAll(".btn-picker-sec").forEach((btn) => {
        btn.onclick = () => {
          this.pickerSection = btn.dataset.sec;
          this.renderPickerSectionsBar();
          if (this.cashierViewMode === "canvas") {
            this.renderCashierCanvas();
          } else {
            this.renderPickerGrid();
          }
        };
      });
    }
  },

  /**
   * Renders the interactive 2D Visual Floor Map in Cashier Picker
   */
  renderCashierCanvas() {
    if (!this.elements.cashierFloorCanvas) return;
    this.elements.cashierFloorCanvas.innerHTML = "";

    let filtered = this.tables;
    if (this.pickerSection !== "all") {
      filtered = this.tables.filter((t) => t.section === this.pickerSection);
    }

    const activeTicket = Cart.getActiveTicket();
    const currentTableId = activeTicket ? activeTicket.tableId : null;

    filtered.forEach((table) => {
      const token = document.createElement("div");
      const isCurrent = table.id === currentTableId;
      const isOccupied = table.status === "occupied" || table.status === "billed";

      token.className = `floor-token cashier-canvas-token floor-token-${table.shape || 'square'} status-${table.status || 'available'} ${isCurrent ? 'status-active-order' : ''}`;
      token.dataset.id = table.id;

      const posX = typeof table.posX === "number" ? table.posX : 30;
      const posY = typeof table.posY === "number" ? table.posY : 30;
      token.style.left = `${posX}px`;
      token.style.top = `${posY}px`;

      if (table.shape === "wall") {
        token.style.cursor = "default";
        token.innerHTML = `<span style="font-weight: 700; font-size: 0.65rem;">🧱 ${table.name}</span>`;
      } else if (table.shape === "counter") {
        token.innerHTML = `
          <div style="font-size: 0.8rem; font-weight: 800; display: flex; align-items: center; gap: 4px;">
            <span>☕</span> <span>${table.name}</span>
          </div>
          <span class="badge" style="font-size: 0.62rem; padding: 1px 4px; background: ${isCurrent ? 'var(--accent)' : isOccupied ? '#ef4444' : '#22c55e'}; color: #fff;">
            ${isCurrent ? "ACTIVE" : isOccupied ? `₱${Number(table.orderTotal || 0).toFixed(0)}` : "AVAILABLE"}
          </span>
        `;
      } else {
        const badgeBg = isCurrent ? "var(--accent)" : isOccupied ? "#ef4444" : "#22c55e";
        const badgeText = isCurrent ? "ACTIVE" : isOccupied ? `₱${Number(table.orderTotal || 0).toFixed(0)}` : "AVAILABLE";

        token.innerHTML = `
          <b style="font-size: 0.88rem; line-height: 1.1;">${table.name}</b>
          <span class="badge" style="background: ${badgeBg}; color: #ffffff; font-size: 0.64rem; margin-top: 3px; padding: 2px 6px;">
            ${badgeText}
          </span>
        `;
      }

      // Cashier Click Behavior
      token.onclick = () => {
        if (table.shape === "wall") return;
        this.handleCashierTableClick(table);
      };

      this.elements.cashierFloorCanvas.appendChild(token);
    });
  },

  /**
   * Alternative Grid View for Cashier Picker
   */
  renderPickerGrid() {
    if (!this.elements.pickerTablesGrid) return;

    let filtered = this.tables;
    if (this.pickerSection !== "all") {
      filtered = this.tables.filter((t) => t.section === this.pickerSection);
    }

    const activeTicket = Cart.getActiveTicket();
    const currentTableId = activeTicket ? activeTicket.tableId : null;

    this.elements.pickerTablesGrid.innerHTML = filtered.map((t) => {
      const isCurrent = t.id === currentTableId;
      const isOccupied = t.status === "occupied" || t.status === "billed";
      const statusBg = isCurrent ? "var(--accent)" : isOccupied ? "#ef4444" : "#16a34a";
      const shapeStyle = t.shape === "round" ? "border-radius: 50%;" : t.shape === "rectangle" ? "border-radius: 8px; aspect-ratio: 1.6/1;" : "border-radius: 10px; aspect-ratio: 1/1;";

      return `
        <div 
          class="cashier-table-tile ${isCurrent ? 'active' : ''}" 
          data-id="${t.id}"
          style="background: var(--bg-card); border: 2px solid ${statusBg}; ${shapeStyle} padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; text-align: center; transition: transform 0.15s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.2);"
        >
          <b style="font-size: 0.95rem; color: var(--text);">${t.name}</b>
          <small style="font-size: 0.68rem; color: var(--text-muted);">${t.seats} Seats</small>
          <span class="badge" style="background: ${statusBg}; color: #ffffff; font-size: 0.64rem; margin-top: 4px; padding: 2px 6px;">
            ${isCurrent ? "ACTIVE ORDER" : isOccupied ? `₱${Number(t.orderTotal || 0).toFixed(0)}` : "AVAILABLE"}
          </span>
        </div>
      `;
    }).join("");

    this.elements.pickerTablesGrid.querySelectorAll(".cashier-table-tile").forEach((tile) => {
      tile.onclick = () => {
        const tableId = tile.dataset.id;
        const table = this.tables.find((t) => t.id === tableId);
        if (table) this.handleCashierTableClick(table);
      };
    });
  },

  /**
   * Cashier Table Click Logic:
   * - If Available: assigns active ticket / seats order
   * - If Occupied: opens Table Order Details & Bill Inspector Modal
   */
  async handleCashierTableClick(table) {
    const activeTicket = Cart.getActiveTicket();
    const isCurrent = activeTicket && activeTicket.tableId === table.id;

    if (table.status === "occupied" || table.status === "billed") {
      // Open Order Details Modal
      this.openOrderDetailsModal(table);
      return;
    }

    // Available table: assign order to table
    activeTicket.tableId = table.id;
    activeTicket.tableName = table.name;
    activeTicket.tableSection = table.section;

    const cartCalc = Cart.calculate();
    const hasItems = activeTicket.items && activeTicket.items.length > 0;

    await DB.setTableStatus(table.id, hasItems ? "occupied" : "available", {
      activeOrderId: activeTicket.id,
      orderTotal: cartCalc.total || 0,
      activeOrderItems: activeTicket.items || [],
      seatedAt: Date.now()
    });

    Cart.notify();
    this.updateCashierBadge();
    if (this.elements.modalTablePicker) this.elements.modalTablePicker.close();
  },

  /**
   * Opens the Table Order Details & Bill Inspector Modal
   * Displays running total, elapsed time, itemized list, Add Items, Pay & Bill Out, Print Bill
   */
  openOrderDetailsModal(table) {
    this.activeDetailTable = table;
    if (!this.elements.modalTableOrderDetails) return;

    if (this.elements.orderDetailsTableName) {
      this.elements.orderDetailsTableName.textContent = table.name;
    }
    if (this.elements.orderDetailsStatusBadge) {
      this.elements.orderDetailsStatusBadge.textContent = (table.status || "occupied").toUpperCase();
    }

    if (this.elements.orderDetailsMeta) {
      const elapsedMs = table.seatedAt ? (Date.now() - table.seatedAt) : 0;
      const mins = Math.floor(elapsedMs / 60000);
      const timeStr = mins > 0 ? `Seated ${mins} min${mins > 1 ? "s" : ""} ago` : "Recently seated";
      this.elements.orderDetailsMeta.textContent = `${table.section || 'Dining'} • ${table.seats || 4} Seats • ${timeStr}`;
    }

    const total = Number(table.orderTotal || 0);
    if (this.elements.orderDetailsTotal) {
      this.elements.orderDetailsTotal.textContent = `₱${total.toFixed(2)}`;
    }

    const items = Array.isArray(table.activeOrderItems) ? table.activeOrderItems : [];
    if (this.elements.orderDetailsItemCount) {
      this.elements.orderDetailsItemCount.textContent = `${items.length} Item${items.length === 1 ? '' : 's'}`;
    }

    if (this.elements.orderDetailsTbody) {
      if (items.length === 0) {
        this.elements.orderDetailsTbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 18px 8px;">
              No item details recorded yet for this table.
            </td>
          </tr>
        `;
      } else {
        this.elements.orderDetailsTbody.innerHTML = items.map((it) => {
          const unitPrice = Number(it.price || 0);
          const lineTotal = unitPrice * Number(it.qty || 1);
          return `
            <tr>
              <td>
                <div style="font-weight: 700;">${it.name || "Item"}</div>
                ${it.variant ? `<small style="color: var(--text-muted); font-size: 0.72rem;">${it.variant}</small>` : ""}
              </td>
              <td style="text-align: center; font-weight: 700;">${it.qty}x</td>
              <td style="text-align: right; color: var(--text-muted);">₱${unitPrice.toFixed(2)}</td>
              <td style="text-align: right; font-weight: 700;">₱${lineTotal.toFixed(2)}</td>
            </tr>
          `;
        }).join("");
      }
    }

    this.elements.modalTableOrderDetails.showModal();
  }
};

// REMARK: ADMIN_TABLES_DINING_FLOOR_PLAN_MODULE_COMPLETE
