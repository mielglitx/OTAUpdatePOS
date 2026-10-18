/**
 * Module Description: Printer Hub & Hardware Management UI Controller
 * Manages thermal printer profiles, interface filtering (All, LAN, BT, USB),
 * dynamic Bluetooth device enumeration via native container bridge (Classic & BLE),
 * dedicated Add Printer modal lifecycle management, Compatibility Mode (BLE GATT)
 * toggle for dual-mode printers (JK-5802H / KPrinter_fbce), automatic 58mm paper calibration,
 * WebUSB hardware pairing, receipt role assignment, diagnostic test print dispatching,
 * and strict top-scroll anchoring.
 */

import { DB } from "./db.js";
import { Printer } from "./printer.js";

export const PrinterUI = {
  elements: {},
  currentFilter: "all",
  detectedUsbDevices: [],
  detectedBtDevices: [],
  initialized: false,

  /**
   * Initializes DOM bindings, hardware listeners, and event handlers
   */
  init() {
    this.elements = {
      // Main Printer Hub Modal (List Viewport Only)
      modalPrinter: document.getElementById("modal-printer"),
      btnPrinterDialog: document.getElementById("btn-printer-dialog"),
      btnClosePrinterHub: document.getElementById("btn-close-printer-hub"),
      btnDismissPrinterHub: document.getElementById("btn-dismiss-printer-hub"),
      btnTestAllPrinters: document.getElementById("btn-test-all-printers"),
      printerFilterInterface: document.getElementById("printer-filter-interface"),
      printerListContainer: document.getElementById("printer-list-container"),

      // Dedicated Add Printer Modal Controls
      modalAddPrinter: document.getElementById("modal-add-printer"),
      btnOpenAddPrinterModal: document.getElementById("btn-open-add-printer-modal"),
      btnCloseAddPrinter: document.getElementById("btn-close-add-printer"),
      btnCancelAddPrinter: document.getElementById("btn-cancel-add-printer"),

      // New Printer Form Fields
      newPrinterName: document.getElementById("new-printer-name"),
      newPrinterType: document.getElementById("new-printer-type"),
      newPrinterRole: document.getElementById("new-printer-role"),
      newPrinterPaper: document.getElementById("new-printer-paper"),

      // Interface Parameter Field Wrappers
      fieldNetworkWrap: document.getElementById("field-network-wrap"),
      newPrinterIp: document.getElementById("new-printer-ip"),
      newPrinterPort: document.getElementById("new-printer-port"),
      
      // Bluetooth Controls
      fieldBluetoothWrap: document.getElementById("field-bluetooth-wrap"),
      newPrinterBtSelect: document.getElementById("new-printer-bt-select"),
      btnScanBtPrinter: document.getElementById("btn-scan-bt-printer"),
      newPrinterBtName: document.getElementById("new-printer-bt-name"),
      newPrinterIsBle: document.getElementById("new-printer-is-ble"),

      // USB Controls
      fieldUsbWrap: document.getElementById("field-usb-wrap"),
      newPrinterUsbSelect: document.getElementById("new-printer-usb-select"),
      btnScanUsbPrinter: document.getElementById("btn-scan-usb-printer"),
      newPrinterUsbPort: document.getElementById("new-printer-usb-port"),

      btnSaveNewPrinter: document.getElementById("btn-save-new-printer"),
      btnKickDrawer: document.getElementById("btn-kick-drawer")
    };

    // 1. Open Printer Hub Modal
    if (this.elements.btnPrinterDialog) {
      this.elements.btnPrinterDialog.onclick = async () => {
        if (this.elements.printerFilterInterface) {
          this.elements.printerFilterInterface.value = "all";
        }
        this.currentFilter = "all";
        await this.loadPrinterHub("all");
        if (this.elements.modalPrinter && typeof this.elements.modalPrinter.showModal === "function") {
          this.elements.modalPrinter.showModal();
          this.elements.modalPrinter.scrollTop = 0;
          if (this.elements.printerListContainer) {
            this.elements.printerListContainer.scrollTop = 0;
          }
        }
      };
    }

    // 2. Close Printer Hub Modal (X and Done buttons)
    const closeHubModal = () => {
      if (this.elements.modalPrinter && this.elements.modalPrinter.open) {
        this.elements.modalPrinter.close();
      }
    };

    if (this.elements.btnClosePrinterHub) {
      this.elements.btnClosePrinterHub.onclick = closeHubModal;
    }
    if (this.elements.btnDismissPrinterHub) {
      this.elements.btnDismissPrinterHub.onclick = closeHubModal;
    }

    // 3. Open Dedicated "Add New Printer" Modal
    if (this.elements.btnOpenAddPrinterModal) {
      this.elements.btnOpenAddPrinterModal.onclick = async () => {
        if (this.elements.newPrinterType) {
          this.elements.newPrinterType.value = this.currentFilter !== "all" ? this.currentFilter : "all";
        }
        this.handleInterfaceTypeChange();
        await this.refreshUsbPrinterList();
        await this.refreshBluetoothPrinterList();

        if (this.elements.modalAddPrinter && typeof this.elements.modalAddPrinter.showModal === "function") {
          this.elements.modalAddPrinter.showModal();
          this.elements.modalAddPrinter.scrollTop = 0;
        }
      };
    }

    // 4. Close Dedicated "Add New Printer" Modal (X and Cancel buttons)
    const closeAddModal = () => {
      if (this.elements.modalAddPrinter && this.elements.modalAddPrinter.open) {
        this.elements.modalAddPrinter.close();
      }
    };

    if (this.elements.btnCloseAddPrinter) {
      this.elements.btnCloseAddPrinter.onclick = closeAddModal;
    }
    if (this.elements.btnCancelAddPrinter) {
      this.elements.btnCancelAddPrinter.onclick = closeAddModal;
    }

    // 5. Filter by Interface Type on Main Hub
    if (this.elements.printerFilterInterface) {
      this.elements.printerFilterInterface.onchange = async () => {
        this.currentFilter = this.elements.printerFilterInterface.value;
        await this.loadPrinterHub(this.currentFilter);
      };
    }

    // 6. Toggle Form Fields inside Add Modal
    if (this.elements.newPrinterType) {
      this.elements.newPrinterType.onchange = () => this.handleInterfaceTypeChange();
    }

    // 7. Pair and Enumerate Bluetooth Printers
    if (this.elements.btnScanBtPrinter) {
      this.elements.btnScanBtPrinter.onclick = () => this.pairBluetoothPrinter();
    }

    // 8. Bluetooth Printer Selection Handler
    if (this.elements.newPrinterBtSelect) {
      this.elements.newPrinterBtSelect.onchange = () => this.handleBtSelectChange();
    }

    // 9. Bluetooth Manual Identifier Input Typing Handler
    if (this.elements.newPrinterBtName) {
      this.elements.newPrinterBtName.oninput = () => {
        const typedVal = this.elements.newPrinterBtName.value.trim();
        if (typedVal && this.elements.newPrinterName && !this.elements.newPrinterName.value.trim()) {
          this.elements.newPrinterName.value = typedVal;
        }
        this.autoDetectPaperWidth(typedVal);
      };
    }

    // 10. Pair and Enumerate USB Printers
    if (this.elements.btnScanUsbPrinter) {
      this.elements.btnScanUsbPrinter.onclick = () => this.pairUsbPrinter();
    }

    // 11. USB Printer Selection Handler
    if (this.elements.newPrinterUsbSelect) {
      this.elements.newPrinterUsbSelect.onchange = () => this.handleUsbSelectChange();
    }

    // 12. Save New Printer Submit Handler
    if (this.elements.btnSaveNewPrinter) {
      this.elements.btnSaveNewPrinter.onclick = () => this.handleSaveNewPrinter();
    }

    // 13. Test All Selected Active Printers
    if (this.elements.btnTestAllPrinters) {
      this.elements.btnTestAllPrinters.onclick = () => this.handleTestAllSelected();
    }

    // 14. Cash Drawer Kick Trigger
    if (this.elements.btnKickDrawer) {
      this.elements.btnKickDrawer.onclick = async () => {
        const enabledPrinters = await DB.getEnabledPrinters();
        await Printer.kickDrawer(enabledPrinters);
      };
    }

    if (this.initialized) return;
    this.initialized = true;

    // Listen for OS-level USB device connections and disconnections
    if (navigator.usb) {
      navigator.usb.addEventListener("connect", () => this.refreshUsbPrinterList());
      navigator.usb.addEventListener("disconnect", () => this.refreshUsbPrinterList());
    }
  },

  /**
   * Toggles configuration fields based on interface selection inside Add Modal
   */
  handleInterfaceTypeChange() {
    if (!this.elements.newPrinterType) return;
    const type = this.elements.newPrinterType.value;

    if (type === "all") {
      if (this.elements.fieldNetworkWrap) this.elements.fieldNetworkWrap.classList.remove("hidden");
      if (this.elements.fieldBluetoothWrap) this.elements.fieldBluetoothWrap.classList.remove("hidden");
      if (this.elements.fieldUsbWrap) this.elements.fieldUsbWrap.classList.remove("hidden");
      this.refreshUsbPrinterList();
      this.refreshBluetoothPrinterList();
    } else {
      if (this.elements.fieldNetworkWrap) this.elements.fieldNetworkWrap.classList.toggle("hidden", type !== "network");
      if (this.elements.fieldBluetoothWrap) this.elements.fieldBluetoothWrap.classList.toggle("hidden", type !== "bluetooth");
      if (this.elements.fieldUsbWrap) this.elements.fieldUsbWrap.classList.toggle("hidden", type !== "usb");

      if (type === "usb") {
        this.refreshUsbPrinterList();
      } else if (type === "bluetooth") {
        this.refreshBluetoothPrinterList();
      }
    }
  },

  /**
   * Discovers and populates bonded Bluetooth devices with hardware MAC address preservation
   */
  async refreshBluetoothPrinterList() {
    if (!this.elements.newPrinterBtSelect) return;
    const select = this.elements.newPrinterBtSelect;
    select.innerHTML = '<option value="">-- Scanning Bluetooth Printers... --</option>';

    const devices = [];

    // 1. Android Native Container Bridge (Bonded Devices in Tablet OS)
    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        const rawNative = await window.flutter_inappwebview.callHandler("getPairedBluetoothDevices");
        if (Array.isArray(rawNative)) {
          rawNative.forEach((d) => {
            if (typeof d === "string") {
              devices.push({ name: d, address: d, isBle: false });
            } else if (d && (d.name || d.address)) {
              devices.push({ 
                name: d.name || "Bluetooth Printer", 
                address: d.address || d.name,
                isBle: d.isBle || false
              });
            }
          });
        }
      } catch (nativeErr) {
        console.warn("[PrinterUI] Native Bluetooth enumeration warning:", nativeErr);
      }
    }

    // 2. Web Bluetooth API (Browser Fallback)
    if (devices.length === 0 && navigator.bluetooth && typeof navigator.bluetooth.getDevices === "function") {
      try {
        const webBtDevices = await navigator.bluetooth.getDevices();
        webBtDevices.forEach((d) => {
          if (d && d.name) {
            devices.push({ name: d.name, address: d.id || d.name, isBle: true });
          }
        });
      } catch (webBtErr) {
        console.warn("[PrinterUI] Web Bluetooth getDevices failed:", webBtErr);
      }
    }

    // 3. Fallback: Always ensure KPrinter_fbce is selectable with BLE flag enabled
    const hasKPrinter = devices.some((d) => 
      (d.name && d.name.toLowerCase().includes("kprinter")) || 
      (d.name && d.name.toLowerCase().includes("fbce")) ||
      (d.address && d.address.toLowerCase().includes("fb:ce"))
    );

    if (!hasKPrinter) {
      devices.unshift({ name: "KPrinter_fbce", address: "KPrinter_fbce", isBle: true });
    }

    this.detectedBtDevices = devices;
    select.innerHTML = '<option value="">-- Select Paired Bluetooth Printer --</option>';

    devices.forEach((dev) => {
      const option = document.createElement("option");
      option.value = dev.address || dev.name;
      option.dataset.name = dev.name;
      option.dataset.mac = dev.address || "";
      option.dataset.isBle = dev.isBle ? "true" : "false";
      option.textContent = `${dev.name} ${dev.address && dev.address !== dev.name ? `(${dev.address})` : ""} ${dev.isBle ? "[BLE]" : ""}`;
      select.appendChild(option);
    });

    const kOption = Array.from(select.options).find((opt) => 
      opt.textContent.toLowerCase().includes("kprinter") || 
      opt.textContent.toLowerCase().includes("fbce")
    );

    if (kOption) {
      select.value = kOption.value;
      this.handleBtSelectChange();
    } else if (devices.length > 0 && !select.value) {
      select.value = devices[0].address || devices[0].name;
      this.handleBtSelectChange();
    }
  },

  /**
   * Initiates Bluetooth discovery or pairing request across Classic & BLE stacks
   */
  async pairBluetoothPrinter() {
    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        const res = await window.flutter_inappwebview.callHandler("scanBluetoothDevices");
        if (Array.isArray(res) && res.length > 0 && this.elements.newPrinterBtSelect) {
          const select = this.elements.newPrinterBtSelect;
          select.innerHTML = '<option value="">-- Select Paired Bluetooth Printer --</option>';
          res.forEach((dev) => {
            const option = document.createElement("option");
            option.value = dev.address || dev.name;
            option.dataset.name = dev.name;
            option.dataset.mac = dev.address || "";
            option.dataset.isBle = dev.isBle ? "true" : "false";
            option.textContent = `${dev.name} (${dev.address}) ${dev.isBle ? "[BLE]" : "[Classic]"}`;
            select.appendChild(option);
          });
          select.value = res[0].address || res[0].name;
          this.handleBtSelectChange();
          return;
        }
      } catch (bridgeErr) {
        console.warn("[PrinterUI] Native scan handler error:", bridgeErr);
      }
    }

    if (this.elements.newPrinterBtName) {
      this.elements.newPrinterBtName.value = "KPrinter_fbce";
    }
    if (this.elements.newPrinterName && !this.elements.newPrinterName.value.trim()) {
      this.elements.newPrinterName.value = "JK-5802H Receipt";
    }
    if (this.elements.newPrinterIsBle) {
      this.elements.newPrinterIsBle.checked = true;
    }
    if (this.elements.newPrinterPaper) {
      this.elements.newPrinterPaper.value = "58mm";
    }
    alert("Set Bluetooth target to 'KPrinter_fbce' with Compatibility Mode (BLE) active.");
  },

  /**
   * Automatically sets hardware MAC address, paper width, suggested name, and BLE toggle
   */
  handleBtSelectChange() {
    if (!this.elements.newPrinterBtSelect) return;
    const select = this.elements.newPrinterBtSelect;
    const selectedOption = select.options[select.selectedIndex];
    if (!selectedOption || !selectedOption.value) return;

    const chosenAddressOrName = selectedOption.value;
    const displayName = selectedOption.dataset.name || chosenAddressOrName;
    const isBleDevice = selectedOption.dataset.isBle === "true";

    if (this.elements.newPrinterBtName) {
      this.elements.newPrinterBtName.value = chosenAddressOrName;
    }

    if (this.elements.newPrinterName && (!this.elements.newPrinterName.value.trim() || this.elements.newPrinterName.value.includes("Printer"))) {
      this.elements.newPrinterName.value = displayName.includes("fbce") ? "JK-5802H Receipt" : displayName;
    }

    if (this.elements.newPrinterIsBle) {
      const isKPrinter = displayName.toLowerCase().includes("kprinter") || 
                         displayName.toLowerCase().includes("fbce") || 
                         chosenAddressOrName.toLowerCase().includes("fb:ce");
      this.elements.newPrinterIsBle.checked = isBleDevice || isKPrinter;
    }

    this.autoDetectPaperWidth(displayName + " " + chosenAddressOrName);
  },

  /**
   * Helper to detect 58mm vs 80mm based on printer model name or identifier
   */
  autoDetectPaperWidth(nameStr) {
    if (!nameStr || !this.elements.newPrinterPaper) return;
    const lower = nameStr.toLowerCase();

    if (
      lower.includes("80") ||
      lower.includes("xp-80") ||
      lower.includes("rpp300") ||
      lower.includes("pt-380") ||
      lower.includes("mpt-iii") ||
      lower.includes("80mm")
    ) {
      this.elements.newPrinterPaper.value = "80mm";
    } else if (
      lower.includes("kprinter") ||
      lower.includes("jk-58") ||
      lower.includes("5802") ||
      lower.includes("fbce") ||
      lower.includes("glprinter") ||
      lower.includes("58") ||
      lower.includes("xp-58") ||
      lower.includes("mpt-ii") ||
      lower.includes("pt-210") ||
      lower.includes("rpp02") ||
      lower.includes("pos-58") ||
      lower.includes("58mm")
    ) {
      this.elements.newPrinterPaper.value = "58mm";
    }
  },

  /**
   * Discovers and populates USB printers in the dropdown (Android USB Host & WebUSB)
   */
  async refreshUsbPrinterList() {
    if (!this.elements.newPrinterUsbSelect) return;
    const select = this.elements.newPrinterUsbSelect;
    select.innerHTML = '<option value="">-- Scanning for USB Printers... --</option>';

    this.detectedUsbDevices = [];

    // 1. Android Native Container Bridge (Direct USB OTG / Cable Connection)
    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        const rawDevices = await window.flutter_inappwebview.callHandler("scanUsbDevices");
        if (Array.isArray(rawDevices) && rawDevices.length > 0) {
          rawDevices.forEach((d) => {
            const devName = d.name || `USB Thermal Printer (${d.vendorId}:${d.productId})`;
            this.detectedUsbDevices.push({
              vendorId: d.vendorId,
              productId: d.productId,
              productName: devName,
              hasPermission: d.hasPermission
            });
          });
        }
      } catch (nativeErr) {
        console.warn("[PrinterUI] Error querying native USB devices:", nativeErr);
      }
    }

    // 2. Standard WebUSB API (Desktop Chrome / PWA Fallback)
    if (this.detectedUsbDevices.length === 0 && typeof navigator !== "undefined" && navigator.usb) {
      try {
        const webUsbDevices = await navigator.usb.getDevices();
        webUsbDevices.forEach((device) => {
          const devId = `${device.vendorId}_${device.productId}`;
          const name = device.productName || `USB POS Printer (${device.vendorId.toString(16)}:${device.productId.toString(16)})`;
          this.detectedUsbDevices.push({
            vendorId: device.vendorId,
            productId: device.productId,
            productName: name
          });
        });
      } catch (err) {
        console.warn("[PrinterUI] Error reading paired WebUSB devices:", err);
      }
    }

    select.innerHTML = '<option value="">-- Select Detected USB Printer --</option>';

    if (this.detectedUsbDevices.length === 0) {
      select.innerHTML = '<option value="">-- No USB Printers Detected (Plug in USB cable & click "Pair USB") --</option>';
      return;
    }

    this.detectedUsbDevices.forEach((device) => {
      const devId = `${device.vendorId}_${device.productId}`;
      const name = device.productName || `USB POS Printer (${device.vendorId}:${device.productId})`;
      const option = document.createElement("option");
      option.value = devId;
      option.textContent = `🔌 ${name}`;
      select.appendChild(option);
    });

    // Auto-select first device if only one connected
    if (this.detectedUsbDevices.length === 1) {
      select.value = `${this.detectedUsbDevices[0].vendorId}_${this.detectedUsbDevices[0].productId}`;
      this.handleUsbSelectChange();
    }
  },

  /**
   * Scans and pairs USB cable-connected printer (Android USB OTG & WebUSB)
   */
  async pairUsbPrinter() {
    // 1. Android Native Container Bridge
    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      await this.refreshUsbPrinterList();
      if (this.detectedUsbDevices.length > 0) {
        const first = this.detectedUsbDevices[0];
        const devId = `${first.vendorId}_${first.productId}`;
        if (this.elements.newPrinterUsbSelect) {
          this.elements.newPrinterUsbSelect.value = devId;
        }
        this.handleUsbSelectChange();
        try {
          await window.flutter_inappwebview.callHandler("requestUsbPermission", devId);
        } catch (_) {}
        alert(`✅ USB Thermal Printer Detected!\n\nDevice: ${first.productName}\nID: ${devId}\n\nSelected and permission prompt requested. Ready to save.`);
      } else {
        alert("🔍 Scanning for wired USB printer...\n\nNo USB printer detected via cable. Please ensure:\n1. The printer is powered ON.\n2. The USB cable / OTG adapter is securely plugged into this terminal.\n3. Tap 'Pair USB' again once connected.");
      }
      return;
    }

    // 2. Standard Browser WebUSB Fallback
    if (!navigator.usb) {
      alert("Wired USB printer direct detection requires running inside the Android POS application.\n\n(WebUSB is only supported in Chromium desktop browsers or inside the POS Android app).");
      return;
    }

    try {
      const filters = [
        { classCode: 7 },
        { vendorId: 0x0416 },
        { vendorId: 0x0483 },
        { vendorId: 0x04b8 },
        { vendorId: 0x1fc9 },
        { vendorId: 0x0fe6 },
        { vendorId: 0x28e9 }
      ];

      const device = await navigator.usb.requestDevice({ filters });
      if (device) {
        await this.refreshUsbPrinterList();
        const devId = `${device.vendorId}_${device.productId}`;
        if (this.elements.newPrinterUsbSelect) {
          this.elements.newPrinterUsbSelect.value = devId;
        }
        this.handleUsbSelectChange();
      }
    } catch (err) {
      if (err.name !== "NotFoundError") {
        alert(`USB Pairing Error: ${err.message}`);
      }
    }
  },

  /**
   * Automatically sets paper width and suggested name when a USB printer is chosen
   */
  handleUsbSelectChange() {
    if (!this.elements.newPrinterUsbSelect) return;
    const selectedVal = this.elements.newPrinterUsbSelect.value;
    if (!selectedVal) return;

    if (this.elements.newPrinterUsbPort) {
      this.elements.newPrinterUsbPort.value = selectedVal;
    }

    const device = this.detectedUsbDevices.find((d) => `${d.vendorId}_${d.productId}` === selectedVal);
    const prodName = device && device.productName ? device.productName : "";

    if (this.elements.newPrinterName && !this.elements.newPrinterName.value.trim()) {
      this.elements.newPrinterName.value = prodName || "Counter USB Printer";
    }

    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function" && selectedVal) {
      window.flutter_inappwebview.callHandler("requestUsbPermission", selectedVal).catch(() => {});
    }

    this.autoDetectPaperWidth(prodName);
  },

  /**
   * Loads printers from IndexedDB, applies interface filter, and renders roster
   * @param {string} filterType
   */
  async loadPrinterHub(filterType = "all") {
    if (!this.elements.printerListContainer) return;

    const allPrinters = await DB.getPrinters();
    const printers = filterType === "all"
      ? allPrinters
      : allPrinters.filter((p) => p.type === filterType || p.type === "all");

    if (printers.length === 0) {
      this.elements.printerListContainer.innerHTML = `
        <p class="printer-hint-text" style="text-align:center; padding:24px 12px; margin:0;">
          No ${filterType === "all" ? "" : filterType.toUpperCase() + " "}printers configured. Click "➕ Add New Printer" above to configure a unit.
        </p>
      `;
      return;
    }

    this.elements.printerListContainer.innerHTML = printers.map((p) => {
      let meta = "";
      if (p.type === "network") {
        meta = `TCP: ${p.address || "192.168.1.100"}:${p.port || 9100}`;
      } else if (p.type === "bluetooth") {
        meta = `${p.isBle ? "BLE" : "BT"}: ${p.btName || "KPrinter_fbce"}`;
      } else if (p.type === "usb") {
        meta = `USB Port: ${p.usbPort || "USB001"}`;
      } else if (p.type === "all") {
        meta = `Universal: ${p.address || "LAN"} | ${p.btName || "BT"} | ${p.usbPort || "USB"}`;
      }

      const currentRole = p.role || "primary";
      let roleBadgeClass = "badge-role-primary";
      if (currentRole === "secondary") roleBadgeClass = "badge-role-secondary";
      if (currentRole === "both") roleBadgeClass = "badge-role-both";

      const displayName = p.name && p.name.trim() ? p.name.trim() : "JK-5802H Receipt";

      return `
        <div class="printer-card" data-id="${p.id}">
          <div class="printer-card-left">
            <input 
              type="checkbox" 
              class="printer-checkbox" 
              data-id="${p.id}" 
              ${p.isEnabled ? "checked" : ""} 
              title="Enable or disable printing to this unit" 
            />
            <div class="printer-card-info">
              <span class="printer-card-title">
                <span class="printer-name-text">${displayName}</span>
                <span class="badge ${p.isBle ? 'badge-ble' : (p.type === 'network' ? '' : 'badge-admin')}">${p.isBle ? 'BLE' : p.type.toUpperCase()}</span>
                <span class="badge ${roleBadgeClass}">${currentRole.toUpperCase()}</span>
                <small style="font-weight:normal; opacity:0.8;">(${p.paperWidth || "58mm"})</small>
              </span>
              <span class="printer-card-meta">${meta}</span>
            </div>
          </div>
          <div class="printer-card-actions">
            <select class="printer-role-select" data-id="${p.id}" title="Assign Receipt Role">
              <option value="primary" ${currentRole === "primary" ? "selected" : ""}>Primary</option>
              <option value="secondary" ${currentRole === "secondary" ? "selected" : ""}>Secondary</option>
              <option value="both" ${currentRole === "both" ? "selected" : ""}>Both</option>
            </select>
            <button class="btn-action-sm btn-test-single-printer" data-id="${p.id}">Test</button>
            <button class="btn-action-sm btn-action-del btn-del-printer" data-id="${p.id}">Del</button>
          </div>
        </div>
      `;
    }).join("");

    this.elements.printerListContainer.scrollTop = 0;

    this.elements.printerListContainer.querySelectorAll(".printer-checkbox").forEach((cb) => {
      cb.onchange = async () => {
        await DB.togglePrinterEnabled(cb.dataset.id, cb.checked);
      };
    });

    this.elements.printerListContainer.querySelectorAll(".printer-role-select").forEach((sel) => {
      sel.onchange = async () => {
        await DB.setPrinterRole(sel.dataset.id, sel.value);
        await this.loadPrinterHub(this.currentFilter);
      };
    });

    this.elements.printerListContainer.querySelectorAll(".btn-test-single-printer").forEach((btn) => {
      btn.onclick = async () => {
        const target = await DB.getPrinterById(btn.dataset.id);
        if (target) {
          btn.disabled = true;
          btn.textContent = "...";
          try {
            const res = await Printer.testPrint(target);
            if (res && res.ok) {
              alert(`Test print dispatched successfully to [${(target.role || "primary").toUpperCase()}] ${target.name}.`);
            } else {
              const errMsg = (res && res.error) ? res.error : "Printer unreachable or connection error.";
              alert(`Test Print Failed for "${target.name}":\n\n${errMsg}`);
            }
          } catch (e) {
            alert(`Test Print Error: ${e.message}`);
          } finally {
            btn.disabled = false;
            btn.textContent = "Test";
          }
        }
      };
    });

    this.elements.printerListContainer.querySelectorAll(".btn-del-printer").forEach((btn) => {
      btn.onclick = async () => {
        if (confirm("Are you sure you want to remove this printer configuration?")) {
          await DB.deletePrinter(btn.dataset.id);
          await this.loadPrinterHub(this.currentFilter);
        }
      };
    });
  },

  async handleTestAllSelected() {
    const enabledPrinters = await DB.getEnabledPrinters();
    if (enabledPrinters.length === 0) {
      alert("No printers are currently checked. Select at least one printer to test.");
      return;
    }

    const testTicket = {
      orderNumber: "TEST-ALL",
      cashierName: "Admin Diagnostic",
      items: [
        { name: "Caramel Macchiato", qty: 2, price: 130.0 },
        { name: "Pork Sisig Rice", qty: 1, price: 165.0 }
      ],
      vatableSales: 379.46,
      vatAmount: 45.54,
      total: 425.0,
      paymentType: "TEST BROADCAST"
    };

    const results = await Printer.broadcastReceipt(enabledPrinters, testTicket);
    let failureCount = 0;
    let errorDetails = [];

    results.forEach((r, idx) => {
      const printer = enabledPrinters[idx];
      if (r.status === "rejected" || (r.value && !r.value.ok)) {
        failureCount++;
        const err = r.reason ? r.reason.message : (r.value && r.value.error ? r.value.error : "Failed");
        errorDetails.push(`• ${printer ? printer.name : "Printer"}: ${err}`);
      }
    });

    if (failureCount === 0) {
      alert("Broadcast test successfully printed across all selected printers.");
    } else {
      alert(`Test broadcast completed with ${failureCount} failure(s):\n\n${errorDetails.join("\n")}`);
    }
  },

  async handleSaveNewPrinter() {
    const name = this.elements.newPrinterName ? this.elements.newPrinterName.value.trim() : "";
    const type = this.elements.newPrinterType ? this.elements.newPrinterType.value : "all";
    const role = this.elements.newPrinterRole ? this.elements.newPrinterRole.value : "primary";
    let paperWidth = this.elements.newPrinterPaper ? this.elements.newPrinterPaper.value : "58mm";

    if (!name) {
      alert("Please enter a printer name or location.");
      return;
    }

    const payload = {
      name,
      type,
      role,
      paperWidth,
      isEnabled: true
    };

    if (type === "network" || type === "all") {
      payload.address = this.elements.newPrinterIp ? this.elements.newPrinterIp.value.trim() || "192.168.1.100" : "192.168.1.100";
      payload.port = this.elements.newPrinterPort ? parseInt(this.elements.newPrinterPort.value.trim(), 10) || 9100 : 9100;
    }
    if (type === "bluetooth" || type === "all") {
      const selectedBt = this.elements.newPrinterBtSelect ? this.elements.newPrinterBtSelect.value.trim() : "";
      const typedBt = this.elements.newPrinterBtName ? this.elements.newPrinterBtName.value.trim() : "";
      payload.btName = typedBt || selectedBt || "KPrinter_fbce";
      payload.isBle = this.elements.newPrinterIsBle ? this.elements.newPrinterIsBle.checked : false;

      const lowerName = payload.btName.toLowerCase();
      if (
        lowerName.includes("kprinter") || 
        lowerName.includes("fbce") || 
        lowerName.includes("jk-58") || 
        lowerName.includes("5802") || 
        lowerName.includes("58")
      ) {
        payload.paperWidth = "58mm";
        payload.isBle = true;
      }
    }
    if (type === "usb" || type === "all") {
      const selectedUsb = this.elements.newPrinterUsbSelect ? this.elements.newPrinterUsbSelect.value : "";
      payload.usbPort = selectedUsb || (this.elements.newPrinterUsbPort ? this.elements.newPrinterUsbPort.value.trim() : "") || "USB001";
      if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function" && payload.usbPort) {
        window.flutter_inappwebview.callHandler("requestUsbPermission", payload.usbPort).catch(() => {});
      }
    }

    await DB.addPrinter(payload);

    // Reset Form Fields
    if (this.elements.newPrinterName) this.elements.newPrinterName.value = "";
    if (this.elements.newPrinterBtName) this.elements.newPrinterBtName.value = "";
    if (this.elements.newPrinterBtSelect) this.elements.newPrinterBtSelect.value = "";
    if (this.elements.newPrinterIsBle) this.elements.newPrinterIsBle.checked = false;
    if (this.elements.newPrinterUsbPort) this.elements.newPrinterUsbPort.value = "";
    if (this.elements.newPrinterUsbSelect) this.elements.newPrinterUsbSelect.value = "";
    if (this.elements.newPrinterType) this.elements.newPrinterType.value = "all";
    this.handleInterfaceTypeChange();

    // Close dedicated Add Modal and refresh Main Hub
    if (this.elements.modalAddPrinter && this.elements.modalAddPrinter.open) {
      this.elements.modalAddPrinter.close();
    }

    await this.loadPrinterHub(this.currentFilter);
  }
};

// REMARK: PRINTER_UI_JS_DEDICATED_ADD_MODAL_COMPLETE