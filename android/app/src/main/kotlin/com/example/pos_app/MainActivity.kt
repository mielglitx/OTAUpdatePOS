package com.example.pos_app

import android.app.PendingIntent
import android.app.Presentation
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.display.DisplayManager
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.view.Display
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class CustomerPresentation(
    context: Context,
    display: Display,
    private val displayUrl: String
) : Presentation(context, display) {
    private var webView: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = FrameLayout(context)
        container.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        setContentView(container)

        webView = WebView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                cacheMode = WebSettings.LOAD_DEFAULT
            }
            webViewClient = WebViewClient()
            loadUrl(displayUrl)
        }
        container.addView(webView)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        webView?.destroy()
        webView = null
    }
}

class MainActivity : FlutterActivity() {
    private val ACTION_USB_PERMISSION = "com.example.pos_app.USB_PERMISSION"
    private var currentPresentation: CustomerPresentation? = null

    private val displayListener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(displayId: Int) {
            android.util.Log.d("POS_DISPLAY", "Display added: $displayId")
            if (displayId != Display.DEFAULT_DISPLAY) {
                autoLaunchCustomerPresentation()
            }
        }

        override fun onDisplayChanged(displayId: Int) {
            android.util.Log.d("POS_DISPLAY", "Display changed: $displayId")
            if (displayId != Display.DEFAULT_DISPLAY && currentPresentation == null) {
                autoLaunchCustomerPresentation()
            }
        }

