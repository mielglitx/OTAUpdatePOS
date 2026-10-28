/**
 * Module Description: Local Offline Storage Subsystem (Dexie.js / IndexedDB)
 * Persists staff accounts, product catalog, categories, completed sales orders,
 * line-item void audit logs, thermal printer hub hardware targets, store profile
 * configuration with granular Karinderya Mode feature flags (individual controls for
 * auto-cash tender, auto-GCash verification bypass, compact items-only receipts, and
 * pager suppression), cashier work shifts (drawer cash float reconciliations), customer-facing
 * dual-screen display styling, offline sync queues, and single-use Wi-Fi hotspot vouchers.
 * Includes zero-dependency embedded SVG product graphics and automatic database migration sweeps.
 */

// Fallback vector SVGs for categories and products (100% offline, zero network requests)
const SVG_CAT_ALL = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2364748b'><path d='M3 4h8v8H3V4zm10 0h8v8h-8V4zM3 14h8v8H3v-8zm10 0h8v8h-8v-8z'/></svg>";
const SVG_CAT_BEV = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2364748b'><path d='M2 19h18v2H2v-2zm18-8v-2h-2V3H4v6H2v2c0 2.21 1.79 4 4 4h8c1.86 0 3.41-1.28 3.86-3H18c1.1 0 2-.9 2-2zm-4-6v6H6V5h10zm2 6h-2V5h2v6z'/></svg>";
const SVG_CAT_MEALS = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2364748b'><path d='M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z'/></svg>";
const SVG_CAT_SNACKS = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2364748b'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z'/></svg>";

const SVG_PROD_COFFEE = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%230284c7'><path d='M2 21h18v-2H2v2zm18-12h-2V5H4v8c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-1h2c1.1 0 2-.9 2-2v-1c0-1.1-.9-2-2-2zm-4 4c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2V7h10v6zm2-1h-2V7h2v5z'/></svg>";
const SVG_PROD_MEAL = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2316a34a'><path d='M18 3c-2.76 0-5 2.24-5 5v5h2V3h3zm-7 0H9v6H7V3H5v6H3v2c0 2.21 1.79 4 4 4v6h2v-6c2.21 0 4-1.79 4-4V3h-2v6h-2V3z'/></svg>";
const SVG_PROD_SNACK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23d97706'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z'/></svg>";

if (typeof window.Dexie === "undefined") {
  throw new Error("[DB Init Error] Dexie.js is not loaded on the window object.");
}

// Initialize Dexie instance
const localDB = new window.Dexie("LokalexPOSDB");

// Define Stores and Database Migrations
localDB.version(1).stores({
  users: "id, pin, badgeCode, role",
  categories: "id, order",
  products: "id, cat, bc",
  orders: "++id, orderNumber, cashierId, timestamp",
  voidLogs: "++id, itemId, managerId, timestamp"
});

localDB.version(2).stores({
  printers: "id, name, type, isEnabled"
});

localDB.version(3).stores({
  printers: "id, name, type, role, isEnabled"
});

localDB.version(4).stores({
  orders: "++id, orderNumber, cashierId, synced, timestamp",
  settings: "key"
});

localDB.version(5).stores({
  products: "id, cat, bc, isMonitored, isAvailable",
  orders: "++id, orderNumber, cashierId, status, synced, timestamp",
  stockQueue: "id"
});

localDB.version(6).stores({
  categories: "id, order, isAddon"
});

localDB.version(7).stores({
  products: "id, cat, bc, isMonitored, isAvailable, createdAt"
});

localDB.version(8).stores({
  vouchers: "id, code, status, orderNumber, createdAt, consumedAt"
});

localDB.version(9).stores({
  shifts: "id, cashierId, cashierName, status, startTime, endTime",
  orders: "++id, orderNumber, cashierId, shiftId, status, synced, timestamp"
});

localDB.version(10).stores({
  tables: "id, name, section, status, activeOrderId"
});

