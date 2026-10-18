/**
 * Module Description: POS Core Workflow, Quantity Modal & Karinderya Security Gate Controller
 * Coordinates the touch quantity editor modal supporting numeric input up to 18 digits,
 * handles reactive cart ticket table DOM rendering, Philippine statutory 12% VAT-inclusive
 * totals calculation, line-item manager void authorization, and the front-page Karinderya
 * Mode toggle with strict Administrator Passcode security verification and reliable state inversion.
 */

import { Bus } from "./bus.js";
import { DB } from "./db.js";
import { Cart } from "./cart.js";
import { AuthVoid } from "./auth-void.js";
import { Theme } from "./theme.js";

/**
 * Direct Cart Item Quantity Editor Modal Controller
 * Supports touchscreen numpad inputs and physical keyboard entry up to 18 digits.
 */
export const CartQtyModal = {
  modal: null,
  input: null,
  nameLabel: null,
  idInput: null,
  errorEl: null,
  currentProductId: null,
  initialized: false,

  init() {
    this.modal = document.getElementById("modal-cart-qty");
    this.input = document.getElementById("cart-qty-input");
    this.nameLabel = document.getElementById("cart-qty-item-name");
    this.idInput = document.getElementById("cart-qty-item-id");
    this.errorEl = document.getElementById("cart-qty-error-msg");

    if (!this.modal || this.initialized) return;
    this.initialized = true;

    // Delegated click handler for touch numpad and action buttons
    this.modal.onclick = async (e) => {
      const target = e.target.closest("button");
      if (!target) return;

      // Numeric buttons (0-9)
      if (target.classList.contains("btn-num") && target.dataset.val !== undefined) {
        e.preventDefault();
        e.stopPropagation();
        const val = target.dataset.val;
        let current = this.input ? this.input.value.trim() : "";

        if (current === "0" || current === "") {
          if (this.input) this.input.value = val;
        } else if (current.length < 18) {
          if (this.input) this.input.value = current + val;
        }

        if (this.errorEl) this.errorEl.textContent = "";
        return;
      }

      // Clear Button (CLR)
      if (target.id === "btn-cart-qty-clear" || target.classList.contains("btn-clear")) {
        e.preventDefault();
        e.stopPropagation();
        if (this.input) this.input.value = "0";
        if (this.errorEl) this.errorEl.textContent = "";
        return;
      }

      // Confirm / Submit Button (OK)
      if (target.id === "btn-cart-qty-submit" || target.classList.contains("btn-submit")) {
        e.preventDefault();
        e.stopPropagation();
        await this.commit();
        return;
      }

      // Cancel / Close Buttons
      if (target.id === "btn-cancel-cart-qty" || target.id === "btn-close-cart-qty-x") {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };

    // Hardware keyboard listener
    this.modal.onkeydown = async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await this.commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        let current = this.input ? this.input.value.trim() : "";
        if (current === "0" || current === "") {
          if (this.input) this.input.value = e.key;
        } else if (current.length < 18) {
          if (this.input) this.input.value = current + e.key;
        }
        if (this.errorEl) this.errorEl.textContent = "";
      } else if (e.key === "Backspace") {
        e.preventDefault();
        let current = this.input ? this.input.value.trim() : "";
        if (current.length > 1) {
          if (this.input) this.input.value = current.slice(0, -1);
        } else {
          if (this.input) this.input.value = "0";
        }
      }
    };
  },

  open(productId, itemName, currentQty) {
    this.currentProductId = productId;
    if (this.nameLabel) this.nameLabel.textContent = itemName;
    if (this.idInput) this.idInput.value = productId;
    if (this.input) this.input.value = String(currentQty);
    if (this.errorEl) this.errorEl.textContent = "";
    if (this.modal && typeof this.modal.showModal === "function") {
      this.modal.showModal();
    }
  },

  async commit() {
    const rawVal = this.input ? this.input.value.trim() : "0";
    const qty = parseInt(rawVal, 10);
    if (isNaN(qty) || qty < 0) {
      if (this.errorEl) this.errorEl.textContent = "Please enter a valid quantity.";
      return;
    }

    const res = await Cart.setQuantity(this.currentProductId, qty);
    if (res && !res.ok && res.reason === "stock_exceeded") {
      if (this.errorEl) {
        this.errorEl.textContent = `Only ${res.available} unit(s) available in stock.`;
      }
      return;
    }

    this.close();
  },

  close() {
    if (this.modal && this.modal.open) {
      this.modal.close();
    }
    this.currentProductId = null;
  }
};

