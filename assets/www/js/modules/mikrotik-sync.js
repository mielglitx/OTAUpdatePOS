/**
 * Module Description: MikroTik RouterOS v7 REST API Client & Unified Voucher Engine
 * Manages communication with MikroTik hAP ax S running RouterOS v7, creates single-code
 * Hotspot user vouchers (where username and password are identical for seamless captive portal
 * entry), formats auto-login QR URLs (?voucher=CODE) prioritizing direct gateway IPs for
 * camera recognition, supports dedicated custom user profiles (e.g., CREW-WIFI), custom
 * session uptimes (hourly/daily), automated router user account deletion (DELETE /ip/hotspot/user/{id}),
 * bulk offline voucher pre-generation, safe native mobile WebView bridge parsing (mikrotikRestCall),
 * and clean RouterOS schema validation preventing unknown parameter errors.
 */

import { DB } from "./db.js";

export const MikrotikSync = {
  /**
   * Generates Basic Auth header from credentials
   * @param {string} user 
   * @param {string} pass 
   * @returns {string}
   */
  getAuthHeader(user, pass) {
    return "Basic " + btoa(`${user || ""}:${pass || ""}`);
  },

  /**
   * Builds the base URL for the MikroTik RouterOS v7 REST endpoint
   * @param {Object} config 
   * @returns {string}
   */
  getBaseUrl(config) {
    const proto = config.hotspotProtocol || "http";
    const ip = (config.hotspotRouterIp || "192.168.88.1").trim();
    const port = config.hotspotPort ? `:${config.hotspotPort}` : "";
    return `${proto}://${ip}${port}/rest`;
  },

  /**
   * Generates a single clean 5-character alphanumeric voucher code
   * Characters chosen avoid visual ambiguity (no 0, O, 1, I)
   * @returns {{code: string, pin: string}}
   */
  generateVoucherCredentials() {
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return { code, pin: code };
  },

  /**
   * Constructs the captive portal one-touch auto-login URL for receipt QR codes.
   * Prioritizes the router's direct gateway IP address over .local domains so
   * smartphone camera apps recognize it as an openable hyperlink.
   * @param {Object} config - Store hotspot settings
   * @param {string} code - Single Voucher Code
   * @returns {string}
   */
  buildAutoLoginUrl(config, code) {
    let host = (config.hotspotDomain || "").trim();
    if (!host || host.endsWith(".local") || host.includes(".lan")) {
      host = (config.hotspotRouterIp || "192.168.88.1").trim();
    }
    const cleanCode = encodeURIComponent(String(code).trim().toUpperCase());
    return `http://${host}/login?voucher=${cleanCode}`;
  },

  /**
   * Universal REST client supporting both native Flutter WebView bridge (zero CORS)
   * and standard browser fetch
   * @param {string} method - 'GET', 'PUT', 'POST', 'DELETE'
   * @param {string} endpoint - Path e.g. '/system/resource' or '/ip/hotspot/user'
   * @param {Object} config - Router settings
   * @param {Object|null} bodyPayload - Optional JSON body
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<{ok: boolean, status: number, data?: any, error?: string}>}
   */
  async executeRestCall(method, endpoint, config, bodyPayload = null, timeoutMs = 4500) {
    const url = `${this.getBaseUrl(config)}${endpoint}`;
    const auth = this.getAuthHeader(config.hotspotUsername, config.hotspotPassword);

    // 1. Mobile Native Shell Bridge (Bypasses all browser CORS & Private Network Access restrictions)
    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      try {
        const nativeRes = await window.flutter_inappwebview.callHandler(
          "mikrotikRestCall",
          method,
          url,
          auth,
          bodyPayload ? JSON.stringify(bodyPayload) : null
        );

        let parsedData = null;
        if (nativeRes && nativeRes.data) {
          try {
            parsedData = typeof nativeRes.data === "string" ? JSON.parse(nativeRes.data) : nativeRes.data;
          } catch (_) {
            parsedData = nativeRes.data;
          }
        }

        const isSuccess = Boolean(nativeRes && nativeRes.status >= 200 && nativeRes.status < 300);

        return {
          ok: isSuccess,
          status: nativeRes && typeof nativeRes.status === "number" ? nativeRes.status : 0,
          data: parsedData
        };
      } catch (bridgeErr) {
        console.warn("[MikroTik Native Bridge Error]", bridgeErr);
      }
    }

    // 2. Standard Web fetch execution fallback
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers = {
      "Authorization": auth,
      "Accept": "application/json"
    };

    const fetchOptions = {
      method,
      headers,
      signal: controller.signal
    };

    if (bodyPayload && (method === "PUT" || method === "POST")) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(bodyPayload);
    }

    try {
      const res = await fetch(url, fetchOptions);
      clearTimeout(timer);

      let responseData = null;
      try {
        responseData = await res.json();
      } catch (jsonErr) {}

      return {
        ok: res.ok,
        status: res.status,
        data: responseData
      };
    } catch (fetchErr) {
      clearTimeout(timer);
      throw fetchErr;
    }
  },

  /**
   * Tests connection to the MikroTik RouterOS REST API with diagnostic analysis
   * @param {Object} config 
   * @returns {Promise<{success: boolean, message: string, data?: any}>}
   */
  async testConnection(config) {
    const proto = config.hotspotProtocol || "http";
    const port = parseInt(config.hotspotPort, 10) || 80;
    const ip = (config.hotspotRouterIp || "192.168.88.1").trim();

    if (proto === "https" && port === 80) {
      return {
        success: false,
        message: "Port Mismatch: Port 80 is HTTP. Change Protocol to 'HTTP' or Port to 443."
      };
    }

    if (proto === "http" && port === 443) {
      return {
        success: false,
        message: "Port Mismatch: Port 443 requires HTTPS. Change Protocol to 'HTTPS' or Port to 80."
      };
    }

    try {
      const res = await this.executeRestCall("GET", "/system/resource", config, null, 4000);

      if (res.ok && res.data) {
        return {
          success: true,
          message: `Connected: RouterOS ${res.data.version || "v7"} (${res.data.board_name || "hAP ax"})`,
          data: res.data
        };
      } else if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          message: `Authentication Failed (HTTP ${res.status}): Verify username '${config.hotspotUsername}' and router password.`
        };
      } else {
        return {
          success: false,
          message: `Router responded with HTTP ${res.status}. Verify user group policies (read, write, api).`
        };
      }
    } catch (err) {
      if (err.name === "AbortError") {
        return {
          success: false,
          message: `Connection Timed Out: Router at ${ip}:${port} is unreachable. Ensure POS is on the router Wi-Fi/LAN.`
        };
      }

      if (err.message && err.message.includes("Failed to fetch")) {
        const isLocalWebOrigin = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
        let corsHelp = isLocalWebOrigin
          ? "Browser CORS Block: Desktop browsers block direct calls to private IP 192.168.88.1. Run POS in Android APK or use local preview pool."
          : "Network Error: Could not reach router. Ensure Web service is enabled on the router and POS is connected.";

        return {
          success: false,
          message: corsHelp
        };
      }

      return {
        success: false,
        message: `Network error: ${err.message}`
      };
    }
  },

  /**
   * Pushes a single hotspot user voucher directly to MikroTik RouterOS via REST API.
   * Sets BOTH name and password to the identical uppercase code.
   * Supports rate-limiting comments, custom profiles (e.g. CREW-WIFI), and custom session uptimes.
   * NOTE: In RouterOS REST API, 'rate-limit' and 'shared-users' belong exclusively to the user profile
   * (/ip/hotspot/user/profile), not /ip/hotspot/user. They are safely recorded in the comment.
   * @param {Object} config 
   * @param {string} code 
   * @param {string|null} [unusedPin]
   * @param {string} [orderNumber=""] 
   * @param {string|null} [rateLimit=null] - Optional bandwidth rate e.g. '2M/5M'
   * @param {string} [sharedUsers="1"] - '1' (Single User) or 'unlimited'
   * @param {string|null} [profileOverride=null] - Explicit profile name (e.g. 'CREW-WIFI')
   * @param {string|null} [uptimeOverride=null] - Explicit session duration (e.g. '12h' or '7d')
   * @returns {Promise<boolean>}
   */
  async createHotspotUserOnRouter(
    config, 
    code, 
    unusedPin = null, 
    orderNumber = "", 
    rateLimit = null, 
    sharedUsers = null,
    profileOverride = null,
    uptimeOverride = null
  ) {
    const cleanCode = String(code).trim().toUpperCase();
    const finalRate = rateLimit || config.hotspotRateLimit || "";
    const resolvedShared = (sharedUsers !== null && sharedUsers !== undefined) ? sharedUsers : (config.hotspotSharedUsers || "1");
    const isUnlimited = String(resolvedShared) === "unlimited" || String(resolvedShared) === "0";
    const deviceLabel = isUnlimited ? "Unlimited Devices" : "1 Device";
    const isUptimeUnlimited = uptimeOverride === "" || uptimeOverride === "0" || String(uptimeOverride).toLowerCase() === "unlimited";
    const uptime = isUptimeUnlimited ? "" : (uptimeOverride || config.hotspotUptime || "2h").trim();
    const targetProfile = (profileOverride || config.hotspotProfile || "default").trim();

    // Valid parameters for RouterOS /ip/hotspot/user:
    // name, password, profile, limit-uptime, comment
    const payload = {
      name: cleanCode,
      password: cleanCode,
      profile: targetProfile,
      comment: `POS Order ${orderNumber || "POOL"} | Rate: ${finalRate || "Uncapped"} | Access: ${deviceLabel} - ${new Date().toISOString()}`
    };
    if (uptime) {
      payload["limit-uptime"] = uptime;
    }

    try {
      let res = await this.executeRestCall("PUT", "/ip/hotspot/user", config, payload, 4000);

      if (!res.ok && res.status === 405) {
        res = await this.executeRestCall("POST", "/ip/hotspot/user", config, payload, 4000);
      }

      // If the target profile does not exist on the router, attempt fallback to 'default'
      if (!res.ok && res.data && typeof res.data === "object" && res.data.detail && String(res.data.detail).toLowerCase().includes("profile")) {
        console.warn(`[MikroTik Notice] Profile '${targetProfile}' not found on router. Retrying with 'default' profile...`);
        payload.profile = "default";
        res = await this.executeRestCall("PUT", "/ip/hotspot/user", config, payload, 4000);
      }

      if (!res.ok && res.status !== 201) {
        console.warn(`[MikroTik API Error] Router returned HTTP ${res.status}:`, res.data);
      }

      return res.ok || res.status === 201;
    } catch (err) {
      console.warn("[MikroTik API Error] Could not create hotspot user on router:", err.message);
      return false;
    }
  },

  /**
   * Deletes a specific hotspot user account from the MikroTik router hardware
   * Queries the router user's internal '.id' first to guarantee clean RouterOS REST deletion
   * @param {Object} config 
   * @param {string} code 
   * @returns {Promise<boolean>}
   */
  async deleteHotspotUserOnRouter(config, code) {
    if (!code) return false;
    const cleanCode = String(code).trim().toUpperCase();

    try {
      const searchRes = await this.executeRestCall(
        "GET",
        `/ip/hotspot/user?name=${encodeURIComponent(cleanCode)}`,
        config,
        null,
        3500
      );

      if (searchRes.ok && Array.isArray(searchRes.data) && searchRes.data.length > 0) {
        const routerItem = searchRes.data[0];
        const internalId = routerItem[".id"] || routerItem["id"] || cleanCode;
        const delRes = await this.executeRestCall(
          "DELETE",
          `/ip/hotspot/user/${encodeURIComponent(internalId)}`,
          config,
          null,
          3500
        );
        return delRes.ok;
      } else if (searchRes.ok && searchRes.data && searchRes.data[".id"]) {
        const delRes = await this.executeRestCall(
          "DELETE",
          `/ip/hotspot/user/${encodeURIComponent(searchRes.data[".id"])}`,
          config,
          null,
          3500
        );
        return delRes.ok;
      }

      const directDel = await this.executeRestCall(
        "DELETE",
        `/ip/hotspot/user/${encodeURIComponent(cleanCode)}`,
        config,
        null,
        3500
      );
      return directDel.ok;
    } catch (delErr) {
      console.warn(`[MikroTik API Error] Could not delete user ${cleanCode} from router:`, delErr.message);
      return false;
    }
  },

  /**
   * Bulk pre-generates single-credential vouchers on MikroTik Router and saves to local IndexedDB pool
   * @param {Object} config 
   * @param {number} count 
   * @param {Function} [onProgress] 
   * @param {string|null} [rateLimitOverride]
   * @param {string} [sharedUsersOverride="1"]
   * @returns {Promise<{success: boolean, created: number, failed: number}>}
   */
  async batchGenerateOfflinePool(config, count = 50, onProgress = null, rateLimitOverride = null, sharedUsersOverride = null) {
    let created = 0;
    let failed = 0;
    const vouchersToStore = [];

    const finalRate = rateLimitOverride || config.hotspotRateLimit || "";
    const resolvedShared = (sharedUsersOverride !== null && sharedUsersOverride !== undefined) ? sharedUsersOverride : (config.hotspotSharedUsers || "1");
    const isUnlimited = String(resolvedShared) === "unlimited" || String(resolvedShared) === "0";
    const finalDevices = isUnlimited ? "unlimited" : "1";

    for (let i = 1; i <= count; i++) {
      const { code, pin } = this.generateVoucherCredentials();
      const pushed = await this.createHotspotUserOnRouter(
        config,
        code,
        pin,
        "PRE-POOL",
        finalRate,
        finalDevices
      );

      if (pushed) {
        created++;
        vouchersToStore.push({
          id: `VOUCH-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          code,
          pin: code,
          qrUrl: this.buildAutoLoginUrl(config, code),
          uptime: config.hotspotUptime || "2h",
          rateLimit: finalRate || "Default",
          sharedUsers: finalDevices,
          status: "AVAILABLE",
          orderNumber: null,
          createdAt: new Date().toISOString(),
          consumedAt: null
        });
      } else {
        failed++;
      }

      if (typeof onProgress === "function") {
        onProgress(i, count, created, failed);
      }
    }

    if (vouchersToStore.length > 0) {
      await DB.saveVouchers(vouchersToStore);
    }

    return { success: created > 0, created, failed };
  },

  /**
   * Generates mock offline passes locally when testing inside browser/desktop preview
   * @param {Object} config 
   * @param {number} count 
   * @param {string|null} [rateLimit]
   * @param {string|null} [sharedUsers=null]
   * @returns {Promise<number>}
   */
  async generateLocalPreviewPool(config, count = 25, rateLimit = null, sharedUsers = null) {
    const vouchersToStore = [];
    const finalRate = rateLimit || config.hotspotRateLimit || "Default";
    const resolvedShared = (sharedUsers !== null && sharedUsers !== undefined) ? sharedUsers : (config.hotspotSharedUsers || "1");
    const isUnlimited = String(resolvedShared) === "unlimited" || String(resolvedShared) === "0";
    const finalDevices = isUnlimited ? "unlimited" : "1";

    for (let i = 1; i <= count; i++) {
      const { code } = this.generateVoucherCredentials();
      vouchersToStore.push({
        id: `VOUCH-PREV-${Date.now()}-${i}`,
        code,
        pin: code,
        qrUrl: this.buildAutoLoginUrl(config, code),
        uptime: config.hotspotUptime || "2h",
        rateLimit: finalRate,
        sharedUsers: finalDevices,
        status: "AVAILABLE",
        orderNumber: null,
        createdAt: new Date().toISOString(),
        consumedAt: null
      });
    }
    await DB.saveVouchers(vouchersToStore);
    return vouchersToStore.length;
  },

  /**
   * HYBRID ISSUANCE ENGINE:
   * 1. If hotspot voucher issuance is disabled, returns null.
   * 2. Tries to create a voucher in real-time on MikroTik Router via REST API (username == password).
   * 3. If online creation fails/times out, immediately consumes from local offline pool.
   * 4. Marks the voucher as CONSUMED and locks it to this order.
   * @param {string} orderNumber 
   * @param {string|null} [rateLimit]
   * @param {string|null} [sharedUsers=null]
   * @returns {Promise<Object|null>} Voucher entity { code, pin, qrUrl, uptime, rateLimit, sharedUsers, source: 'LIVE'|'POOL' }
   */
  async issueHybridVoucher(orderNumber, rateLimit = null, sharedUsers = null) {
    const store = await DB.getStoreSettings();

    if (!store.hotspotEnabled) {
      return null;
    }

    const { code } = this.generateVoucherCredentials();
    const qrUrl = this.buildAutoLoginUrl(store, code);
    const uptime = store.hotspotUptime || "2h";
    const finalRate = rateLimit || store.hotspotRateLimit || "Default";
    const resolvedShared = (sharedUsers !== null && sharedUsers !== undefined) ? sharedUsers : (store.hotspotSharedUsers || "1");
    const isUnlimited = String(resolvedShared) === "unlimited" || String(resolvedShared) === "0";
    const finalDevices = isUnlimited ? "unlimited" : "1";

    // 1. Attempt Real-Time Creation on MikroTik Router
    const liveSuccess = await this.createHotspotUserOnRouter(
      store,
      code,
      code,
      orderNumber,
      finalRate,
      finalDevices
    );

    if (liveSuccess) {
      const liveVoucher = {
        id: `VOUCH-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        code,
        pin: code,
        qrUrl,
        uptime,
        rateLimit: finalRate,
        sharedUsers: finalDevices,
        status: "CONSUMED",
        orderNumber,
        source: "LIVE",
        createdAt: new Date().toISOString(),
        consumedAt: new Date().toISOString()
      };

      await DB.instance.vouchers.put(liveVoucher);
      return liveVoucher;
    }

    // 2. Fallback to Pre-Generated Offline Pool
    const pooledVoucher = await DB.getNextAvailableVoucher();

    if (pooledVoucher) {
      const consumed = await DB.consumeLocalVoucher(pooledVoucher.code, orderNumber);
      return {
        ...consumed,
        sharedUsers: finalDevices, // Guarantee current store concurrency applies to pool voucher
        rateLimit: finalRate || consumed.rateLimit,
        source: "POOL"
      };
    }

    // 3. Resilient Fallback: Create dynamic local voucher so customer is NEVER left without a voucher
    console.warn("[Hotspot Voucher] Router offline and pool depleted; generating dynamic local voucher.");
    const fallbackVoucher = {
      id: `VOUCH-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      code,
      pin: code,
      qrUrl,
      uptime,
      rateLimit: finalRate,
      sharedUsers: finalDevices,
      status: "CONSUMED",
      orderNumber,
      source: "LOCAL_FALLBACK",
      createdAt: new Date().toISOString(),
      consumedAt: new Date().toISOString()
    };
    await DB.instance.vouchers.put(fallbackVoucher);
    return fallbackVoucher;
  }
};

// REMARK: MIKROTIK_SYNC_CREW_WIFI_PROFILE_AND_PAYLOAD_FIXED_COMPLETE