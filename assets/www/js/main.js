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
    const btnSkip = document.getElementById("btn-startup-ota-skip");

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
  try {
    // 1. Initialize IndexedDB schema, seed master records, and sync settings
    await DB.init();

    // 2. Initialize Network Monitor & Cloud Sync Adapter
    Sync.init();

    // 3. Boot POS Facade ticket bindings and manager void modal verification
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

    // 4. Initialize Catalog & Category Browser
    CatalogUI.init();
    await CatalogUI.loadCategories();
    await CatalogUI.loadProducts("all");

    // 5. Initialize Payment & Multi-Printer Checkout Engine
    CheckoutUI.init();

    // 6. Initialize Multi-Printer Hub Console
    PrinterUI.init();

    // 7. Initialize Administration Back-Office Portal
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

    // 8. Initialize Customer-Facing Dual Screen Customizer Sub-Module
    if (AdminDisplay && typeof AdminDisplay.init === "function") {
      AdminDisplay.init();

      // Bind Customer Display Admin Navigation Tab
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

      // Bind Topbar Customer Display Hardware Presentation Trigger
      const btnCustomerDisplay = document.getElementById("btn-customer-display");
      if (btnCustomerDisplay) {
        btnCustomerDisplay.onclick = async () => {
          await AdminDisplay.pushLiveToSecondary();
        };
      }

      // Feature Rework: Auto-enable and auto-mount secondary customer presentation display on boot
      // if Android hardware indicates dual-monitor / Sunmi sub-display connected
      setTimeout(async () => {
        try {
          await AdminDisplay.pushLiveToSecondary({ silent: true });
        } catch (_) {}
      }, 1200);
    }

    // 8.1 Initialize Dining & Floor Plan Table Layout Sub-Module
    if (AdminTables && typeof AdminTables.init === "function") {
      await AdminTables.init();

      // Bind Table Layout Admin Navigation Tab
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

    // 9. Initialize Lock Screen & Cashier Shift Engagement
    LoginUI.init({
      onLoginSuccess: async (user) => {
        CatalogUI.focusBarcode();

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
        Cart.clear();

        // 2. Detached non-blocking background dispatch: sales summary prints asynchronously
        // Terminal is already locked on-screen, so printer hardware/network latency never freezes or slows the UI
        if (priorUser) {
          printLogoutReport(priorUser).catch((err) => {
            console.warn("[Background Logout Print Notice]:", err);
          });
        }
      }
    });

    // 10. Bind global register action controls
    const btnClearCart = document.getElementById("btn-clear-cart");
    const btnLockTerminal = document.getElementById("btn-lock-terminal");
    if (btnClearCart) {
      btnClearCart.onclick = () => Cart.clear();
    }
    // 11. Over-The-Air (OTA) Startup Update Verification
    // Checks for newly published updates on application startup
    setTimeout(async () => {
      try {
        await checkStartupOtaUpdate();
      } catch (otaErr) {
        console.warn("[Startup OTA Check Notice]:", otaErr);
      }
    }, 1500);

    if (btnLockTerminal) {
      btnLockTerminal.onclick = () => {
        // Immediate zero-latency terminal lock: locks in 0ms without waiting for thermal printer
        LoginUI.lock();
      };
    }

  } catch (err) {
    console.error("[POS Bootstrap Error] System failed to initialize:", err);
  }
}

// Start application runtime
initApp();

// REMARK: MAIN_JS_DEDUPLICATED_LOCK_PRINT_AND_DEBOUNCE_COMPLETE