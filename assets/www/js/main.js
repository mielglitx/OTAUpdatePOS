/**
 * Module Description: POS Application Primary Entrypoint & Modular Orchestrator
 * Eliminates duplicate shift report printing on logout by consolidating print execution
 * exclusively into the primary lock handler with an asynchronous debounce guard.
 * Captures authenticated cashier credentials prior to session teardown to prevent fallback
 * to default user profiles on thermal printouts. Directly imports all core modules, session state,
 * reporting engines, printer drivers, and the secondary customer display customizer from verified
 * relative module paths without speculative 404 script loaders.
 * Initializes core database, network sync scheduler, catalog, multi-printer hardware hub,
 * cashier terminal, silent background shift engagement with admin-configured drawer float,
 * customer-facing dual-screen display customizer, and system lock screen.
 */

import { 
  POS, 
  DB, 
  Cart, 
  Theme, 
  Sync, 
  LoginUI, 
  CatalogUI, 
  CheckoutUI, 
  PrinterUI, 
  AdminUI,
  Printer,
  Reports,
  Session
} from "./facade.js";
import { AdminDisplay } from "./modules/admin/admin-display.js";
import { AdminTables } from "./modules/admin/admin-tables.js";

let isPrintingLogoutReport = false;

/**
 * Compiles and prints the active cashier's shift sales summary on thermal receipt printers in background
 * @param {Object|null} user - Logged-out cashier user object
 */
async function printLogoutReport(user) {
  if (isPrintingLogoutReport) return;
  isPrintingLogoutReport = true;

  try {
    const activeUser = user || { id: "USR-001", name: "Cashier" };
    const activeShift = await DB.getActiveShift(activeUser.id);
    
    // Retrieve financial ledger for the active shift
    const summary = await DB.getSalesSummary(activeShift ? activeShift.id : "active");
    
    // Safety check: Skip printing if there are no sales and no opening float
    if (!summary || (summary.orderCount === 0 && (!summary.initialCash || summary.initialCash === 0))) {
      return;
    }

    const enabledPrinters = await DB.getEnabledPrinters();
    const paperWidth = enabledPrinters.length > 0 && enabledPrinters[0].paperWidth 
      ? enabledPrinters[0].paperWidth 
      : "58mm";

    const reportBytes = Reports.buildDailyReportBytes(summary, activeUser, paperWidth);

    if (enabledPrinters.length > 0) {
      await Promise.allSettled(enabledPrinters.map((p) => Printer.dispatchToTarget(p, reportBytes)));
    } else {
      await Printer.dispatch(reportBytes);
    }
  } catch (err) {
    console.warn("[Logout Sales Summary Print Notice]:", err);
  } finally {
    isPrintingLogoutReport = false;
  }
}

/**
 * Over-The-Air (OTA) Startup Update Verification
 * Runs on application boot to check GitHub for updates and prompts cashier/admin immediately.
 */