/**
 * Front-Page Karinderya Mode Security Gate Controller
 * Enforces Administrator PIN authorization before toggling Karinderya Mode on the register.
 */
export const KarinderyaAuth = {
  checkbox: null,
  modal: null,
  pinInput: null,
  errorEl: null,
  pinBuffer: "",
  currentState: false,
  targetState: false,
  initialized: false,

  async init() {
    this.checkbox = document.getElementById("cb-karinderya-mode");
    this.modal = document.getElementById("modal-karinderya-auth");
    this.pinInput = document.getElementById("karinderya-auth-pin-input");
    this.errorEl = document.getElementById("karinderya-auth-error-msg");

    if (!this.checkbox || !this.modal || this.initialized) return;
    this.initialized = true;

    // Load initial persisted state from database
    const store = await DB.getStoreSettings();
    this.currentState = Boolean(store.karinderyaMode);
    this.checkbox.checked = this.currentState;

    // Sync external admin changes
    Bus.on("store:karinderya-changed", (enabled) => {
      this.currentState = Boolean(enabled);
      if (this.checkbox) this.checkbox.checked = this.currentState;
    });

    // Intercept click on the wrapper label or checkbox to prevent uncontrolled toggle
    const labelWrapper = this.checkbox.closest("label") || this.checkbox;
    labelWrapper.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Calculate target state against our known ground truth state
      this.targetState = !this.currentState;
      this.checkbox.checked = this.currentState;
      this.openAuthModal();
    };

    // Delegated click handler for the authorization modal numpad
    this.modal.onclick = async (e) => {
      const target = e.target.closest("button");
      if (!target) return;

      if (target.classList.contains("btn-num") && target.dataset.val !== undefined) {
        e.preventDefault();
        this.appendDigit(target.dataset.val);
        return;
      }

      if (target.id === "btn-karinderya-auth-clear" || target.classList.contains("btn-clear")) {
        e.preventDefault();
        this.clearPin();
        return;
      }

      if (target.id === "btn-karinderya-auth-submit" || target.classList.contains("btn-submit")) {
        e.preventDefault();
        await this.verifyAndApply();
        return;
      }

      if (target.id === "btn-cancel-karinderya-auth" || target.id === "btn-close-karinderya-auth-x") {
        e.preventDefault();
        this.close();
      }
    };

    // Keyboard listener for PIN entry
    this.modal.onkeydown = async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await this.verifyAndApply();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        this.appendDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        this.pinBuffer = this.pinBuffer.slice(0, -1);
        this.updateDisplay();
      }
    };
  },

  openAuthModal() {
    this.pinBuffer = "";
    this.updateDisplay();
    if (this.errorEl) this.errorEl.textContent = "";

    const titleEl = document.getElementById("karinderya-auth-target-title");
    if (titleEl) {
      titleEl.textContent = this.targetState ? "Enable Fast Mode" : "Disable Fast Mode";
    }

    if (this.modal && typeof this.modal.showModal === "function") {
      this.modal.showModal();
      setTimeout(() => {
        if (this.pinInput) this.pinInput.focus();
      }, 80);
    }
  },

  appendDigit(digit) {
    if (this.pinBuffer.length < 6) {
      this.pinBuffer += digit;
      this.updateDisplay();
      if (this.errorEl) this.errorEl.textContent = "";
    }
  },

  clearPin() {
    this.pinBuffer = "";
    this.updateDisplay();
    if (this.errorEl) this.errorEl.textContent = "";
  },

  updateDisplay() {
    if (this.pinInput) {
      this.pinInput.value = this.pinBuffer ? "•".repeat(this.pinBuffer.length) : "";
    }
  },

  async verifyAndApply() {
    if (!this.pinBuffer) {
      if (this.errorEl) this.errorEl.textContent = "Please enter administrator PIN.";
      return;
    }

    try {
      // Authenticate user against IndexedDB
      const user = await DB.authenticateUser(this.pinBuffer);

      // Enforce strict security rule: Only accounts with "admin" role can toggle Fast Mode
      if (user && String(user.role).toLowerCase() === "admin") {
        const store = await DB.getStoreSettings();
        const updated = {
          ...store,
          karinderyaMode: this.targetState
        };
        await DB.saveStoreSettings(updated);

        this.currentState = this.targetState;
        if (this.checkbox) {
          this.checkbox.checked = this.currentState;
        }

        Bus.emit("store:karinderya-changed", this.currentState);
        this.close();
        alert(`Fast Mode is now ${this.currentState ? "ENABLED" : "DISABLED"}. Fast-service checkout and compact receipts are active.`);
      } else {
        if (this.errorEl) {
          this.errorEl.textContent = "Access Denied: Only Administrator passcodes can toggle Fast Mode.";
        }
        this.clearPin();
      }
    } catch (err) {
      if (this.errorEl) this.errorEl.textContent = `Authorization error: ${err.message}`;
      this.clearPin();
    }
  },

  close() {
    if (this.modal && this.modal.open) {
      this.modal.close();
    }
    this.pinBuffer = "";
    if (this.checkbox) {
      this.checkbox.checked = this.currentState;
    }
  }
};

