/**
 * Module Description: Terminal Login & Security Lock Screen Controller
 * Governs terminal authentication, physical keyboard listeners, and touch numpad input buffers.
 * Operates purely on high-speed numeric PIN authentication with camera hardware overhead removed.
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

    // Cache DOM selections with strict scoping to the login screen
    this.elements = {
      screen,
      pinInput: document.getElementById("login-pin-input"),
      errorMsg: document.getElementById("login-error-msg"),
      btnClear: screen ? screen.querySelector("#btn-pin-clear") : document.getElementById("btn-pin-clear"),
      btnSubmit: screen ? screen.querySelector("#btn-pin-submit") : document.getElementById("btn-pin-submit"),
      txtActiveCashier: document.getElementById("txt-active-cashier"),
      btnLockTerminal: document.getElementById("btn-lock-terminal"),
      btnOpenAdmin: document.getElementById("btn-open-admin"),
      numButtons: screen ? screen.querySelectorAll(".btn-num[data-val]") : document.querySelectorAll("#login-screen .btn-num[data-val]")
    };

    // Attach virtual numpad click listeners immediately for instant touch input
    if (this.elements.numButtons && this.elements.numButtons.length > 0) {
      this.elements.numButtons.forEach((btn) => {
        const handleNumPress = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          this.appendDigit(btn.dataset.val);
        };
        btn.onclick = handleNumPress;
        // Pointerdown for zero-latency touch response on tablets
        btn.onpointerdown = (e) => {
          if (e.pointerType === "touch" || e.pointerType === "pen") {
            e.preventDefault();
            this.appendDigit(btn.dataset.val);
          }
        };
      });
    }

    // Attach action button listeners
    if (this.elements.btnClear) {
      const handleClear = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.clearPin();
      };
      this.elements.btnClear.onclick = handleClear;
      this.elements.btnClear.onpointerdown = (e) => {
        if (e.pointerType === "touch" || e.pointerType === "pen") {
          e.preventDefault();
          this.clearPin();
        }
      };
    }

    if (this.elements.btnSubmit) {
      const handleSubmit = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.submitLogin();
      };
      this.elements.btnSubmit.onclick = handleSubmit;
      this.elements.btnSubmit.onpointerdown = (e) => {
        if (e.pointerType === "touch" || e.pointerType === "pen") {
          e.preventDefault();
          this.submitLogin();
        }
      };
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

    try {
      const user = await DB.authenticateUser(this.pinBuffer);
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
        this.elements.errorMsg.textContent = "Database error during login.";
      }
      this.clearPin();
    }
  },

  /**
   * Common authentication success handler
   * @param {Object} user
   */
  authenticateSuccess(user) {
    Session.set(user);

    if (this.elements.txtActiveCashier) {
      this.elements.txtActiveCashier.textContent = `${user.name} (${String(user.role).toUpperCase()})`;
    }

    if (this.elements.screen) {
      this.elements.screen.classList.add("hidden");
      this.elements.screen.style.display = "none";
    }

    this.clearPin();

    // Toggle Admin button visibility based on session role
    if (this.elements.btnOpenAdmin) {
      if (Session.isAdmin()) {
        this.elements.btnOpenAdmin.classList.remove("hidden");
      } else {
        this.elements.btnOpenAdmin.classList.add("hidden");
      }
    }

    if (typeof this.callbacks.onLoginSuccess === "function") {
      this.callbacks.onLoginSuccess(user);
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
    }

    if (this.elements.txtActiveCashier) {
      this.elements.txtActiveCashier.textContent = "Not Signed In";
    }

    if (this.elements.btnOpenAdmin) {
      this.elements.btnOpenAdmin.classList.add("hidden");
    }

    if (this.elements.screen) {
      this.elements.screen.classList.remove("hidden");
      this.elements.screen.style.display = "flex";
    }

    this.clearPin();

    if (this.elements.pinInput) {
      this.elements.pinInput.focus();
    }

    if (typeof this.callbacks.onLock === "function") {
      this.callbacks.onLock(priorUser);
    }
  }
};

// REMARK: LOGIN_UI_JS_LOCK_METHOD_AND_VISIBILITY_REPAIRED_COMPLETE