/// Module Description: Standalone Offline POS Container Main Entry Point
/// Initializes the local embedded web server, requests runtime Android Bluetooth/Location permissions,
/// initializes Android OS dual-monitor DisplayManager to render customer-facing order presentation
/// views on secondary external screens (customer-display.html), safely checks and type-promotes
/// secondary display identifiers, and hosts the core InAppWebView container with native bridge handlers
/// for raw TCP printing, chunked Classic Bluetooth RFCOMM printing, direct GATT Bluetooth Low Energy (BLE)
/// printing (Compatibility Mode for JK-5802H), dual Bluetooth discovery, secondary monitor presentation
/// dispatch, and native MikroTik RouterOS v7 REST execution.
library;

import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:http/http.dart' as http;
import 'package:permission_handler/permission_handler.dart';
import 'package:presentation_displays/displays_manager.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import 'ota_service.dart';

final DisplayManager _displayManager = DisplayManager();
const MethodChannel _nativeBridge = MethodChannel('com.example.pos_app/native_bridge');
String? _connectedMac;

Future<void> ensureBtPermissions() async {
  await [
    Permission.bluetoothConnect,
    Permission.bluetoothScan,
    Permission.location,
    Permission.locationWhenInUse,
  ].request();
}

Future<bool> _writeChunked(List<int> bytes) async {
  const chunk = 512;
  for (var i = 0; i < bytes.length; i += chunk) {
    final end = (i + chunk > bytes.length) ? bytes.length : i + chunk;
    final ok = await PrintBluetoothThermal.writeBytes(bytes.sublist(i, end));
    if (!ok) return false;
    await Future.delayed(const Duration(milliseconds: 40));
  }
  return true;
}

/// Automatically detects and mounts the Customer Display on Sunmi or Android Display #2
Future<bool> launchSecondaryPresentation() async {
  // 1. Direct Native Android Presentation Display (Rock-solid for Sunmi T2, T2s, D2s dual-screens)
  try {
    final dynamic res = await _nativeBridge.invokeMethod('openCustomerPresentation', {
      'url': 'http://localhost:8080/customer-display.html',
    });
    if (res is Map && res['ok'] == true) {
      debugPrint('[Dual Monitor Native] Successfully mounted presentation on Sunmi / Android display (${res['name'] ?? res['displayId']})');
      return true;
    }
  } catch (e) {
    debugPrint('[Dual Monitor Native Exception]: $e');
  }

  // 2. Flutter Multi-Engine Plugin with ProGuard/Release-safe JSON parser
  try {
    const MethodChannel pluginChannel = MethodChannel('presentation_displays_plugin');
    final String? rawJson = await pluginChannel.invokeMethod<String>('listDisplay');
    if (rawJson != null && rawJson.isNotEmpty) {
      final List<dynamic> decoded = jsonDecode(rawJson) as List<dynamic>;
      for (final item in decoded) {
        if (item is Map) {
          final id = item['displayId'] ?? item['a'];
          if (id != null && id is int && id != 0) {
            await _displayManager.showSecondaryDisplay(
              displayId: id,
              routerName: 'presentation',
            );
            debugPrint('[Dual Monitor Plugin] Mounted presentation on Display #$id');
            return true;
          }
        }
      }
    }
  } catch (e) {
    debugPrint('[Dual Monitor Plugin Exception]: $e');
  }

  debugPrint('[Dual Monitor] No hardware secondary display detected (Display ID > 0).');
  return false;
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ensureBtPermissions();
  await PosLocalWebServer.start();
  runApp(const POSApp());
}

/// Required entrypoint for presentation_displays Kotlin engine
@pragma('vm:entry-point')
void secondaryDisplayMain() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SecondaryCustomerApp());
}

class SecondaryCustomerApp extends StatelessWidget {
  const SecondaryCustomerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: SecondaryCustomerDisplay(),
    );
  }
}

class POSApp extends StatelessWidget {
  const POSApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      initialRoute: '/',
      routes: {
        '/': (context) => const POSContainer(),
        'presentation': (context) => const SecondaryCustomerDisplay(),
      },
    );
  }
}

