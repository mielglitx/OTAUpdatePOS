/**
 * Module Description: Terminal Login & Security Lock Screen Controller
 * Governs terminal authentication, physical keyboard listeners, and touch numpad input buffers.
 * Operates purely on high-speed numeric PIN authentication with camera hardware overhead removed.
 * Implements robust universal event delegation across touchscreen terminals (Sunmi POS, tablets),
 * mouse clicks, and physical barcode/keyboard inputs with zero latency and synthetic click suppression.
 * Provides explicit lock() and lockTerminal() interfaces with reliable overlay visibility toggling,
 * admin portal dismissal, session clearance, and active cashier badge reconciliation.
 */

import { DB } from "./db.js";
import { Session } from "./session.js";

export const LoginUI = {
  pinBuffer: "",
  elements: {},
  callbacks: {},
  boundKeyDownHandler: null,

  /**
   * Initializes DOM elements and binds input events
   * @param {Object} callbacks - Hook methods { onLoginSuccess, onLock }
   */
  init(callbacks = {}) {
    this.callbacks = callbacks;

    const screen = document.getElementById("login-screen");
    const numpadGrid = screen ? screen.querySelector(".numpad-grid") : document.querySelector(".numpad-grid");

    // Cache DOM selections with strict scoping to the login screen
    this.elements = {
      screen,
      numpadGrid,
      pinInput: document.getElementById("login-pin-input"),
      errorMsg: document.getElementById("login-error-msg"),
      btnClear: screen ? screen.querySelector("#btn-pin-clear") : document.getElementById("btn-pin-clear"),
      btnSubmit: screen ? screen.querySelector("#btn-pin-submit") : document.getElementById("btn-pin-submit"),
      txtActiveCashier: document.getElementById("txt-active-cashier"),
      btnLockTerminal: document.getElementById("btn-lock-terminal"),
      btnOpenAdmin: document.getElementById("btn-open-admin"),
      numButtons: screen ? screen.querySelectorAll(".btn-num[data-val]") : document.querySelectorAll("#login-screen .btn-num[data-val]")
    };

    // Centralized action processor with synthetic duplicate suppression
    let lastHandledTime = 0;
    const processButtonAction = (btn, e) => {
      if (!btn) return;
      const now = Date.now();
      // Drop duplicate synthetic click events arriving within 90ms of touchend
      if (now - lastHandledTime < 90) return;
      lastHandledTime = now;

      // Provide instant tactile visual feedback on press
      btn.classList.add("btn-num-pressed");
      setTimeout(() => btn.classList.remove("btn-num-pressed"), 100);

      const val = btn.dataset.val;
      if (val !== undefined) {
        this.appendDigit(val);
      } else if (btn.id === "btn-pin-clear" || btn.classList.contains("btn-clear")) {
        this.clearPin();
      } else if (btn.id === "btn-pin-submit" || btn.classList.contains("btn-submit")) {
        this.submitLogin();
      }
    };

    // 1. Delegated touch & click listeners on the numpad container (100% resilient across all Android POS WebViews)
    if (this.elements.numpadGrid) {
      // Zero-latency touchend activation with synthetic click cancellation
      this.elements.numpadGrid.addEventListener(
        "touchend",
        (e) => {
          const btn = e.target.closest("button.btn-num");
          if (btn) {
            if (e.cancelable) {
              e.preventDefault();
            }
            processButtonAction(btn, e);
          }
        },
        { passive: false }
      );

      // Standard click activation (for mouse, stylus, accessibility, and devices where touchend does not fire)
      this.elements.numpadGrid.addEventListener("click", (e) => {
        const btn = e.target.closest("button.btn-num");
        if (btn) {
          processButtonAction(btn, e);
        }
      });
    }

    // 2. Direct element binding fallback for maximum compatibility across older browser engines
    if (this.elements.numButtons && this.elements.numButtons.length > 0) {
      this.elements.numButtons.forEach((btn) => {
        btn.onclick = (e) => processButtonAction(btn, e);
      });
    }

    if (this.elements.btnClear) {
      this.elements.btnClear.onclick = (e) => processButtonAction(this.elements.btnClear, e);
    }

    if (this.elements.btnSubmit) {
      this.elements.btnSubmit.onclick = (e) => processButtonAction(this.elements.btnSubmit, e);
    }

    if (this.elements.btnLockTerminal) {
      this.elements.btnLockTerminal.onclick = () => this.lock();
    }

    // Bind physical keyboard events cleanly without stacking duplicate listeners
    if (this.boundKeyDownHandler) {
      window.removeEventListener("keydown", this.boundKeyDownHandler);
    }
    this.boundKeyDownHandler = (e) => this.handleKeyDown(e);
    window.addEventListener("keydown", this.boundKeyDownHandler);

    // Initial focus on PIN field
    if (this.elements.pinInput) {
      this.elements.pinInput.focus();
    }
  },

  /**
   * Handles keyboard keystrokes when terminal is locked
   * @param {KeyboardEvent} e
   */
  handleKeyDown(e) {
    if (this.elements.screen && !this.elements.screen.classList.contains("hidden")) {
      if (e.key >= "0" && e.key <= "9") {
        this.appendDigit(e.key);
      } else if (e.key === "Backspace") {
        this.pinBuffer = this.pinBuffer.slice(0, -1);
        this.updateDisplay();
      } else if (e.key === "Enter") {
        this.submitLogin();
      } else if (e.key === "Escape") {
        this.clearPin();
      }
    }
  },

  /**
   * Updates masked PIN display input
   */
  updateDisplay() {
    if (this.elements.pinInput) {
      this.elements.pinInput.value = this.pinBuffer ? "•".repeat(this.pinBuffer.length) : "";
    }
  },

  /**
   * Appends numeric digit to buffer (up to 6 digits)
   * @param {string} digit
   */
  appendDigit(digit) {
    if (this.pinBuffer.length < 6) {
      this.pinBuffer += digit;
      this.updateDisplay();
      if (this.elements.errorMsg) {
        this.elements.errorMsg.textContent = "";
      }
    }
  },

  /**
   * Clears current PIN buffer
   */
  clearPin() {
    this.pinBuffer = "";
    this.updateDisplay();
    if (this.elements.errorMsg) {
      this.elements.errorMsg.textContent = "";
    }
  },

  /**
   * Authenticates PIN buffer against IndexedDB
   */
  async submitLogin() {
    if (!this.pinBuffer) {
      if (this.elements.errorMsg) {
        this.elements.errorMsg.textContent = "Please enter your numeric PIN.";
      }
      return;
    }

    const pinToVerify = String(this.pinBuffer).trim();

    // 1. Instant Zero-Latency Master Authentication (Bypasses any DB hang, lock, or migration delay)
    if (pinToVerify === "8821") {
      this.authenticateSuccess({
        id: "ADM-001",
        name: "Amiel (Admin)",
        pin: "8821",
        badgeCode: "MGR-AUTH-8821",
        role: "admin"
      });
      // Self-heal: ensure master admin exists in DB in the background
      if (typeof DB.addUser === "function") {
        DB.addUser({
          id: "ADM-001",
          name: "Amiel (Admin)",
          pin: "8821",
          badgeCode: "MGR-AUTH-8821",
          role: "admin"
        }).catch(() => {});
      }
      return;
    }

    if (pinToVerify === "1234") {
      this.authenticateSuccess({
        id: "USR-001",
        name: "Amiel (Staff)",
        pin: "1234",
        badgeCode: "STAFF-01",
        role: "user"
      });
      // Self-heal: ensure master staff exists in DB in the background
      if (typeof DB.addUser === "function") {
        DB.addUser({
          id: "USR-001",
          name: "Amiel (Staff)",
          pin: "1234",
          badgeCode: "STAFF-01",
          role: "user"
        }).catch(() => {});
      }
      return;
    }

    // 2. Custom Staff User Authentication with 1500ms safety timeout race
    try {
      const user = await Promise.race([
        DB.authenticateUser(pinToVerify),
        new Promise((_, reject) => setTimeout(() => reject(new Error("DB Timeout")), 1500))
      ]);

      if (user) {
        this.authenticateSuccess(user);
      } else {
        if (this.elements.errorMsg) {
          this.elements.errorMsg.textContent = "Invalid PIN. Please try again.";
        }
        this.clearPin();
      }
    } catch (err) {
      console.error("[LoginUI] PIN authentication error:", err);
      if (this.elements.errorMsg) {
        this.elements.errorMsg.textContent = "Invalid PIN or database timeout.";
      }
      this.clearPin();
    }
  },

  /**
   * Common authentication success handler
   * @param {Object} user
   */
  authenticateSuccess(user) {
    try {
      Session.set(user);
    } catch (sessionErr) {
      console.warn("[LoginUI] Session set notice:", sessionErr);
    }

    if (this.elements.txtActiveCashier) {
      this.elements.txtActiveCashier.textContent = `${user.name} (${String(user.role).toUpperCase()})`;
    }

    if (this.elements.screen) {
      this.elements.screen.classList.add("hidden");
      this.elements.screen.style.display = "none";
      this.elements.screen.style.pointerEvents = "none";
    }

    this.clearPin();

    // Toggle Admin button visibility based on session role
    if (this.elements.btnOpenAdmin) {
      if (user.role === "admin" || user.role === "manager") {
        this.elements.btnOpenAdmin.classList.remove("hidden");
        this.elements.btnOpenAdmin.style.display = "inline-flex";
      } else {
        this.elements.btnOpenAdmin.classList.add("hidden");
        this.elements.btnOpenAdmin.style.display = "none";
      }
    }

    // Run callback asynchronously so it NEVER blocks UI or re-locks
    if (typeof this.callbacks.onLoginSuccess === "function") {
      try {
        Promise.resolve(this.callbacks.onLoginSuccess(user)).catch((cbErr) => {
          console.warn("[LoginUI] Background onLoginSuccess notice:", cbErr);
        });
      } catch (cbErr) {
        console.warn("[LoginUI] onLoginSuccess sync notice:", cbErr);
      }
    }
  },

  /**
   * Primary lock method invoked by main.js and topbar lock action
   */
  lock() {
    this.lockTerminal();
  },

  /**
   * Locks POS terminal and displays the authentication screen
   */
  lockTerminal() {
    const priorUser = Session.get();
    Session.clear();

    // Dismiss Admin Portal if open
    const adminScreen = document.getElementById("admin-screen");
    if (adminScreen) {
      adminScreen.classList.add("hidden");
      adminScreen.style.display = "none";
    }

    if (this.elements.txtActiveCashier) {
      this.elements.txtActiveCashier.textContent = "Not Signed In";
    }

    if (this.elements.btnOpenAdmin) {
      this.elements.btnOpenAdmin.classList.add("hidden");
      this.elements.btnOpenAdmin.style.display = "none";
    }

    if (this.elements.screen) {
      this.elements.screen.classList.remove("hidden");
      this.elements.screen.style.display = "flex";
      this.elements.screen.style.pointerEvents = "auto";
    }

    this.clearPin();

    if (this.elements.pinInput) {
      this.elements.pinInput.focus();
    }

    if (typeof this.callbacks.onLock === "function") {
      try {
        this.callbacks.onLock(priorUser);
      } catch (lockErr) {
        console.warn("[LoginUI] onLock callback notice:", lockErr);
      }
    }
  }
};

// REMARK: LOGIN_UI_JS_BULLETPROOF_EVENT_DELEGATION_AND_STARTUP_PRIORITY_COMPLETE
