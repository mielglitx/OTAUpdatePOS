/**
 * Module Description: Offline EMVCo Merchant-Presented QR Parser & Dynamic Payload Engine
 * Implements the Bangko Sentral ng Pilipinas (BSP) QR Ph / EMVCo MPM specification.
 * Parses Tag-Length-Value (TLV) payloads, mutates transaction amount (Tag 54)
 * and point of initiation (Tag 01), and computes CRC-16/CCITT-FALSE checksums.
 */

export const GCashEMVCo = {
  // Fallback base static merchant QR payload if none uploaded in store settings
  basePayload: "00020101021126350009PH.P2PQR011112345678901020460165204541153036085802PH5913MERCHANT NAME6007TARLAC 6304",

  /**
   * Recalculates CRC-16/CCITT-FALSE (Polynomial: 0x1021, Init: 0xFFFF)
   * @param {string} payloadWithoutCrc - Assembled TLV string ending with "6304"
   * @returns {string} 4-character uppercase hexadecimal CRC
   */
  computeCRC(payloadWithoutCrc) {
    let crc = 0xffff;
    const str = payloadWithoutCrc + "6304";
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  },

  /**
   * Parses standard EMVCo Tag-Length-Value (TLV) string into an ordered Map
   * @param {string} raw - Raw EMVCo payload string
   * @returns {Map<string, string>} Tag-value mapping
   */
  parseTLV(raw) {
    const tags = new Map();
    if (!raw || typeof raw !== "string") return tags;

    let i = 0;
    while (i < raw.length) {
      if (i + 4 > raw.length) break;

      const tag = raw.substring(i, i + 2);
      const len = parseInt(raw.substring(i + 2, i + 4), 10);

      if (!tag || isNaN(len) || len < 0 || i + 4 + len > raw.length) {
        break;
      }

      const val = raw.substring(i + 4, i + 4 + len);
      tags.set(tag, val);
      i += 4 + len;
    }
    return tags;
  },

  /**
   * Extracts merchant name (Tag 59) and Philippine mobile number from EMVCo payload
   * @param {string} payload - Raw EMVCo payload string
   * @returns {{ name: string, number: string }} Extracted merchant details
   */
  extractMerchantInfo(payload) {
    if (!payload || typeof payload !== "string") {
      return { name: "", number: "" };
    }
    const tags = this.parseTLV(payload);
    let name = (tags.get("59") || "").trim();

    // Mobile number detection: scan for standard Philippine mobile number formats
    let number = "";
    const phoneMatch = payload.match(/(?:09|\+639|639)\d{9}/);
    if (phoneMatch) {
      let num = phoneMatch[0];
      if (num.startsWith("+63")) num = "0" + num.slice(3);
      else if (num.startsWith("63")) num = "0" + num.slice(2);
      number = num;
    }

    return { name, number };
  },

  /**
   * Takes base merchant payload and generates a dynamic QR string with exact amount
   * @param {number|string} amount - Payable transaction total
   * @returns {string} EMVCo QR Ph formatted payload string
   */
  generateDynamicPayload(amount) {
    const numericAmount = Math.max(0, Number(amount) || 0);
    const amountStr = numericAmount.toFixed(2);
    const tags = this.parseTLV(this.basePayload);

    // 1. Tag 01: Set Point of Initiation Method to '12' (Dynamic QR)
    tags.set("01", "12");

    // 2. Tag 53: Set Transaction Currency to PHP ('608')
    tags.set("53", "608");

    // 3. Tag 54: Set exact Transaction Amount
    tags.set("54", amountStr);

    // 4. Strip existing Tag 63 (CRC checksum)
    tags.delete("63");

    // 5. Reassemble string maintaining sequential order
    let assembled = "";
    for (const [tag, val] of tags.entries()) {
      const len = String(val.length).padStart(2, "0");
      assembled += `${tag}${len}${val}`;
    }

    // 6. Compute and append fresh 16-bit CRC checksum
    const crc = this.computeCRC(assembled);
    return `${assembled}6304${crc}`;
  },

  /**
   * Updates base merchant payload from administrative store configuration
   * @param {string} newRawPayload
   */
  setBasePayload(newRawPayload) {
    if (newRawPayload && typeof newRawPayload === "string" && newRawPayload.includes("6304")) {
      this.basePayload = newRawPayload.trim();
    }
  },

  /**
   * Generates a clean, crisp, high-resolution QR code data URL from a payload string.
   * Renders ONLY the pure QR code with a clear quiet zone (white margin) on a white canvas,
   * completely stripping away phone UI screenshot frames and blue backgrounds.
   * @param {string} payload - Payload string to encode
   * @param {number} size - Output width & height in pixels (default: 300)
   * @returns {Promise<string>} Base64 PNG data URL of the clean QR code
   */
  generateCleanQrDataUrl(payload, size = 300) {
    return new Promise((resolve) => {
      if (!payload || typeof payload !== "string") {
        resolve("");
        return;
      }

      if (typeof window === "undefined" || !window.QRCode) {
        console.warn("[GCashEMVCo] QRCode library not found on window.");
        resolve("");
        return;
      }

      try {
        const container = document.createElement("div");
        container.style.position = "absolute";
        container.style.left = "-9999px";
        container.style.top = "-9999px";
        container.style.visibility = "hidden";
        document.body.appendChild(container);

        const qrSize = Math.max(120, size);
        new window.QRCode(container, {
          text: payload,
          width: qrSize,
          height: qrSize,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.M : 0
        });

        // Add quiet zone margin (white border) for optimal phone camera scanning
        const finish = () => {
          try {
            const srcCanvas = container.querySelector("canvas");
            if (srcCanvas && srcCanvas.width > 0 && srcCanvas.height > 0) {
              const margin = Math.round(qrSize * 0.08); // 8% quiet zone border
              const totalSize = qrSize + margin * 2;
              const canvas = document.createElement("canvas");
              canvas.width = totalSize;
              canvas.height = totalSize;
              const ctx = canvas.getContext("2d");
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, totalSize, totalSize);
              ctx.drawImage(srcCanvas, margin, margin, qrSize, qrSize);
              const dataUrl = canvas.toDataURL("image/png");
              container.remove();
              resolve(dataUrl);
              return;
            }

            const img = container.querySelector("img");
            if (img && img.src && img.src.startsWith("data:")) {
              container.remove();
              resolve(img.src);
              return;
            }

            container.remove();
            resolve("");
          } catch (err) {
            console.warn("[GCashEMVCo] Error extracting QR canvas:", err);
            container.remove();
            resolve("");
          }
        };

        // qrcode.js draws to canvas synchronously; brief microtask ensures layout
        setTimeout(finish, 20);
      } catch (err) {
        console.error("[GCashEMVCo] generateCleanQrDataUrl error:", err);
        resolve("");
      }
    });
  },

  /**
   * Decodes QR payload from an uploaded image source (full mobile screenshot, photo, or cropped QR).
   * Employs a robust multi-pass scanning strategy:
   * 1. Full native resolution pass with jsQR
   * 2. Scaled pass (optimized dimensions: max 1000px)
   * 3. Center crop pass targeting the GCash mobile app QR display frame
   * 4. Tighter center crop pass targeting high-DPI smartphone layouts
   * 5. Contrast-boosted / binarized pass for compressed or dim screenshots
   * 6. Fallback to ZXing UMD library if available
   * @param {File|Blob|string|HTMLImageElement|HTMLCanvasElement} imageSource - Uploaded image
   * @returns {Promise<string|null>} Decoded QR payload string, or null if unreadable
   */
  async extractPayloadFromImage(imageSource) {
    if (!imageSource) return null;

    const loadImage = (src) => {
      return new Promise((resolve, reject) => {
        if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement && src.complete && src.naturalWidth > 0) {
          resolve(src);
          return;
        }
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(new Error("Failed to load image for QR decoding: " + e));

        if (typeof src === "string") {
          img.src = src;
        } else if ((typeof Blob !== "undefined" && src instanceof Blob) || (typeof File !== "undefined" && src instanceof File)) {
          const reader = new FileReader();
          reader.onload = (e) => { img.src = e.target.result; };
          reader.onerror = reject;
          reader.readAsDataURL(src);
        } else {
          reject(new Error("Unsupported image source type"));
        }
      });
    };

    let img;
    try {
      img = await loadImage(imageSource);
    } catch (e) {
      console.warn("[GCashEMVCo] Could not load image for QR decoding:", e);
      return null;
    }

    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) return null;

    const scanCanvasWithJsQR = (canvas) => {
      if (typeof window === "undefined" || !window.jsQR) return null;
      try {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imgData.data, canvas.width, canvas.height, {
          inversionAttempts: "attemptBoth"
        });
        if (code && code.data && code.data.trim()) {
          return code.data.trim();
        }
      } catch (e) {
        console.warn("[GCashEMVCo] jsQR scan error on canvas:", e);
      }
      return null;
    };

    const scanWithZXing = async (imageOrCanvas) => {
      if (typeof window !== "undefined" && window.ZXing && window.ZXing.BrowserQRCodeReader) {
        try {
          const reader = new window.ZXing.BrowserQRCodeReader();
          let result = null;
          if (typeof HTMLCanvasElement !== "undefined" && imageOrCanvas instanceof HTMLCanvasElement) {
            result = await reader.decodeFromCanvas(imageOrCanvas);
          } else {
            result = await reader.decodeFromImageElement(imageOrCanvas);
          }
          if (result && result.getText && result.getText().trim()) {
            return result.getText().trim();
          }
        } catch (_) {}
      }
      return null;
    };

    // PASS 1: Direct Native Resolution Scan
    {
      const canvas = document.createElement("canvas");
      canvas.width = naturalW;
      canvas.height = naturalH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const res = scanCanvasWithJsQR(canvas);
      if (res) return res;
    }

    // PASS 2: Scaled Scan (Max dimension 1000px, optimal module size for jsQR)
    if (naturalW > 1000 || naturalH > 1000 || naturalW < 400 || naturalH < 400) {
      const maxDim = 900;
      const scale = Math.min(maxDim / naturalW, maxDim / naturalH);
      const targetW = Math.max(300, Math.round(naturalW * scale));
      const targetH = Math.max(300, Math.round(naturalH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const res = scanCanvasWithJsQR(canvas);
      if (res) return res;
    }

    // PASS 3: Center Crop (GCash mobile screenshot format)
    // On typical GCash screenshots, the QR code card is in the central region:
    // X: 8% to 92%, Y: 18% to 76%
    {
      const cropX = Math.round(naturalW * 0.08);
      const cropY = Math.round(naturalH * 0.18);
      const cropW = Math.round(naturalW * 0.84);
      const cropH = Math.round(naturalH * 0.58);
      if (cropW > 50 && cropH > 50) {
        const canvas = document.createElement("canvas");
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        const res = scanCanvasWithJsQR(canvas);
        if (res) return res;

        // If large cropped canvas, also try scaled crop (e.g. 600px max)
        if (cropW > 700 || cropH > 700) {
          const scaledCropCanvas = document.createElement("canvas");
          const sScale = 600 / Math.max(cropW, cropH);
          scaledCropCanvas.width = Math.round(cropW * sScale);
          scaledCropCanvas.height = Math.round(cropH * sScale);
          const sCtx = scaledCropCanvas.getContext("2d");
          sCtx.drawImage(canvas, 0, 0, scaledCropCanvas.width, scaledCropCanvas.height);
          const sRes = scanCanvasWithJsQR(scaledCropCanvas);
          if (sRes) return sRes;
        }
      }
    }

    // PASS 4: Tighter Center Crop (Targeting GCash QR box in various phone aspect ratios)
    {
      const cropX = Math.round(naturalW * 0.15);
      const cropY = Math.round(naturalH * 0.25);
      const cropW = Math.round(naturalW * 0.70);
      const cropH = Math.round(naturalH * 0.48);
      if (cropW > 50 && cropH > 50) {
        const canvas = document.createElement("canvas");
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        const res = scanCanvasWithJsQR(canvas);
        if (res) return res;
      }
    }

    // PASS 5: High-Contrast / Grayscale Binarization Pass
    {
      const canvas = document.createElement("canvas");
      const targetW = Math.min(naturalW, 800);
      const targetH = Math.min(naturalH, 800);
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const imgData = ctx.getImageData(0, 0, targetW, targetH);
      const data = imgData.data;

      let totalLum = 0;
      const len = data.length;
      for (let i = 0; i < len; i += 4) {
        totalLum += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      }
      const avgLum = totalLum / (len / 4);

      for (let i = 0; i < len; i += 4) {
        const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
        const val = lum < avgLum ? 0 : 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
      ctx.putImageData(imgData, 0, 0);
      const res = scanCanvasWithJsQR(canvas);
      if (res) return res;
    }

    // PASS 6: ZXing Fallback
    try {
      const zxingRes = await scanWithZXing(img);
      if (zxingRes) return zxingRes;
    } catch (_) {}

    return null;
  }
};

// REMARK: GCASH_EMVCO_JS_MODULARIZATION_COMPLETE