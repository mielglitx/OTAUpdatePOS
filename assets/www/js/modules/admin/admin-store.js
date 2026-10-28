/**
 * Module Description: Admin Store Profile, Branding & Granular Karinderya Settings Sub-Module
 * Manages store branding details (Store Name, Registered Company Name, Branch Address,
 * Contact Numbers, Receipt Footer Taglines), monochrome logo image uploading,
 * customer number pager configuration (on/off toggle and buzzer capacity),
 * and individual granular Karinderya Mode behavior controls (independent toggles for
 * exact cash tender bypass, GCash prompt bypass, compact items-only thermal receipt,
 * and calling buzzer suppression). Synchronizes settings in real time across the application.
 */

import { DB } from "../db.js";
import { Bus } from "../bus.js";
import { GCashEMVCo } from "../gcash-emvco.js";

export const AdminStore = {
  elements: {},
  callbacks: {},
  currentStoreLogoBase64: "",
  currentGcashQrBase64: "",
  currentGcashQrPayload: "",
  initialized: false,

  /**
   * Initializes DOM selections and binds store profile save, pager toggle, and logo preview events
   * @param {Object} callbacks - External hooks
   */
  init(callbacks = {}) {
    this.callbacks = callbacks;

    this.elements = {
      storeNameInput: document.getElementById("store-name-input"),
      storeCompanyInput: document.getElementById("store-company-input"),
      storeAddressInput: document.getElementById("store-address-input"),
      storeContactInput: document.getElementById("store-contact-input"),
      storeTaglineInput: document.getElementById("store-tagline-input"),
      storeLogoInput: document.getElementById("store-logo-input"),
      storeLogoPreview: document.getElementById("store-logo-preview"),
      storeAutoOpenDrawerCheckbox: document.getElementById("store-auto-open-drawer-checkbox"),
      storeUsePagerCheckbox: document.getElementById("store-use-pager-checkbox"),
      storePagerCountWrap: document.getElementById("store-pager-count-wrap"),
      storePagerCountInput: document.getElementById("store-pager-count-input"),
      
      // GCash Settings Elements
      storeGcashNameInput: document.getElementById("store-gcash-name-input"),
      storeGcashNumberInput: document.getElementById("store-gcash-number-input"),
      storeGcashQrInput: document.getElementById("store-gcash-qr-input"),
      storeGcashQrPreview: document.getElementById("store-gcash-qr-preview"),
      storeGcashQrPlaceholder: document.getElementById("store-gcash-qr-placeholder"),
      storeGcashQrStatus: document.getElementById("store-gcash-qr-status"),
      btnRemoveGcashQr: document.getElementById("btn-remove-gcash-qr"),

      // Master Fast Mode Toggle
      storeKarinderyaCheckbox: document.getElementById("store-karinderya-checkbox"),
      
      // Granular Individual Karinderya Behavior Checkboxes
      cbKarinderyaAutoCash: document.getElementById("cb-karinderya-auto-cash"),
      cbKarinderyaAutoGCash: document.getElementById("cb-karinderya-auto-gcash"),
      cbKarinderyaCompactReceipt: document.getElementById("cb-karinderya-compact-receipt"),
      cbKarinderyaSuppressPager: document.getElementById("cb-karinderya-suppress-pager"),
      cbKarinderyaVoucherOnly: document.getElementById("cb-karinderya-voucher-only"),
      
      btnSaveStoreSettings: document.getElementById("btn-save-store-settings")
    };

    if (this.initialized) return;
    this.initialized = true;

    // Synchronize master toggle in real time if changed from front-page register topbar
    Bus.on("store:karinderya-changed", (enabled) => {
      if (this.elements.storeKarinderyaCheckbox) {
        this.elements.storeKarinderyaCheckbox.checked = Boolean(enabled);
      }
    });

    // Toggle buzzer count input visibility based on checkbox state
    if (this.elements.storeUsePagerCheckbox) {
      this.elements.storeUsePagerCheckbox.onchange = () => {
        const isEnabled = this.elements.storeUsePagerCheckbox.checked;
        if (this.elements.storePagerCountWrap) {
          this.elements.storePagerCountWrap.classList.toggle("hidden", !isEnabled);
        }
      };
    }

    // Store Logo File Reader & Preview Handler
    if (this.elements.storeLogoInput) {
      this.elements.storeLogoInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            this.currentStoreLogoBase64 = evt.target.result;
            if (this.elements.storeLogoPreview) {
              this.elements.storeLogoPreview.src = this.currentStoreLogoBase64;
              this.elements.storeLogoPreview.classList.remove("hidden");
            }
          };
          reader.readAsDataURL(file);
        }
      };
    }

    // GCash QR Code File Reader, Payload Stripper & Clean QR Generator
    if (this.elements.storeGcashQrInput) {
      this.elements.storeGcashQrInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (this.elements.storeGcashQrStatus) {
          this.elements.storeGcashQrStatus.innerHTML = '<span style="color: #0284c7; font-weight: 600;">⏳ Scanning screenshot & extracting pure QR code...</span>';
        }

        const reader = new FileReader();
        reader.onload = async (evt) => {
          const originalBase64 = evt.target.result;

          try {
            // Attempt multi-pass QR payload extraction from the uploaded phone screenshot
            const payload = await GCashEMVCo.extractPayloadFromImage(originalBase64);

            if (payload) {
              this.currentGcashQrPayload = payload;
              GCashEMVCo.setBasePayload(payload);

              // Generate crisp, borderless, high-resolution QR code (displaying ONLY the QR code)
              const cleanQr = await GCashEMVCo.generateCleanQrDataUrl(payload, 300);
              this.currentGcashQrBase64 = cleanQr || originalBase64;

              // Auto-fill Merchant Name & Number if fields are empty
              const merchantInfo = GCashEMVCo.extractMerchantInfo(payload);
              if (merchantInfo.name && this.elements.storeGcashNameInput && !this.elements.storeGcashNameInput.value.trim()) {
                this.elements.storeGcashNameInput.value = merchantInfo.name;
              }
              if (merchantInfo.number && this.elements.storeGcashNumberInput && !this.elements.storeGcashNumberInput.value.trim()) {
                this.elements.storeGcashNumberInput.value = merchantInfo.number;
              }

              if (this.elements.storeGcashQrStatus) {
                this.elements.storeGcashQrStatus.innerHTML = '<span style="color: #059669; font-weight: 700;">✅ Clean QR Code extracted from screenshot!</span>';
              }
            } else {
              // Fallback to raw uploaded image if payload cannot be decoded
              this.currentGcashQrPayload = "";
              this.currentGcashQrBase64 = originalBase64;
              if (this.elements.storeGcashQrStatus) {
                this.elements.storeGcashQrStatus.innerHTML = '<span style="color: #d97706; font-weight: 600;">⚠️ Showing uploaded image directly (Could not auto-extract QR payload).</span>';
              }
            }
          } catch (err) {
            console.warn("[AdminStore] Error during QR stripping:", err);
            this.currentGcashQrPayload = "";
            this.currentGcashQrBase64 = originalBase64;
            if (this.elements.storeGcashQrStatus) {
              this.elements.storeGcashQrStatus.innerHTML = '<span style="color: #d97706; font-weight: 600;">⚠️ Showing uploaded image directly.</span>';
            }
          }

          // Update preview display
          if (this.elements.storeGcashQrPreview) {
            this.elements.storeGcashQrPreview.src = this.currentGcashQrBase64;
            this.elements.storeGcashQrPreview.classList.remove("hidden");
          }
          if (this.elements.storeGcashQrPlaceholder) {
            this.elements.storeGcashQrPlaceholder.classList.add("hidden");
          }
          if (this.elements.btnRemoveGcashQr) {
            this.elements.btnRemoveGcashQr.classList.remove("hidden");
          }
        };
        reader.readAsDataURL(file);
      };
    }

    // Remove Uploaded GCash QR Code
    if (this.elements.btnRemoveGcashQr) {
      this.elements.btnRemoveGcashQr.onclick = () => {
        this.currentGcashQrBase64 = "";
        this.currentGcashQrPayload = "";
        if (this.elements.storeGcashQrInput) {
          this.elements.storeGcashQrInput.value = "";
        }
        if (this.elements.storeGcashQrPreview) {
          this.elements.storeGcashQrPreview.src = "";
          this.elements.storeGcashQrPreview.classList.add("hidden");
        }
        if (this.elements.storeGcashQrPlaceholder) {
          this.elements.storeGcashQrPlaceholder.classList.remove("hidden");
        }
        if (this.elements.storeGcashQrStatus) {
          this.elements.storeGcashQrStatus.innerHTML = "";
        }
        this.elements.btnRemoveGcashQr.classList.add("hidden");
      };
    }

    // Save Store Profile & Settings Trigger
    if (this.elements.btnSaveStoreSettings) {
      this.elements.btnSaveStoreSettings.onclick = async () => {
        const storeName = this.elements.storeNameInput ? this.elements.storeNameInput.value.trim() || "LOKALEX STORE" : "LOKALEX STORE";
        const companyName = this.elements.storeCompanyInput ? this.elements.storeCompanyInput.value.trim() : "";
        const address = this.elements.storeAddressInput ? this.elements.storeAddressInput.value.trim() : "";
        const contactNumber = this.elements.storeContactInput ? this.elements.storeContactInput.value.trim() : "";
        const tagline = this.elements.storeTaglineInput ? this.elements.storeTaglineInput.value.trim() : "";
        const useNumberPager = this.elements.storeUsePagerCheckbox ? Boolean(this.elements.storeUsePagerCheckbox.checked) : false;
        const pagerCount = this.elements.storePagerCountInput ? Math.max(1, parseInt(this.elements.storePagerCountInput.value, 10) || 24) : 24;

        // GCash Settings
        const gcashName = this.elements.storeGcashNameInput ? this.elements.storeGcashNameInput.value.trim() : "";
        const gcashNumber = this.elements.storeGcashNumberInput ? this.elements.storeGcashNumberInput.value.trim() : "";
        const gcashQrBase64 = this.currentGcashQrBase64 || "";
        const gcashQrPayload = this.currentGcashQrPayload || "";

        // Capture master state and each granular behavior flag
        const karinderyaMode = this.elements.storeKarinderyaCheckbox ? Boolean(this.elements.storeKarinderyaCheckbox.checked) : false;
        const karinderyaAutoCash = this.elements.cbKarinderyaAutoCash ? Boolean(this.elements.cbKarinderyaAutoCash.checked) : true;
        const karinderyaAutoGCash = this.elements.cbKarinderyaAutoGCash ? Boolean(this.elements.cbKarinderyaAutoGCash.checked) : true;
        const karinderyaCompactReceipt = this.elements.cbKarinderyaCompactReceipt ? Boolean(this.elements.cbKarinderyaCompactReceipt.checked) : true;
        const karinderyaSuppressPager = this.elements.cbKarinderyaSuppressPager ? Boolean(this.elements.cbKarinderyaSuppressPager.checked) : true;
        const karinderyaVoucherOnly = this.elements.cbKarinderyaVoucherOnly ? Boolean(this.elements.cbKarinderyaVoucherOnly.checked) : false;

        const autoOpenDrawer = this.elements.storeAutoOpenDrawerCheckbox ? this.elements.storeAutoOpenDrawerCheckbox.checked : true;

        const payload = {
          storeName,
          companyName,
          address,
          contactNumber,
          tagline,
          logoBase64: this.currentStoreLogoBase64 || "",
          gcashName,
          gcashNumber,
          gcashQrBase64,
          gcashQrPayload,
          autoOpenDrawer,
          useNumberPager,
          pagerCount,
          karinderyaMode,
          karinderyaAutoCash,
          karinderyaAutoGCash,
          karinderyaCompactReceipt,
          karinderyaSuppressPager,
          karinderyaVoucherOnly
        };

        await DB.saveStoreSettings(payload);
        Bus.emit("store:karinderya-changed", karinderyaMode);
        Bus.emit("store:karinderya-settings-updated", payload);
        alert("Store Profile, GCash Settings & Fast Mode settings saved successfully.");
      };
    }
  },

  /**
   * Loads persisted store settings and individual Karinderya checkboxes from IndexedDB into form fields
   */
  async loadStoreSettings() {
    const settings = await DB.getStoreSettings();

    if (this.elements.storeNameInput) this.elements.storeNameInput.value = settings.storeName || "";
    if (this.elements.storeCompanyInput) this.elements.storeCompanyInput.value = settings.companyName || "";
    if (this.elements.storeAddressInput) this.elements.storeAddressInput.value = settings.address || "";
    if (this.elements.storeContactInput) this.elements.storeContactInput.value = settings.contactNumber || "";
    if (this.elements.storeTaglineInput) this.elements.storeTaglineInput.value = settings.tagline || "";

    if (this.elements.storeAutoOpenDrawerCheckbox) {
      this.elements.storeAutoOpenDrawerCheckbox.checked = settings.autoOpenDrawer !== false;
    }

    const isPagerEnabled = Boolean(settings.useNumberPager);
    if (this.elements.storeUsePagerCheckbox) {
      this.elements.storeUsePagerCheckbox.checked = isPagerEnabled;
    }
    if (this.elements.storePagerCountWrap) {
      this.elements.storePagerCountWrap.classList.toggle("hidden", !isPagerEnabled);
    }
    if (this.elements.storePagerCountInput) {
      this.elements.storePagerCountInput.value = settings.pagerCount !== undefined ? settings.pagerCount : 24;
    }

    // Populate Master Karinderya Mode state
    if (this.elements.storeKarinderyaCheckbox) {
      this.elements.storeKarinderyaCheckbox.checked = Boolean(settings.karinderyaMode);
    }

    // Populate individual granular behavior checkboxes (defaults to true if not explicitly set)
    if (this.elements.cbKarinderyaAutoCash) {
      this.elements.cbKarinderyaAutoCash.checked = settings.karinderyaAutoCash !== undefined ? Boolean(settings.karinderyaAutoCash) : true;
    }
    if (this.elements.cbKarinderyaAutoGCash) {
      this.elements.cbKarinderyaAutoGCash.checked = settings.karinderyaAutoGCash !== undefined ? Boolean(settings.karinderyaAutoGCash) : true;
    }
    if (this.elements.cbKarinderyaCompactReceipt) {
      this.elements.cbKarinderyaCompactReceipt.checked = settings.karinderyaCompactReceipt !== undefined ? Boolean(settings.karinderyaCompactReceipt) : true;
    }
    if (this.elements.cbKarinderyaSuppressPager) {
      this.elements.cbKarinderyaSuppressPager.checked = settings.karinderyaSuppressPager !== undefined ? Boolean(settings.karinderyaSuppressPager) : true;
    }
    if (this.elements.cbKarinderyaVoucherOnly) {
      this.elements.cbKarinderyaVoucherOnly.checked = settings.karinderyaVoucherOnly !== undefined ? Boolean(settings.karinderyaVoucherOnly) : false;
    }

    this.currentStoreLogoBase64 = settings.logoBase64 || "";
    if (this.elements.storeLogoPreview) {
      if (settings.logoBase64) {
        this.elements.storeLogoPreview.src = settings.logoBase64;
        this.elements.storeLogoPreview.classList.remove("hidden");
      } else {
        this.elements.storeLogoPreview.classList.add("hidden");
      }
    }

    // Populate GCash Settings
    if (this.elements.storeGcashNameInput) {
      this.elements.storeGcashNameInput.value = settings.gcashName || "";
    }
    if (this.elements.storeGcashNumberInput) {
      this.elements.storeGcashNumberInput.value = settings.gcashNumber || "";
    }

    this.currentGcashQrBase64 = settings.gcashQrBase64 || "";
    this.currentGcashQrPayload = settings.gcashQrPayload || "";

    if (this.currentGcashQrPayload) {
      GCashEMVCo.setBasePayload(this.currentGcashQrPayload);
      if (this.elements.storeGcashQrStatus) {
        this.elements.storeGcashQrStatus.innerHTML = '<span style="color: #059669; font-weight: 700;">✅ Clean QR Code active</span>';
      }
    } else if (this.currentGcashQrBase64) {
      if (this.elements.storeGcashQrStatus) {
        this.elements.storeGcashQrStatus.innerHTML = '<span style="color: #64748b; font-size: 0.75rem;">Custom QR image loaded</span>';
      }
      // Background auto-upgrade: attempt to strip payload from existing screenshot
      GCashEMVCo.extractPayloadFromImage(this.currentGcashQrBase64).then(async (payload) => {
        if (payload) {
          this.currentGcashQrPayload = payload;
          GCashEMVCo.setBasePayload(payload);
          const cleanQr = await GCashEMVCo.generateCleanQrDataUrl(payload, 300);
          if (cleanQr) {
            this.currentGcashQrBase64 = cleanQr;
            if (this.elements.storeGcashQrPreview) {
              this.elements.storeGcashQrPreview.src = cleanQr;
            }
            if (this.elements.storeGcashQrStatus) {
              this.elements.storeGcashQrStatus.innerHTML = '<span style="color: #059669; font-weight: 700;">✅ Clean QR Code extracted from screenshot!</span>';
            }
            await DB.saveStoreSettings({
              gcashQrBase64: cleanQr,
              gcashQrPayload: payload
            });
          }
        }
      }).catch((err) => console.warn("[AdminStore] Auto-strip on load error:", err));
    } else {
      if (this.elements.storeGcashQrStatus) {
        this.elements.storeGcashQrStatus.innerHTML = "";
      }
    }

    if (this.elements.storeGcashQrPreview) {
      if (this.currentGcashQrBase64) {
        this.elements.storeGcashQrPreview.src = this.currentGcashQrBase64;
        this.elements.storeGcashQrPreview.classList.remove("hidden");
        if (this.elements.storeGcashQrPlaceholder) {
          this.elements.storeGcashQrPlaceholder.classList.add("hidden");
        }
        if (this.elements.btnRemoveGcashQr) {
          this.elements.btnRemoveGcashQr.classList.remove("hidden");
        }
      } else {
        this.elements.storeGcashQrPreview.src = "";
        this.elements.storeGcashQrPreview.classList.add("hidden");
        if (this.elements.storeGcashQrPlaceholder) {
          this.elements.storeGcashQrPlaceholder.classList.remove("hidden");
        }
        if (this.elements.btnRemoveGcashQr) {
          this.elements.btnRemoveGcashQr.classList.add("hidden");
        }
      }
    }
  }
};

// REMARK: ADMIN_STORE_JS_GRANULAR_KARINDERYA_SETTINGS_COMPLETE