/// Dedicated Presentation Widget rendered exclusively on Android Display #2
class SecondaryCustomerDisplay extends StatelessWidget {
  const SecondaryCustomerDisplay({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: SafeArea(
        child: InAppWebView(
          initialUrlRequest: URLRequest(
            url: WebUri('http://localhost:8080/customer-display.html'),
          ),
          initialSettings: InAppWebViewSettings(
            isInspectable: true,
            supportZoom: false,
            allowsInlineMediaPlayback: true,
            mediaPlaybackRequiresUserGesture: false,
          ),
        ),
      ),
    );
  }
}

class POSContainer extends StatefulWidget {
  const POSContainer({super.key});
  @override
  State<POSContainer> createState() => _POSContainerState();
}

class _POSContainerState extends State<POSContainer> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Attempt auto-mounting of customer display on secondary monitor
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      launchSecondaryPresentation();
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) launchSecondaryPresentation();
      });

      // Startup Over-The-Air (OTA) Update Verification
      try {
        final updateCheck = await OtaManager.checkGithubRelease();
        if (updateCheck['ok'] == true && updateCheck['hasUpdate'] == true) {
          debugPrint('[Startup OTA Notice] New release ${updateCheck['latestVersion']} detected on startup.');
        }
      } catch (e) {
        debugPrint('[Startup OTA Check Error]: $e');
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      launchSecondaryPresentation();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    PosLocalWebServer.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: InAppWebView(
          initialUrlRequest: URLRequest(
            url: WebUri('http://localhost:8080/index.html'),
          ),
          initialSettings: InAppWebViewSettings(
            isInspectable: true,
            supportZoom: false,
            allowsInlineMediaPlayback: true,
            mediaPlaybackRequiresUserGesture: false,
          ),
          onPermissionRequest: (controller, request) async {
            return PermissionResponse(
              resources: request.resources,
              action: PermissionResponseAction.GRANT,
            );
          },
          onConsoleMessage: (controller, consoleMessage) {
            debugPrint('[WebView Console ${consoleMessage.messageLevel}]: ${consoleMessage.message}');
          },
          onWebViewCreated: (controller) {
            // Bridge 1: Dual Display Hardware Trigger
            controller.addJavaScriptHandler(
              handlerName: 'openSecondaryDisplay',
              callback: (args) async {
                final success = await launchSecondaryPresentation();
                return {'ok': success};
              },
            );

            // Bridge 2: Raw TCP Socket (LAN ESC/POS Printers)
            controller.addJavaScriptHandler(
              handlerName: 'printRawTcp',
              callback: (args) async {
                final String ip = args[0] as String;
                final int port = args[1] ?? 9100;
                final List<int> bytes = List<dynamic>.from(args[2]).cast<int>();
                try {
                  final socket = await Socket.connect(
                    ip,
                    port,
                    timeout: const Duration(seconds: 4),
                  );
                  socket.add(bytes);
                  await socket.flush();
                  await socket.close();
                  return {'ok': true};
                } catch (e) {
                  return {'ok': false, 'error': e.toString()};
                }
              },
            );

            // Bridge 3: Enumerate Paired Bluetooth Devices from Android OS (Classic)
            controller.addJavaScriptHandler(
              handlerName: 'getPairedBluetoothDevices',
              callback: (args) async {
                try {
                  await ensureBtPermissions();
                  final bool isEnabled =
                      await PrintBluetoothThermal.bluetoothEnabled;
                  if (!isEnabled) {
                    return [];
                  }
                  final List<BluetoothInfo> bonded =
                      await PrintBluetoothThermal.pairedBluetooths;
                  return bonded
                      .map((b) => {
                            'name': b.name,
                            'address': b.macAdress,
                            'isBle': false,
                          })
                      .toList();
                } catch (e) {
                  debugPrint('[Bluetooth Paired Enumeration Error]: $e');
                  return [];
                }
              },
            );

            // Bridge 4: Dual Bluetooth Device Discovery (Classic Bonded + Over-the-Air BLE)
            controller.addJavaScriptHandler(
              handlerName: 'scanBluetoothDevices',
              callback: (args) async {
                try {
                  await ensureBtPermissions();
                  final List<Map<String, dynamic>> deviceList = [];

                  final bool isClassicEnabled =
                      await PrintBluetoothThermal.bluetoothEnabled;
                  if (isClassicEnabled) {
                    final List<BluetoothInfo> bonded =
                        await PrintBluetoothThermal.pairedBluetooths;
                    for (final b in bonded) {
                      deviceList.add({
                        'name': b.name,
                        'address': b.macAdress,
                        'isBle': false,
                      });
                    }
                  }

                  if (await FlutterBluePlus.isSupported &&
                      await FlutterBluePlus.adapterState.first ==
                          BluetoothAdapterState.on) {
                    List<ScanResult> bleResults = [];
                    final subscription =
                        FlutterBluePlus.scanResults.listen((results) {
                      bleResults = results;
                    });

                    await FlutterBluePlus.startScan(
                      timeout: const Duration(seconds: 3),
                      androidUsesFineLocation: false,
                    );
                    await FlutterBluePlus.isScanning
                        .where((val) => val == false)
                        .first;
                    await subscription.cancel();

                    for (final r in bleResults) {
                      final advName = r.advertisementData.advName.trim();
                      final platformName = r.device.platformName.trim();
                      final String resolvedName = advName.isNotEmpty
                          ? advName
                          : (platformName.isNotEmpty ? platformName : '');
                      final String devMac = r.device.remoteId.str.trim();

                      if (resolvedName.isNotEmpty &&
                          !deviceList.any((d) => d['address'] == devMac)) {
                        deviceList.add({
                          'name': resolvedName,
                          'address': devMac,
                          'isBle': true,
                        });
                      }
                    }
                  }

                  return deviceList;
                } catch (e) {
                  debugPrint('[Scan Bluetooth Devices Error]: $e');
                  return [];
                }
              },
            );

            // Bridge 5: Raw Bluetooth ESC/POS Socket Dispatch (Standard Classic SPP)
            controller.addJavaScriptHandler(
              handlerName: 'printRawBluetooth',
              callback: (args) async {
                final String targetNameOrMac = (args[0] as String).trim();
                final List<int> bytes = List<dynamic>.from(args[1]).cast<int>();

                try {
                  await ensureBtPermissions();
                  final bool isEnabled =
                      await PrintBluetoothThermal.bluetoothEnabled;
                  if (!isEnabled) {
                    return {
                      'ok': false,
                      'error':
                          'Bluetooth is disabled. Please turn on Bluetooth and Location in tablet settings.'
                    };
                  }

                  final List<BluetoothInfo> bonded =
                      await PrintBluetoothThermal.pairedBluetooths;

                  final macRegex =
                      RegExp(r'^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$');
                  String? targetMac;

                  if (macRegex.hasMatch(targetNameOrMac)) {
                    targetMac =
                        targetNameOrMac.toUpperCase().replaceAll('-', ':');
                  } else {
                    final String targetLower = targetNameOrMac.toLowerCase();
                    final String cleanTarget =
                        targetLower.replaceAll(RegExp(r'[^a-z0-9]'), '');

                    for (final device in bonded) {
                      final String devName = device.name.trim().toLowerCase();
                      final String devMac =
                          device.macAdress.trim().toLowerCase();

                      if (devName.isNotEmpty &&
                          (devName == targetLower ||
                              devName.contains(targetLower) ||
                              targetLower.contains(devName) ||
                              devMac == targetLower)) {
                        targetMac =
                            device.macAdress.toUpperCase().replaceAll('-', ':');
                        break;
                      }
                    }

                    if (targetMac == null) {
                      for (final device in bonded) {
                        final String devMac =
                            device.macAdress.trim().toLowerCase();
                        final String cleanDevMac =
                            devMac.replaceAll(RegExp(r'[^a-z0-9]'), '');

                        if (cleanDevMac.length >= 4) {
                          final String last4 =
                              cleanDevMac.substring(cleanDevMac.length - 4);
                          if (cleanTarget.contains(last4) ||
                              last4.contains(cleanTarget)) {
                            targetMac = device.macAdress
                                .toUpperCase()
                                .replaceAll('-', ':');
                            break;
                          }
                        }
                      }
                    }
                  }

                  if (targetMac == null || !macRegex.hasMatch(targetMac)) {
                    final String available = bonded
                        .map((b) => '"${b.name}" (${b.macAdress})')
                        .join(', ');
                    return {
                      'ok': false,
                      'error':
                          'Could not resolve Classic address for "$targetNameOrMac". Paired devices: $available'
                    };
                  }

                  final connected =
                      await PrintBluetoothThermal.connectionStatus;
                  if (connected && _connectedMac == targetMac) {
                    if (await _writeChunked(bytes)) return {'ok': true};
                  }

                  if (connected) {
                    try {
                      await PrintBluetoothThermal.disconnect;
                    } catch (_) {}
                    _connectedMac = null;
                    await Future.delayed(const Duration(milliseconds: 600));
                  }

                  bool connectOk = await PrintBluetoothThermal.connect(
                    macPrinterAddress: targetMac,
                  );

                  if (!connectOk) {
                    try {
                      await PrintBluetoothThermal.disconnect;
                    } catch (_) {}
                    await Future.delayed(const Duration(milliseconds: 800));
                    connectOk = await PrintBluetoothThermal.connect(
                      macPrinterAddress: targetMac,
                    );
                  }

                  if (!connectOk) {
                    _connectedMac = null;
                    return {
                      'ok': false,
                      'error':
                          'Could not connect via Classic Bluetooth. Turn on "Compatibility Mode (BLE)" in Printer Settings.'
                    };
                  }

                  _connectedMac = targetMac;
                  final bool printOk = await _writeChunked(bytes);
                  return {'ok': printOk};
                } catch (e) {
                  return {'ok': false, 'error': e.toString()};
                }
              },
            );

            // Bridge 6: Compatibility Mode (BLE GATT Dispatch for JK-5802H / KPrinter_fbce)
            controller.addJavaScriptHandler(
              handlerName: 'printRawBle',
              callback: (args) async {
                final String targetNameOrMac = (args[0] as String).trim();
                final List<int> bytes = List<dynamic>.from(args[1]).cast<int>();

                BluetoothDevice? targetDevice;

                try {
                  await ensureBtPermissions();

                  if (await FlutterBluePlus.isSupported == false) {
                    return {
                      'ok': false,
                      'error': 'BLE is not supported on this tablet.'
                    };
                  }

                  if (await FlutterBluePlus.adapterState.first !=
                      BluetoothAdapterState.on) {
                    return {
                      'ok': false,
                      'error':
                          'Bluetooth is disabled. Please turn on Bluetooth and Location in tablet settings.'
                    };
                  }

                  final macRegex =
                      RegExp(r'^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$');

                  if (macRegex.hasMatch(targetNameOrMac)) {
                    final formattedMac =
                        targetNameOrMac.toUpperCase().replaceAll('-', ':');
                    targetDevice = BluetoothDevice.fromId(formattedMac);
                  }

                  if (targetDevice == null) {
                    final List<BluetoothDevice> connectedList =
                        FlutterBluePlus.connectedDevices;
                    for (final d in connectedList) {
                      final dName = d.platformName.toLowerCase();
                      final dMac = d.remoteId.str.toLowerCase();
                      final target = targetNameOrMac.toLowerCase();
                      if (dMac == target ||
                          dName == target ||
                          dName.contains(target) ||
                          target.contains(dName)) {
                        targetDevice = d;
                        break;
                      }
                    }
                  }

                  if (targetDevice == null) {
                    List<ScanResult> scanResults = [];
                    final sub = FlutterBluePlus.scanResults
                        .listen((r) => scanResults = r);
                    await FlutterBluePlus.startScan(
                      timeout: const Duration(seconds: 4),
                      androidUsesFineLocation: false,
                    );
                    await FlutterBluePlus.isScanning
                        .where((val) => val == false)
                        .first;
                    await sub.cancel();

                    final targetLower = targetNameOrMac.toLowerCase();
                    final cleanTarget =
                        targetLower.replaceAll(RegExp(r'[^a-z0-9]'), '');

                    for (final r in scanResults) {
                      final adv = r.advertisementData.advName.toLowerCase();
                      final plat = r.device.platformName.toLowerCase();
                      final devName = adv.isNotEmpty ? adv : plat;
                      final devMac = r.device.remoteId.str.toLowerCase();
                      final cleanDevMac =
                          devMac.replaceAll(RegExp(r'[^a-z0-9]'), '');

                      if (devMac == targetLower ||
                          devName == targetLower ||
                          devName.contains(targetLower) ||
                          targetLower.contains(devName)) {
                        targetDevice = r.device;
                        break;
                      }

                      if (cleanDevMac.length >= 4 && cleanTarget.isNotEmpty) {
                        final last4 =
                            cleanDevMac.substring(cleanDevMac.length - 4);
                        if (cleanTarget.contains(last4) ||
                            last4.contains(cleanTarget)) {
                          targetDevice = r.device;
                          break;
                        }
                      }
                    }

                    if (targetDevice == null) {
                      for (final r in scanResults) {
                        final devMac = r.device.remoteId.str;
                        final cleanDevMac = devMac
                            .toLowerCase()
                            .replaceAll(RegExp(r'[^a-z0-9]'), '');
                        if (cleanDevMac.endsWith('fbce') ||
                            cleanDevMac.contains('fbce')) {
                          targetDevice = r.device;
                          break;
                        }
                      }
                    }
                  }

                  if (targetDevice == null) {
                    return {
                      'ok': false,
                      'error':
                          'BLE Printer "$targetNameOrMac" not found. Ensure JK-5802H is powered ON.'
                    };
                  }

                  try {
                    await targetDevice.disconnect();
                  } catch (_) {}
                  await Future.delayed(const Duration(milliseconds: 200));

                  await targetDevice.connect(
                    timeout: const Duration(seconds: 14),
                    autoConnect: false,
                  );

                  if (Platform.isAndroid) {
                    try {
                      await targetDevice.requestMtu(256);
                    } catch (_) {}
                  }

                  final services = await targetDevice.discoverServices();
                  BluetoothCharacteristic? writeChar;

                  for (final s in services) {
                    final sUuid = s.uuid.str128.toLowerCase();
                    if (sUuid.startsWith('00001800') ||
                        sUuid.startsWith('00001801') ||
                        sUuid.startsWith('0000180a')) {
                      continue;
                    }
                    for (final c in s.characteristics) {
                      if (c.properties.write ||
                          c.properties.writeWithoutResponse) {
                        writeChar = c;
                        break;
                      }
                    }
                    if (writeChar != null) break;
                  }

                  if (writeChar == null) {
                    for (final s in services) {
                      for (final c in s.characteristics) {
                        if (c.properties.write ||
                            c.properties.writeWithoutResponse) {
                          writeChar = c;
                          break;
                        }
                      }
                      if (writeChar != null) break;
                    }
                  }

                  if (writeChar == null) {
                    await targetDevice.disconnect();
                    return {
                      'ok': false,
                      'error':
                          'Connected to BLE printer, but no writable print characteristic was found.'
                    };
                  }

                  const int bleChunkSize = 80;
                  final bool withoutResp =
                      writeChar.properties.writeWithoutResponse;

                  for (int i = 0; i < bytes.length; i += bleChunkSize) {
                    final end = (i + bleChunkSize > bytes.length)
                        ? bytes.length
                        : i + bleChunkSize;
                    final chunk = bytes.sublist(i, end);
                    await writeChar.write(chunk, withoutResponse: withoutResp);
                    await Future.delayed(const Duration(milliseconds: 30));
                  }

                  await Future.delayed(const Duration(milliseconds: 400));
                  await targetDevice.disconnect();

                  return {'ok': true};
                } catch (bleErr) {
                  try {
                    await targetDevice?.disconnect();
                  } catch (_) {}
                  return {
                    'ok': false,
                    'error': 'BLE Print Error: ${bleErr.toString()}'
                  };
                }
              },
            );

            // Bridge 7: MikroTik RouterOS v7 REST API Execution
            controller.addJavaScriptHandler(
              handlerName: 'mikrotikRestCall',
              callback: (args) async {
                final String method = args[0] as String;
                final String url = args[1] as String;
                final String authHeader = args[2] as String;
                final String? bodyPayload = args.length > 3 && args[3] != null
                    ? args[3] as String
                    : null;

                try {
                  final uri = Uri.parse(url);
                  final headers = <String, String>{
                    'Authorization': authHeader,
                    'Accept': 'application/json',
                    if (bodyPayload != null) 'Content-Type': 'application/json',
                  };

                  http.Response response;
                  const timeoutDuration = Duration(seconds: 5);

                  final String upperMethod = method.toUpperCase();
                  if (upperMethod == 'GET') {
                    response = await http
                        .get(uri, headers: headers)
                        .timeout(timeoutDuration);
                  } else if (upperMethod == 'POST') {
                    response = await http
                        .post(uri, headers: headers, body: bodyPayload)
                        .timeout(timeoutDuration);
                  } else if (upperMethod == 'PUT') {
                    response = await http
                        .put(uri, headers: headers, body: bodyPayload)
                        .timeout(timeoutDuration);
                  } else if (upperMethod == 'DELETE') {
                    response = await http
                        .delete(uri, headers: headers, body: bodyPayload)
                        .timeout(timeoutDuration);
                  } else {
                    return {
                      'status': 405,
                      'data': jsonEncode(
                          {'error': 'Unsupported HTTP method: $method'}),
                    };
                  }

                  return {
                    'status': response.statusCode,
                    'data': response.body,
                  };
                } catch (e) {
                  return {
                    'status': 500,
                    'data': jsonEncode({'error': e.toString()}),
                  };
                }
              },
            );

            // Bridge 8: Native Android File Storage Writer (Sales Reports & Config Backups)
            controller.addJavaScriptHandler(
              handlerName: 'saveFileNative',
              callback: (args) async {
                final String filename = args[0] as String;
                final String content = args[1] as String;
                try {
                  final List<Directory> candidates = [
                    Directory('/storage/emulated/0/Download'),
                    Directory('/storage/emulated/0/Documents'),
                  ];
                  for (final dir in candidates) {
                    if (await dir.exists()) {
                      final file = File('${dir.path}/$filename');
                      await file.writeAsString(content, flush: true);
                      debugPrint('[Native Storage Save] Saved to ${file.path}');
                      return {'ok': true, 'path': file.path};
                    }
                  }
                } catch (e) {
                  debugPrint('[Native Storage Save Exception]: $e');
                }
                return {'ok': false};
              },
            );

            // Bridge 9: Native Android Print Spooler (Print / Save as PDF)
            controller.addJavaScriptHandler(
              handlerName: 'printToPdf',
              callback: (args) async {
                try {
                  await controller.printCurrentPage();
                  return {'ok': true};
                } catch (e) {
                  debugPrint('[Native Print Error]: $e');
                  return {'ok': false, 'error': e.toString()};
                }
              },
            );

            // Bridge 10: Native Android USB Printer Discovery (OTG / Direct Cable)
            controller.addJavaScriptHandler(
              handlerName: 'scanUsbDevices',
              callback: (args) async {
                try {
                  final List<dynamic>? devices =
                      await _nativeBridge.invokeMethod<List<dynamic>>('getUsbPrinters');
                  return devices ?? [];
                } catch (e) {
                  debugPrint('[Native USB Scan Error]: $e');
                  return [];
                }
              },
            );

            // Bridge 10b: Request Native USB Printer Permission
            controller.addJavaScriptHandler(
              handlerName: 'requestUsbPermission',
              callback: (args) async {
                final String usbId = (args.isNotEmpty && args[0] is String)
                    ? (args[0] as String).trim()
                    : '';
                try {
                  final dynamic res = await _nativeBridge.invokeMethod(
                    'requestUsbPermission',
                    {'usbIdentifier': usbId},
                  );
                  if (res is Map) {
                    return res;
                  }
                  return {'ok': true};
                } catch (e) {
                  debugPrint('[Native USB Permission Error]: $e');
                  return {'ok': false, 'error': e.toString()};
                }
              },
            );

            // Bridge 11: Native Android USB Raw ESC/POS Print Dispatch
            controller.addJavaScriptHandler(
              handlerName: 'printRawUsb',
              callback: (args) async {
                final String usbId = (args[0] as String).trim();
                final List<int> bytes = List<dynamic>.from(args[1]).cast<int>();
                try {
                  final dynamic res = await _nativeBridge.invokeMethod('printRawUsb', {
                    'usbIdentifier': usbId,
                    'bytesList': bytes,
                  });
                  if (res is Map) {
                    return res;
                  }
                  return {'ok': true};
                } catch (e) {
                  debugPrint('[Native USB Print Error]: $e');
                  return {'ok': false, 'error': e.toString()};
                }
              },
            );

            // Bridge 12: Native Android Presentation Display Status
            controller.addJavaScriptHandler(
              handlerName: 'getSecondaryDisplayStatus',
              callback: (args) async {
                try {
                  final dynamic list = await _nativeBridge.invokeMethod('getDisplayList');
                  return {'ok': true, 'displays': list};
                } catch (e) {
                  return {'ok': false, 'error': e.toString()};
                }
              },
            );

            // Bridge 13: OTA Update Status Check
            controller.addJavaScriptHandler(
              handlerName: 'getOtaStatus',
              callback: (args) async {
                try {
                  final version = await OtaManager.getCurrentVersion();
                  final repo = await OtaManager.getSavedRepo();
                  final hasCustom = await OtaManager.hasCustomOta();
                  return {
                    'ok': true,
                    'currentVersion': version,
                    'repo': repo,
                    'hasCustomOta': hasCustom,
                  };
                } catch (e) {
                  return {'ok': false, 'error': e.toString()};
                }
              },
            );

            // Bridge 14: Save OTA GitHub Repository
            controller.addJavaScriptHandler(
              handlerName: 'setOtaRepo',
              callback: (args) async {
                try {
                  final repo = args[0] as String;
                  await OtaManager.saveRepo(repo);
                  return {'ok': true};
                } catch (e) {
                  return {'ok': false, 'error': e.toString()};
                }
              },
            );

            // Bridge 15: Check Latest Release on GitHub
            controller.addJavaScriptHandler(
              handlerName: 'checkOtaUpdate',
              callback: (args) async {
                try {
                  final String? repoOverride = (args.isNotEmpty && args[0] is String && (args[0] as String).isNotEmpty)
                      ? args[0] as String
                      : null;
                  return await OtaManager.checkGithubRelease(repoOverride: repoOverride);
                } catch (e) {
                  return {'ok': false, 'error': e.toString()};
                }
              },
            );

            // Bridge 16: Download and Apply OTA Update from GitHub Release
            controller.addJavaScriptHandler(
              handlerName: 'performOtaUpdate',
              callback: (args) async {
                try {
                  final downloadUrl = args[0] as String;
                  final targetVersion = args[1] as String;
                  final res = await OtaManager.downloadAndApplyUpdate(downloadUrl, targetVersion);
                  if (res['ok'] == true) {
                    Future.delayed(const Duration(milliseconds: 300), () {
                      controller.reload();
                    });
                  }
                  return res;
                } catch (e) {
                  return {'ok': false, 'error': e.toString()};
                }
              },
            );

            // Bridge 17: Rollback OTA to Bundled APK Version
            controller.addJavaScriptHandler(
              handlerName: 'rollbackOtaUpdate',
              callback: (args) async {
                try {
                  final res = await OtaManager.rollbackToBundled();
                  if (res['ok'] == true) {
                    Future.delayed(const Duration(milliseconds: 300), () {
                      controller.reload();
                    });
                  }
                  return res;
                } catch (e) {
                  return {'ok': false, 'error': e.toString()};
                }
              },
            );
          },
        ),
      ),
    );
  }
}

// REMARK: MAIN_DART_SAFE_DISPLAY_ID_PROMOTION_COMPLETE
