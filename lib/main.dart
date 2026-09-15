/// Standalone Offline POS Container Main Entry Point
/// Initializes the local embedded web server, manages lifecycle termination,
/// and hosts the core InAppWebView container with secure native bridge handlers
/// for raw TCP printing and runtime camera permission handling.
library;

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

final InAppLocalhostServer server = InAppLocalhostServer(
  documentRoot: 'assets/www',
  port: 8080,
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await server.start();
  runApp(const MaterialApp(
    debugShowCheckedModeBanner: false,
    home: POSContainer(),
  ));
}

class POSContainer extends StatefulWidget {
  const POSContainer({super.key});
  @override
  State<POSContainer> createState() => _POSContainerState();
}

class _POSContainerState extends State<POSContainer> {
  @override
  void dispose() {
    server.close();
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
          onWebViewCreated: (controller) {
            // Bridge: Raw TCP Socket (Port 9100 for LAN ESC/POS Printers)
            controller.addJavaScriptHandler(
              handlerName: 'printRawTcp',
              callback: (args) async {
                final String ip = args[0];
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
          },
        ),
      ),
    );
  }
}

// REMARK: MAIN_DART_LINTER_FIX_COMPLETE