async function checkStartupOtaUpdate() {
  if (typeof window === "undefined" || !window.flutter_inappwebview || typeof window.flutter_inappwebview.callHandler !== "function") {
    return;
  }

  try {
    const res = await window.flutter_inappwebview.callHandler("checkOtaUpdate");
    if (!res || !res.ok) return;

    const hasUpdate = Boolean(res.updateAvailable || res.hasUpdate);
    if (!hasUpdate) return;

    const modal = document.getElementById("modal-startup-ota");
    if (!modal) return;

    const txtVersion = document.getElementById("startup-ota-version");
    const txtNotes = document.getElementById("startup-ota-notes");
    const progressBox = document.getElementById("startup-ota-progress");
    const progressMsg = document.getElementById("startup-ota-progress-msg");
    const actionsBox = document.getElementById("startup-ota-actions");
    const btnInstall = document.getElementById("btn-startup-ota-install");
    const btnInstallApk = document.getElementById("btn-startup-ota-install-apk");
    const btnSkip = document.getElementById("btn-startup-ota-skip");

    if (btnInstallApk) {
      if (res.hasApk && res.apkDownloadUrl) {
        btnInstallApk.classList.remove("hidden");
        const apkMb = res.apkSizeBytes ? ` (${(res.apkSizeBytes / (1024 * 1024)).toFixed(1)} MB)` : "";
        btnInstallApk.textContent = `📲 Install APK Update${apkMb}`;
        btnInstallApk.onclick = async () => {
          btnInstallApk.disabled = true;
          if (btnInstall) btnInstall.disabled = true;
          if (btnSkip) btnSkip.disabled = true;
          if (progressBox) progressBox.classList.remove("hidden");
          if (progressMsg) progressMsg.textContent = `Downloading full APK update (${res.latestVersion})... Please wait.`;
          if (actionsBox) actionsBox.classList.add("hidden");

          try {
            const apkRes = await window.flutter_inappwebview.callHandler(
              "downloadAndInstallApk",
              res.apkDownloadUrl,
              res.latestVersion
            );

            if (apkRes && apkRes.ok) {
              if (progressMsg) {
                progressMsg.innerHTML = `<span style="color: #16a34a; font-weight: bold;">✅ Download complete! Opening Android Package Installer... Tap 'Update' on your screen.</span>`;
              }
              setTimeout(() => modal.close(), 4000);
            } else {
              alert(`APK update failed: ${apkRes?.error || "Unknown installer error"}`);
              modal.close();
            }
          } catch (apkErr) {
            alert(`Could not install APK: ${apkErr.message}`);
            modal.close();
          }
        };
      } else {
        btnInstallApk.classList.add("hidden");
      }
    }

    if (txtVersion) {
      txtVersion.textContent = `${res.latestVersion} (Current: ${res.currentVersion})`;
    }
    if (txtNotes) {
      txtNotes.innerHTML = res.releaseNotes
        ? res.releaseNotes.replace(/\r?\n/g, "<br>")
        : "Enhancements, fixes, and performance improvements.";
    }

    if (btnSkip) {
      btnSkip.onclick = () => {
        modal.close();
      };
    }

    if (btnInstall) {
      btnInstall.onclick = async () => {
        btnInstall.disabled = true;
        if (btnSkip) btnSkip.disabled = true;
        if (progressBox) progressBox.classList.remove("hidden");
        if (progressMsg) progressMsg.textContent = `Downloading & installing ${res.latestVersion}... Please do not exit.`;
        if (actionsBox) actionsBox.classList.add("hidden");

        try {
          const updateRes = await window.flutter_inappwebview.callHandler(
            "performOtaUpdate",
            res.downloadUrl,
            res.latestVersion
          );

          if (updateRes && updateRes.ok) {
            if (progressMsg) {
              progressMsg.innerHTML = `<span style="color: #16a34a; font-weight: bold;">✅ Update applied successfully! Reloading POS...</span>`;
            }
          } else {
            alert(`Update failed: ${updateRes?.error || "Unknown extraction error"}`);
            modal.close();
          }
        } catch (updateErr) {
          alert(`Could not install OTA update: ${updateErr.message}`);
          modal.close();
        }
      };
    }

    modal.showModal();
  } catch (err) {
    console.warn("[Startup OTA Check Error]:", err);
  }
}

