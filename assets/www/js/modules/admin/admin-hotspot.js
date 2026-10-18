/**
 * Module Description: Admin MikroTik Hotspot & Captive Portal Sub-Module
 * Manages configuration for RouterOS v7 REST endpoints, connection testing,
 * automated port/protocol synchronization (HTTP=80, HTTPS=443), password visibility
 * preview toggle, user-friendly session duration presets, bandwidth speed rate-limiting,
 * single user vs unlimited multi-device concurrent user allowances, dedicated Crew Wi-Fi
 * access pass generation mapped accurately with custom CREW-WIFI router profiles, custom
 * hourly/daily durations, thermal receipt printing, individual and bulk voucher deletion
 * (both local IndexedDB and remote RouterOS user accounts), progressive disclosure for
 * advanced networking fields, and universal plain-text (.txt) configuration backup/restore
 * designed for seamless cross-platform compatibility on Android, iOS, and desktop browsers.
 */

import { DB } from "../db.js";
import { MikrotikSync } from "../mikrotik-sync.js";
import { Printer } from "../printer.js";
import { GCashEMVCo } from "../gcash-emvco.js";

export const AdminHotspot = {
  elements: {},
  callbacks: {},
  initialized: false,
  selectedUptime: "2h",
  activeCrewVoucher: null,
  activeAdminVoucher: null,
  qrReader: null,
  pendingImportSettings: null,

  /**
   * Initializes DOM selections and binds Hotspot administrative events
   * @param {Object} callbacks - External hooks
   */
  init(callbacks = {}) {
    this.callbacks = callbacks;

    this.elements = {
      hotspotEnabledCheckbox: document.getElementById("store-hotspot-enabled-checkbox"),
      hotspotSettingsWrap: document.getElementById("hotspot-settings-wrap"),

      // Duration Controls
      selectDuration: document.getElementById("select-hotspot-duration"),
      durationPresetButtons: document.querySelectorAll(".btn-duration-preset"),
      customDurationWrap: document.getElementById("custom-duration-wrap"),
      inputCustomDurationVal: document.getElementById("input-custom-duration-val"),
      selectCustomDurationUnit: document.getElementById("select-custom-duration-unit"),

      // Bandwidth Speed Limit & Single/Unlimited Concurrency Controls
      selectRateLimit: document.getElementById("select-hotspot-rate-limit"),
      selectSharedUsers: document.getElementById("select-hotspot-shared-users"),

      // Basic Network Coordinates & Password Visibility
      inputRouterIp: document.getElementById("input-hotspot-ip"),
      inputPassword: document.getElementById("input-hotspot-pass"),
      btnToggleHotspotPass: document.getElementById("btn-toggle-hotspot-pass"),

      // Advanced Accordion Controls
      btnToggleAdvanced: document.getElementById("btn-toggle-advanced-hotspot"),
      advancedSettingsWrap: document.getElementById("advanced-hotspot-wrap"),
      inputPort: document.getElementById("input-hotspot-port"),
      selectProtocol: document.getElementById("select-hotspot-protocol"),
      inputUsername: document.getElementById("input-hotspot-user"),
      inputDomain: document.getElementById("input-hotspot-domain"),
      inputProfile: document.getElementById("input-hotspot-profile"),

      // Action Buttons & Status Indicators
      btnSaveHotspotSettings: document.getElementById("btn-save-hotspot-settings"),
      btnTestHotspotConnection: document.getElementById("btn-test-hotspot-conn"),
      btnExportHotspotSettings: document.getElementById("btn-export-hotspot-settings"),
      btnImportHotspotSettings: document.getElementById("btn-import-hotspot-settings"),
      inputImportFile: document.getElementById("input-import-hotspot-file"),
      statHotspotStatus: document.getElementById("stat-hotspot-conn-status"),
      statAvailableVouchers: document.getElementById("stat-available-vouchers"),
      statConsumedVouchers: document.getElementById("stat-consumed-vouchers"),

      // Crew Wi-Fi Modal Controls
      btnOpenCrewWifiModal: document.getElementById("btn-open-crew-wifi-modal"),
      modalCrewWifi: document.getElementById("modal-crew-wifi"),
      btnCloseCrewWifiX: document.getElementById("btn-close-crew-wifi-x"),
      btnCancelCrewWifi: document.getElementById("btn-cancel-crew-wifi"),
      selectCrewDurationMode: document.getElementById("select-crew-duration-mode"),
      inputCrewDurationQty: document.getElementById("input-crew-duration-qty"),
      crewDurationUnitLabel: document.getElementById("crew-duration-unit-label"),
      crewDurationHint: document.getElementById("crew-duration-hint"),
      selectCrewRateLimit: document.getElementById("select-crew-rate-limit"),
      crewPassResultBox: document.getElementById("crew-pass-result-box"),
      crewWifiQrcode: document.getElementById("crew-wifi-qrcode"),
      crewWifiCodeDisplay: document.getElementById("crew-wifi-code-display"),
      crewWifiDetailsLabel: document.getElementById("crew-wifi-details-label"),
      btnGenerateCrewWifi: document.getElementById("btn-generate-crew-wifi"),
      btnPrintCrewWifi: document.getElementById("btn-print-crew-wifi"),

      // Admin Master Wi-Fi Modal Controls
      btnOpenAdminWifiModal: document.getElementById("btn-open-admin-wifi-modal"),
      modalAdminWifi: document.getElementById("modal-admin-wifi"),
      btnCloseAdminWifiX: document.getElementById("btn-close-admin-wifi-x"),
      btnCancelAdminWifi: document.getElementById("btn-cancel-admin-wifi"),
      btnGenerateAdminWifi: document.getElementById("btn-generate-admin-wifi"),
      btnPrintAdminWifi: document.getElementById("btn-print-admin-wifi"),
      adminPassResultBox: document.getElementById("admin-pass-result-box"),
      adminWifiQrcode: document.getElementById("admin-wifi-qrcode"),
      adminWifiCodeDisplay: document.getElementById("admin-wifi-code-display"),
      adminWifiDetailsLabel: document.getElementById("admin-wifi-details-label"),

      // Export Inspector Modal Controls
      modalExportHotspot: document.getElementById("modal-export-hotspot"),
      hotspotQrExportCanvas: document.getElementById("hotspot-qr-export-canvas"),
      exportJsonTextarea: document.getElementById("export-json-textarea"),
      btnCloseExportModal: document.getElementById("btn-close-export-modal"),
      btnCopyExportJson: document.getElementById("btn-copy-export-json"),
      btnDownloadExportJson: document.getElementById("btn-download-export-json"),

      // Import Dialog Controls
      modalImportHotspot: document.getElementById("modal-import-hotspot"),
      btnCloseImportModal: document.getElementById("btn-close-import-modal"),
      tabImportCamera: document.getElementById("tab-import-camera"),
      tabImportImage: document.getElementById("tab-import-image"),
      tabImportText: document.getElementById("tab-import-text"),
      viewImportCamera: document.getElementById("view-import-camera"),
      viewImportImage: document.getElementById("view-import-image"),
      viewImportText: document.getElementById("view-import-text"),
      hotspotImportVideo: document.getElementById("hotspot-import-video"),
      hotspotImportCameraPlaceholder: document.getElementById("hotspot-import-camera-placeholder"),
      hotspotScanLaser: document.getElementById("hotspot-scan-laser"),
      btnStartCameraScan: document.getElementById("btn-start-camera-scan"),
      btnStopCameraScan: document.getElementById("btn-stop-camera-scan"),
      inputImportQrImage: document.getElementById("input-import-qr-image"),
      btnChooseQrImage: document.getElementById("btn-choose-qr-image"),
      importQrImageStatus: document.getElementById("import-qr-image-status"),
      importJsonTextarea: document.getElementById("import-json-textarea"),
      inputImportFileBackup: document.getElementById("input-import-file-backup"),
      btnApplyPastedJson: document.getElementById("btn-apply-pasted-json"),
      importPreviewBox: document.getElementById("import-preview-box"),
      importPreviewDetails: document.getElementById("import-preview-details"),
      btnCancelImportPreview: document.getElementById("btn-cancel-import-preview"),
      btnConfirmImportPreview: document.getElementById("btn-confirm-import-preview"),

      // Batch Generation Controls
      inputBatchCount: document.getElementById("input-batch-vouchers-count"),
      quickBatchButtons: document.querySelectorAll(".btn-quick-batch"),
      btnBatchGenerate: document.getElementById("btn-batch-generate-vouchers"),
      btnDeleteUnusedVouchers: document.getElementById("btn-delete-unused-vouchers"),
      btnClearConsumedVouchers: document.getElementById("btn-clear-consumed-vouchers"),
      vouchersTbody: document.getElementById("vouchers-admin-tbody")
    };

    if (this.initialized) return;
    this.initialized = true;

    // 1. Toggle master checkbox
    if (this.elements.hotspotEnabledCheckbox) {
      this.elements.hotspotEnabledCheckbox.onchange = () => {
        const isEnabled = this.elements.hotspotEnabledCheckbox.checked;
        if (this.elements.hotspotSettingsWrap) {
          this.elements.hotspotSettingsWrap.classList.toggle("hidden", !isEnabled);
        }
      };
    }

    // 2. Password Visibility Preview Toggle (Shows / Hides RouterOS Password)
    if (this.elements.btnToggleHotspotPass && this.elements.inputPassword) {
      this.elements.btnToggleHotspotPass.onclick = () => {
        const isPassword = this.elements.inputPassword.type === "password";
        this.elements.inputPassword.type = isPassword ? "text" : "password";
        this.elements.btnToggleHotspotPass.textContent = isPassword ? "🙈" : "👁️";
      };
    }

    // 3. Protocol change listener with automated port switching
    if (this.elements.selectProtocol) {
      this.elements.selectProtocol.onchange = () => {
        const proto = this.elements.selectProtocol.value;
        if (this.elements.inputPort) {
          this.elements.inputPort.value = proto === "https" ? "443" : "80";
        }
      };
    }

    // 4. Duration Dropdown Change Listener
    if (this.elements.selectDuration) {
      this.elements.selectDuration.onchange = () => {
        const val = this.elements.selectDuration.value;
        if (val === "custom") {
          if (this.elements.customDurationWrap) {
            this.elements.customDurationWrap.classList.remove("hidden");
          }
          this.updateActivePresetButton(null);
        } else {
          if (this.elements.customDurationWrap) {
            this.elements.customDurationWrap.classList.add("hidden");
          }
          this.selectedUptime = val;
          this.updateActivePresetButton(val);
        }
      };
    }

    // 5. Quick-Tap Duration Preset Buttons
    if (this.elements.durationPresetButtons) {
      this.elements.durationPresetButtons.forEach((btn) => {
        btn.onclick = () => {
          const uptime = btn.dataset.uptime;
          this.selectedUptime = uptime;
          if (this.elements.selectDuration) {
            this.elements.selectDuration.value = uptime;
          }
          if (this.elements.customDurationWrap) {
            this.elements.customDurationWrap.classList.add("hidden");
          }
          this.updateActivePresetButton(uptime);
        };
      });
    }

    // 6. Custom Duration Inputs
    const updateCustomUptime = () => {
      const num = parseInt(this.elements.inputCustomDurationVal ? this.elements.inputCustomDurationVal.value : "2", 10) || 1;
      const unit = this.elements.selectCustomDurationUnit ? this.elements.selectCustomDurationUnit.value : "h";
      this.selectedUptime = `${num}${unit}`;
    };

    if (this.elements.inputCustomDurationVal) {
      this.elements.inputCustomDurationVal.oninput = updateCustomUptime;
    }
    if (this.elements.selectCustomDurationUnit) {
      this.elements.selectCustomDurationUnit.onchange = updateCustomUptime;
    }

    // 7. Advanced Accordion
    if (this.elements.btnToggleAdvanced) {
      this.elements.btnToggleAdvanced.onclick = () => {
        if (this.elements.advancedSettingsWrap) {
          const isHidden = this.elements.advancedSettingsWrap.classList.contains("hidden");
          this.elements.advancedSettingsWrap.classList.toggle("hidden", !isHidden);
          this.elements.btnToggleAdvanced.textContent = isHidden
            ? "▲ Hide Advanced Settings"
            : "⚙️ Show Advanced Network Settings";
        }
      };
    }

    // 8. Save Hotspot Configuration Action
    if (this.elements.btnSaveHotspotSettings) {
      this.elements.btnSaveHotspotSettings.onclick = async () => {
        await this.saveHotspotSettings();
      };
    }

    // 9. Test Router Connection Action
    if (this.elements.btnTestHotspotConnection) {
      this.elements.btnTestHotspotConnection.onclick = async () => {
        await this.testConnection();
      };
    }

    // 10. Export Settings Configuration (Exports formatted text file)
    if (this.elements.btnExportHotspotSettings) {
      this.elements.btnExportHotspotSettings.onclick = async () => {
        await this.exportSettings();
      };
    }

    // Export Modal Controls
    if (this.elements.btnCloseExportModal) {
      this.elements.btnCloseExportModal.onclick = () => {
        if (this.elements.modalExportHotspot && this.elements.modalExportHotspot.open) {
          this.elements.modalExportHotspot.close();
        }
      };
    }

    if (this.elements.btnCopyExportJson) {
      this.elements.btnCopyExportJson.onclick = async () => {
        if (this.elements.exportJsonTextarea) {
          try {
            await navigator.clipboard.writeText(this.elements.exportJsonTextarea.value);
            alert("Configuration text backup copied to clipboard successfully!");
          } catch (clipErr) {
            this.elements.exportJsonTextarea.select();
            document.execCommand("copy");
            alert("Configuration text backup selected and copied!");
          }
        }
      };
    }

    if (this.elements.btnDownloadExportJson) {
      this.elements.btnDownloadExportJson.onclick = () => {
        if (this.elements.exportJsonTextarea) {
          this.triggerFileDownload(this.elements.exportJsonTextarea.value);
        }
      };
    }

    // 11. Import Settings Modal & Event Listeners
    if (this.elements.btnImportHotspotSettings) {
      this.elements.btnImportHotspotSettings.onclick = () => {
        this.openImportModal();
      };
    }

    if (this.elements.btnCloseImportModal) {
      this.elements.btnCloseImportModal.onclick = () => {
        this.closeImportModal();
      };
    }

    if (this.elements.modalImportHotspot) {
      this.elements.modalImportHotspot.addEventListener("close", () => {
        this.stopCameraScanner();
      });
      this.elements.modalImportHotspot.addEventListener("cancel", () => {
        this.stopCameraScanner();
      });
    }

    const switchImportTab = (mode) => {
      this.stopCameraScanner();
      const tabs = [
        { tab: this.elements.tabImportCamera, view: this.elements.viewImportCamera, id: "camera" },
        { tab: this.elements.tabImportImage, view: this.elements.viewImportImage, id: "image" },
        { tab: this.elements.tabImportText, view: this.elements.viewImportText, id: "text" }
      ];
      tabs.forEach((item) => {
        if (item.tab) item.tab.classList.toggle("active", item.id === mode);
        if (item.view) item.view.classList.toggle("hidden", item.id !== mode);
      });
      if (mode === "camera") {
        this.startCameraScanner();
      }
    };

    if (this.elements.tabImportCamera) {
      this.elements.tabImportCamera.onclick = () => switchImportTab("camera");
    }
    if (this.elements.tabImportImage) {
      this.elements.tabImportImage.onclick = () => switchImportTab("image");
    }
    if (this.elements.tabImportText) {
      this.elements.tabImportText.onclick = () => switchImportTab("text");
    }

    if (this.elements.btnStartCameraScan) {
      this.elements.btnStartCameraScan.onclick = () => {
        this.startCameraScanner();
      };
    }
    if (this.elements.btnStopCameraScan) {
      this.elements.btnStopCameraScan.onclick = () => {
        this.stopCameraScanner();
      };
    }

    if (this.elements.btnChooseQrImage && this.elements.inputImportQrImage) {
      this.elements.btnChooseQrImage.onclick = () => {
        this.elements.inputImportQrImage.value = "";
        this.elements.inputImportQrImage.click();
      };
    }
    if (this.elements.inputImportQrImage) {
      this.elements.inputImportQrImage.onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          await this.handleQrImageUpload(file);
        }
      };
    }

    if (this.elements.inputImportFileBackup) {
      this.elements.inputImportFileBackup.onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          try {
            const text = await file.text();
            if (this.elements.importJsonTextarea) {
              this.elements.importJsonTextarea.value = text;
            }
            this.handleScannedConfig(text);
          } catch (err) {
            alert("Failed to read file: " + err.message);
          }
        }
      };
    }

    if (this.elements.btnApplyPastedJson) {
      this.elements.btnApplyPastedJson.onclick = () => {
        const txt = this.elements.importJsonTextarea ? this.elements.importJsonTextarea.value.trim() : "";
        if (!txt) {
          alert("Please paste configuration JSON or text first.");
          return;
        }
        this.handleScannedConfig(txt);
      };
    }

    if (this.elements.btnCancelImportPreview) {
      this.elements.btnCancelImportPreview.onclick = () => {
        this.pendingImportSettings = null;
        if (this.elements.importPreviewBox) {
          this.elements.importPreviewBox.classList.add("hidden");
        }
      };
    }

    if (this.elements.btnConfirmImportPreview) {
      this.elements.btnConfirmImportPreview.onclick = async () => {
        await this.applyImportedSettings();
      };
    }

    if (this.elements.inputImportFile) {
      this.elements.inputImportFile.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          await this.importSettingsFile(file);
        }
      };
    }

    // 12. Quick Batch Size Buttons
    if (this.elements.quickBatchButtons) {
      this.elements.quickBatchButtons.forEach((btn) => {
        btn.onclick = () => {
          const count = parseInt(btn.dataset.count, 10);
          if (this.elements.inputBatchCount && !isNaN(count)) {
            this.elements.inputBatchCount.value = count;
          }
          this.elements.quickBatchButtons.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
        };
      });
    }

    // 13. Batch Pre-generate Vouchers for Offline Pool
    if (this.elements.btnBatchGenerate) {
      this.elements.btnBatchGenerate.onclick = async () => {
        await this.batchGeneratePool();
      };
    }

    // 14. Delete All Unused Vouchers
    if (this.elements.btnDeleteUnusedVouchers) {
      this.elements.btnDeleteUnusedVouchers.onclick = async () => {
        await this.deleteAllUnusedVouchers();
      };
    }

    // 15. Clear Consumed Vouchers Log
    if (this.elements.btnClearConsumedVouchers) {
      this.elements.btnClearConsumedVouchers.onclick = async () => {
        if (confirm("Clear all consumed vouchers from database history? Available pool will remain untouched.")) {
          await DB.clearConsumedVouchers();
          await this.loadVouchersTable();
          alert("Consumed vouchers log cleared successfully.");
        }
      };
    }

    // =========================================================================
    // 16. DEDICATED CREW WI-FI PASS CONTROLLER
    // =========================================================================

    if (this.elements.btnOpenCrewWifiModal) {
      this.elements.btnOpenCrewWifiModal.onclick = () => {
        this.activeCrewVoucher = null;
        if (this.elements.crewPassResultBox) {
          this.elements.crewPassResultBox.classList.add("hidden");
        }
        if (this.elements.btnPrintCrewWifi) {
          this.elements.btnPrintCrewWifi.classList.add("hidden");
        }
        if (this.elements.modalCrewWifi && typeof this.elements.modalCrewWifi.showModal === "function") {
          this.elements.modalCrewWifi.showModal();
        }
      };
    }

    const closeCrewModal = () => {
      if (this.elements.modalCrewWifi && this.elements.modalCrewWifi.open) {
        this.elements.modalCrewWifi.close();
      }
    };

    if (this.elements.btnCloseCrewWifiX) this.elements.btnCloseCrewWifiX.onclick = closeCrewModal;
    if (this.elements.btnCancelCrewWifi) this.elements.btnCancelCrewWifi.onclick = closeCrewModal;

    // Toggle Hourly (1-24h) vs Daily (1-30d) Duration Limits
    if (this.elements.selectCrewDurationMode) {
      this.elements.selectCrewDurationMode.onchange = () => {
        const mode = this.elements.selectCrewDurationMode.value;
        if (mode === "hours") {
          if (this.elements.inputCrewDurationQty) {
            this.elements.inputCrewDurationQty.max = "24";
            this.elements.inputCrewDurationQty.value = "12";
          }
          if (this.elements.crewDurationUnitLabel) this.elements.crewDurationUnitLabel.textContent = "Hours";
          if (this.elements.crewDurationHint) this.elements.crewDurationHint.textContent = "Range: 1 to 24 hours.";
        } else {
          if (this.elements.inputCrewDurationQty) {
            this.elements.inputCrewDurationQty.max = "30";
            this.elements.inputCrewDurationQty.value = "7";
          }
          if (this.elements.crewDurationUnitLabel) this.elements.crewDurationUnitLabel.textContent = "Days";
          if (this.elements.crewDurationHint) this.elements.crewDurationHint.textContent = "Range: 1 to 30 days.";
        }
      };
    }

    // Generate Crew Wi-Fi Pass on MikroTik and Display
    // Generate Crew Wi-Fi Pass on MikroTik and Display
    if (this.elements.btnGenerateCrewWifi) {
      this.elements.btnGenerateCrewWifi.onclick = async () => {
        this.elements.btnGenerateCrewWifi.disabled = true;
        this.elements.btnGenerateCrewWifi.textContent = "Creating...";

        try {
          const store = await DB.getStoreSettings();

          const mode = this.elements.selectCrewDurationMode ? this.elements.selectCrewDurationMode.value : "hours";
          const maxVal = mode === "days" ? 30 : 24;
          const qtyRaw = parseInt(this.elements.inputCrewDurationQty ? this.elements.inputCrewDurationQty.value : "12", 10) || 12;
          const qty = Math.min(maxVal, Math.max(1, qtyRaw));
          const unit = mode === "days" ? "d" : "h";
          const uptime = `${qty}${unit}`;
          const rateLimit = this.elements.selectCrewRateLimit ? this.elements.selectCrewRateLimit.value : "";

          const { code, pin } = MikrotikSync.generateVoucherCredentials();

          // Push to MikroTik if router coordinates configured
          let pushed = false;
          try {
            pushed = await MikrotikSync.createHotspotUserOnRouter(
              store,
              code,
              pin,
              "CREW-PASS",
              rateLimit,
              "unlimited",
              "CREW-WIFI",
              uptime
            );
          } catch (routerErr) {
            console.warn("[AdminHotspot] Router push for crew pass timed out or failed:", routerErr);
          }

          const qrUrl = MikrotikSync.buildAutoLoginUrl(store, code);
          const crewVoucher = {
            id: `VOUCH-CREW-${Date.now()}`,
            code,
            pin: code,
            qrUrl,
            uptime,
            rateLimit: rateLimit || "Default",
            sharedUsers: "unlimited",
            status: "AVAILABLE",
            orderNumber: "CREW-PASS",
            createdAt: new Date().toISOString(),
            consumedAt: null
          };

          await DB.instance.vouchers.put(crewVoucher);
          this.activeCrewVoucher = crewVoucher;

          // Render QR Code for camera scanning
          if (this.elements.crewWifiQrcode) {
            this.elements.crewWifiQrcode.innerHTML = "";
            if (typeof window.QRCode !== "undefined") {
              new window.QRCode(this.elements.crewWifiQrcode, {
                text: qrUrl,
                width: 140,
                height: 140,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: window.QRCode.CorrectLevel.M
              });
            }
          }

          if (this.elements.crewWifiCodeDisplay) {
            this.elements.crewWifiCodeDisplay.textContent = code;
          }

          if (this.elements.crewWifiDetailsLabel) {
            const durationDisplay = mode === "days" ? `${qty} Day${qty > 1 ? 's' : ''}` : `${qty} Hour${qty > 1 ? 's' : ''}`;
            const speedDisplay = rateLimit ? ` • Speed: ${rateLimit}` : " • Speed: Uncapped";
            this.elements.crewWifiDetailsLabel.textContent = `Duration: ${durationDisplay}${speedDisplay} • Unlimited Devices`;
          }

          if (this.elements.crewPassResultBox) {
            this.elements.crewPassResultBox.classList.remove("hidden");
          }
          if (this.elements.btnPrintCrewWifi) {
            this.elements.btnPrintCrewWifi.classList.remove("hidden");
          }

          await this.loadVouchersTable();

          if (!pushed) {
            alert(`Crew Wi-Fi Pass "${code}" saved locally!\n\nNote: Router sync is offline or timed out, but the pass is ready.`);
          } else {
            alert(`Crew Wi-Fi Pass "${code}" generated successfully on router with unlimited device access!`);
          }
        } catch (err) {
          console.error("[AdminHotspot Error]", err);
          alert(`Could not create Crew Wi-Fi pass: ${err.message}`);
        } finally {
          this.elements.btnGenerateCrewWifi.disabled = false;
          this.elements.btnGenerateCrewWifi.textContent = "⚡ Create Pass";
        }
      };
    }

    // Print Thermal Slip for Crew Pass
    if (this.elements.btnPrintCrewWifi) {
      this.elements.btnPrintCrewWifi.onclick = async () => {
        if (!this.activeCrewVoucher) return;
        this.elements.btnPrintCrewWifi.disabled = true;
        this.elements.btnPrintCrewWifi.textContent = "Printing...";

        try {
          const enabled = await DB.getEnabledPrinters();
          await Printer.printCrewSlip(this.activeCrewVoucher, enabled);
          alert(`Crew Wi-Fi pass printed successfully.`);
        } catch (err) {
          alert(`Print failed: ${err.message}`);
        } finally {
          this.elements.btnPrintCrewWifi.disabled = false;
          this.elements.btnPrintCrewWifi.textContent = "🖨️ Print Crew Slip";
        }
      };
    }

    // Admin Master Wi-Fi Modal Open/Close Triggers
    if (this.elements.btnOpenAdminWifiModal) {
      this.elements.btnOpenAdminWifiModal.onclick = () => {
        if (this.elements.modalAdminWifi) {
          this.elements.modalAdminWifi.showModal();
        }
      };
    }

    if (this.elements.btnCloseAdminWifiX) {
      this.elements.btnCloseAdminWifiX.onclick = () => {
        if (this.elements.modalAdminWifi) this.elements.modalAdminWifi.close();
      };
    }

    if (this.elements.btnCancelAdminWifi) {
      this.elements.btnCancelAdminWifi.onclick = () => {
        if (this.elements.modalAdminWifi) this.elements.modalAdminWifi.close();
      };
    }

    // Generate Admin Master Pass (Unlimited Time, Uncapped Speed, Unlimited Devices)
    if (this.elements.btnGenerateAdminWifi) {
      this.elements.btnGenerateAdminWifi.onclick = async () => {
        this.elements.btnGenerateAdminWifi.disabled = true;
        this.elements.btnGenerateAdminWifi.textContent = "Creating...";

        try {
          const store = await DB.getStoreSettings();
          const { code, pin } = MikrotikSync.generateVoucherCredentials();

          // Push to MikroTik if router coordinates configured
          let pushed = false;
          try {
            pushed = await MikrotikSync.createHotspotUserOnRouter(
              store,
              code,
              pin,
              "ADMIN-MASTER-PASS",
              "", // uncapped speed
              "unlimited", // unlimited devices
              store.hotspotProfile || "default",
              "" // unlimited time
            );
          } catch (routerErr) {
            console.warn("[AdminHotspot] Router push for admin pass timed out or failed:", routerErr);
          }

          const qrUrl = MikrotikSync.buildAutoLoginUrl(store, code);
          const adminVoucher = {
            id: `VOUCH-ADMIN-${Date.now()}`,
            code,
            pin: code,
            qrUrl,
            uptime: "Unlimited",
            rateLimit: "Uncapped",
            sharedUsers: "unlimited",
            status: "AVAILABLE",
            orderNumber: "ADMIN-PASS",
            createdAt: new Date().toISOString(),
            consumedAt: null
          };

          await DB.instance.vouchers.put(adminVoucher);
          this.activeAdminVoucher = adminVoucher;

          // Render QR Code for camera scanning
          if (this.elements.adminWifiQrcode) {
            this.elements.adminWifiQrcode.innerHTML = "";
            if (typeof window.QRCode !== "undefined") {
              new window.QRCode(this.elements.adminWifiQrcode, {
                text: qrUrl,
                width: 140,
                height: 140,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: window.QRCode.CorrectLevel.M
              });
            }
          }

          if (this.elements.adminWifiCodeDisplay) {
            this.elements.adminWifiCodeDisplay.textContent = code;
          }

          if (this.elements.adminWifiDetailsLabel) {
            this.elements.adminWifiDetailsLabel.textContent = "Duration: UNLIMITED • Speed: UNCAPPED • UNLIMITED DEVICES";
          }

          if (this.elements.adminPassResultBox) {
            this.elements.adminPassResultBox.classList.remove("hidden");
          }
          if (this.elements.btnPrintAdminWifi) {
            this.elements.btnPrintAdminWifi.classList.remove("hidden");
          }

          await this.loadVouchersTable();

          if (!pushed) {
            alert(`Admin Pass "${code}" saved locally!\n\nNote: Router sync is offline or timed out, but the pass is ready.`);
          } else {
            alert(`Admin Master Wi-Fi Pass "${code}" generated successfully on router with unlimited time, uncapped speed, and unlimited devices!`);
          }
        } catch (err) {
          console.error("[AdminHotspot Error]", err);
          alert(`Could not create Admin Master Pass: ${err.message}`);
        } finally {
          this.elements.btnGenerateAdminWifi.disabled = false;
          this.elements.btnGenerateAdminWifi.textContent = "👑 Generate Master Pass";
        }
      };
    }

    // Print Thermal Slip for Admin Master Pass
    if (this.elements.btnPrintAdminWifi) {
      this.elements.btnPrintAdminWifi.onclick = async () => {
        if (!this.activeAdminVoucher) return;
        this.elements.btnPrintAdminWifi.disabled = true;
        this.elements.btnPrintAdminWifi.textContent = "Printing...";

        try {
          const enabled = await DB.getEnabledPrinters();
          await Printer.printAdminSlip(this.activeAdminVoucher, enabled);
          alert("Admin Master Wi-Fi pass printed successfully.");
        } catch (err) {
          alert(`Print failed: ${err.message}`);
        } finally {
          this.elements.btnPrintAdminWifi.disabled = false;
          this.elements.btnPrintAdminWifi.textContent = "🖨️ Print Admin Slip";
        }
      };
    }
  },

  /**
   * Highlights the selected duration preset button
   * @param {string|null} uptimeVal
   */
  updateActivePresetButton(uptimeVal) {
    if (!this.elements.durationPresetButtons) return;
    this.elements.durationPresetButtons.forEach((b) => {
      b.classList.toggle("active", b.dataset.uptime === uptimeVal);
    });
  },

  /**
   * Parses saved RouterOS uptime syntax (e.g., '2h', '30m', '1d') and reflects it on the form
   * @param {string} uptimeStr
   */
  applyUptimeToUI(uptimeStr = "2h") {
    const clean = uptimeStr.trim();
    this.selectedUptime = clean;

    const standardPresets = ["1h", "2h", "3h", "4h", "12h", "1d"];

    if (standardPresets.includes(clean)) {
      if (this.elements.selectDuration) this.elements.selectDuration.value = clean;
      if (this.elements.customDurationWrap) this.elements.customDurationWrap.classList.add("hidden");
      this.updateActivePresetButton(clean);
    } else {
      if (this.elements.selectDuration) this.elements.selectDuration.value = "custom";
      if (this.elements.customDurationWrap) this.elements.customDurationWrap.classList.remove("hidden");
      this.updateActivePresetButton(null);

      const match = clean.match(/^(\d+)([mhd])$/i);
      if (match) {
        if (this.elements.inputCustomDurationVal) this.elements.inputCustomDurationVal.value = match[1];
        if (this.elements.selectCustomDurationUnit) this.elements.selectCustomDurationUnit.value = match[2].toLowerCase();
      } else {
        if (this.elements.inputCustomDurationVal) this.elements.inputCustomDurationVal.value = "2";
        if (this.elements.selectCustomDurationUnit) this.elements.selectCustomDurationUnit.value = "h";
      }
    }
  },

  /**
   * Loads persisted settings from IndexedDB into form fields
   */
  async loadHotspotSettings() {
    const store = await DB.getStoreSettings();

    const isEnabled = Boolean(store.hotspotEnabled);
    if (this.elements.hotspotEnabledCheckbox) {
      this.elements.hotspotEnabledCheckbox.checked = isEnabled;
    }
    if (this.elements.hotspotSettingsWrap) {
      this.elements.hotspotSettingsWrap.classList.toggle("hidden", !isEnabled);
    }

    // Load Basic Settings
    if (this.elements.inputRouterIp) this.elements.inputRouterIp.value = store.hotspotRouterIp || "192.168.88.1";
    if (this.elements.inputPassword) this.elements.inputPassword.value = store.hotspotPassword || "";
    this.applyUptimeToUI(store.hotspotUptime || "2h");

    // Load Bandwidth Speed & Single/Unlimited Concurrency Setting
    if (this.elements.selectRateLimit) {
      this.elements.selectRateLimit.value = store.hotspotRateLimit || "";
    }
    if (this.elements.selectSharedUsers) {
      const savedShared = String(store.hotspotSharedUsers || "1");
      this.elements.selectSharedUsers.value = (savedShared === "unlimited" || savedShared === "0") ? "unlimited" : "1";
    }

    // Load Advanced Settings
    const defaultProto = store.hotspotProtocol || "http";
    if (this.elements.selectProtocol) this.elements.selectProtocol.value = defaultProto;
    if (this.elements.inputPort) {
      this.elements.inputPort.value = store.hotspotPort || (defaultProto === "https" ? 443 : 80);
    }
    if (this.elements.inputUsername) this.elements.inputUsername.value = store.hotspotUsername || "pos-terminal";
    if (this.elements.inputDomain) this.elements.inputDomain.value = store.hotspotDomain || "hotspot.danielacafecuisine.local";
    if (this.elements.inputProfile) this.elements.inputProfile.value = store.hotspotProfile || "pos-customer";

    await this.loadVouchersTable();
  },

  /**
   * Saves updated settings into IndexedDB
   */
  async saveHotspotSettings() {
    let finalUptime = this.selectedUptime;
    if (this.elements.selectDuration && this.elements.selectDuration.value === "custom") {
      const num = parseInt(this.elements.inputCustomDurationVal ? this.elements.inputCustomDurationVal.value : "2", 10) || 1;
      const unit = this.elements.selectCustomDurationUnit ? this.elements.selectCustomDurationUnit.value : "h";
      finalUptime = `${num}${unit}`;
    }

    const proto = this.elements.selectProtocol ? this.elements.selectProtocol.value : "http";
    const defaultPort = proto === "https" ? 443 : 80;
    const specifiedPort = this.elements.inputPort ? parseInt(this.elements.inputPort.value, 10) : defaultPort;

    const payload = {
      hotspotEnabled: this.elements.hotspotEnabledCheckbox ? this.elements.hotspotEnabledCheckbox.checked : false,
      hotspotRouterIp: this.elements.inputRouterIp ? this.elements.inputRouterIp.value.trim() : "192.168.88.1",
      hotspotPassword: this.elements.inputPassword ? this.elements.inputPassword.value.trim() : "",
      hotspotUptime: finalUptime || "2h",
      hotspotRateLimit: this.elements.selectRateLimit ? this.elements.selectRateLimit.value : "",
      hotspotSharedUsers: this.elements.selectSharedUsers ? this.elements.selectSharedUsers.value : "1",

      // Advanced Settings
      hotspotPort: !isNaN(specifiedPort) && specifiedPort > 0 ? specifiedPort : defaultPort,
      hotspotProtocol: proto,
      hotspotUsername: this.elements.inputUsername ? this.elements.inputUsername.value.trim() : "pos-terminal",
      hotspotDomain: this.elements.inputDomain ? this.elements.inputDomain.value.trim() : "hotspot.danielacafecuisine.local",
      hotspotProfile: this.elements.inputProfile ? this.elements.inputProfile.value.trim() : "pos-customer"
    };

    await DB.saveStoreSettings(payload);
    alert("MikroTik Hotspot settings saved successfully.");
  },

  /**
   * Exports current configuration as readable QR code and universal text (.txt) backup
   */
  async exportSettings() {
    const store = await DB.getStoreSettings();

    const exportData = {
      version: "2.1",
      type: "mikrotik_hotspot_settings",
      exportedAt: new Date().toISOString(),
      settings: {
        hotspotEnabled: Boolean(store.hotspotEnabled),
        hotspotRouterIp: store.hotspotRouterIp || "192.168.88.1",
        hotspotPort: store.hotspotPort || 80,
        hotspotProtocol: store.hotspotProtocol || "http",
        hotspotUsername: store.hotspotUsername || "pos-terminal",
        hotspotPassword: store.hotspotPassword || "",
        hotspotDomain: store.hotspotDomain || "hotspot.danielacafecuisine.local",
        hotspotProfile: store.hotspotProfile || "pos-customer",
        hotspotUptime: store.hotspotUptime || "2h",
        hotspotRateLimit: store.hotspotRateLimit || "",
        hotspotSharedUsers: store.hotspotSharedUsers || "1"
      }
    };

    const textString = JSON.stringify(exportData, null, 2);
    const compactString = JSON.stringify(exportData);

    if (this.elements.exportJsonTextarea) {
      this.elements.exportJsonTextarea.value = textString;
    }

    // Render Clean High-Contrast QR Code for Optical Syncing
    if (this.elements.hotspotQrExportCanvas) {
      this.elements.hotspotQrExportCanvas.innerHTML = "";
      if (typeof window.QRCode !== "undefined") {
        new window.QRCode(this.elements.hotspotQrExportCanvas, {
          text: compactString,
          width: 240,
          height: 240,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: window.QRCode.CorrectLevel.M
        });
      }
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textString);
      }
    } catch (_) {}

    if (this.elements.modalExportHotspot && typeof this.elements.modalExportHotspot.showModal === "function") {
      this.elements.modalExportHotspot.showModal();
    }

    await this.triggerFileDownload(textString);
  },

  /**
   * Helper to save configuration file via Flutter Native Bridge or browser fallback
   * Writes directly to Android Downloads directory on Android devices
   * @param {string} contentString 
   */
  async triggerFileDownload(contentString) {
    const now = new Date();
    const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const filename = `mikrotik_settings_${dateStamp}.txt`;

    // 1. Try Flutter Native Storage Bridge (Writes directly to Android Download folder)
    if (typeof window !== "undefined" && window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        const res = await window.flutter_inappwebview.callHandler("saveFileNative", filename, contentString);
        if (res && res.ok) {
          alert(`Configuration file saved to Android storage:\n${res.path || filename}`);
          return;
        }
      } catch (nativeErr) {
        console.warn("[Hotspot Export] Native save bridge failed, falling back to browser download:", nativeErr);
      }
    }

    // 2. Standard Browser Blob Download Fallback
    try {
      const blob = new Blob([contentString], { type: "text/plain;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn("[Export Download Notice] Browser direct download suppressed on mobile shell.", err);
    }
  },

  /**
   * Opens the MikroTik Settings Import Modal dialog
   */
  openImportModal() {
    this.pendingImportSettings = null;
    if (this.elements.importPreviewBox) {
      this.elements.importPreviewBox.classList.add("hidden");
    }
    if (this.elements.importQrImageStatus) {
      this.elements.importQrImageStatus.textContent = "";
    }
    if (this.elements.importJsonTextarea) {
      this.elements.importJsonTextarea.value = "";
    }

    // Reset tabs: activate Camera tab by default
    if (this.elements.tabImportCamera) this.elements.tabImportCamera.classList.add("active");
    if (this.elements.tabImportImage) this.elements.tabImportImage.classList.remove("active");
    if (this.elements.tabImportText) this.elements.tabImportText.classList.remove("active");
    if (this.elements.viewImportCamera) this.elements.viewImportCamera.classList.remove("hidden");
    if (this.elements.viewImportImage) this.elements.viewImportImage.classList.add("hidden");
    if (this.elements.viewImportText) this.elements.viewImportText.classList.add("hidden");

    if (this.elements.modalImportHotspot && typeof this.elements.modalImportHotspot.showModal === "function") {
      this.elements.modalImportHotspot.showModal();
    }
  },

  /**
   * Closes the MikroTik Settings Import Modal dialog and releases camera hardware
   */
  closeImportModal() {
    this.stopCameraScanner();
    this.pendingImportSettings = null;
    if (this.elements.modalImportHotspot && this.elements.modalImportHotspot.open) {
      this.elements.modalImportHotspot.close();
    }
  },

  /**
   * Activates live video stream and ZXing engine to scan exported QR code
   */
  async startCameraScanner() {
    try {
      if (!window.ZXing || (!window.ZXing.BrowserQRCodeReader && !window.ZXing.BrowserMultiFormatReader)) {
        alert("Camera scanner library is still loading. You can use the QR Image or Paste Text tabs in the meantime.");
        return;
      }

      if (this.elements.hotspotImportVideo) {
        this.elements.hotspotImportVideo.style.display = "block";
      }
      if (this.elements.hotspotImportCameraPlaceholder) {
        this.elements.hotspotImportCameraPlaceholder.classList.add("hidden");
      }
      if (this.elements.hotspotScanLaser) {
        this.elements.hotspotScanLaser.classList.remove("hidden");
        this.elements.hotspotScanLaser.classList.add("scan-laser-active");
      }
      if (this.elements.btnStartCameraScan) {
        this.elements.btnStartCameraScan.classList.add("hidden");
      }
      if (this.elements.btnStopCameraScan) {
        this.elements.btnStopCameraScan.classList.remove("hidden");
      }

      if (!this.qrReader) {
        this.qrReader = window.ZXing.BrowserQRCodeReader
          ? new window.ZXing.BrowserQRCodeReader()
          : new window.ZXing.BrowserMultiFormatReader();
      }

      await this.qrReader.decodeFromVideoDevice(
        undefined,
        this.elements.hotspotImportVideo,
        (result) => {
          if (result && result.getText()) {
            const rawText = result.getText();
            this.handleScannedConfig(rawText);
          }
        }
      );
    } catch (err) {
      console.warn("[Hotspot QR Camera Error]", err);
      alert("Unable to access camera: " + (err.message || "Permission denied or camera busy."));
      this.stopCameraScanner();
    }
  },

  /**
   * Halts live video scanning and releases optical camera hardware
   */
  stopCameraScanner() {
    if (this.qrReader) {
      try {
        this.qrReader.reset();
      } catch (_) {}
    }
    if (this.elements.hotspotImportVideo && this.elements.hotspotImportVideo.srcObject) {
      const stream = this.elements.hotspotImportVideo.srcObject;
      if (typeof stream.getTracks === "function") {
        stream.getTracks().forEach((track) => track.stop());
      }
      this.elements.hotspotImportVideo.srcObject = null;
    }
    if (this.elements.hotspotImportVideo) {
      this.elements.hotspotImportVideo.style.display = "none";
    }
    if (this.elements.hotspotImportCameraPlaceholder) {
      this.elements.hotspotImportCameraPlaceholder.classList.remove("hidden");
    }
    if (this.elements.hotspotScanLaser) {
      this.elements.hotspotScanLaser.classList.add("hidden");
      this.elements.hotspotScanLaser.classList.remove("scan-laser-active");
    }
    if (this.elements.btnStartCameraScan) {
      this.elements.btnStartCameraScan.classList.remove("hidden");
    }
    if (this.elements.btnStopCameraScan) {
      this.elements.btnStopCameraScan.classList.add("hidden");
    }
  },

  /**
   * Decodes QR Code from uploaded screenshot or photo
   * @param {File} file 
   */
  async handleQrImageUpload(file) {
    if (!file) return;

    if (this.elements.importQrImageStatus) {
      this.elements.importQrImageStatus.style.color = "#0284c7";
      this.elements.importQrImageStatus.textContent = "🔍 Decoding QR Code from image...";
    }

    try {
      const payload = await GCashEMVCo.extractPayloadFromImage(file);
      if (!payload) {
        if (this.elements.importQrImageStatus) {
          this.elements.importQrImageStatus.style.color = "#ef4444";
          this.elements.importQrImageStatus.textContent = "❌ No readable QR code found in this image. Please ensure the QR code is centered and clear.";
        }
        return;
      }

      if (this.elements.importQrImageStatus) {
        this.elements.importQrImageStatus.style.color = "#10b981";
        this.elements.importQrImageStatus.textContent = "✅ QR Code successfully decoded!";
      }

      this.handleScannedConfig(payload);
    } catch (err) {
      console.error("[QR Image Decode Error]", err);
      if (this.elements.importQrImageStatus) {
        this.elements.importQrImageStatus.style.color = "#ef4444";
        this.elements.importQrImageStatus.textContent = `❌ Decode failed: ${err.message}`;
      }
    }
  },

  /**
   * Flexible configuration parser handling JSON, stripped text, and query strings
   * @param {string} rawText 
   */
  parseConfig(rawText) {
    if (!rawText || typeof rawText !== "string") return null;
    let clean = rawText.replace(/^\uFEFF/, "").trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    try {
      const parsed = JSON.parse(clean);
      const s = parsed.settings || parsed;
      if (s && s.hotspotRouterIp) {
        return s;
      }
    } catch (_) {
      if (clean.includes("hotspotRouterIp=") || clean.includes("ip=")) {
        const params = new URLSearchParams(clean);
        const ip = params.get("hotspotRouterIp") || params.get("ip");
        if (ip) {
          return {
            hotspotEnabled: params.get("hotspotEnabled") !== "false",
            hotspotRouterIp: ip,
            hotspotPort: parseInt(params.get("port") || params.get("hotspotPort") || "80", 10),
            hotspotProtocol: params.get("proto") || params.get("hotspotProtocol") || "http",
            hotspotUsername: params.get("user") || params.get("hotspotUsername") || "pos-terminal",
            hotspotPassword: params.get("pass") || params.get("hotspotPassword") || "",
            hotspotDomain: params.get("domain") || params.get("hotspotDomain") || "hotspot.danielacafecuisine.local",
            hotspotProfile: params.get("profile") || params.get("hotspotProfile") || "pos-customer",
            hotspotUptime: params.get("uptime") || params.get("hotspotUptime") || "2h",
            hotspotRateLimit: params.get("rate") || params.get("hotspotRateLimit") || "",
            hotspotSharedUsers: params.get("shared") || params.get("hotspotSharedUsers") || "1"
          };
        }
      }
    }
    return null;
  },

  /**
   * Validates scanned configuration and displays confirmation preview box
   * @param {string} rawText 
   */
  handleScannedConfig(rawText) {
    const s = this.parseConfig(rawText);
    if (!s) {
      alert("Invalid or unrecognized MikroTik settings format. Please check the QR code or text.");
      return;
    }

    this.stopCameraScanner();
    this.pendingImportSettings = s;

    if (this.elements.importPreviewBox && this.elements.importPreviewDetails) {
      const proto = s.hotspotProtocol === "https" ? "https" : "http";
      const port = s.hotspotPort || (proto === "https" ? 443 : 80);
      const shared = (String(s.hotspotSharedUsers) === "unlimited" || String(s.hotspotSharedUsers) === "0") ? "Unlimited" : "1 Device";

      this.elements.importPreviewDetails.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <div><b>Router IP:</b> ${proto}://${s.hotspotRouterIp}:${port}</div>
          <div><b>Username:</b> ${s.hotspotUsername || "pos-terminal"}</div>
          <div><b>Domain:</b> ${s.hotspotDomain || "—"}</div>
          <div><b>Profile:</b> ${s.hotspotProfile || "pos-customer"}</div>
          <div><b>Session Duration:</b> ${s.hotspotUptime || "2h"}</div>
          <div><b>Bandwidth Limit:</b> ${s.hotspotRateLimit || "Default (Unlimited)"}</div>
          <div><b>Concurrency:</b> ${shared}</div>
          <div><b>Password:</b> ${s.hotspotPassword ? "••••••••" : "<i>(None)</i>"}</div>
        </div>
      `;
      this.elements.importPreviewBox.classList.remove("hidden");
    }
  },

  /**
   * Applies confirmed imported configuration to IndexedDB and reloads settings
   */
  async applyImportedSettings() {
    if (!this.pendingImportSettings) return;
    const s = this.pendingImportSettings;

    await DB.saveStoreSettings({
      hotspotEnabled: s.hotspotEnabled !== undefined ? Boolean(s.hotspotEnabled) : true,
      hotspotRouterIp: String(s.hotspotRouterIp).trim(),
      hotspotPort: parseInt(s.hotspotPort, 10) || 80,
      hotspotProtocol: s.hotspotProtocol === "https" ? "https" : "http",
      hotspotUsername: String(s.hotspotUsername || "pos-terminal").trim(),
      hotspotPassword: String(s.hotspotPassword || "").trim(),
      hotspotDomain: String(s.hotspotDomain || "hotspot.danielacafecuisine.local").trim(),
      hotspotProfile: String(s.hotspotProfile || "pos-customer").trim(),
      hotspotUptime: String(s.hotspotUptime || "2h").trim(),
      hotspotRateLimit: String(s.hotspotRateLimit || "").trim(),
      hotspotSharedUsers: (String(s.hotspotSharedUsers) === "unlimited" || String(s.hotspotSharedUsers) === "0") ? "unlimited" : "1"
    });

    await this.loadHotspotSettings();
    this.closeImportModal();
    alert("MikroTik Hotspot settings imported and applied successfully!");
  },

  /**
   * Reads, validates, and applies an imported .txt or .json configuration file
   * @param {File} file 
   */
  async importSettingsFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      this.handleScannedConfig(text);
    } catch (err) {
      console.error("[Settings Import Error]", err);
      alert(`Failed to import configuration file: ${err.message}`);
    }
  },

  /**
   * Tests communication with MikroTik RouterOS v7 REST API
   */
  async testConnection() {
    if (!this.elements.statHotspotStatus) return;

    this.elements.statHotspotStatus.textContent = "Connecting to RouterOS...";
    this.elements.statHotspotStatus.style.color = "#38bdf8";

    const proto = this.elements.selectProtocol ? this.elements.selectProtocol.value : "http";
    const defaultPort = proto === "https" ? 443 : 80;
    const specifiedPort = this.elements.inputPort ? parseInt(this.elements.inputPort.value, 10) : defaultPort;

    const config = {
      hotspotProtocol: proto,
      hotspotRouterIp: this.elements.inputRouterIp ? this.elements.inputRouterIp.value.trim() : "192.168.88.1",
      hotspotPort: !isNaN(specifiedPort) && specifiedPort > 0 ? specifiedPort : defaultPort,
      hotspotUsername: this.elements.inputUsername ? this.elements.inputUsername.value.trim() : "pos-terminal",
      hotspotPassword: this.elements.inputPassword ? this.elements.inputPassword.value.trim() : ""
    };

    const res = await MikrotikSync.testConnection(config);
    if (res.success) {
      this.elements.statHotspotStatus.textContent = `🟢 ${res.message}`;
      this.elements.statHotspotStatus.style.color = "#16a34a";
    } else {
      this.elements.statHotspotStatus.textContent = `🔴 ${res.message}`;
      this.elements.statHotspotStatus.style.color = "#dc2626";

      if (res.message && res.message.includes("Browser CORS Block")) {
        const confirmMock = confirm(
          "CORS Block Detected (VS Code Live Preview):\n\n" +
          "Your desktop browser blocks direct REST calls to 192.168.88.1. " +
          "When deployed inside the Android/Flutter APK, it connects directly without restrictions.\n\n" +
          "Would you like to generate 25 local test vouchers in IndexedDB now so you can test register checkouts and receipt printing?"
        );
        if (confirmMock) {
          const rate = this.elements.selectRateLimit ? this.elements.selectRateLimit.value : "";
          const users = this.elements.selectSharedUsers ? this.elements.selectSharedUsers.value : "1";
          await MikrotikSync.generateLocalPreviewPool(config, 25, rate, users);
          await this.loadVouchersTable();
          alert("25 test vouchers generated in local pool! You can now test receipt printing and auto-login QR codes.");
        }
      }
    }
  },

  /**
   * Pre-generates bulk single-code vouchers on MikroTik with configured speed limit and Single/Unlimited allowance
   */
  async batchGeneratePool() {
    const count = parseInt(this.elements.inputBatchCount ? this.elements.inputBatchCount.value : "25", 10) || 25;
    const store = await DB.getStoreSettings();

    if (!store.hotspotPassword) {
      alert("Please enter and save your MikroTik Router Password first.");
      if (this.elements.inputPassword) this.elements.inputPassword.focus();
      return;
    }

    const rate = this.elements.selectRateLimit ? this.elements.selectRateLimit.value : store.hotspotRateLimit;
    const users = this.elements.selectSharedUsers ? this.elements.selectSharedUsers.value : (store.hotspotSharedUsers || "1");

    if (this.elements.btnBatchGenerate) {
      this.elements.btnBatchGenerate.disabled = true;
      this.elements.btnBatchGenerate.textContent = "Generating...";
    }

    const res = await MikrotikSync.batchGenerateOfflinePool(
      store, 
      count, 
      (current, total) => {
        if (this.elements.btnBatchGenerate) {
          this.elements.btnBatchGenerate.textContent = `Generating (${current}/${total})...`;
        }
      },
      rate,
      users
    );

    if (this.elements.btnBatchGenerate) {
      this.elements.btnBatchGenerate.disabled = false;
      this.elements.btnBatchGenerate.textContent = "⚡ Generate Passes";
    }

    await this.loadVouchersTable();

    if (res.created === 0 && res.failed > 0) {
      const confirmMock = confirm(
        `Could not reach MikroTik router (${res.failed} attempts failed due to CORS or connection error).\n\n` +
        "Generate 25 local offline passes for browser testing instead?"
      );
      if (confirmMock) {
        await MikrotikSync.generateLocalPreviewPool(store, count, rate, users);
        await this.loadVouchersTable();
        alert(`${count} test passes created in local offline stock!`);
      }
    } else {
      alert(`Batch Complete: Created ${res.created} Wi-Fi passes in offline stock (${res.failed} failed).`);
    }
  },

  /**
   * Deletes a single voucher both from the router hardware and the local IndexedDB database
   * @param {string} code 
   */
  async deleteSingleVoucher(code) {
    if (!code) return;

    if (!confirm(`Are you sure you want to delete voucher "${code}"? This will revoke the user from both the MikroTik router and local storage.`)) {
      return;
    }

    const store = await DB.getStoreSettings();
    await MikrotikSync.deleteHotspotUserOnRouter(store, code);
    await DB.instance.vouchers.where("code").equals(code).delete();
    await this.loadVouchersTable();
    alert(`Voucher "${code}" has been removed.`);
  },

  /**
   * Deletes all unconsumed / available vouchers from both the MikroTik router and IndexedDB
   */
  async deleteAllUnusedVouchers() {
    const availableVouchers = await DB.instance.vouchers.where("status").equals("AVAILABLE").toArray();

    if (availableVouchers.length === 0) {
      alert("No available vouchers to delete.");
      return;
    }

    if (!confirm(`Delete all ${availableVouchers.length} unused vouchers? This will permanently remove them from both the router and local database.`)) {
      return;
    }

    const store = await DB.getStoreSettings();

    if (this.elements.btnDeleteUnusedVouchers) {
      this.elements.btnDeleteUnusedVouchers.disabled = true;
      this.elements.btnDeleteUnusedVouchers.textContent = "Deleting...";
    }

    for (const v of availableVouchers) {
      await MikrotikSync.deleteHotspotUserOnRouter(store, v.code);
    }

    await DB.instance.vouchers.where("status").equals("AVAILABLE").delete();

    if (this.elements.btnDeleteUnusedVouchers) {
      this.elements.btnDeleteUnusedVouchers.disabled = false;
      this.elements.btnDeleteUnusedVouchers.textContent = "🗑️ Delete All Unused";
    }

    await this.loadVouchersTable();
    alert(`Successfully deleted ${availableVouchers.length} unused vouchers.`);
  },

  /**
   * Loads single-code vouchers table and metrics
   */
  async loadVouchersTable() {
    const vouchers = await DB.getVouchers();
    const availableCount = vouchers.filter((v) => v.status === "AVAILABLE").length;
    const consumedCount = vouchers.filter((v) => v.status === "CONSUMED").length;

    if (this.elements.statAvailableVouchers) {
      this.elements.statAvailableVouchers.textContent = `${availableCount} Passes Ready`;
      this.elements.statAvailableVouchers.style.color = availableCount > 5 ? "#16a34a" : "#dc2626";
    }

    if (this.elements.statConsumedVouchers) {
      this.elements.statConsumedVouchers.textContent = `${consumedCount} Issued`;
    }

    if (!this.elements.vouchersTbody) return;

    if (vouchers.length === 0) {
      this.elements.vouchersTbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center" style="padding: 24px; color: #64748b;">
            No Wi-Fi passes in stock. Click "⚡ Generate Passes" above to create a batch.
          </td>
        </tr>
      `;
      return;
    }

    this.elements.vouchersTbody.innerHTML = vouchers.slice(0, 100).map((v) => {
      const isAvailable = v.status === "AVAILABLE";
      const statusBadge = isAvailable
        ? `<span class="badge badge-status-ok">AVAILABLE</span>`
        : `<span class="badge badge-status-out">CONSUMED</span>`;

      const orderLabel = v.orderNumber ? `<code>${v.orderNumber}</code>` : `<span style="color:#94a3b8;">Unassigned</span>`;
      const dateLabel = v.consumedAt 
        ? new Date(v.consumedAt).toLocaleDateString() + " " + new Date(v.consumedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : new Date(v.createdAt).toLocaleDateString();

      const speedLabel = v.rateLimit || "Default";
      const isUnlimited = String(v.sharedUsers) === "unlimited" || String(v.sharedUsers) === "0";
      const devicesBadge = isUnlimited
        ? `<span class="badge badge-role-both">UNLIMITED</span>`
        : `<span class="badge badge-admin">1 DEVICE</span>`;

      return `
        <tr>
          <td><b>${v.code}</b></td>
          <td>${v.uptime || "2h"}</td>
          <td><span class="badge badge-admin">${speedLabel}</span></td>
          <td>${devicesBadge}</td>
          <td>${statusBadge}</td>
          <td>${orderLabel}</td>
          <td>${dateLabel}</td>
          <td class="text-center">
            <button type="button" class="btn-action-sm btn-action-del btn-del-voucher" data-code="${v.code}">Del</button>
          </td>
        </tr>
      `;
    }).join("");

    // Bind individual row-level voucher deletion buttons
    this.elements.vouchersTbody.querySelectorAll(".btn-del-voucher").forEach((btn) => {
      btn.onclick = async () => {
        await this.deleteSingleVoucher(btn.dataset.code);
      };
    });
  }
};

// REMARK: ADMIN_HOTSPOT_TXT_BACKUP_SUPPORT_COMPLETE