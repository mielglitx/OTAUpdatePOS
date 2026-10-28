/**
 * Module Description: Active Ticket, Multi-Cart & VAT Calculation Engine
 * Governs multiple concurrent active tickets/carts (allowing cashiers to hold/park
 * orders while serving subsequent customers), validates inventory stock ceilings,
 * enforces item availability toggles, calculates Philippine statutory 12%
 * VAT-inclusive financial totals, emits reactive application events,
 * and synchronizes ticket state with the customer-facing dual monitor
 * display via BroadcastChannel ('pos_customer_display') and localStorage fallback.
 */

import { Bus } from "./bus.js";
import { DB } from "./db.js";

// Initialize cross-screen broadcast channel for dual-monitor customer display
const displayChannel = typeof window.BroadcastChannel !== "undefined"
  ? new window.BroadcastChannel("pos_customer_display")
  : null;

export const Cart = {
  // Multi-cart ticket collection
  tickets: [
    { id: "TICK-1", label: "Order 1", items: [] }
  ],
  activeTicketId: "TICK-1",
  ticketCounter: 1,

  /**
   * Retrieves the currently active ticket entity
   * @returns {Object} Active ticket object
   */
  getActiveTicket() {
    let t = this.tickets.find((item) => item.id === this.activeTicketId);
    if (!t) {
      if (this.tickets.length === 0) {
        this.ticketCounter++;
        t = {
          id: `TICK-${Date.now().toString().slice(-6)}`,
          label: `Order ${this.ticketCounter}`,
          items: []
        };
        this.tickets.push(t);
      }
      this.activeTicketId = this.tickets[0].id;
      t = this.tickets[0];
    }
    return t;
  },

  /**
   * Backward-compatible getter & setter for active ticket's items array
   */
  get items() {
    return this.getActiveTicket().items;
  },
  set items(val) {
    this.getActiveTicket().items = val;
  },

  /**
   * Creates a new parked order tab and immediately activates it
   * @param {string} [customLabel] - Optional custom name (e.g. Table # or Customer Name)
   * @returns {Object} Newly created ticket
   */
  createTicket(customLabel) {
    this.ticketCounter++;
    const label = customLabel || `Order ${this.ticketCounter}`;
    const newTicket = {
      id: `TICK-${Date.now().toString().slice(-6)}`,
      label,
      items: []
    };
    this.tickets.push(newTicket);
    this.activeTicketId = newTicket.id;

    this.notify();
    this.emitTicketsChanged();
    return newTicket;
  },

  /**
   * Switches active workspace to another ticket tab
   * @param {string} ticketId 
   */
  switchTicket(ticketId) {
    if (this.activeTicketId === ticketId) return;
    const target = this.tickets.find((t) => t.id === ticketId);
    if (target) {
      this.activeTicketId = target.id;
      this.notify();
      this.emitTicketsChanged();
    }
  },

  /**
   * Closes or removes a ticket tab (e.g., after completion or manual cancellation)
   * @param {string} ticketId 
   */
  closeTicket(ticketId) {
    const index = this.tickets.findIndex((t) => t.id === ticketId);
    if (index === -1) return;

    this.tickets.splice(index, 1);

    if (this.tickets.length === 0) {
      this.ticketCounter++;
      const fallback = {
        id: `TICK-${Date.now().toString().slice(-6)}`,
        label: `Order ${this.ticketCounter}`,
        items: []
      };
      this.tickets.push(fallback);
      this.activeTicketId = fallback.id;
    } else if (this.activeTicketId === ticketId) {
      this.activeTicketId = this.tickets[Math.max(0, index - 1)].id;
    }

    this.notify();
    this.emitTicketsChanged();
  },

  /**
   * Emits ticket list state to UI components
   */
  emitTicketsChanged() {
    Bus.emit("cart:tickets-changed", {
      tickets: this.tickets.map((t) => ({
        id: t.id,
        label: t.label,
        itemCount: t.items.reduce((sum, i) => sum + (i.qty || 1), 0),
        total: t.items.reduce((sum, i) => sum + ((Number(i.price) || 0) * (i.qty || 1)), 0),
        isActive: t.id === this.activeTicketId
      })),
      activeTicketId: this.activeTicketId,
      activeLabel: this.getActiveTicket().label
    });
  },

  /**
   * Dispatches payload to external customer display window
   * @param {Object} payload
   */
  broadcastToCustomer(payload) {
    if (displayChannel) {
      try {
        displayChannel.postMessage(payload);
      } catch (err) {
        console.warn("[Cart BroadcastChannel Error]", err);
      }
    }

    // Fallback via localStorage storage events for environments without BroadcastChannel
    try {
      localStorage.setItem("pos_customer_broadcast", JSON.stringify({
        ...payload,
        _timestamp: Date.now()
      }));
    } catch (e) {
      // Storage quota or private browsing guard
    }
  },

  /**
   * Adds or increments a product in the active cart with stock verification
   * @param {Object} product - Product entity from database
   * @param {number} quantity - Quantity to add
   * @returns {Object} { ok: boolean, reason?: string, currentQty?: number }
   */
  add(product, quantity = 1) {
    if (!product || !product.id) {
      return { ok: false, reason: "invalid_product" };
    }

    // 1. Check availability flag for both unmonitored and monitored goods
    if (product.isAvailable === false) {
      Bus.emit("cart:item-unavailable", { product });
      return { ok: false, reason: "unavailable" };
    }

    const existing = this.items.find((i) => i.id === product.id);
    const currentInCart = existing ? existing.qty : 0;
    const requestedTotal = currentInCart + quantity;

    // 2. Monitored inventory stock ceiling check
    if (product.isMonitored) {
      const availableStock = typeof product.stock === "number" ? product.stock : 0;

      if (availableStock <= 0) {
        Bus.emit("cart:out-of-stock", { product });
        return { ok: false, reason: "out_of_stock" };
      }

      if (requestedTotal > availableStock) {
        Bus.emit("cart:stock-limit-reached", {
          product,
          requested: requestedTotal,
          available: availableStock,
          inCart: currentInCart
        });
        return { ok: false, reason: "stock_exceeded", available: availableStock };
      }
    }

    // 3. Commit line item to active ticket
    if (existing) {
      existing.qty = requestedTotal;
    } else {
      this.items.push({
        id: product.id,
        name: product.name,
        price: Number(product.price) || 0.0,
        qty: quantity,
        isMonitored: Boolean(product.isMonitored),
        maxStock: product.isMonitored ? product.stock : null
      });
    }

    this.notify();
    this.emitTicketsChanged();
    return { ok: true, currentQty: requestedTotal };
  },

  /**
   * Directly sets absolute item quantity with inventory ceiling validation
   * @param {string|number} productId 
   * @param {number} newQty 
   * @returns {Promise<Object>} { ok: boolean, reason?: string, available?: number }
   */
  async setQuantity(productId, newQty) {
    const item = this.items.find((i) => i.id === productId);
    if (!item) return { ok: false, reason: "item_not_found" };

    if (newQty <= 0) {
      this.voidItem(productId);
      return { ok: true };
    }

    const product = await DB.getProductById(productId);
    if (product && product.isMonitored) {
      const availableStock = typeof product.stock === "number" ? product.stock : 0;
      if (newQty > availableStock) {
        Bus.emit("cart:stock-limit-reached", {
          product,
          requested: newQty,
          available: availableStock,
          inCart: item.qty
        });
        return { ok: false, reason: "stock_exceeded", available: availableStock };
      }
    }

    item.qty = newQty;
    this.notify();
    this.emitTicketsChanged();
    return { ok: true };
  },

  /**
   * Decrements line item quantity by 1 or voids it if count reaches 0
   * @param {string|number} productId 
   */
  decrement(productId) {
    const index = this.items.findIndex((i) => i.id === productId);
    if (index === -1) return;

    if (this.items[index].qty > 1) {
      this.items[index].qty -= 1;
    } else {
      this.items.splice(index, 1);
    }
    this.notify();
    this.emitTicketsChanged();
  },

  /**
   * Removes an item from the ticket (called upon Manager Authorization)
   * @param {string|number} productId 
   * @returns {Object|null} The removed item object
   */
  voidItem(productId) {
    const index = this.items.findIndex((i) => i.id === productId);
    if (index !== -1) {
      const removed = this.items.splice(index, 1)[0];
      this.notify();
      this.emitTicketsChanged();
      Bus.emit("cart:item-voided", removed);
      return removed;
    }
    return null;
  },

  /**
   * Returns current quantity of a product currently in the active cart
   * @param {string|number} productId 
   * @returns {number}
   */
  getQty(productId) {
    const existing = this.items.find((i) => i.id === productId);
    return existing ? existing.qty : 0;
  },

  /**
   * Clears all items from the active ticket
   */
  clear() {
    this.items = [];
    this.notify();
    this.emitTicketsChanged();
    this.broadcastToCustomer({
      type: "checkout:cleared",
      data: {}
    });
  },

  /**
   * Computes Philippine statutory 12% VAT-inclusive breakdown and order totals for active ticket
   * @returns {Object} Calculated ticket breakdown
   */
  calculate() {
    const total = this.items.reduce((sum, item) => sum + (Number(item.price) || 0) * item.qty, 0);

    // Republic of the Philippines Standard: Menu prices are VAT-Inclusive (12%)
    const vatableSales = total / 1.12;
    const vatAmount = total - vatableSales;

    return {
      items: this.items.map((i) => ({
        id: i.id,
        name: i.name,
        price: Number(i.price) || 0,
        qty: i.qty,
        isMonitored: Boolean(i.isMonitored)
      })),
      itemCount: this.items.reduce((sum, item) => sum + item.qty, 0),
      vatableSales: Number(vatableSales.toFixed(2)),
      vatAmount: Number(vatAmount.toFixed(2)),
      total: Number(total.toFixed(2)),
      ticketLabel: this.getActiveTicket().label,
      tableId: this.getActiveTicket().tableId || null,
      tableName: this.getActiveTicket().tableName || null,
      tableSection: this.getActiveTicket().tableSection || null
    };
  },

  setTable(tableId, tableName, tableSection) {
    const t = this.getActiveTicket();
    t.tableId = tableId;
    t.tableName = tableName;
    t.tableSection = tableSection;
    this.notify();
    this.emitTicketsChanged();
  },

  clearTable() {
    const t = this.getActiveTicket();
    delete t.tableId;
    delete t.tableName;
    delete t.tableSection;
    this.notify();
    this.emitTicketsChanged();
  },

  /**
   * Loads itemized order from a table into the active ticket
   */
  loadOrder(items = [], tableId = null, tableName = null, tableSection = null) {
    const t = this.getActiveTicket();
    t.items = (items || []).map((i) => ({
      id: i.id,
      name: i.name,
      price: Number(i.price) || 0,
      qty: Number(i.qty) || 1,
      isMonitored: Boolean(i.isMonitored)
    }));
    t.tableId = tableId;
    t.tableName = tableName;
    t.tableSection = tableSection;
    this.notify();
    this.emitTicketsChanged();
  },

  /**
   * Broadcasts updated ticket calculations to internal subscribers and external customer screens
   */
  notify() {
    const calc = this.calculate();
    Bus.emit("cart:updated", calc);

    // Synchronize active order items and total to table record in IndexedDB
    const activeTicket = this.getActiveTicket();
    if (activeTicket && activeTicket.tableId) {
      const status = calc.items.length > 0 ? "occupied" : "available";
      DB.setTableStatus(activeTicket.tableId, status, {
        activeOrderId: activeTicket.id,
        activeOrderItems: calc.items,
        orderTotal: calc.total,
        guestCount: activeTicket.guestCount || 0
      }).then(() => {
        Bus.emit("tables:updated");
      }).catch(() => {});
    }

    // Mirror cart updates directly to second monitor
    this.broadcastToCustomer({
      type: "cart:updated",
      data: calc
    });
  }
};

// REMARK: CART_JS_MULTI_TICKET_ENGINE_COMPLETE