/**
 * Module Description: Dining & Floor Plan Table Layout Management Sub-Module
 * Provides manual visual table setup, custom dining sections (e.g. Main Hall,
 * Patio, VIP Room, Canteen Benches), versatile venue presets (Cafe, Restaurant, Canteen),
 * seat capacities, table shapes (square, round, rectangle), real-time cashier table
 * selector modal, active ticket table assignment, order linking, receipt printing,
 * and automatic table release upon checkout completion.
 */

import { DB } from "../db.js";
import { Bus } from "../bus.js";
import { Cart } from "../cart.js";

export const AdminTables = {
  initialized: false,
  settings: {},
  tables: [],
  activeSection: "all",
  editingTableId: null,

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
      adminTablesGrid: document.getElementById("admin-tables-grid"),
      sectionsTagsContainer: document.getElementById("admin-sections-tags"),

      // Stats Badges
      statTotalTables: document.getElementById("stat-total-tables"),
      statAvailableTables: document.getElementById("stat-available-tables"),
      statOccupiedTables: document.getElementById("stat-occupied-tables"),

      // Cashier Floor Plan Picker & Ticket Elements
      btnToggleTables: document.getElementById("btn-toggle-tables"),
      ticketTableBadge: document.getElementById("ticket-table-badge"),
      modalTablePicker: document.getElementById("modal-table-picker"),
      pickerSectionsBar: document.getElementById("picker-sections-bar"),
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
      btnDeleteTableForm: document.getElementById("btn-delete-table-form")
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
        if (confirm(`Reset and populate table layout with the default ${label} floor plan template? Current tables will be replaced.`)) {
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
        this.renderAdminTables();
      };
    }

    // 5. Add Table Form Trigger
    if (this.elements.btnAdminAddTable) {
      this.elements.btnAdminAddTable.onclick = () => {
        this.openTableModal(null);
      };
    }

    // 6. Modal Form Actions
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

    // 7. Cashier Register Floor Plan Trigger
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

    // 8. Event Bus Hooks
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
            // Move tables to default section
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
   * Renders table cards inside the Admin Management Pane
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
          Click <b>➕ Add New Table</b> to configure your dining layout.
        </div>
      `;
      return;
    }

    const shapeIcons = {
      square: "⬛",
      round: "⚪",
      rectangle: "▬"
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

    // Bind Edit Table buttons
    this.elements.adminTablesGrid.querySelectorAll(".btn-edit-table").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const table = this.tables.find((t) => t.id === id);
        if (table) this.openTableModal(table);
      };
    });

    // Bind Clear Table buttons
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
      seats: Number(this.elements.formTableSeats ? this.elements.formTableSeats.value : 4) || 4,
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
      }
    }

    await DB.saveTable(payload);
    if (this.elements.modalTableForm) this.elements.modalTableForm.close();
    await this.loadData();
  },

  /**
   * =============================================================
   * CASHIER INTERACTIVE FLOOR PLAN PICKER MODAL
   * =============================================================
   */
  async openTablePicker() {
    if (!this.elements.modalTablePicker) return;
    await this.loadData();

    let pickerSection = "all";

    const renderPicker = () => {
      // 1. Render Section Filter Tabs
      const sections = Array.isArray(this.settings.sections) && this.settings.sections.length > 0
        ? this.settings.sections
        : ["Main Dining"];

      if (this.elements.pickerSectionsBar) {
        this.elements.pickerSectionsBar.innerHTML = `
          <button type="button" class="btn-tool btn-sm btn-picker-sec ${pickerSection === 'all' ? 'active' : ''}" data-sec="all">
            All Areas (${this.tables.length})
          </button>
          ${sections.map((s) => `
            <button type="button" class="btn-tool btn-sm btn-picker-sec ${pickerSection === s ? 'active' : ''}" data-sec="${s}">
              ${s}
            </button>
          `).join("")}
        `;

        this.elements.pickerSectionsBar.querySelectorAll(".btn-picker-sec").forEach((btn) => {
          btn.onclick = () => {
            pickerSection = btn.dataset.sec;
            renderPicker();
          };
        });
      }

      // 2. Render Interactive Tables Grid
      let filtered = this.tables;
      if (pickerSection !== "all") {
        filtered = this.tables.filter((t) => t.section === pickerSection);
      }

      const activeTicket = Cart.getActiveTicket();
      const currentTableId = activeTicket ? activeTicket.tableId : null;

      if (this.elements.pickerTablesGrid) {
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

        // Bind Table Tile Clicks
        this.elements.pickerTablesGrid.querySelectorAll(".cashier-table-tile").forEach((tile) => {
          tile.onclick = async () => {
            const tableId = tile.dataset.id;
            const table = this.tables.find((t) => t.id === tableId);
            if (!table) return;

            // If table is occupied by another ticket
            if (table.status === "occupied" && table.id !== currentTableId) {
              const action = confirm(
                `Table "${table.name}" is currently OCCUPIED (Order: ₱${Number(table.orderTotal || 0).toFixed(2)}).\n\n` +
                `Click OK to assign current active ticket to ${table.name}.\n` +
                `Click Cancel to keep current order.`
              );
              if (!action) return;
            }

            // Assign table to active ticket
            activeTicket.tableId = table.id;
            activeTicket.tableName = table.name;
            activeTicket.tableSection = table.section;

            // Mark table occupied in DB
            const cartCalc = Cart.calculate();
            await DB.setTableStatus(table.id, "occupied", {
              activeOrderId: activeTicket.id,
              orderTotal: cartCalc.total || 0
            });

            Cart.notify();
            this.updateCashierBadge();
            if (this.elements.modalTablePicker) this.elements.modalTablePicker.close();
          };
        });
      }
    };

    renderPicker();
    this.elements.modalTablePicker.showModal();
  }
};

// REMARK: ADMIN_TABLES_DINING_FLOOR_PLAN_MODULE_COMPLETE

