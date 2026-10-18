/**
 * Module Description: Admin Secondary Customer Display Customizer Sub-Module
 * Manages configuration for the customer-facing dual-screen presentation.
 * Features reactive 16:9 interactive live simulation, pre-configured layout geometry
 * presets (split, banner-top, checkout-focus, minimalist), two-way color palette
 * pickers, one-touch brand themes, typography and scaling controls, branding toggles,
 * sample cart generator, and modular component priority re-ordering with instant
 * BroadcastChannel synchronization to physical secondary Android displays.
 */

import { DB } from "../db.js";

export const AdminDisplay = {
  elements: {},
  callbacks: {},
  initialized: false,
  currentSettings: {},
  sampleCartActive: false,

  // Theme Palette Presets
  palettePresets: {
    "dark-slate": {
      bgColor: "#0f172a",
      surfaceColor: "#1e293b",
      accentColor: "#0284c7",
      textColor: "#f8fafc",
      textMutedColor: "#94a3b8"
    },
    "clean-light": {
      bgColor: "#f8fafc",
      surfaceColor: "#ffffff",
      accentColor: "#0284c7",
      textColor: "#0f172a",
      textMutedColor: "#64748b"
    },
    "emerald": {
      bgColor: "#064e3b",
      surfaceColor: "#065f46",
      accentColor: "#10b981",
      textColor: "#ecfdf5",
      textMutedColor: "#a7f3d0"
    },
    "indigo": {
      bgColor: "#1e1b4b",
      surfaceColor: "#312e81",
      accentColor: "#6366f1",
      textColor: "#e0e7ff",
      textMutedColor: "#a5b4fc"
    },
    "crimson": {
      bgColor: "#450a0a",
      surfaceColor: "#7f1d1d",
      accentColor: "#ef4444",
      textColor: "#fef2f2",
      textMutedColor: "#fca5a5"
    }
  },

  // Component Human-Readable Labels
  componentLabels: {
    header: "🏪 Store Header & Brand Identity",
    cart: "🛒 Live Cart Items Table",
    bill: "🧾 Subtotal & 12% VAT Breakdown",
    total: "💰 Total Amount Due Callout",
    pager: "📢 Calling Buzzer / Pager Banner",
    payment: "💵 Cash Tendered & Change Due Card",
    footer: "📌 Bottom Terminal Notice & Status"
  },

  /**
   * Initializes DOM selections and binds real-time customizer event listeners
   * @param {Object} callbacks - External hooks
   */
  init(callbacks = {}) {
    this.callbacks = callbacks;

    this.elements = {
      // Top Action Buttons
      btnResetDisplaySettings: document.getElementById("btn-reset-display-settings"),
      btnPushLiveDisplay: document.getElementById("btn-push-live-display"),
      btnSaveDisplaySettings: document.getElementById("btn-save-display-settings"),

      // Layout Preset Buttons
      layoutPresetButtons: document.querySelectorAll(".btn-layout-preset"),

      // Palette Presets & Inputs
      paletteButtons: document.querySelectorAll(".btn-color-palette"),
      inputBgColor: document.getElementById("input-cd-bg-color"),
      txtBgColor: document.getElementById("txt-cd-bg-color"),
      inputSurfaceColor: document.getElementById("input-cd-surface-color"),
      txtSurfaceColor: document.getElementById("txt-cd-surface-color"),
      inputAccentColor: document.getElementById("input-cd-accent-color"),
      txtAccentColor: document.getElementById("txt-cd-accent-color"),
      inputTextColor: document.getElementById("input-cd-text-color"),
      txtTextColor: document.getElementById("txt-cd-text-color"),
      inputMutedColor: document.getElementById("input-cd-muted-color"),
      txtMutedColor: document.getElementById("txt-cd-muted-color"),

      // Typography
      selectFont: document.getElementById("select-cd-font"),
      selectScale: document.getElementById("select-cd-scale"),

      // Branding & Custom Text
      cbShowLogo: document.getElementById("cb-cd-show-logo"),
      cbShowTagline: document.getElementById("cb-cd-show-tagline"),
      inputWelcomeMsg: document.getElementById("input-cd-welcome-msg"),
      inputFooterNote: document.getElementById("input-cd-footer-note"),

      // Component Sorter List
      componentsList: document.getElementById("cd-components-list"),

      // 16:9 Simulator Preview
      previewFrame: document.getElementById("cd-preview-frame"),
      btnRefreshPreviewCart: document.getElementById("btn-refresh-preview-cart")
    };

    if (this.initialized) return;
    this.initialized = true;

    // 1. Layout Preset Selection
    if (this.elements.layoutPresetButtons) {
      this.elements.layoutPresetButtons.forEach((btn) => {
        btn.onclick = () => {
          this.elements.layoutPresetButtons.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.currentSettings.layoutPreset = btn.dataset.preset;
          this.broadcastLivePreview();
        };
      });
    }

    // 2. Quick Theme Palette Buttons
    if (this.elements.paletteButtons) {
      this.elements.paletteButtons.forEach((btn) => {
        btn.onclick = () => {
          this.applyPalettePreset(btn.dataset.theme);
        };
      });
    }

    // 3. Two-Way Color Picker Sync (Picker <-> Text Input)
    const bindColorPair = (colorPicker, textInput, settingKey) => {
      if (!colorPicker || !textInput) return;

      colorPicker.oninput = () => {
        textInput.value = colorPicker.value.toUpperCase();
        this.currentSettings[settingKey] = colorPicker.value;
        this.broadcastLivePreview();
      };

      textInput.oninput = () => {
        const val = textInput.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
          colorPicker.value = val;
          this.currentSettings[settingKey] = val;
          this.broadcastLivePreview();
        }
      };
    };

    bindColorPair(this.elements.inputBgColor, this.elements.txtBgColor, "bgColor");
    bindColorPair(this.elements.inputSurfaceColor, this.elements.txtSurfaceColor, "surfaceColor");
    bindColorPair(this.elements.inputAccentColor, this.elements.txtAccentColor, "accentColor");
    bindColorPair(this.elements.inputTextColor, this.elements.txtTextColor, "textColor");
    bindColorPair(this.elements.inputMutedColor, this.elements.txtMutedColor, "textMutedColor");

    // 4. Typography Family & Scale Listeners
    if (this.elements.selectFont) {
      this.elements.selectFont.onchange = () => {
        this.currentSettings.fontFamily = this.elements.selectFont.value;
        this.broadcastLivePreview();
      };
    }

    if (this.elements.selectScale) {
      this.elements.selectScale.onchange = () => {
        this.currentSettings.fontSizeScale = this.elements.selectScale.value;
        this.broadcastLivePreview();
      };
    }

    // 5. Branding Toggles & Custom Text Listeners
    if (this.elements.cbShowLogo) {
      this.elements.cbShowLogo.onchange = () => {
        this.currentSettings.showLogo = this.elements.cbShowLogo.checked;
        this.broadcastLivePreview();
      };
    }

    if (this.elements.cbShowTagline) {
      this.elements.cbShowTagline.onchange = () => {
        this.currentSettings.showTagline = this.elements.cbShowTagline.checked;
        this.broadcastLivePreview();
      };
    }

    if (this.elements.inputWelcomeMsg) {
      this.elements.inputWelcomeMsg.oninput = () => {
        this.currentSettings.customWelcome = this.elements.inputWelcomeMsg.value;
        this.broadcastLivePreview();
      };
    }

    if (this.elements.inputFooterNote) {
      this.elements.inputFooterNote.oninput = () => {
        this.currentSettings.customFooterNote = this.elements.inputFooterNote.value;
        this.broadcastLivePreview();
      };
    }

    // 6. Save Configuration to IndexedDB
    if (this.elements.btnSaveDisplaySettings) {
      this.elements.btnSaveDisplaySettings.onclick = async () => {
        await this.saveDisplaySettings();
      };
    }

    // 7. Reset Defaults Action
    if (this.elements.btnResetDisplaySettings) {
      this.elements.btnResetDisplaySettings.onclick = async () => {
        if (confirm("Reset customer display settings to factory modern slate defaults?")) {
          await this.resetDefaults();
        }
      };
    }

    // 8. Push Live to Screen #2 (Mount Native Presentation)
    if (this.elements.btnPushLiveDisplay) {
      this.elements.btnPushLiveDisplay.onclick = async () => {
        await this.pushLiveToSecondary();
      };
    }

    // 9. Sample Cart Simulation Toggle
    if (this.elements.btnRefreshPreviewCart) {
      this.elements.btnRefreshPreviewCart.onclick = () => {
        this.toggleSampleCart();
      };
    }
  },

  /**
   * Loads saved customer display settings from IndexedDB into form controls
   */
  async loadDisplaySettings() {
    this.currentSettings = await DB.getDisplaySettings();
    this.applySettingsToForm(this.currentSettings);
    this.renderComponentsList();
    this.broadcastLivePreview();
  },

  /**
   * Populates form inputs and active button states from a configuration entity
   * @param {Object} cfg 
   */
  applySettingsToForm(cfg) {
    if (!cfg) return;

    // 1. Layout Preset
    if (this.elements.layoutPresetButtons) {
      this.elements.layoutPresetButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.preset === (cfg.layoutPreset || "split"));
      });
    }

    // 2. Color Palettes
    if (this.elements.inputBgColor && this.elements.txtBgColor) {
      const c = cfg.bgColor || "#0f172a";
      this.elements.inputBgColor.value = c;
      this.elements.txtBgColor.value = c.toUpperCase();
    }
    if (this.elements.inputSurfaceColor && this.elements.txtSurfaceColor) {
      const c = cfg.surfaceColor || "#1e293b";
      this.elements.inputSurfaceColor.value = c;
      this.elements.txtSurfaceColor.value = c.toUpperCase();
    }
    if (this.elements.inputAccentColor && this.elements.txtAccentColor) {
      const c = cfg.accentColor || "#0284c7";
      this.elements.inputAccentColor.value = c;
      this.elements.txtAccentColor.value = c.toUpperCase();
    }
    if (this.elements.inputTextColor && this.elements.txtTextColor) {
      const c = cfg.textColor || "#f8fafc";
      this.elements.inputTextColor.value = c;
      this.elements.txtTextColor.value = c.toUpperCase();
    }
    if (this.elements.inputMutedColor && this.elements.txtMutedColor) {
      const c = cfg.textMutedColor || "#94a3b8";
      this.elements.inputMutedColor.value = c;
      this.elements.txtMutedColor.value = c.toUpperCase();
    }

    // 3. Typography
    if (this.elements.selectFont) {
      this.elements.selectFont.value = cfg.fontFamily || "sans";
    }
    if (this.elements.selectScale) {
      this.elements.selectScale.value = cfg.fontSizeScale || "normal";
    }

    // 4. Branding & Custom Text
    if (this.elements.cbShowLogo) {
      this.elements.cbShowLogo.checked = cfg.showLogo !== false;
    }
    if (this.elements.cbShowTagline) {
      this.elements.cbShowTagline.checked = cfg.showTagline !== false;
    }
    if (this.elements.inputWelcomeMsg) {
      this.elements.inputWelcomeMsg.value = cfg.customWelcome || "Welcome! Your order details will appear here as items are scanned.";
    }
    if (this.elements.inputFooterNote) {
      this.elements.inputFooterNote.value = cfg.customFooterNote || "Customer Display Terminal • Live Order Mirror";
    }
  },

  /**
   * Applies one of the pre-configured color palette presets
   * @param {string} themeKey 
   */
  applyPalettePreset(themeKey) {
    const palette = this.palettePresets[themeKey];
    if (!palette) return;

    Object.assign(this.currentSettings, palette);

    if (this.elements.inputBgColor) this.elements.inputBgColor.value = palette.bgColor;
    if (this.elements.txtBgColor) this.elements.txtBgColor.value = palette.bgColor.toUpperCase();

    if (this.elements.inputSurfaceColor) this.elements.inputSurfaceColor.value = palette.surfaceColor;
    if (this.elements.txtSurfaceColor) this.elements.txtSurfaceColor.value = palette.surfaceColor.toUpperCase();

    if (this.elements.inputAccentColor) this.elements.inputAccentColor.value = palette.accentColor;
    if (this.elements.txtAccentColor) this.elements.txtAccentColor.value = palette.accentColor.toUpperCase();

    if (this.elements.inputTextColor) this.elements.inputTextColor.value = palette.textColor;
    if (this.elements.txtTextColor) this.elements.txtTextColor.value = palette.textColor.toUpperCase();

    if (this.elements.inputMutedColor) this.elements.inputMutedColor.value = palette.textMutedColor;
    if (this.elements.txtMutedColor) this.elements.txtMutedColor.value = palette.textMutedColor.toUpperCase();

    this.broadcastLivePreview();
  },

  /**
   * Renders modular component items with up/down priority positioning controls
   */
  renderComponentsList() {
    if (!this.elements.componentsList) return;

    const order = this.currentSettings.componentsOrder || ["header", "cart", "bill", "total", "pager", "payment", "footer"];

    this.elements.componentsList.innerHTML = order.map((compKey, index) => {
      const label = this.componentLabels[compKey] || compKey;
      const isFirst = index === 0;
      const isLast = index === order.length - 1;

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--bg-alt); border: var(--border); border-radius: 4px;">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--text);">
            <span style="display: inline-block; width: 22px; color: var(--text-muted); font-family: monospace;">${index + 1}.</span>
            ${label}
          </span>
          <div style="display: flex; gap: 4px;">
            <button type="button" class="btn-tool btn-sm btn-comp-move-up" data-index="${index}" ${isFirst ? "disabled" : ""} title="Move Up">▲</button>
            <button type="button" class="btn-tool btn-sm btn-comp-move-down" data-index="${index}" ${isLast ? "disabled" : ""} title="Move Down">▼</button>
          </div>
        </div>
      `;
    }).join("");

    this.elements.componentsList.querySelectorAll(".btn-comp-move-up").forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index, 10);
        this.moveComponent(idx, -1);
      };
    });

    this.elements.componentsList.querySelectorAll(".btn-comp-move-down").forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index, 10);
        this.moveComponent(idx, 1);
      };
    });
  },

  /**
   * Re-orders component array and triggers live simulator preview
   * @param {number} index 
   * @param {number} delta 
   */
  moveComponent(index, delta) {
    const list = [...(this.currentSettings.componentsOrder || ["header", "cart", "bill", "total", "pager", "payment", "footer"])];
    const targetIdx = index + delta;

    if (targetIdx < 0 || targetIdx >= list.length) return;

    const [moved] = list.splice(index, 1);
    list.splice(targetIdx, 0, moved);

    this.currentSettings.componentsOrder = list;
    this.renderComponentsList();
    this.broadcastLivePreview();
  },

  /**
   * Broadcasts updated display configuration to live simulator iframe and secondary monitor
   */
  broadcastLivePreview() {
    try {
      localStorage.setItem("pos_display_settings", JSON.stringify(this.currentSettings));
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel("pos_customer_display");
        channel.postMessage({ type: "display:updated", data: this.currentSettings });
      }
    } catch (_) {}
  },

  /**
   * Toggles rich sample cart simulation inside the 16:9 preview simulator
   */
  toggleSampleCart() {
    this.sampleCartActive = !this.sampleCartActive;

    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("pos_customer_display");

      if (this.sampleCartActive) {
        // Send Sample Cart Payload
        channel.postMessage({
          type: "cart:updated",
          data: {
            itemCount: 4,
            items: [
              { name: "Caramel Macchiato", qty: 2, price: 130.0 },
              { name: "Pork Sisig Rice", qty: 1, price: 165.0 },
              { name: "Choco Crinkles", qty: 1, price: 75.0 }
            ],
            vatableSales: 446.43,
            vatAmount: 53.57,
            total: 500.0
          }
        });

        // Send Sample Checkout Payload
        channel.postMessage({
          type: "checkout:updated",
          data: {
            pagerNumber: "12",
            tendered: 1000.0,
            change: 500.0
          }
        });

        if (this.elements.btnRefreshPreviewCart) {
          this.elements.btnRefreshPreviewCart.textContent = "🧹 Clear Sample Cart";
        }
      } else {
        // Clear Cart
        channel.postMessage({ type: "checkout:cleared" });
        if (this.elements.btnRefreshPreviewCart) {
          this.elements.btnRefreshPreviewCart.textContent = "🛒 Simulate Sample Cart";
        }
      }
    }
  },

  /**
   * Saves display configuration permanently into IndexedDB
   */
  async saveDisplaySettings() {
    await DB.saveDisplaySettings(this.currentSettings);
    alert("Secondary customer display settings saved successfully!");
  },

  /**
   * Resets display styling to default modern slate appearance
   */
  async resetDefaults() {
    const defaults = {
      layoutPreset: "split",
      themeMode: "dark",
      bgColor: "#0f172a",
      surfaceColor: "#1e293b",
      accentColor: "#0284c7",
      textColor: "#f8fafc",
      textMutedColor: "#94a3b8",
      fontFamily: "sans",
      fontSizeScale: "normal",
      showLogo: true,
      showTagline: true,
      customWelcome: "Welcome! Your order details will appear here as items are scanned.",
      customFooterNote: "Customer Display Terminal • Live Order Mirror",
      componentsOrder: ["header", "cart", "bill", "total", "pager", "payment", "footer"]
    };

    this.currentSettings = await DB.saveDisplaySettings(defaults);
    this.applySettingsToForm(this.currentSettings);
    this.renderComponentsList();
    this.broadcastLivePreview();
    alert("Customer display settings reset to defaults.");
  },

  /**
   * Triggers native Android DisplayManager to launch or reconnect the external presentation screen
   */
  async pushLiveToSecondary() {
    this.broadcastLivePreview();

    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        const res = await window.flutter_inappwebview.callHandler("openSecondaryDisplay");
        if (res && res.ok) {
          alert("Secondary customer presentation display mounted successfully on Android Display #2.");
        } else {
          alert("No external secondary monitor detected by Android DisplayManager.\n\nEnsure your second monitor is connected via HDMI or integrated hardware cable.");
        }
      } catch (err) {
        alert(`Native presentation call error: ${err.message}`);
      }
    } else {
      alert("Settings pushed via local broadcast channel!\n\n(Running in web preview mode. When deployed inside the Android APK, this mounts the hardware presentation screen).");
    }
  }
};

// REMARK: ADMIN_DISPLAY_JS_LIVE_SIMULATOR_AND_THEMING_COMPLETE