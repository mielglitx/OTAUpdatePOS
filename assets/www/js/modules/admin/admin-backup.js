/**
 * Module Description: Admin System Backup & Selective Data Recovery Sub-Module
 * Manages full and modular export/import of POS configuration and databases:
 * Items & Categories (with inventory tracking), Staff User Profiles, Store Profile & Branding,
 * Cloud Sync Credentials, MikroTik Router Configuration, and Generated Hotspot Vouchers.
 * Supports cross-platform export in both standard .json and Android-friendly plain .txt formats,
 * universal Android filesystem saving via native Flutter bridge with Blob fallback,
 * and selective module restoration with safe Upsert/Merge vs Clean Replace modes.
 */

import { DB } from "../db.js";
import { Bus } from "../bus.js";

export const AdminBackup = {
  elements: {},
  callbacks: {},
  initialized: false,
  pendingBackupData: null,
  pendingOtaUpdate: null,

  /**
   * Initializes DOM selections and binds Backup administrative events
   * @param {Object} callbacks - External hooks
   */
  init(callbacks = {}) {
    this.callbacks = callbacks;

    this.elements = {
      // Export Controls
      cbExportItems: document.getElementById("cb-export-items"),
      cbExportUsers: document.getElementById("cb-export-users"),
      cbExportStore: document.getElementById("cb-export-store"),
      cbExportSync: document.getElementById("cb-export-sync"),
      cbExportHotspot: document.getElementById("cb-export-hotspot"),
      cbExportVouchers: document.getElementById("cb-export-vouchers"),
      cbExportOta: document.getElementById("cb-export-ota"),

      btnSelectAllExport: document.getElementById("btn-select-all-export"),
      btnDeselectAllExport: document.getElementById("btn-deselect-all-export"),
      btnExportBackupDownload: document.getElementById("btn-export-backup-download"),
      btnQuickExportBackup: document.getElementById("btn-quick-export-backup"),

      statBackupItemsCount: document.getElementById("stat-backup-items-count"),
      statBackupUsersCount: document.getElementById("stat-backup-users-count"),
      statBackupVouchersCount: document.getElementById("stat-backup-vouchers-count"),
      statBackupOtaRepo: document.getElementById("stat-backup-ota-repo"),

      // Import Controls
      inputBackupFile: document.getElementById("input-backup-file"),
      btnTriggerFileImport: document.getElementById("btn-trigger-file-import"),
      backupDropzone: document.getElementById("backup-dropzone"),
      textareaBackupPaste: document.getElementById("textarea-backup-paste"),
      btnParsePastedBackup: document.getElementById("btn-parse-pasted-backup"),

      // Restore Inspector Panel
      backupInspectPanel: document.getElementById("backup-inspect-panel"),
      inspectBackupDate: document.getElementById("inspect-backup-date"),
      inspectModulesChecklist: document.getElementById("inspect-modules-checklist"),
      btnExecuteRestore: document.getElementById("btn-execute-restore"),
      btnCancelRestore: document.getElementById("btn-cancel-restore"),

      // OTA System Update Controls
      badgeCurrentOtaVersion: document.getElementById("badge-current-ota-version"),
      btnRevertOta: document.getElementById("btn-revert-ota"),
      btnCheckOta: document.getElementById("btn-check-ota"),
      inputOtaGithubRepo: document.getElementById("input-ota-github-repo"),
      btnSaveOtaRepo: document.getElementById("btn-save-ota-repo"),
      otaStatusText: document.getElementById("ota-status-text"),
      otaUpdateBanner: document.getElementById("ota-update-banner"),
      otaBannerTitle: document.getElementById("ota-banner-title"),
      otaBannerDesc: document.getElementById("ota-banner-desc"),
      btnApplyOta: document.getElementById("btn-apply-ota")
    };

    if (this.initialized) return;
    this.initialized = true;

    // 1. Export Selection Helpers (Select All / Clear)
    if (this.elements.btnSelectAllExport) {
      this.elements.btnSelectAllExport.onclick = () => this.toggleAllExportCheckboxes(true);
    }
    if (this.elements.btnDeselectAllExport) {
      this.elements.btnDeselectAllExport.onclick = () => this.toggleAllExportCheckboxes(false);
    }

    // 2. Download Backup File Triggers
    if (this.elements.btnExportBackupDownload) {
      this.elements.btnExportBackupDownload.onclick = async () => await this.exportBackup();
    }
    if (this.elements.btnQuickExportBackup) {
      this.elements.btnQuickExportBackup.onclick = async () => await this.exportBackup();
    }

    // 3. File Selection & Drag-and-Drop Handlers
    if (this.elements.btnTriggerFileImport) {
      this.elements.btnTriggerFileImport.onclick = () => {
        if (this.elements.inputBackupFile) this.elements.inputBackupFile.click();
      };
    }

    if (this.elements.backupDropzone) {
      this.elements.backupDropzone.onclick = () => {
        if (this.elements.inputBackupFile) this.elements.inputBackupFile.click();
      };

      this.elements.backupDropzone.ondragover = (e) => {
        e.preventDefault();
        this.elements.backupDropzone.style.borderColor = "#16a34a";
        this.elements.backupDropzone.style.background = "rgba(22, 163, 74, 0.08)";
      };

      this.elements.backupDropzone.ondragleave = (e) => {
        e.preventDefault();
        this.elements.backupDropzone.style.borderColor = "";
        this.elements.backupDropzone.style.background = "";
      };

      this.elements.backupDropzone.ondrop = (e) => {
        e.preventDefault();
        this.elements.backupDropzone.style.borderColor = "";
        this.elements.backupDropzone.style.background = "";
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFileSelected(e.dataTransfer.files[0]);
        }
      };
    }

    if (this.elements.inputBackupFile) {
      this.elements.inputBackupFile.onchange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleFileSelected(e.target.files[0]);
        }
      };
    }

    // 4. Pasted Text Inspector
    if (this.elements.btnParsePastedBackup) {
      this.elements.btnParsePastedBackup.onclick = () => {
        const text = (this.elements.textareaBackupPaste ? this.elements.textareaBackupPaste.value : "").trim();
        if (!text) {
          alert("Please paste backup JSON or text content first.");
          return;
        }
        this.inspectBackupContent(text);
      };
    }

    // 5. Restore Action Buttons
    if (this.elements.btnExecuteRestore) {
      this.elements.btnExecuteRestore.onclick = async () => await this.executeRestore();
    }
    if (this.elements.btnCancelRestore) {
      this.elements.btnCancelRestore.onclick = () => this.clearImportInspector();
    }

    // 6. Over-The-Air (OTA) System Updates
    if (this.elements.btnSaveOtaRepo) {
      this.elements.btnSaveOtaRepo.onclick = async () => await this.saveOtaRepo();
    }
    if (this.elements.btnCheckOta) {
      this.elements.btnCheckOta.onclick = async () => await this.checkOtaUpdate();
    }
    if (this.elements.btnApplyOta) {
      this.elements.btnApplyOta.onclick = async () => await this.applyOtaUpdate();
    }
    if (this.elements.btnRevertOta) {
      this.elements.btnRevertOta.onclick = async () => await this.revertOtaUpdate();
    }
  },

  /**
   * Toggles all export module checkboxes
   * @param {boolean} checkedState
   */
  toggleAllExportCheckboxes(checkedState) {
    const cbs = [
      this.elements.cbExportItems,
      this.elements.cbExportUsers,
      this.elements.cbExportStore,
      this.elements.cbExportSync,
      this.elements.cbExportHotspot,
      this.elements.cbExportVouchers,
      this.elements.cbExportOta
    ];
    cbs.forEach((cb) => {
      if (cb) cb.checked = checkedState;
    });
  },

  /**
   * Refreshes real-time database record counts on the export card and OTA status
   */
  async loadBackupSettings() {
    try {
      const [prodCount, catCount, userCount, vouchCount] = await Promise.all([
        DB.instance.products.count().catch(() => 0),
        DB.instance.categories.count().catch(() => 0),
        DB.instance.users.count().catch(() => 0),
        DB.instance.vouchers.count().catch(() => 0)
      ]);

      if (this.elements.statBackupItemsCount) {
        this.elements.statBackupItemsCount.textContent = `${prodCount} items, ${catCount} cats`;
      }
      if (this.elements.statBackupUsersCount) {
        this.elements.statBackupUsersCount.textContent = `${userCount} accounts`;
      }
      if (this.elements.statBackupVouchersCount) {
        this.elements.statBackupVouchersCount.textContent = `${vouchCount} vouchers`;
      }

      await this.loadOtaStatus();
    } catch (err) {
      console.warn("[AdminBackup] Could not refresh backup counts:", err);
    }
  },

  /**
   * Queries Flutter native bridge for current OTA release version and configured GitHub repo
   */
  async loadOtaStatus() {
    if (typeof window === "undefined" || !window.flutter_inappwebview || typeof window.flutter_inappwebview.callHandler !== "function") {
      if (this.elements.otaStatusText) {
        this.elements.otaStatusText.textContent = "OTA updates are available when running inside the Android POS application.";
      }
      return;
    }

    try {
      const res = await window.flutter_inappwebview.callHandler("getOtaStatus");
      if (res && res.ok) {
        if (this.elements.badgeCurrentOtaVersion) {
          const isCustom = !!res.hasCustomOta;
          this.elements.badgeCurrentOtaVersion.textContent = isCustom
            ? `${res.currentVersion} (OTA Active)`
            : `${res.currentVersion} (Bundled)`;
          this.elements.badgeCurrentOtaVersion.className = isCustom
            ? "badge badge-cash"
            : "badge";
        }
        if (this.elements.inputOtaGithubRepo && res.repo) {
          this.elements.inputOtaGithubRepo.value = res.repo;
        }
        if (this.elements.statBackupOtaRepo) {
          this.elements.statBackupOtaRepo.textContent = res.repo || "Default";
        }
        if (this.elements.btnRevertOta) {
          this.elements.btnRevertOta.style.display = res.hasCustomOta ? "inline-block" : "none";
        }
      }
    } catch (err) {
      console.warn("[AdminBackup] Could not fetch OTA status:", err);
    }
  },

  /**
   * Saves the GitHub repository identifier (e.g. owner/repo)
   */
  async saveOtaRepo() {
    const repoVal = (this.elements.inputOtaGithubRepo ? this.elements.inputOtaGithubRepo.value : "").trim();
    if (!repoVal || !repoVal.includes("/")) {
      alert("Please enter a valid GitHub repository in the format: owner/repo (e.g. Amiel/pos_app)");
      return;
    }

    if (typeof window !== "undefined" && window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        const res = await window.flutter_inappwebview.callHandler("setOtaRepo", repoVal);
        if (res && res.ok) {
          alert(`✅ GitHub repository saved: ${repoVal}`);
          if (this.elements.statBackupOtaRepo) {
            this.elements.statBackupOtaRepo.textContent = repoVal;
          }
          if (this.elements.otaStatusText) {
            this.elements.otaStatusText.textContent = `Repository set to ${repoVal}. Ready to check for updates.`;
          }
        } else {
          alert(`Failed to save repository: ${res?.error || "Unknown error"}`);
        }
      } catch (err) {
        alert(`Error saving OTA repository: ${err.message}`);
      }
    } else {
      localStorage.setItem("pos_ota_github_repo", repoVal);
      if (this.elements.statBackupOtaRepo) {
        this.elements.statBackupOtaRepo.textContent = repoVal;
      }
      alert(`Repository ${repoVal} saved to local storage.`);
    }
  },

  /**
   * Checks GitHub Releases API for newer web asset releases
   */
  async checkOtaUpdate() {
    if (typeof window === "undefined" || !window.flutter_inappwebview || typeof window.flutter_inappwebview.callHandler !== "function") {
      alert("OTA updates can only be checked from within the native Android POS application.");
      return;
    }

    const repoVal = (this.elements.inputOtaGithubRepo ? this.elements.inputOtaGithubRepo.value : "").trim();
    if (!repoVal || !repoVal.includes("/")) {
      alert("Please specify a valid GitHub repository first (e.g. Amiel/pos_app).");
      if (this.elements.inputOtaGithubRepo) this.elements.inputOtaGithubRepo.focus();
      return;
    }

    if (this.elements.btnCheckOta) {
      this.elements.btnCheckOta.disabled = true;
      this.elements.btnCheckOta.textContent = "⏳ Checking...";
    }
    if (this.elements.otaStatusText) {
      this.elements.otaStatusText.innerHTML = "<em>Querying GitHub API for latest releases...</em>";
    }

    try {
      const res = await window.flutter_inappwebview.callHandler("checkOtaUpdate", repoVal);
      if (!res || !res.ok) {
        const errMsg = res?.error || "Unable to reach GitHub. Check your internet connection.";
        if (this.elements.otaStatusText) {
          this.elements.otaStatusText.innerHTML = `<span style="color: #dc2626; font-weight: bold;">❌ ${errMsg}</span>`;
        }
        if (this.elements.otaUpdateBanner) this.elements.otaUpdateBanner.classList.add("hidden");
        return;
      }

      if (res.updateAvailable) {
        this.pendingOtaUpdate = res;
        const sizeMb = res.assetSize ? ` (${(res.assetSize / (1024 * 1024)).toFixed(2)} MB)` : "";
        const cleanNotes = res.releaseNotes ? res.releaseNotes.substring(0, 160).replace(/\r?\n/g, " ") : "Updates and improvements.";
        if (this.elements.otaStatusText) {
          this.elements.otaStatusText.innerHTML = `
            <strong>✨ New update available:</strong> <span style="color: #0284c7; font-weight: bold;">${res.latestVersion}</span> (Current: ${res.currentVersion})<br>
            <small style="color: var(--text-muted);">${cleanNotes}</small>
          `;
        }

        if (this.elements.otaBannerTitle) {
          this.elements.otaBannerTitle.textContent = `🎉 New Update Available: ${res.latestVersion}`;
        }
        if (this.elements.otaBannerDesc) {
          this.elements.otaBannerDesc.textContent = `Asset: ${res.assetName}${sizeMb} • Click Install to apply seamlessly in the background.`;
        }
        if (this.elements.otaUpdateBanner) {
          this.elements.otaUpdateBanner.classList.remove("hidden");
        }
      } else {
        this.pendingOtaUpdate = null;
        if (this.elements.otaStatusText) {
          this.elements.otaStatusText.innerHTML = `
            <span style="color: #16a34a; font-weight: bold;">✅ Up to date!</span> Current version <code>${res.currentVersion}</code> is the latest release.
          `;
        }
        if (this.elements.otaUpdateBanner) {
          this.elements.otaUpdateBanner.classList.add("hidden");
        }
      }
    } catch (err) {
      if (this.elements.otaStatusText) {
        this.elements.otaStatusText.innerHTML = `<span style="color: #dc2626;">Error: ${err.message}</span>`;
      }
    } finally {
      if (this.elements.btnCheckOta) {
        this.elements.btnCheckOta.disabled = false;
        this.elements.btnCheckOta.textContent = "🔍 Check for OTA Updates";
      }
    }
  },

  /**
   * Downloads and applies the pending OTA update package from GitHub
   */
  async applyOtaUpdate() {
    if (!this.pendingOtaUpdate || !this.pendingOtaUpdate.downloadUrl) {
      alert("No pending update found. Please check for updates first.");
      return;
    }

    const { downloadUrl, latestVersion } = this.pendingOtaUpdate;
    const confirmInstall = confirm(
      `Install Over-The-Air Update ${latestVersion}?\n\n` +
      `The update bundle will download and extract in the background, and the POS interface will reload.\n` +
      `All transactions, items, and settings are 100% preserved.`
    );
    if (!confirmInstall) return;

    if (this.elements.btnApplyOta) {
      this.elements.btnApplyOta.disabled = true;
      this.elements.btnApplyOta.textContent = "⏳ Installing Update...";
    }
    if (this.elements.otaStatusText) {
      this.elements.otaStatusText.innerHTML = `<em>Downloading and verifying update ${latestVersion}... Please do not turn off the device.</em>`;
    }

    try {
      const res = await window.flutter_inappwebview.callHandler("performOtaUpdate", downloadUrl, latestVersion);
      if (res && res.ok) {
        if (this.elements.otaStatusText) {
          this.elements.otaStatusText.innerHTML = `<span style="color: #16a34a; font-weight: bold;">✅ Update installed! Reloading terminal...</span>`;
        }
      } else {
        alert(`Failed to apply OTA update: ${res?.error || "Unknown extraction error"}`);
        if (this.elements.btnApplyOta) {
          this.elements.btnApplyOta.disabled = false;
          this.elements.btnApplyOta.textContent = "⚡ Install Update & Reload";
        }
      }
    } catch (err) {
      alert(`OTA update installation failed: ${err.message}`);
      if (this.elements.btnApplyOta) {
        this.elements.btnApplyOta.disabled = false;
        this.elements.btnApplyOta.textContent = "⚡ Install Update & Reload";
      }
    }
  },

  /**
   * Reverts OTA updates and restores the original APK-bundled web assets
   */
  async revertOtaUpdate() {
    const confirmRevert = confirm(
      "Revert to Factory Bundled Assets?\n\n" +
      "This will remove downloaded OTA web assets and restore the original version shipped with the installed APK.\n" +
      "All sales records, items, and store settings will remain intact."
    );
    if (!confirmRevert) return;

    if (this.elements.btnRevertOta) {
      this.elements.btnRevertOta.disabled = true;
      this.elements.btnRevertOta.textContent = "⏳ Reverting...";
    }

    try {
      const res = await window.flutter_inappwebview.callHandler("rollbackOtaUpdate");
      if (res && res.ok) {
        alert("Factory assets restored. Reloading terminal...");
      } else {
        alert(`Could not revert: ${res?.error || "Unknown error"}`);
        if (this.elements.btnRevertOta) {
          this.elements.btnRevertOta.disabled = false;
          this.elements.btnRevertOta.textContent = "🔄 Revert to Factory Assets";
        }
      }
    } catch (err) {
      alert(`Revert failed: ${err.message}`);
      if (this.elements.btnRevertOta) {
        this.elements.btnRevertOta.disabled = false;
        this.elements.btnRevertOta.textContent = "🔄 Revert to Factory Assets";
      }
    }
  },

  /**
   * Generates and downloads the backup file based on selected modules and format
   */
  async exportBackup() {
    const includeItems = this.elements.cbExportItems ? this.elements.cbExportItems.checked : false;
    const includeUsers = this.elements.cbExportUsers ? this.elements.cbExportUsers.checked : false;
    const includeStore = this.elements.cbExportStore ? this.elements.cbExportStore.checked : false;
    const includeSync = this.elements.cbExportSync ? this.elements.cbExportSync.checked : false;
    const includeHotspot = this.elements.cbExportHotspot ? this.elements.cbExportHotspot.checked : false;
    const includeVouchers = this.elements.cbExportVouchers ? this.elements.cbExportVouchers.checked : false;
    const includeOta = this.elements.cbExportOta ? this.elements.cbExportOta.checked : false;

    if (!includeItems && !includeUsers && !includeStore && !includeSync && !includeHotspot && !includeVouchers && !includeOta) {
      alert("Please select at least one component to include in your backup.");
      return;
    }

    const payload = {
      _app: "LokalexPOS",
      _version: "2.0",
      _createdAt: new Date().toISOString(),
      _modulesIncluded: [],
      modules: {}
    };

    // 1. Items & Categories
    if (includeItems) {
      const [categories, products] = await Promise.all([
        DB.instance.categories.toArray(),
        DB.instance.products.toArray()
      ]);
      payload.modules.items = { categories, products };
      payload._modulesIncluded.push("items");
    }

    // 2. Staff User Accounts
    if (includeUsers) {
      payload.modules.users = await DB.instance.users.toArray();
      payload._modulesIncluded.push("users");
    }

    // 3. Store Profile & Fast Mode
    const fullStore = await DB.getStoreSettings();
    if (includeStore) {
      payload.modules.store = {
        storeName: fullStore.storeName,
        companyName: fullStore.companyName,
        address: fullStore.address,
        contactNumber: fullStore.contactNumber,
        tagline: fullStore.tagline,
        logoBase64: fullStore.logoBase64,
        gcashName: fullStore.gcashName,
        gcashNumber: fullStore.gcashNumber,
        gcashQrBase64: fullStore.gcashQrBase64,
        gcashQrPayload: fullStore.gcashQrPayload,
        useNumberPager: fullStore.useNumberPager,
        pagerCount: fullStore.pagerCount,
        defaultInitialCash: fullStore.defaultInitialCash,
        karinderyaMode: fullStore.karinderyaMode,
        karinderyaAutoCash: fullStore.karinderyaAutoCash,
        karinderyaAutoGCash: fullStore.karinderyaAutoGCash,
        karinderyaCompactReceipt: fullStore.karinderyaCompactReceipt,
        karinderyaSuppressPager: fullStore.karinderyaSuppressPager,
        karinderyaVoucherOnly: fullStore.karinderyaVoucherOnly
      };
      payload._modulesIncluded.push("store");
    }

    // 4. Cloud Sync Credentials
    if (includeSync) {
      payload.modules.sync = await DB.getSyncConfig();
      payload._modulesIncluded.push("sync");
    }

    // 5. MikroTik Router Configuration
    if (includeHotspot) {
      payload.modules.hotspot = {
        hotspotEnabled: fullStore.hotspotEnabled,
        hotspotRouterIp: fullStore.hotspotRouterIp,
        hotspotPort: fullStore.hotspotPort,
        hotspotProtocol: fullStore.hotspotProtocol,
        hotspotUsername: fullStore.hotspotUsername,
        hotspotPassword: fullStore.hotspotPassword,
        hotspotDomain: fullStore.hotspotDomain,
        hotspotProfile: fullStore.hotspotProfile,
        hotspotUptime: fullStore.hotspotUptime,
        hotspotRateLimit: fullStore.hotspotRateLimit,
        hotspotSharedUsers: fullStore.hotspotSharedUsers,
        hotspotAutoPrint: fullStore.hotspotAutoPrint
      };
      payload._modulesIncluded.push("hotspot");
    }

    // 6. Wi-Fi Vouchers Pool
    if (includeVouchers) {
      payload.modules.vouchers = await DB.instance.vouchers.toArray();
      payload._modulesIncluded.push("vouchers");
    }

    // 7. Over-The-Air (OTA) Update Settings
    if (includeOta) {
      let otaRepo = (this.elements.inputOtaGithubRepo ? this.elements.inputOtaGithubRepo.value : "").trim();
      if (!otaRepo && typeof localStorage !== "undefined") {
        otaRepo = localStorage.getItem("pos_ota_github_repo") || "";
      }
      let otaVersion = "1.0.0";
      if (this.elements.badgeCurrentOtaVersion) {
        otaVersion = this.elements.badgeCurrentOtaVersion.textContent.trim();
      }
      payload.modules.ota = {
        githubRepo: otaRepo,
        currentVersion: otaVersion
      };
      payload._modulesIncluded.push("ota");
    }

    // Format selection: .json vs .txt
    const formatInput = document.querySelector("input[name='export-format']:checked");
    const format = formatInput ? formatInput.value : "json";
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const filename = `pos_backup_${stamp}.${format}`;
    const mimeType = format === "json" ? "application/json;charset=utf-8;" : "text/plain;charset=utf-8;";
    const content = JSON.stringify(payload, null, 2);

    await this.saveFileUniversal(filename, content, mimeType);
  },

  /**
   * Universal cross-platform file saving supporting native Android Flutter bridge with Blob fallback
   * @param {string} filename 
   * @param {string} content 
   * @param {string} mimeType 
   */
  async saveFileUniversal(filename, content, mimeType) {
    // 1. Prioritize Native Android Flutter Bridge (writes directly to /storage/emulated/0/Download)
    if (typeof window !== "undefined" && window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        const res = await window.flutter_inappwebview.callHandler("saveFileNative", filename, content);
        if (res && res.ok) {
          alert(`✅ Backup saved successfully to device storage:\n${res.path || filename}`);
          return true;
        }
      } catch (err) {
        console.warn("[AdminBackup] Flutter bridge save error:", err);
      }
    }

    // 2. Standard Browser / PWA Blob Download Fallback
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
      alert(`✅ Backup file download initiated: ${filename}`);
      return true;
    } catch (err) {
      alert(`Could not save backup file: ${err.message}`);
      return false;
    }
  },

  /**
   * Handles local file reading from device
   * @param {File} file 
   */
  handleFileSelected(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      this.inspectBackupContent(text);
    };
    reader.onerror = () => {
      alert("Failed to read the selected backup file.");
    };
    reader.readAsText(file);
  },

  /**
   * Parses and validates raw JSON/text backup and renders the restore inspector
   * @param {string} rawText 
   */
  inspectBackupContent(rawText) {
    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      alert("Invalid backup file: The selected file does not contain valid JSON content.");
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      alert("Invalid backup format: Content must be a valid JSON object.");
      return;
    }

    // Normalize modules: supports both unified { modules: { ... } } or flat objects
    const modules = parsed.modules || parsed;
    this.pendingBackupData = {
      meta: {
        app: parsed._app || "Unknown POS",
        version: parsed._version || "1.0",
        createdAt: parsed._createdAt || parsed.timestamp || "Unknown Date"
      },
      modules
    };

    // Render Inspector Panel
    if (this.elements.inspectBackupDate) {
      const dateDisplay = parsed._createdAt ? new Date(parsed._createdAt).toLocaleString() : "Custom Backup";
      this.elements.inspectBackupDate.textContent = `Issued: ${dateDisplay}`;
    }

    const container = this.elements.inspectModulesChecklist;
    if (container) {
      container.innerHTML = "";

      const moduleDefs = [
        {
          key: "items",
          label: "📦 Product Catalog & Categories",
          detect: () => {
            const m = modules.items;
            if (m && (Array.isArray(m.products) || Array.isArray(m.categories))) {
              const pLen = (m.products || []).length;
              const cLen = (m.categories || []).length;
              return `${pLen} items, ${cLen} categories found`;
            }
            if (Array.isArray(modules.products) || Array.isArray(modules.categories)) {
              const pLen = (modules.products || []).length;
              const cLen = (modules.categories || []).length;
              return `${pLen} items, ${cLen} categories found`;
            }
            return null;
          }
        },
        {
          key: "users",
          label: "👥 Staff & User Profile Accounts",
          detect: () => {
            const u = modules.users;
            if (Array.isArray(u)) return `${u.length} accounts found`;
            return null;
          }
        },
        {
          key: "store",
          label: "🏪 Store Profile & Fast Mode Settings",
          detect: () => {
            const s = modules.store || modules.store_settings;
            if (s && typeof s === "object") return "Store configuration found";
            return null;
          }
        },
        {
          key: "sync",
          label: "☁️ Cloud Sync Credentials",
          detect: () => {
            const sy = modules.sync || modules.cloud_sync;
            if (sy && typeof sy === "object") return "Sync configuration found";
            return null;
          }
        },
        {
          key: "hotspot",
          label: "📶 MikroTik Hotspot Router Configuration",
          detect: () => {
            const h = modules.hotspot || (modules.store && modules.store.hotspotRouterIp);
            if (h) return "Router configuration found";
            return null;
          }
        },
        {
          key: "vouchers",
          label: "🎟️ Hotspot Wi-Fi Vouchers Pool",
          detect: () => {
            const v = modules.vouchers;
            if (Array.isArray(v)) return `${v.length} vouchers found`;
            return null;
          }
        },
        {
          key: "ota",
          label: "🔄 Over-The-Air (OTA) Update Settings",
          detect: () => {
            const o = modules.ota || modules.ota_settings;
            if (o && (o.githubRepo || typeof o === "object")) {
              return o.githubRepo ? `Repo: ${o.githubRepo}` : "OTA configuration found";
            }
            return null;
          }
        }
      ];

      let anyDetected = false;

      moduleDefs.forEach((def) => {
        const detail = def.detect();
        const isPresent = Boolean(detail);
        if (isPresent) anyDetected = true;

        const row = document.createElement("label");
        row.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: ${isPresent ? '#fff' : '#f1f5f9'}; border: 1px solid var(--border); border-radius: 6px; cursor: ${isPresent ? 'pointer' : 'not-allowed'}; opacity: ${isPresent ? '1' : '0.6'};`;

        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" class="backup-restore-cb" data-module="${def.key}" ${isPresent ? "checked" : "disabled"} style="width: 16px; height: 16px; accent-color: #16a34a;" />
            <span style="font-weight: 700; font-size: 0.8rem;">${def.label}</span>
          </div>
          <span class="badge ${isPresent ? 'badge-cash' : ''}" style="font-size: 0.7rem;">${isPresent ? detail : 'Not in backup'}</span>
        `;

        container.appendChild(row);
      });

      if (!anyDetected) {
        alert("Warning: Could not recognize any valid POS data modules inside this file.");
      }
    }

    if (this.elements.backupInspectPanel) {
      this.elements.backupInspectPanel.classList.remove("hidden");
      this.elements.backupInspectPanel.scrollIntoView({ behavior: "smooth" });
    }
  },

  /**
   * Resets and hides the import inspector
   */
  clearImportInspector() {
    this.pendingBackupData = null;
    if (this.elements.backupInspectPanel) {
      this.elements.backupInspectPanel.classList.add("hidden");
    }
    if (this.elements.inputBackupFile) {
      this.elements.inputBackupFile.value = "";
    }
    if (this.elements.textareaBackupPaste) {
      this.elements.textareaBackupPaste.value = "";
    }
  },

  /**
   * Restores selected modules into Dexie IndexedDB
   */
  async executeRestore() {
    if (!this.pendingBackupData || !this.pendingBackupData.modules) {
      alert("No valid backup data loaded.");
      return;
    }

    const checkedBoxes = Array.from(document.querySelectorAll(".backup-restore-cb:checked"));
    if (checkedBoxes.length === 0) {
      alert("Please check at least one module to restore.");
      return;
    }

    const selectedModules = checkedBoxes.map((cb) => cb.dataset.module);
    const restoreModeInput = document.querySelector("input[name='restore-mode']:checked");
    const isReplace = restoreModeInput ? restoreModeInput.value === "replace" : false;

    const modeText = isReplace
      ? "CLEAN REPLACE: Existing data for selected modules will be wiped and replaced."
      : "MERGE / UPSERT: Matching records will be updated; existing items will be preserved.";

    const confirmed = confirm(
      `Are you sure you want to restore the selected ${selectedModules.length} module(s)?\n\nMode: ${modeText}\n\nProceed?`
    );
    if (!confirmed) return;

    if (this.elements.btnExecuteRestore) {
      this.elements.btnExecuteRestore.disabled = true;
      this.elements.btnExecuteRestore.textContent = "Restoring...";
    }

    const modules = this.pendingBackupData.modules;
    const restoredSummary = [];

    try {
      // 1. Items & Categories
      if (selectedModules.includes("items")) {
        const itemData = modules.items || modules;
        const categories = itemData.categories || [];
        const products = itemData.products || [];

        if (isReplace) {
          if (categories.length > 0) await DB.instance.categories.clear();
          if (products.length > 0) await DB.instance.products.clear();
        }

        if (categories.length > 0) {
          await DB.instance.categories.bulkPut(categories);
        }
        if (products.length > 0) {
          await DB.instance.products.bulkPut(products);
        }

        restoredSummary.push(`${products.length} items & ${categories.length} categories`);
        Bus.emit("inventory:updated");
      }

      // 2. Staff User Accounts
      if (selectedModules.includes("users")) {
        const users = modules.users || [];
        if (users.length > 0) {
          if (isReplace) await DB.instance.users.clear();
          await DB.instance.users.bulkPut(users);
          restoredSummary.push(`${users.length} staff users`);
        }
      }

      // 3. Store Profile & Fast Mode Settings
      if (selectedModules.includes("store")) {
        const storeData = modules.store || modules.store_settings || {};
        if (Object.keys(storeData).length > 0) {
          await DB.saveStoreSettings(storeData);
          Bus.emit("store:karinderya-settings-updated", storeData);
          if (storeData.karinderyaMode !== undefined) {
            Bus.emit("store:karinderya-changed", storeData.karinderyaMode);
          }
          restoredSummary.push("Store profile & Fast Mode");
        }
      }

      // 4. Cloud Sync Credentials
      if (selectedModules.includes("sync")) {
        const syncData = modules.sync || modules.cloud_sync || {};
        if (Object.keys(syncData).length > 0) {
          await DB.saveSyncConfig(syncData);
          restoredSummary.push("Cloud sync settings");
        }
      }

      // 5. MikroTik Hotspot Router Configuration
      if (selectedModules.includes("hotspot")) {
        const hotspotData = modules.hotspot || (modules.store && modules.store.hotspotRouterIp ? modules.store : {});
        if (Object.keys(hotspotData).length > 0) {
          await DB.saveStoreSettings(hotspotData);
          restoredSummary.push("MikroTik Hotspot configuration");
        }
      }

      // 6. Hotspot Vouchers Pool
      if (selectedModules.includes("vouchers")) {
        const vouchers = modules.vouchers || [];
        if (vouchers.length > 0) {
          if (isReplace) await DB.instance.vouchers.clear();
          await DB.instance.vouchers.bulkPut(vouchers);
          restoredSummary.push(`${vouchers.length} vouchers`);
        }
      }

      // 7. Over-The-Air (OTA) Update Settings
      if (selectedModules.includes("ota")) {
        const otaData = modules.ota || modules.ota_settings || {};
        const repo = (otaData.githubRepo || "").trim();
        if (repo) {
          if (this.elements.inputOtaGithubRepo) {
            this.elements.inputOtaGithubRepo.value = repo;
          }
          if (this.elements.statBackupOtaRepo) {
            this.elements.statBackupOtaRepo.textContent = repo;
          }
          if (typeof window !== "undefined" && window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
            try {
              await window.flutter_inappwebview.callHandler("setOtaRepo", repo);
            } catch (otaErr) {
              console.warn("[AdminBackup] Bridge setOtaRepo restore error:", otaErr);
            }
          }
          if (typeof localStorage !== "undefined") {
            localStorage.setItem("pos_ota_github_repo", repo);
          }
          restoredSummary.push(`OTA Repository (${repo})`);
        }
      }

      await this.loadBackupSettings();
      this.clearImportInspector();
      alert(`✅ System Backup Restored Successfully!\n\nRestored:\n• ${restoredSummary.join("\n• ")}`);
    } catch (err) {
      console.error("[AdminBackup Restore Error]:", err);
      alert(`Failed to restore backup: ${err.message}`);
    } finally {
      if (this.elements.btnExecuteRestore) {
        this.elements.btnExecuteRestore.disabled = false;
        this.elements.btnExecuteRestore.textContent = "⚡ Restore Selected Data";
      }
    }
  }
};

// REMARK: ADMIN_BACKUP_JS_SELECTIVE_EXPORT_IMPORT_COMPLETE