export const DB = {
  instance: localDB,
  initPromise: null,

  /**
   * Initializes database, seeds master records if empty, and sanitizes image paths
   */
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      await localDB.open();

      // Resolve Dexie property collision:
      // Dexie creates localDB.tables as an internal Array of tables, preventing
      // localDB.table("tables").count() or .toArray(). We bind methods directly so both
      // localDB.table("tables") and localDB.tables work seamlessly across all modules.
      try {
        const tableStore = localDB.table("tables");
        if (Array.isArray(localDB.tables)) {
          localDB.tables.count = () => tableStore.count();
          localDB.tables.toArray = () => tableStore.toArray();
          localDB.tables.get = (k) => tableStore.get(k);
          localDB.tables.put = (item) => tableStore.put(item);
          localDB.tables.bulkPut = (items) => tableStore.bulkPut(items);
          localDB.tables.delete = (k) => tableStore.delete(k);
          localDB.tables.clear = () => tableStore.clear();
        }
      } catch (_) {}

      // 1. Seed Users if empty
      const userCount = await localDB.users.count();
      if (userCount === 0) {
        await localDB.users.bulkAdd([
          {
            id: "USR-001",
            name: "Amiel (Staff)",
            pin: "1234",
            badgeCode: "STAFF-01",
            role: "user"
          },
          {
            id: "ADM-001",
            name: "Amiel (Admin)",
            pin: "8821",
            badgeCode: "MGR-AUTH-8821",
            role: "admin"
          }
        ]);
      }

      // 2. Seed Categories if empty
      const catCount = await localDB.categories.count();
      if (catCount === 0) {
        await localDB.categories.bulkAdd([
          { id: "all", name: "All Items", image: SVG_CAT_ALL, order: 1, isAddon: false },
          { id: "beverages", name: "Beverages", image: SVG_CAT_BEV, order: 2, isAddon: false },
          { id: "meals", name: "Meals", image: SVG_CAT_MEALS, order: 3, isAddon: false },
          { id: "snacks", name: "Snacks", image: SVG_CAT_SNACKS, order: 4, isAddon: false }
        ]);
      }

      // 3. Seed Products if empty
      const prodCount = await localDB.products.count();
      if (prodCount === 0) {
        await localDB.products.bulkAdd([
          {
            id: "P1",
            name: "Iced Americano",
            price: 110.0,
            cat: "beverages",
            bc: "1001",
            image: SVG_PROD_COFFEE,
            isMonitored: false,
            stock: 0,
            threshold: null,
            isAvailable: true,
            createdAt: "2026-01-01T08:00:00.000Z"
          },
          {
            id: "P2",
            name: "Cafe Latte",
            price: 130.0,
            cat: "beverages",
            bc: "1002",
            image: SVG_PROD_COFFEE,
            isMonitored: false,
            stock: 0,
            threshold: null,
            isAvailable: true,
            createdAt: "2026-01-01T08:05:00.000Z"
          },
          {
            id: "P3",
            name: "Pork Sisig Rice",
            price: 165.0,
            cat: "meals",
            bc: "1003",
            image: SVG_PROD_MEAL,
            isMonitored: true,
            stock: 15,
            threshold: 5,
            isAvailable: true,
            createdAt: "2026-01-01T08:10:00.000Z"
          },
          {
            id: "P4",
            name: "Choco Crinkles",
            price: 75.0,
            cat: "snacks",
            bc: "1004",
            image: SVG_PROD_SNACK,
            isMonitored: true,
            stock: 24,
            threshold: 6,
            isAvailable: true,
            createdAt: "2026-01-01T08:15:00.000Z"
          }
        ]);
      } else {
        // Migration Sweep: Sanitize existing products that reference missing physical image files
        const existingProducts = await localDB.products.toArray();
        for (const prod of existingProducts) {
          if (prod.image && (prod.image.includes(".png") || prod.image.startsWith("img/"))) {
            let cleanSvg = SVG_PROD_COFFEE;
            if (prod.cat === "meals") cleanSvg = SVG_PROD_MEAL;
            else if (prod.cat === "snacks") cleanSvg = SVG_PROD_SNACK;
            await localDB.products.update(prod.id, { image: cleanSvg });
          }
        }
      }

      // 4. Seed Printers if empty
      const printerCount = await localDB.printers.count();
      if (printerCount === 0) {
        await localDB.printers.bulkAdd([
          {
            id: "PRN-001",
            name: "Cashier Counter Thermal",
            type: "network",
            role: "primary",
            address: "192.168.1.100",
            port: 9100,
            paperWidth: "58mm",
            isBle: false,
            isEnabled: true
          }
        ]);
      }

      // 5. Seed Default Cloud Sync Settings if empty
      const syncSetting = await localDB.settings.get("cloud_sync");
      if (!syncSetting) {
        await localDB.settings.put({
          key: "cloud_sync",
          source: "firebase",
          firebaseUrl: "",
          firebaseAuth: "",
          gasUrl: "",
          gasSecret: "",
          lastSync: null
        });
      }

      // 6. Seed Default Store Profile & MikroTik Settings if empty
      const storeSetting = await localDB.settings.get("store_settings");
      if (!storeSetting) {
        await localDB.settings.put({
          key: "store_settings",
          storeName: "LOKALEX STORE",
          companyName: "Lokalex Delivery Services",
          address: "Camiling, Tarlac, Philippines",
          contactNumber: "0917-123-4567",
          tagline: "Fast, Fresh & Local Delivery",
          logoBase64: "",
          gcashName: "",
          gcashNumber: "",
          gcashQrBase64: "",
          gcashQrPayload: "",
          useNumberPager: false,
          pagerCount: 24,
          defaultInitialCash: 1000.0,
          karinderyaMode: false,
          karinderyaAutoCash: true,
          karinderyaAutoGCash: true,
          karinderyaCompactReceipt: true,
          karinderyaSuppressPager: true,
          karinderyaVoucherOnly: false,
          hotspotEnabled: false,
          hotspotRouterIp: "192.168.88.1",
          hotspotPort: 80,
          hotspotProtocol: "http",
          hotspotUsername: "pos-terminal",
          hotspotPassword: "",
          hotspotDomain: "hotspot.lokalex.local",
          hotspotProfile: "pos-customer",
          hotspotUptime: "2h",
          hotspotRateLimit: "2M/5M",
          hotspotSharedUsers: "1",
          hotspotAutoPrint: true
        });
      }

      // 7. Seed Default Secondary Customer Display Settings if empty
      const displaySetting = await localDB.settings.get("display_settings");
      if (!displaySetting) {
        await localDB.settings.put({
          key: "display_settings",
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
          componentsOrder: ["header", "cart", "bill", "total", "pager", "payment", "footer"],
          photoPresentationEnabled: true,
          photoDisplayMode: "lineup",
          photoInterval: 5,
          photoFitMode: "cover",
          photoLayoutPlacement: "adaptive",
          photos: []
        });
      }

      // 8. Seed Default Table Layout Settings & Tables if empty
      const tableSetting = await localDB.settings.get("table_settings");
      if (!tableSetting) {
        await localDB.settings.put({
          key: "table_settings",
          enabled: true,
          layoutType: "restaurant",
          sections: ["Main Dining", "Patio / Outdoor", "VIP / Function"],
          autoClearOnPayment: true,
          requireTableOnDineIn: false
        });
      }

      const tablesCount = await localDB.table("tables").count();
      if (tablesCount === 0) {
        await localDB.table("tables").bulkPut([
          { id: "TBL-01", name: "Table 1", section: "Main Dining", seats: 2, shape: "square", status: "available", posX: 20, posY: 20, activeOrderId: null, guestCount: 0 },
          { id: "TBL-02", name: "Table 2", section: "Main Dining", seats: 4, shape: "square", status: "available", posX: 140, posY: 20, activeOrderId: null, guestCount: 0 },
          { id: "TBL-03", name: "Table 3", section: "Main Dining", seats: 4, shape: "square", status: "available", posX: 260, posY: 20, activeOrderId: null, guestCount: 0 },
          { id: "TBL-04", name: "Table 4", section: "Main Dining", seats: 6, shape: "rectangle", status: "available", posX: 380, posY: 20, activeOrderId: null, guestCount: 0 },
          { id: "TBL-05", name: "Table 5", section: "Main Dining", seats: 2, shape: "round", status: "available", posX: 20, posY: 140, activeOrderId: null, guestCount: 0 },
          { id: "TBL-06", name: "Table 6", section: "Main Dining", seats: 4, shape: "round", status: "available", posX: 140, posY: 140, activeOrderId: null, guestCount: 0 },
          { id: "TBL-07", name: "Table 7", section: "Patio / Outdoor", seats: 4, shape: "square", status: "available", posX: 20, posY: 20, activeOrderId: null, guestCount: 0 },
          { id: "TBL-08", name: "Table 8", section: "Patio / Outdoor", seats: 4, shape: "square", status: "available", posX: 140, posY: 20, activeOrderId: null, guestCount: 0 },
          { id: "TBL-09", name: "VIP Room 1", section: "VIP / Function", seats: 8, shape: "rectangle", status: "available", posX: 20, posY: 20, activeOrderId: null, guestCount: 0 }
        ]);
      }
    })();

    return this.initPromise;
  },

  /**
   * Customer-Facing Display Customization Settings
   */
  async getDisplaySettings() {
    const settings = await localDB.settings.get("display_settings");
    const defaults = {
      key: "display_settings",
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
      componentsOrder: ["header", "cart", "slideshow", "bill", "total", "pager", "payment", "footer"],
      photoPresentationEnabled: true,
      photoDisplayMode: "lineup",
      photoInterval: 5,
      photoFitMode: "cover",
      photoLayoutPlacement: "adaptive",
      photos: []
    };
    const res = { ...defaults, ...(settings || {}) };
    if (res.componentsOrder && !res.componentsOrder.includes("slideshow")) {
      const idx = res.componentsOrder.indexOf("cart");
      if (idx !== -1) {
        res.componentsOrder.splice(idx + 1, 0, "slideshow");
      } else {
        res.componentsOrder.push("slideshow");
      }
    }
    return res;
  },

  async saveDisplaySettings(updates) {
    const current = await this.getDisplaySettings();
    const merged = { ...current, ...updates, key: "display_settings" };
    // Enforce maximum 20 photos constraint
    if (Array.isArray(merged.photos) && merged.photos.length > 20) {
      merged.photos = merged.photos.slice(0, 20);
    }
    await localDB.settings.put(merged);

    try {
      localStorage.setItem("pos_display_settings", JSON.stringify(merged));
    } catch (_) {
      try {
        const lightweight = {
          ...merged,
          photos: (merged.photos || []).map((p) => ({
            id: p.id,
            name: p.name,
            caption: p.caption,
            order: p.order
          }))
        };
        localStorage.setItem("pos_display_settings", JSON.stringify(lightweight));
      } catch (__) {}
    }

    try {
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel("pos_customer_display");
        channel.postMessage({ type: "display:updated", data: merged });
      }
    } catch (_) {}

    return merged;
  },

  /**
   * Customer Display Photo Presentation Helpers (Max 20 Photos)
   */
  async getDisplayPhotos() {
    const settings = await this.getDisplaySettings();
    return settings.photos || [];
  },

  async saveDisplayPhotos(photosList) {
    if (!Array.isArray(photosList)) return [];
    const capped = photosList.slice(0, 20).map((p, idx) => ({
      ...p,
      order: typeof p.order === "number" ? p.order : idx + 1
    }));
    await this.saveDisplaySettings({ photos: capped });
    return capped;
  },

  /**
   * Store Settings & Profile Configuration (With Granular Karinderya Controls)
   */
  async getStoreSettings() {
    const settings = await localDB.settings.get("store_settings");
    const defaults = {
      key: "store_settings",
      storeName: "LOKALEX STORE",
      companyName: "Lokalex Delivery Services",
      address: "Camiling, Tarlac, Philippines",
      contactNumber: "0917-123-4567",
      tagline: "Fast, Fresh & Local Delivery",
      logoBase64: "",
      gcashName: "",
      gcashNumber: "",
      gcashQrBase64: "",
      gcashQrPayload: "",
      useNumberPager: false,
      pagerCount: 24,
      defaultInitialCash: 1000.0,
      autoOpenDrawer: true,
      karinderyaMode: false,
      karinderyaAutoCash: true,
      karinderyaAutoGCash: true,
      karinderyaCompactReceipt: true,
      karinderyaSuppressPager: true,
      karinderyaVoucherOnly: false,
      hotspotEnabled: false,
      hotspotRouterIp: "192.168.88.1",
      hotspotPort: 80,
      hotspotProtocol: "http",
      hotspotUsername: "pos-terminal",
      hotspotPassword: "",
      hotspotDomain: "hotspot.lokalex.local",
      hotspotProfile: "pos-customer",
      hotspotUptime: "2h",
      hotspotRateLimit: "2M/5M",
      hotspotSharedUsers: "1",
      hotspotAutoPrint: true
    };
    return { ...defaults, ...(settings || {}) };
  },

  async saveStoreSettings(updates) {
    const current = await this.getStoreSettings();
    const merged = { ...current, ...updates, key: "store_settings" };
    await localDB.settings.put(merged);

    try {
      localStorage.setItem("pos_store_settings", JSON.stringify(merged));
      if (merged.autoOpenDrawer !== undefined) {
        localStorage.setItem("pos_auto_open_drawer", String(merged.autoOpenDrawer));
      }
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel("pos_customer_display");
        channel.postMessage({ type: "store:updated", data: merged });
      }
    } catch (_) {}

    return merged;
  },

  // ===========================================================================
  // CASHIER SHIFT MANAGEMENT & DRAWER CASH RECONCILIATION
  // ===========================================================================

  async getActiveShift(cashierId = null) {
    if (cashierId) {
      return await localDB.shifts
        .where("cashierId")
        .equals(cashierId)
        .filter((s) => s.status === "OPEN")
        .first();
    }
    return await localDB.shifts.where("status").equals("OPEN").first();
  },

  async startShift(cashier, initialCash = 1000.0) {
    const existing = await this.getActiveShift(cashier.id);
    if (existing) {
      return existing;
    }

    const newShift = {
      id: `SHIFT-${Date.now().toString().slice(-6)}`,
      cashierId: cashier.id || "USR-001",
      cashierName: cashier.name || "Cashier",
      initialCash: Math.max(0, Number(initialCash) || 0.0),
      status: "OPEN",
      startTime: new Date().toISOString(),
      endTime: null,
      note: ""
    };

    await localDB.shifts.add(newShift);
    return newShift;
  },

  async closeShift(shiftId, note = "") {
    const shift = await localDB.shifts.get(shiftId);
    if (!shift) return null;

    const updated = {
      ...shift,
      status: "CLOSED",
      endTime: new Date().toISOString(),
      note: note || shift.note || ""
    };

    await localDB.shifts.put(updated);
    return updated;
  },

  async getShifts() {
    return await localDB.shifts.reverse().sortBy("startTime");
  },

  async getShiftById(id) {
    return await localDB.shifts.get(id);
  },

  // ===========================================================================
  // MIKROTIK HOTSPOT VOUCHERS SUB-SYSTEM
  // ===========================================================================

  async getVouchers() {
    return await localDB.vouchers.reverse().sortBy("createdAt");
  },

  async getAvailableVouchersCount() {
    return await localDB.vouchers.where("status").equals("AVAILABLE").count();
  },

  async saveVouchers(vouchersArray) {
    if (!Array.isArray(vouchersArray) || vouchersArray.length === 0) return;
    await localDB.vouchers.bulkPut(vouchersArray);
  },

  async getNextAvailableVoucher() {
    return await localDB.vouchers.where("status").equals("AVAILABLE").first();
  },

  async consumeLocalVoucher(code, orderNumber) {
    const voucher = await localDB.vouchers.where("code").equals(code).first();
    if (!voucher) return null;

    const updated = {
      ...voucher,
      status: "CONSUMED",
      orderNumber,
      consumedAt: new Date().toISOString()
    };

    await localDB.vouchers.put(updated);
    return updated;
  },

  async clearConsumedVouchers() {
    return await localDB.vouchers.where("status").equals("CONSUMED").delete();
  },

  // ===========================================================================
  // CLOUD SYNC CONFIGURATION
  // ===========================================================================

  async getSyncConfig() {
    const config = await localDB.settings.get("cloud_sync");
    return config || {
      source: "firebase",
      firebaseUrl: "",
      firebaseAuth: "",
      gasUrl: "",
      gasSecret: "",
      lastSync: null
    };
  },

  async saveSyncConfig(updates) {
    const current = await this.getSyncConfig();
    const merged = { ...current, ...updates, key: "cloud_sync" };
    await localDB.settings.put(merged);
    return merged;
  },

  async getUnsyncedOrders() {
    return await localDB.orders.filter((ord) => ord.synced === 0 || !ord.synced).toArray();
  },

  async markOrdersAsSynced(orderIds) {
    if (!orderIds || orderIds.length === 0) return;
    await localDB.transaction("rw", localDB.orders, async () => {
      for (const id of orderIds) {
        await localDB.orders.update(id, { synced: 1 });
      }
    });
  },

  async getUnsyncedStock() {
    const queueEntries = await localDB.stockQueue.toArray();
    if (queueEntries.length === 0) return {};

    const stockMap = {};
    for (const item of queueEntries) {
      const prod = await localDB.products.get(item.id);
      if (prod && prod.isMonitored) {
        stockMap[item.id] = {
          stock: typeof prod.stock === "number" ? prod.stock : 0,
          isAvailable: Boolean(prod.isAvailable)
        };
      }
    }
    return stockMap;
  },

  async clearStockQueue(productIds) {
    if (!productIds || productIds.length === 0) return;
    await localDB.transaction("rw", localDB.stockQueue, async () => {
      for (const id of productIds) {
        await localDB.stockQueue.delete(id);
      }
    });
  },

  async syncUpsertCatalog(remoteCategories, remoteProducts) {
    await localDB.transaction("rw", localDB.categories, localDB.products, async () => {
      if (Array.isArray(remoteCategories) && remoteCategories.length > 0) {
        await localDB.categories.bulkPut(remoteCategories);
      }
      if (Array.isArray(remoteProducts) && remoteProducts.length > 0) {
        await localDB.products.bulkPut(remoteProducts);
      }
    });
  },

  // ===========================================================================
  // THERMAL PRINTER HUB HARDWARE PROFILES
  // ===========================================================================

  async getPrinters() {
    return await localDB.printers.toArray();
  },

  async getEnabledPrinters() {
    return await localDB.printers.filter((p) => Boolean(p.isEnabled)).toArray();
  },

  async getPrinterById(id) {
    return await localDB.printers.where("id").equals(id).first();
  },

  async addPrinter(printer) {
    const newPrinter = {
      id: printer.id || `PRN-${Date.now().toString().slice(-4)}`,
      name: (printer.name || "").trim(),
      type: printer.type || "network",
      role: printer.role || "primary",
      address: (printer.address || "").trim(),
      port: parseInt(printer.port, 10) || 9100,
      btName: (printer.btName || "").trim(),
      usbPort: (printer.usbPort || "").trim(),
      paperWidth: printer.paperWidth || "58mm",
      isBle: Boolean(printer.isBle),
      isEnabled: printer.isEnabled !== undefined ? Boolean(printer.isEnabled) : true
    };
    await localDB.printers.add(newPrinter);
    return newPrinter;
  },

  async updatePrinter(id, updates) {
    const formatted = { ...updates };
    if (formatted.name !== undefined) formatted.name = formatted.name.trim();
    if (formatted.address !== undefined) formatted.address = formatted.address.trim();
    if (formatted.port !== undefined) formatted.port = parseInt(formatted.port, 10) || 9100;
    if (formatted.btName !== undefined) formatted.btName = formatted.btName.trim();
    if (formatted.usbPort !== undefined) formatted.usbPort = formatted.usbPort.trim();
    if (formatted.isBle !== undefined) formatted.isBle = Boolean(formatted.isBle);
    if (formatted.isEnabled !== undefined) formatted.isEnabled = Boolean(formatted.isEnabled);

    await localDB.printers.update(id, formatted);
    return await this.getPrinterById(id);
  },

  async setPrinterRole(id, role) {
    const targetRole = ["primary", "secondary", "both"].includes(role) ? role : "primary";
    await localDB.printers.update(id, { role: targetRole });
    return await this.getPrinterById(id);
  },

  async togglePrinterEnabled(id, isEnabled) {
    await localDB.printers.update(id, { isEnabled: Boolean(isEnabled) });
    return await this.getPrinterById(id);
  },

  async deletePrinter(id) {
    return await localDB.printers.delete(id);
  },

  // ===========================================================================
  // CATEGORIES & PRODUCTS
  // ===========================================================================

  async getCategories() {
    return await localDB.categories.orderBy("order").toArray();
  },

  async getCategoryById(id) {
    return await localDB.categories.where("id").equals(id).first();
  },

  async getAddonCategories() {
    return await localDB.categories.filter((c) => Boolean(c.isAddon)).toArray();
  },

  async addCategory(category) {
    const slug = (category.name || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const newCategory = {
      id: category.id || slug || `cat-${Date.now().toString().slice(-4)}`,
      name: (category.name || "").trim(),
      order: parseInt(category.order, 10) || 99,
      image: category.image || SVG_CAT_ALL,
      isAddon: Boolean(category.isAddon)
    };

    await localDB.categories.add(newCategory);
    return newCategory;
  },

  async updateCategory(id, updates) {
    const formatted = { ...updates };
    if (formatted.name !== undefined) formatted.name = formatted.name.trim();
    if (formatted.order !== undefined) formatted.order = parseInt(formatted.order, 10) || 99;
    if (formatted.isAddon !== undefined) formatted.isAddon = Boolean(formatted.isAddon);
    await localDB.categories.update(id, formatted);
    return await this.getCategoryById(id);
  },

  async updateCategoryOrders(orderList) {
    if (!Array.isArray(orderList) || orderList.length === 0) return;
    await localDB.transaction("rw", localDB.categories, async () => {
      for (const item of orderList) {
        await localDB.categories.update(item.id, { order: parseInt(item.order, 10) || 1 });
      }
    });
  },

  async deleteCategory(id) {
    if (id === "all") throw new Error("Cannot delete root 'all' category.");
    return await localDB.categories.delete(id);
  },

  async getProducts(category = "all") {
    if (category === "all") {
      return await localDB.products.toArray();
    }
    return await localDB.products.where("cat").equals(category).toArray();
  },

  async getAddonProducts() {
    const addonCategories = await this.getAddonCategories();
    if (addonCategories.length === 0) return [];
    const addonCatIds = new Set(addonCategories.map((c) => c.id));
    return await localDB.products.filter((p) => addonCatIds.has(p.cat)).toArray();
  },

  async getProductByBarcode(barcode) {
    return await localDB.products.where("bc").equals(barcode).first();
  },

  async getProductById(id) {
    return await localDB.products.where("id").equals(id).first();
  },

  async addProduct(product) {
    const isMon = Boolean(product.isMonitored);
    const stockVal = isMon ? Math.max(0, parseInt(product.stock, 10) || 0) : 0;
    const isAvailable = isMon ? stockVal > 0 : product.isAvailable !== false;

    let defaultSvg = SVG_PROD_COFFEE;
    if (product.cat === "meals") defaultSvg = SVG_PROD_MEAL;
    else if (product.cat === "snacks") defaultSvg = SVG_PROD_SNACK;

    const newProduct = {
      id: product.id || `P${Date.now().toString().slice(-5)}`,
      name: (product.name || "").trim(),
      price: Math.max(0, Number(product.price) || 0.0),
      cat: product.cat || "all",
      bc: (product.bc || "").trim(),
      image: product.image || defaultSvg,
      isMonitored: isMon,
      stock: stockVal,
      threshold: product.threshold !== null && product.threshold !== undefined && product.threshold !== ""
        ? Math.max(0, parseInt(product.threshold, 10) || 0)
        : null,
      isAvailable,
      createdAt: product.createdAt || new Date().toISOString()
    };

    await localDB.products.add(newProduct);
    if (isMon) {
      await localDB.stockQueue.put({ id: newProduct.id });
    }
    return newProduct;
  },

  async updateProduct(id, updates) {
    const formatted = { ...updates };
    if (formatted.price !== undefined) formatted.price = Math.max(0, Number(formatted.price) || 0.0);
    if (formatted.name !== undefined) formatted.name = formatted.name.trim();
    if (formatted.bc !== undefined) formatted.bc = formatted.bc.trim();
    if (formatted.stock !== undefined) {
      formatted.stock = Math.max(0, parseInt(formatted.stock, 10) || 0);
      if (formatted.isMonitored || updates.isMonitored) {
        formatted.isAvailable = formatted.stock > 0;
      }
    }

    await localDB.products.update(id, formatted);
    const prod = await this.getProductById(id);
    if (prod && prod.isMonitored) {
      await localDB.stockQueue.put({ id: prod.id });
    }
    return prod;
  },

  async deleteProduct(id) {
    await localDB.stockQueue.delete(id);
    return await localDB.products.delete(id);
  },

  // ===========================================================================
  // USERS & AUTHENTICATION
  // ===========================================================================

  async getUsers() {
    return await localDB.users.toArray();
  },

  async getUserById(id) {
    return await localDB.users.where("id").equals(id).first();
  },

  async authenticateUser(pinOrBadge) {
    const trimmed = String(pinOrBadge).trim();
    const user = await localDB.users
      .filter((u) => u.pin === trimmed || u.badgeCode === trimmed)
      .first();

    return user || null;
  },

  async verifyManagerBadge(badgeOrPin) {
    const user = await this.authenticateUser(badgeOrPin);
    if (user && (user.role === "admin" || user.role === "manager")) {
      return user;
    }
    return null;
  },

  async addUser(user) {
    const newUser = {
      id: user.id || `USR-${Date.now().toString().slice(-4)}`,
      name: (user.name || "").trim(),
      pin: String(user.pin).trim(),
      badgeCode: (user.badgeCode || "").trim(),
      role: user.role === "admin" || user.role === "manager" ? user.role : "user"
    };
    await localDB.users.add(newUser);
    return newUser;
  },

  async updateUser(id, updates) {
    const formatted = { ...updates };
    if (formatted.name !== undefined) formatted.name = formatted.name.trim();
    if (formatted.pin !== undefined) formatted.pin = String(formatted.pin).trim();
    if (formatted.badgeCode !== undefined) formatted.badgeCode = (formatted.badgeCode || "").trim();
    if (formatted.role !== undefined) {
      formatted.role = formatted.role === "admin" || formatted.role === "manager" ? formatted.role : "user";
    }
    await localDB.users.update(id, formatted);
    return await this.getUserById(id);
  },

  async deleteUser(id) {
    return await localDB.users.delete(id);
  },

  // ===========================================================================
  // ORDER PERSISTENCE WITH ACTIVE SHIFT LINKING
  // ===========================================================================

  async saveOrder(orderData) {
    const sanitizedItems = (orderData.items || []).map((item) => ({
      id: item.id,
      name: item.name || "Item",
      price: Math.max(0, Number(item.price) || 0.0),
      qty: Math.max(1, parseInt(item.qty, 10) || 1)
    }));

    let activeShiftId = orderData.shiftId || null;
    if (!activeShiftId) {
      const activeShift = await this.getActiveShift(orderData.cashierId);
      if (activeShift) {
        activeShiftId = activeShift.id;
      }
    }

    const record = {
      orderNumber: orderData.orderNumber || `ORD-${Date.now().toString().slice(-6)}`,
      shiftId: activeShiftId,
      cashierId: orderData.cashierId || "STAFF-01",
      cashierName: orderData.cashierName || "Cashier",
      items: sanitizedItems,
      vatableSales: Math.max(0, Number(orderData.vatableSales) || 0.0),
      vatAmount: Math.max(0, Number(orderData.vatAmount) || 0.0),
      total: Math.max(0, Number(orderData.total) || 0.0),
      paymentType: orderData.paymentType || "CASH",
      amountTendered: orderData.amountTendered ? Math.max(0, Number(orderData.amountTendered)) : null,
      changeAmount: orderData.changeAmount ? Math.max(0, Number(orderData.changeAmount)) : null,
      gcashRefNo: orderData.gcashRefNo || null,
      gcashAmountPaid: orderData.gcashAmountPaid ? Math.max(0, Number(orderData.gcashAmountPaid)) : null,
      gcashPaymentDate: orderData.gcashPaymentDate || null,
      pagerNumber: orderData.pagerNumber || null,
      voucher: orderData.voucher || null,
      status: "COMPLETED",
      timestamp: new Date().toISOString(),
      synced: 0
    };

    let insertedId;

    await localDB.transaction("rw", [localDB.orders, localDB.products, localDB.stockQueue], async () => {
      insertedId = await localDB.orders.add(record);

      for (const item of sanitizedItems) {
        const product = await localDB.products.get(item.id);
        if (product && product.isMonitored) {
          const currentStock = typeof product.stock === "number" ? product.stock : 0;
          const updatedStock = Math.max(0, currentStock - item.qty);
          await localDB.products.update(item.id, {
            stock: updatedStock,
            isAvailable: updatedStock > 0
          });
          await localDB.stockQueue.put({ id: item.id });
        }
      }
    });

    return { ...record, id: insertedId };
  },

  async voidOrder(orderIdOrNumber, manager, reason = "Manager Void") {
    let order;
    if (typeof orderIdOrNumber === "number") {
      order = await localDB.orders.get(orderIdOrNumber);
    } else {
      order = await localDB.orders.where("orderNumber").equals(orderIdOrNumber).first();
    }

    if (!order) {
      throw new Error(`Order ${orderIdOrNumber} not found.`);
    }

    if (order.status === "VOIDED") {
      throw new Error(`Order ${order.orderNumber} has already been voided.`);
    }

    await localDB.transaction("rw", [localDB.orders, localDB.products, localDB.stockQueue, localDB.voidLogs], async () => {
      await localDB.orders.update(order.id, {
        status: "VOIDED",
        voidedAt: new Date().toISOString(),
        voidedBy: manager ? manager.name || manager.id : "Manager",
        voidReason: reason,
        synced: 0
      });

      for (const item of order.items || []) {
        const product = await localDB.products.get(item.id);
        if (product && product.isMonitored) {
          const currentStock = typeof product.stock === "number" ? product.stock : 0;
          const restoredStock = currentStock + (parseInt(item.qty, 10) || 1);
          await localDB.products.update(item.id, {
            stock: restoredStock,
            isAvailable: true
          });
          await localDB.stockQueue.put({ id: item.id });
        }
      }

      await localDB.voidLogs.add({
        orderNumber: order.orderNumber,
        total: order.total,
        managerId: manager ? manager.id : "MGR-001",
        managerName: manager ? manager.name : "Manager",
        reason,
        timestamp: new Date().toISOString()
      });
    });

    return await localDB.orders.get(order.id);
  },

  async getAllOrders() {
    return await localDB.orders.reverse().sortBy("timestamp");
  },

  async getOrderById(id) {
    return await localDB.orders.get(id);
  },

  async getSalesSummary(shiftFilter = null) {
    let allOrders = await localDB.orders.toArray();
    let initialCash = 0.0;
    let selectedShift = null;

    if (shiftFilter && shiftFilter !== "all") {
      if (shiftFilter === "active") {
        selectedShift = await this.getActiveShift();
      } else {
        selectedShift = await localDB.shifts.get(shiftFilter);
      }

      if (selectedShift) {
        initialCash = Number(selectedShift.initialCash) || 0.0;
        allOrders = allOrders.filter((ord) => {
          if (ord.shiftId && ord.shiftId === selectedShift.id) {
            return true;
          }
          if (ord.cashierId === selectedShift.cashierId) {
            const ordTime = ord.timestamp;
            if (ordTime >= selectedShift.startTime) {
              return !selectedShift.endTime || ordTime <= selectedShift.endTime;
            }
          }
          return false;
        });
      }
    } else {
      const activeShift = await this.getActiveShift();
      if (activeShift) {
        initialCash = Number(activeShift.initialCash) || 0.0;
      }
    }

    let grossSales = 0.0;
    let totalVat = 0.0;
    let cashSales = 0.0;
    let gcashSales = 0.0;
    let completedCount = 0;
    let voidedCount = 0;
    let voidedSales = 0.0;

    for (const order of allOrders) {
      if (order.status === "VOIDED") {
        voidedCount++;
        voidedSales += Number(order.total) || 0;
        continue;
      }

      completedCount++;
      grossSales += Number(order.total) || 0;
      totalVat += Number(order.vatAmount) || 0;
      if (order.paymentType === "CASH") {
        cashSales += Number(order.total) || 0;
      } else {
        gcashSales += Number(order.total) || 0;
      }
    }

    const grossCashDrawer = initialCash + cashSales;

    return {
      shift: selectedShift,
      initialCash: Number(initialCash.toFixed(2)),
      grossCashDrawer: Number(grossCashDrawer.toFixed(2)),
      orderCount: completedCount,
      voidedCount,
      voidedSales: Number(voidedSales.toFixed(2)),
      grossSales: Number(grossSales.toFixed(2)),
      totalVat: Number(totalVat.toFixed(2)),
      cashSales: Number(cashSales.toFixed(2)),
      gcashSales: Number(gcashSales.toFixed(2))
    };
  },

  async logVoid(item, manager) {
    return await localDB.voidLogs.add({
      itemId: item.id,
      itemName: item.name,
      price: Number(item.price) || 0.0,
      qty: parseInt(item.qty, 10) || 1,
      managerId: manager ? manager.id : "MGR-001",
      managerName: manager ? manager.name : "Manager",
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Clears transactions based on selected scope ('today', 'week', 'month', 'all')
   * @param {'today' | 'week' | 'month' | 'all'} scope 
   * @returns {Promise<{ deletedCount: number, scope: string }>}
   */
  async clearOrdersByScope(scope = "today") {
    const allOrders = await localDB.orders.toArray();
    let toDeleteIds = [];
    const now = new Date();

    if (scope === "all") {
      toDeleteIds = allOrders.map((o) => o.id);
    } else if (scope === "today") {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      toDeleteIds = allOrders.filter((o) => new Date(o.timestamp) >= startOfDay).map((o) => o.id);
    } else if (scope === "week") {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay(); // 0 is Sunday
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);
      toDeleteIds = allOrders.filter((o) => new Date(o.timestamp) >= startOfWeek).map((o) => o.id);
    } else if (scope === "month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      toDeleteIds = allOrders.filter((o) => new Date(o.timestamp) >= startOfMonth).map((o) => o.id);
    }

    if (toDeleteIds.length > 0) {
      await localDB.orders.bulkDelete(toDeleteIds);
    }

    return { deletedCount: toDeleteIds.length, scope };
  },

  /**
   * Returns count of orders matching a scope without deleting
   * @param {'today' | 'week' | 'month' | 'all'} scope 
   * @returns {Promise<number>}
   */
  async getOrderCountByScope(scope = "today") {
    const allOrders = await localDB.orders.toArray();
    const now = new Date();

    if (scope === "all") return allOrders.length;
    if (scope === "today") {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return allOrders.filter((o) => new Date(o.timestamp) >= startOfDay).length;
    }
    if (scope === "week") {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);
      return allOrders.filter((o) => new Date(o.timestamp) >= startOfWeek).length;
    }
    if (scope === "month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return allOrders.filter((o) => new Date(o.timestamp) >= startOfMonth).length;
    }
    return 0;
  },

  /**
   * =============================================================
   * TABLE LAYOUT & DINING CONFIGURATION SYSTEM (Cafe, Restaurant, Canteen)
   * =============================================================
   */
  async getTableSettings() {
    const settings = await localDB.settings.get("table_settings");
    const defaults = {
      key: "table_settings",
      enabled: true,
      layoutType: "restaurant", // "cafe" | "restaurant" | "canteen"
      sections: ["Main Dining", "Patio / Outdoor", "VIP / Function"],
      autoClearOnPayment: true,
      requireTableOnDineIn: false
    };
    return { ...defaults, ...(settings || {}) };
  },

  async saveTableSettings(updates) {
    const current = await this.getTableSettings();
    const merged = { ...current, ...updates, key: "table_settings" };
    await localDB.settings.put(merged);
    return merged;
  },

  async getTables(section = null) {
    const all = await localDB.table("tables").toArray();
    if (section && section !== "all") {
      return all.filter((t) => t.section === section);
    }
    return all.sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }));
  },

  async getTable(id) {
    if (!id) return null;
    return await localDB.table("tables").get(id);
  },

  async saveTable(tableData) {
    if (!tableData) throw new Error("Table data is required");
    const id = tableData.id || `TBL-${Date.now().toString().slice(-4)}`;
    const table = {
      id,
      name: tableData.name || `Table ${id}`,
      section: tableData.section || "Main Dining",
      seats: Number(tableData.seats) || 4,
      shape: tableData.shape || "square", // square | round | rectangle | wall | counter
      status: tableData.status || "available", // available | occupied | billed | reserved
      posX: typeof tableData.posX === "number" ? tableData.posX : 30,
      posY: typeof tableData.posY === "number" ? tableData.posY : 30,
      width: Number(tableData.width) || 0,
      height: Number(tableData.height) || 0,
      activeOrderId: tableData.activeOrderId || null,
      activeOrderItems: Array.isArray(tableData.activeOrderItems) ? tableData.activeOrderItems : [],
      guestCount: Number(tableData.guestCount) || 0,
      orderTotal: Number(tableData.orderTotal) || 0,
      seatedAt: tableData.seatedAt || null,
      notes: tableData.notes || ""
    };
    await localDB.table("tables").put(table);
    return table;
  },

  async deleteTable(id) {
    if (!id) return false;
    await localDB.table("tables").delete(id);
    return true;
  },

  async setTableStatus(id, status, details = {}) {
    const table = await this.getTable(id);
    if (!table) return null;
    table.status = status;
    if (details.activeOrderId !== undefined) table.activeOrderId = details.activeOrderId;
    if (details.activeOrderItems !== undefined) table.activeOrderItems = details.activeOrderItems;
    if (details.guestCount !== undefined) table.guestCount = details.guestCount;
    if (details.orderTotal !== undefined) table.orderTotal = details.orderTotal;
    if (details.seatedAt !== undefined) table.seatedAt = details.seatedAt;
    if (details.posX !== undefined) table.posX = details.posX;
    if (details.posY !== undefined) table.posY = details.posY;
    if (details.notes !== undefined) table.notes = details.notes;
    await localDB.table("tables").put(table);
    return table;
  },

  async clearTable(id) {
    const table = await this.getTable(id);
    if (!table) return null;
    table.status = "available";
    table.activeOrderId = null;
    table.activeOrderItems = [];
    table.guestCount = 0;
    table.orderTotal = 0;
    table.seatedAt = null;
    await localDB.table("tables").put(table);
    return table;
  },

  async resetTableLayoutTemplate(type = "restaurant") {
    await localDB.table("tables").clear();
    let sections = [];
    let defaultTables = [];

    if (type === "cafe") {
      sections = ["Main Cafe", "Window Counter", "Terrace"];
      defaultTables = [
        { id: "TBL-C1", name: "Cafe 1", section: "Main Cafe", seats: 2, shape: "round", status: "available", posX: 30, posY: 30 },
        { id: "TBL-C2", name: "Cafe 2", section: "Main Cafe", seats: 2, shape: "round", status: "available", posX: 150, posY: 30 },
        { id: "TBL-C3", name: "Cafe 3", section: "Main Cafe", seats: 4, shape: "square", status: "available", posX: 270, posY: 30 },
        { id: "TBL-C4", name: "Window 1", section: "Window Counter", seats: 1, shape: "rectangle", status: "available", posX: 30, posY: 30 },
        { id: "TBL-C5", name: "Window 2", section: "Window Counter", seats: 1, shape: "rectangle", status: "available", posX: 150, posY: 30 },
        { id: "TBL-C6", name: "Window 3", section: "Window Counter", seats: 1, shape: "rectangle", status: "available", posX: 270, posY: 30 },
        { id: "TBL-C7", name: "Terrace A", section: "Terrace", seats: 4, shape: "square", status: "available", posX: 30, posY: 30 },
        { id: "TBL-C8", name: "Terrace B", section: "Terrace", seats: 4, shape: "square", status: "available", posX: 150, posY: 30 }
      ];
    } else if (type === "canteen") {
      sections = ["Canteen Hall A", "Canteen Hall B", "Faculty & Staff"];
      defaultTables = [
        { id: "TBL-K1", name: "Bench 1", section: "Canteen Hall A", seats: 8, shape: "rectangle", status: "available", posX: 30, posY: 30 },
        { id: "TBL-K2", name: "Bench 2", section: "Canteen Hall A", seats: 8, shape: "rectangle", status: "available", posX: 200, posY: 30 },
        { id: "TBL-K3", name: "Bench 3", section: "Canteen Hall A", seats: 8, shape: "rectangle", status: "available", posX: 30, posY: 150 },
        { id: "TBL-K4", name: "Bench 4", section: "Canteen Hall A", seats: 8, shape: "rectangle", status: "available", posX: 200, posY: 150 },
        { id: "TBL-K5", name: "Bench 5", section: "Canteen Hall B", seats: 6, shape: "rectangle", status: "available", posX: 30, posY: 30 },
        { id: "TBL-K6", name: "Bench 6", section: "Canteen Hall B", seats: 6, shape: "rectangle", status: "available", posX: 200, posY: 30 },
        { id: "TBL-K7", name: "Staff T-1", section: "Faculty & Staff", seats: 4, shape: "square", status: "available", posX: 30, posY: 30 },
        { id: "TBL-K8", name: "Staff T-2", section: "Faculty & Staff", seats: 4, shape: "square", status: "available", posX: 160, posY: 30 }
      ];
    } else {
      // Restaurant default
      sections = ["Main Dining", "Patio / Outdoor", "VIP / Function"];
      defaultTables = [
        { id: "TBL-01", name: "Table 1", section: "Main Dining", seats: 2, shape: "square", status: "available", posX: 30, posY: 30 },
        { id: "TBL-02", name: "Table 2", section: "Main Dining", seats: 4, shape: "square", status: "available", posX: 150, posY: 30 },
        { id: "TBL-03", name: "Table 3", section: "Main Dining", seats: 4, shape: "square", status: "available", posX: 270, posY: 30 },
        { id: "TBL-04", name: "Table 4", section: "Main Dining", seats: 6, shape: "rectangle", status: "available", posX: 390, posY: 30 },
        { id: "TBL-05", name: "Table 5", section: "Main Dining", seats: 2, shape: "round", status: "available", posX: 30, posY: 150 },
        { id: "TBL-06", name: "Table 6", section: "Main Dining", seats: 4, shape: "round", status: "available", posX: 150, posY: 150 },
        { id: "TBL-07", name: "Table 7", section: "Patio / Outdoor", seats: 4, shape: "square", status: "available", posX: 30, posY: 30 },
        { id: "TBL-08", name: "Table 8", section: "Patio / Outdoor", seats: 4, shape: "square", status: "available", posX: 150, posY: 30 },
        { id: "TBL-09", name: "VIP Room 1", section: "VIP / Function", seats: 8, shape: "rectangle", status: "available", posX: 30, posY: 30 }
      ];
    }

    await this.saveTableSettings({ layoutType: type, sections });
    await localDB.table("tables").bulkPut(defaultTables.map((t) => ({
      ...t,
      activeOrderId: null,
      guestCount: 0,
      orderTotal: 0
    })));

    return { sections, tables: defaultTables };
  }
};

// REMARK: DB_JS_GRANULAR_KARINDERYA_SETTINGS_COMPLETE