        override fun onDisplayRemoved(displayId: Int) {
            android.util.Log.d("POS_DISPLAY", "Display removed: $displayId")
            if (currentPresentation?.display?.displayId == displayId) {
                hideCustomerPresentation()
            }
        }
    }

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == ACTION_USB_PERMISSION) {
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                android.util.Log.d("POS_USB", "USB permission broadcast received. Granted: $granted")
            }
        }
    }

    private fun autoLaunchCustomerPresentation(url: String = "http://localhost:8080/customer-display.html") {
        try {
            val dm = getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
            val secondary = dm.displays.firstOrNull { it.displayId != Display.DEFAULT_DISPLAY }
            if (secondary != null && currentPresentation == null) {
                runOnUiThread {
                    currentPresentation = CustomerPresentation(this, secondary, url)
                    currentPresentation?.show()
                    android.util.Log.d("POS_DISPLAY", "Auto-mounted CustomerPresentation on display ${secondary.displayId} (${secondary.name})")
                }
            }
        } catch (e: Exception) {
            android.util.Log.w("POS_DISPLAY", "Auto presentation mount error: ${e.message}")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(usbReceiver, IntentFilter(ACTION_USB_PERMISSION), RECEIVER_NOT_EXPORTED)
            } else {
                registerReceiver(usbReceiver, IntentFilter(ACTION_USB_PERMISSION))
            }
        } catch (e: Exception) {
            android.util.Log.w("POS_USB", "Could not register USB receiver: ${e.message}")
        }

        try {
            val dm = getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
            dm.registerDisplayListener(displayListener, null)
            autoLaunchCustomerPresentation()
        } catch (e: Exception) {
            android.util.Log.w("POS_DISPLAY", "Could not register DisplayListener: ${e.message}")
        }
    }

    override fun onResume() {
        super.onResume()
        autoLaunchCustomerPresentation()
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(usbReceiver)
        } catch (_: Exception) {}
        try {
            val dm = getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
            dm.unregisterDisplayListener(displayListener)
        } catch (_: Exception) {}
        try {
            currentPresentation?.dismiss()
            currentPresentation = null
        } catch (_: Exception) {}
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.example.pos_app/native_bridge")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getUsbPrinters" -> {
                        val list = scanUsbPrinters(this)
                        result.success(list)
                    }
                    "requestUsbPermission" -> {
                        val usbId = call.argument<String>("usbIdentifier")
                        val res = requestUsbPermission(this, usbId)
                        result.success(res)
                    }
                    "printRawUsb" -> {
                        val usbId = call.argument<String>("usbIdentifier")
                        val bytes = call.argument<ByteArray>("bytes")
                            ?: (call.argument<List<Int>>("bytesList")?.map { it.toByte() }?.toByteArray())
                        if (bytes == null) {
                            result.success(mapOf("ok" to false, "error" to "No byte data provided."))
                        } else {
                            val res = printRawUsb(this, usbId, bytes)
                            result.success(res)
                        }
                    }
                    "openCustomerPresentation" -> {
                        val url = call.argument<String>("url") ?: "http://localhost:8080/customer-display.html"
                        val res = showCustomerPresentation(this, url)
                        result.success(res)
                    }
                    "hideCustomerPresentation" -> {
                        val res = hideCustomerPresentation()
                        result.success(res)
                    }
                    "checkAutoMountPresentation" -> {
                        autoLaunchCustomerPresentation()
                        result.success(mapOf("ok" to true, "mounted" to (currentPresentation != null)))
                    }
                    "getDisplayList" -> {
                        val dm = getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
                        val list = dm.displays.map {
                            mapOf(
                                "displayId" to it.displayId,
                                "name" to it.name,
                                "flags" to it.flags,
                                "rotation" to it.rotation
                            )
                        }
                        result.success(list)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun findTargetUsbDevice(usbManager: UsbManager, usbIdentifier: String?): UsbDevice? {
        val deviceList = usbManager.deviceList
        var targetDevice: UsbDevice? = null

        // 1. Match by vendorId_productId (handles decimal and hex strings, e.g. "1046_8193" or "0x0416_0x2001")
        if (!usbIdentifier.isNullOrBlank() && usbIdentifier.contains("_")) {
            val parts = usbIdentifier.split("_")
            val targetVid = parts[0].toIntOrNull() ?: parts[0].removePrefix("0x").toIntOrNull(16)
            val targetPid = parts.getOrNull(1)?.toIntOrNull() ?: parts.getOrNull(1)?.removePrefix("0x")?.toIntOrNull(16)
            if (targetVid != null && targetPid != null) {
                for (device in deviceList.values) {
                    if (device.vendorId == targetVid && device.productId == targetPid) {
                        targetDevice = device
                        break
                    }
                }
            }
        }

        // 2. Match by exact deviceName
        if (targetDevice == null && !usbIdentifier.isNullOrBlank()) {
            for (device in deviceList.values) {
                if (device.deviceName == usbIdentifier) {
                    targetDevice = device
                    break
                }
            }
        }

        // 3. Match any printer device with USB_CLASS_PRINTER (class 7)
        if (targetDevice == null) {
            for (device in deviceList.values) {
                var isPrinter = device.deviceClass == UsbConstants.USB_CLASS_PRINTER
                if (!isPrinter) {
                    for (i in 0 until device.interfaceCount) {
                        if (device.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_PRINTER) {
                            isPrinter = true
                            break
                        }
                    }
                }
                if (isPrinter) {
                    targetDevice = device
                    break
                }
            }
        }

        // 4. Fallback: Match any USB device having a bulk OUT endpoint
        if (targetDevice == null) {
            for (device in deviceList.values) {
                for (i in 0 until device.interfaceCount) {
                    val iface = device.getInterface(i)
                    for (j in 0 until iface.endpointCount) {
                        val ep = iface.getEndpoint(j)
                        if (ep.direction == UsbConstants.USB_DIR_OUT && ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                            targetDevice = device
                            break
                        }
                    }
                    if (targetDevice != null) break
                }
                if (targetDevice != null) break
            }
        }

        return targetDevice
    }

    private fun requestUsbPermission(context: Context, usbIdentifier: String?): Map<String, Any> {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val device = findTargetUsbDevice(usbManager, usbIdentifier)
            ?: return mapOf("ok" to false, "error" to "No USB printer found connected to terminal.")

        if (usbManager.hasPermission(device)) {
            return mapOf("ok" to true, "granted" to true, "deviceName" to device.deviceName)
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        val pi = PendingIntent.getBroadcast(context, 0, Intent(ACTION_USB_PERMISSION), flags)
        usbManager.requestPermission(device, pi)
        return mapOf("ok" to true, "granted" to false, "requested" to true, "deviceName" to device.deviceName)
    }

    private fun scanUsbPrinters(context: Context): List<Map<String, Any?>> {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val deviceList = usbManager.deviceList
        val result = ArrayList<Map<String, Any?>>()

        for (device in deviceList.values) {
            var isPrinter = device.deviceClass == UsbConstants.USB_CLASS_PRINTER
            if (!isPrinter) {
                for (i in 0 until device.interfaceCount) {
                    val iface = device.getInterface(i)
                    if (iface.interfaceClass == UsbConstants.USB_CLASS_PRINTER) {
                        isPrinter = true
                        break
                    }
                }
            }

            var hasBulkOut = false
            for (i in 0 until device.interfaceCount) {
                val iface = device.getInterface(i)
                for (j in 0 until iface.endpointCount) {
                    val ep = iface.getEndpoint(j)
                    if (ep.direction == UsbConstants.USB_DIR_OUT && ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                        hasBulkOut = true
                        break
                    }
                }
                if (hasBulkOut) break
            }

            if (isPrinter || hasBulkOut) {
                val hasPerm = usbManager.hasPermission(device)
                if (!hasPerm) {
                    try {
                        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
                        val pi = PendingIntent.getBroadcast(context, 0, Intent(ACTION_USB_PERMISSION), flags)
                        usbManager.requestPermission(device, pi)
                    } catch (permErr: Exception) {
                        android.util.Log.w("POS_USB", "Auto permission request error: ${permErr.message}")
                    }
                }

                val name = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) device.productName else null)
                    ?: "USB POS Printer (${device.vendorId.toString(16)}:${device.productId.toString(16)})"
                val manufacturer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) device.manufacturerName ?: "" else ""

                result.add(
                    mapOf(
                        "name" to name,
                        "vendorId" to device.vendorId,
                        "productId" to device.productId,
                        "deviceId" to device.deviceId,
                        "deviceName" to device.deviceName,
                        "manufacturer" to manufacturer,
                        "hasPermission" to usbManager.hasPermission(device)
                    )
                )
            }
        }
        return result
    }

    private fun printRawUsb(context: Context, usbIdentifier: String?, bytes: ByteArray): Map<String, Any> {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val targetDevice = findTargetUsbDevice(usbManager, usbIdentifier)
            ?: return mapOf("ok" to false, "error" to "No USB printer found connected to terminal.")

        if (!usbManager.hasPermission(targetDevice)) {
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            val pi = PendingIntent.getBroadcast(context, 0, Intent(ACTION_USB_PERMISSION), flags)
            usbManager.requestPermission(targetDevice, pi)
            return mapOf(
                "ok" to false,
                "error" to "USB Permission requested for printer. Please tap 'ALLOW' on the system dialog and retry."
            )
        }

        val connection = usbManager.openDevice(targetDevice)
            ?: return mapOf("ok" to false, "error" to "Could not open USB connection to printer. Please re-plug the USB cable.")

        var targetInterface: UsbInterface? = null
        var targetEndpoint: UsbEndpoint? = null

        try {
            // Pass 1: Prioritize interface with printer class (7) and bulk OUT endpoint
            for (i in 0 until targetDevice.interfaceCount) {
                val iface = targetDevice.getInterface(i)
                if (iface.interfaceClass == UsbConstants.USB_CLASS_PRINTER || iface.interfaceClass == 7) {
                    for (j in 0 until iface.endpointCount) {
                        val ep = iface.getEndpoint(j)
                        if (ep.direction == UsbConstants.USB_DIR_OUT && ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                            targetInterface = iface
                            targetEndpoint = ep
                            break
                        }
                    }
                }
                if (targetEndpoint != null) break
            }

            // Pass 2: Fallback to any interface with bulk OUT endpoint
            if (targetEndpoint == null) {
                for (i in 0 until targetDevice.interfaceCount) {
                    val iface = targetDevice.getInterface(i)
                    for (j in 0 until iface.endpointCount) {
                        val ep = iface.getEndpoint(j)
                        if (ep.direction == UsbConstants.USB_DIR_OUT && ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                            targetInterface = iface
                            targetEndpoint = ep
                            break
                        }
                    }
                    if (targetEndpoint != null) break
                }
            }

            if (targetInterface == null || targetEndpoint == null) {
                return mapOf("ok" to false, "error" to "No writable USB bulk OUT endpoint found on printer.")
            }

            val claimed = connection.claimInterface(targetInterface, true)
            if (!claimed) {
                return mapOf("ok" to false, "error" to "Could not claim USB printer interface.")
            }

            // Safe packet size: use multiples of endpoint packet size (typically 64 or 512 bytes)
            val maxPkt = if (targetEndpoint.maxPacketSize > 0) targetEndpoint.maxPacketSize else 64
            val chunkSize = minOf(512, maxPkt * 4)
            var offset = 0
            var allSuccess = true

            while (offset < bytes.size) {
                val len = minOf(chunkSize, bytes.size - offset)
                val written = connection.bulkTransfer(targetEndpoint, bytes, offset, len, 5000)
                if (written < 0) {
                    allSuccess = false
                    break
                }
                offset += if (written > 0) written else len
                if (offset < bytes.size) {
                    Thread.sleep(2)
                }
            }

            return if (allSuccess) {
                mapOf("ok" to true)
            } else {
                mapOf("ok" to false, "error" to "USB transfer write failed during dispatch.")
            }
        } catch (e: Exception) {
            return mapOf("ok" to false, "error" to (e.message ?: "USB write exception"))
        } finally {
            try {
                if (targetInterface != null) {
                    connection.releaseInterface(targetInterface)
                }
            } catch (_: Exception) {}
            try {
                connection.close()
            } catch (_: Exception) {}
        }
    }

    private fun showCustomerPresentation(context: Context, url: String): Map<String, Any> {
        try {
            val dm = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
            val displays = dm.displays
            val secondary = displays.firstOrNull { it.displayId != Display.DEFAULT_DISPLAY }

            if (secondary == null) {
                return mapOf("ok" to false, "error" to "No external secondary display detected (Display ID > 0).")
            }

            runOnUiThread {
                currentPresentation?.dismiss()
                currentPresentation = CustomerPresentation(context, secondary, url)
                currentPresentation?.show()
            }
            return mapOf("ok" to true, "displayId" to secondary.displayId, "name" to secondary.name)
        } catch (e: Exception) {
            return mapOf("ok" to false, "error" to (e.message ?: "Presentation error"))
        }
    }

    private fun hideCustomerPresentation(): Map<String, Any> {
        try {
            runOnUiThread {
                currentPresentation?.dismiss()
                currentPresentation = null
            }
            return mapOf("ok" to true)
        } catch (e: Exception) {
            return mapOf("ok" to false, "error" to (e.message ?: "Dismiss error"))
        }
    }
}