async function initApp() {
  // 1. Initialize Lock Screen & Touch Numpad IMMEDIATELY (Priority #1 so user can ALWAYS type and log in)
  try {
    LoginUI.init({
      onLoginSuccess: async (user) => {
        try {
          CatalogUI.focusBarcode();
        } catch (_) {}

        // Silently engage cashier shift using Admin-configured initial money
        try {
          const activeShift = await DB.getActiveShift(user ? user.id : null);
          if (!activeShift) {
            const store = await DB.getStoreSettings();
            const startingFloat = Number(store.defaultInitialCash) || 1000.0;
            await DB.startShift(user || { id: "USR-001", name: "Cashier" }, startingFloat);
          }
        } catch (shiftErr) {
          console.warn("[Shift Auto-Start Notice]:", shiftErr);
        }
      },
      onLock: (priorUser) => {
        // 1. Immediately purge in-memory cart state
        try {
          Cart.clear();
        } catch (_) {}

        // 2. Detached non-blocking background dispatch: sales summary prints asynchronously
        if (priorUser) {
          printLogoutReport(priorUser).catch((err) => {
            console.warn("[Background Logout Print Notice]:", err);
          });
        }
      }
    });
  } catch (loginErr) {
    console.error("[Bootstrap Error] LoginUI init failed:", loginErr);
  }

  // 2. Initialize IndexedDB schema, seed master records, and sync settings
  try {
    await DB.init();
  } catch (dbErr) {
    console.error("[Bootstrap Error] DB init failed:", dbErr);
  }

  // 3. Initialize Network Monitor & Cloud Sync Adapter
  try {
    Sync.init();
  } catch (syncErr) {
    console.warn("[Bootstrap Warning] Sync init:", syncErr);
  }

  // 4. Boot POS Facade ticket bindings and manager void modal verification
  try {
    POS.boot({
      tbody: document.getElementById("cart-tbody"),
      txtNet: document.getElementById("txt-subtotal"),
      txtVat: document.getElementById("txt-tax"),
      txtTotal: document.getElementById("txt-total"),
      modalVoid: document.getElementById("modal-void"),
      inputVoid: document.getElementById("manager-qr-input"),
      lblVoid: document.getElementById("void-item-label"),
      errVoid: document.getElementById("void-error-msg")
    });
  } catch (posErr) {
    console.warn("[Bootstrap Warning] POS boot:", posErr);
  }

  // 5. Initialize Catalog & Category Browser
  try {
    CatalogUI.init();
    await CatalogUI.loadCategories();
    await CatalogUI.loadProducts("all");
  } catch (catErr) {
    console.warn("[Bootstrap Warning] CatalogUI init:", catErr);
  }

  // 6. Initialize Payment & Multi-Printer Checkout Engine
  try {
    CheckoutUI.init();
  } catch (checkoutErr) {
    console.warn("[Bootstrap Warning] CheckoutUI init:", checkoutErr);
  }

  // 7. Initialize Multi-Printer Hub Console
  try {
    PrinterUI.init();
  } catch (printerErr) {
    console.warn("[Bootstrap Warning] PrinterUI init:", printerErr);
  }

  // 8. Initialize Administration Back-Office Portal
  try {
    AdminUI.init({
      onCatalogModified: async () => {
        await CatalogUI.loadCategories();
        await CatalogUI.loadProducts(CatalogUI.getActiveCategory());
      },
      onCategoriesModified: async () => {
        await CatalogUI.loadCategories();
        await CatalogUI.loadProducts(CatalogUI.getActiveCategory());
      }
    });
  } catch (adminErr) {
    console.warn("[Bootstrap Warning] AdminUI init:", adminErr);
  }

  // 9. Initialize Customer-Facing Dual Screen Customizer Sub-Module
  try {
    if (AdminDisplay && typeof AdminDisplay.init === "function") {
      AdminDisplay.init();

      const tabBtnDisplay = document.getElementById("tab-btn-display");
      if (tabBtnDisplay) {
        tabBtnDisplay.addEventListener("click", async () => {
          document.querySelectorAll(".btn-admin-tab").forEach((b) => b.classList.remove("active"));
          tabBtnDisplay.classList.add("active");

          document.querySelectorAll(".admin-tab-pane").forEach((p) => p.classList.remove("active"));
          const paneDisplay = document.getElementById("pane-display");
          if (paneDisplay) {
            paneDisplay.classList.add("active");
          }

          await AdminDisplay.loadDisplaySettings();
        });
      }

      const btnCustomerDisplay = document.getElementById("btn-customer-display");
      if (btnCustomerDisplay) {
        btnCustomerDisplay.onclick = async () => {
          await AdminDisplay.pushLiveToSecondary();
        };
      }

      setTimeout(async () => {
        try {
          await AdminDisplay.pushLiveToSecondary({ silent: true });
        } catch (_) {}
      }, 1200);
    }
  } catch (dispErr) {
    console.warn("[Bootstrap Warning] AdminDisplay init:", dispErr);
  }

  // 10. Initialize Dining & Floor Plan Table Layout Sub-Module
  try {
    if (AdminTables && typeof AdminTables.init === "function") {
      await AdminTables.init();

      const tabBtnTables = document.getElementById("tab-btn-tables");
      if (tabBtnTables) {
        tabBtnTables.addEventListener("click", async () => {
          document.querySelectorAll(".btn-admin-tab").forEach((b) => b.classList.remove("active"));
          tabBtnTables.classList.add("active");

          document.querySelectorAll(".admin-tab-pane").forEach((p) => p.classList.remove("active"));
          const paneTables = document.getElementById("pane-tables");
          if (paneTables) {
            paneTables.classList.add("active");
          }

          await AdminTables.loadData();
        });
      }
    }
  } catch (tableErr) {
    console.warn("[Bootstrap Warning] AdminTables init:", tableErr);
  }

  // 11. Bind global register action controls
  try {
    const btnClearCart = document.getElementById("btn-clear-cart");
    const btnLockTerminal = document.getElementById("btn-lock-terminal");
    if (btnClearCart) {
      btnClearCart.onclick = () => Cart.clear();
    }
    if (btnLockTerminal) {
      btnLockTerminal.onclick = () => {
        LoginUI.lock();
      };
    }
  } catch (_) {}

  // 12. Over-The-Air (OTA) Startup Update Verification
  setTimeout(async () => {
    try {
      await checkStartupOtaUpdate();
    } catch (otaErr) {
      console.warn("[Startup OTA Check Notice]:", otaErr);
    }
  }, 1500);
}

// Start application runtime
initApp();

// REMARK: MAIN_JS_DEDUPLICATED_LOCK_PRINT_AND_DEBOUNCE_COMPLETE