/**
 * Core POS Subsystem Coordinator
 */
export const POS = {
  booted: false,

  async boot(ui) {
    if (this.booted) return;
    this.booted = true;

    // 1. Initialize Dual-Theme Engine
    Theme.init();

    // 2. Initialize Direct Cart Item Quantity Editor Modal
    CartQtyModal.init();

    // 3. Initialize Front-Page Karinderya Security Gate
    await KarinderyaAuth.init();

    // 4. Initialize Manager Void Authorization with 4-element signature
    AuthVoid.init(
      ui.modalVoid,
      ui.inputVoid,
      ui.lblVoid,
      ui.errVoid
    );

    // 5. Reactive Ticket & Cart Rendering
    Bus.on("cart:updated", (calc) => {
      if (!ui.tbody) return;

      ui.tbody.innerHTML = calc.items
        .map(
          (item) => `
        <tr>
          <td>${item.name}</td>
          <td class="text-center">
            <button 
              type="button" 
              class="btn-cart-qty" 
              data-id="${item.id}" 
              data-name="${item.name}" 
              data-qty="${item.qty}"
              title="Click to edit quantity"
            >
              ${item.qty}
            </button>
          </td>
          <td class="text-right">₱${item.price.toFixed(2)}</td>
          <td class="text-right">₱${(item.price * item.qty).toFixed(2)}</td>
          <td class="text-center">
            <button type="button" class="btn-row-void" data-id="${item.id}">Void</button>
          </td>
        </tr>
      `
        )
        .join("");

      // Bind dynamic quantity editor modal triggers
      ui.tbody.querySelectorAll(".btn-cart-qty").forEach((btn) => {
        btn.onclick = () => {
          CartQtyModal.open(btn.dataset.id, btn.dataset.name, btn.dataset.qty);
        };
      });

      // Bind dynamic Void triggers
      ui.tbody.querySelectorAll(".btn-row-void").forEach((btn) => {
        btn.onclick = () => {
          const item = calc.items.find((i) => String(i.id) === String(btn.dataset.id));
          if (item) {
            Bus.emit("cart:request-void", item);
          }
        };
      });

      // Update Financial Totals (Philippine statutory 12% VAT standard)
      if (ui.txtNet) ui.txtNet.textContent = `₱${calc.vatableSales.toFixed(2)}`;
      if (ui.txtVat) ui.txtVat.textContent = `₱${calc.vatAmount.toFixed(2)}`;
      if (ui.txtTotal) ui.txtTotal.textContent = `₱${calc.total.toFixed(2)}`;
    });
  }
};

// REMARK: POS_CORE_JS_KARINDERYA_RELIABLE_STATE_TOGGLE_COMPLETE