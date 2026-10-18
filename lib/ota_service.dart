import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

/// Hybrid HTTP Server running on http://localhost:8080
/// Prioritizes downloaded OTA web assets from Documents/www,
/// cleanly falling back to built-in Flutter assets/www.
class PosLocalWebServer {
  static HttpServer? _server;
  static const int port = 8080;

  static String _getMimeType(String path) {
    final ext = path.split('.').last.toLowerCase();
    switch (ext) {
      case 'html':
      case 'htm':
        return 'text/html; charset=utf-8';
      case 'css':
        return 'text/css; charset=utf-8';
      case 'js':
      case 'mjs':
        return 'application/javascript; charset=utf-8';
      case 'json':
        return 'application/json; charset=utf-8';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'svg':
        return 'image/svg+xml';
      case 'ico':
        return 'image/x-icon';
      case 'woff':
        return 'font/woff';
      case 'woff2':
        return 'font/woff2';
      case 'ttf':
        return 'font/ttf';
      case 'otf':
        return 'font/otf';
      default:
        return 'application/octet-stream';
    }
  }

  static Future<void> start() async {
    if (_server != null) return;
    try {
      _server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
      _server!.listen((HttpRequest request) async {
        try {
          var reqPath = request.uri.path;
          if (reqPath == '/' || reqPath.isEmpty) {
            reqPath = '/index.html';
          }
          if (reqPath.startsWith('/')) {
            reqPath = reqPath.substring(1);
          }

          // Check if custom OTA updated asset exists in app document directory
          final docsDir = await getApplicationDocumentsDirectory();
          final localFile = File('${docsDir.path}/www/$reqPath');

          List<int>? bytes;
          if (await localFile.exists()) {
            bytes = await localFile.readAsBytes();
          } else {
            // Clean fallback to embedded Flutter asset bundle
            try {
              final byteData = await rootBundle.load('assets/www/$reqPath');
              bytes = byteData.buffer.asUint8List();
            } catch (_) {
              bytes = null;
            }
          }

          if (bytes != null) {
            final mimeType = _getMimeType(reqPath);
            request.response.headers.set(HttpHeaders.contentTypeHeader, mimeType);
            request.response.headers.set('Access-Control-Allow-Origin', '*');
            request.response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            request.response.headers.set('Access-Control-Allow-Headers', '*');
            request.response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            request.response.add(bytes);
          } else {
            request.response.statusCode = HttpStatus.notFound;
            request.response.headers.set(HttpHeaders.contentTypeHeader, 'text/plain');
            request.response.write('File not found: $reqPath');
          }
        } catch (e) {
          request.response.statusCode = HttpStatus.internalServerError;
          request.response.headers.set(HttpHeaders.contentTypeHeader, 'text/plain');
          request.response.write('Server Error: $e');
        } finally {
          await request.response.close();
        }
      });
      debugPrint('[PosLocalWebServer] Serving on http://localhost:$port');
    } catch (e) {
      debugPrint('[PosLocalWebServer] Failed to start server: $e');
    }
  }

  static Future<void> stop() async {
    await _server?.close(force: true);
    _server = null;
  }
}

/// Over-The-Air (OTA) Update Manager using GitHub Releases
class OtaManager {
  static const String _defaultRepo = 'mielglitx/otaupdatepos';
  static const String _bundledVersion = 'v1.0.0 (Bundled)';

  /// Returns the current installed web version
  static Future<String> getCurrentVersion() async {
    try {
      final docs = await getApplicationDocumentsDirectory();
      final versionFile = File('${docs.path}/ota_version.txt');
      if (await versionFile.exists()) {
        final v = (await versionFile.readAsString()).trim();
        if (v.isNotEmpty) return v;
      }
    } catch (_) {}
    return _bundledVersion;
  }

  /// Returns whether a custom OTA update is currently active
  static Future<bool> hasCustomOta() async {
    try {
      final docs = await getApplicationDocumentsDirectory();
      final indexFile = File('${docs.path}/www/index.html');
      return await indexFile.exists();
    } catch (_) {
      return false;
    }
  }

  /// Returns the saved GitHub repository string (e.g., 'owner/repo')
  static Future<String> getSavedRepo() async {
    try {
      final docs = await getApplicationDocumentsDirectory();
      final repoFile = File('${docs.path}/ota_repo.txt');
      if (await repoFile.exists()) {
        final r = (await repoFile.readAsString()).trim();
        if (r.isNotEmpty) return r;
      }
    } catch (_) {}
    return _defaultRepo;
  }

  /// Saves the configured GitHub repository string
  static Future<void> saveRepo(String repo) async {
    final clean = repo.trim();
    final docs = await getApplicationDocumentsDirectory();
    final repoFile = File('${docs.path}/ota_repo.txt');
    await repoFile.writeAsString(clean, flush: true);
  }

  /// Checks GitHub Releases API for latest release and matching www.zip asset
  static Future<Map<String, dynamic>> checkGithubRelease({String? repoOverride}) async {
    final repo = repoOverride ?? await getSavedRepo();
    final currentVersion = await getCurrentVersion();

    final url = Uri.parse('https://api.github.com/repos/$repo/releases/latest');
    try {
      final response = await http.get(url, headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Flutter-POS-OTA-Client'
      }).timeout(const Duration(seconds: 10));

      if (response.statusCode == 404) {
        return {
          'ok': false,
          'error': 'Repository or Release not found on GitHub: "$repo". Ensure repo is public or tag is released.',
          'currentVersion': currentVersion,
        };
      }

      if (response.statusCode != 200) {
        return {
          'ok': false,
          'error': 'GitHub API error (HTTP ${response.statusCode}): ${response.body}',
          'currentVersion': currentVersion,
        };
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final tagName = (data['tag_name'] as String?)?.trim() ?? '';
      final releaseName = (data['name'] as String?)?.trim() ?? tagName;
      final releaseNotes = (data['body'] as String?)?.trim() ?? 'No changelog provided.';
      final assets = (data['assets'] as List<dynamic>?) ?? [];

      // Find the www.zip asset
      String? zipDownloadUrl;
      int zipSizeBytes = 0;
      for (final a in assets) {
        final name = (a['name'] as String?)?.toLowerCase() ?? '';
        if (name == 'www.zip' || name.endsWith('.zip')) {
          zipDownloadUrl = a['browser_download_url'] as String?;
          zipSizeBytes = (a['size'] as num?)?.toInt() ?? 0;
          break;
        }
      }

      if (zipDownloadUrl == null) {
        return {
          'ok': false,
          'error': 'Release "$tagName" found, but no "www.zip" asset is attached to it.',
          'currentVersion': currentVersion,
          'latestVersion': tagName,
          'releaseName': releaseName,
        };
      }

      final cleanTag = tagName.replaceAll(RegExp(r'[^0-9.]'), '');
      final cleanCurrent = currentVersion.replaceAll(RegExp(r'[^0-9.]'), '');
      final hasUpdate = (cleanTag.isNotEmpty && cleanCurrent.isNotEmpty)
          ? cleanTag != cleanCurrent
          : tagName != currentVersion;

      return {
        'ok': true,
        'hasUpdate': hasUpdate,
        'updateAvailable': hasUpdate,
        'currentVersion': currentVersion,
        'latestVersion': tagName,
        'releaseName': releaseName,
        'releaseNotes': releaseNotes,
        'downloadUrl': zipDownloadUrl,
        'sizeBytes': zipSizeBytes,
        'assetSize': zipSizeBytes,
        'assetName': 'www.zip',
      };
    } catch (e) {
      return {
        'ok': false,
        'error': 'Network timeout or connection error: $e',
        'currentVersion': currentVersion,
      };
    }
  }

  /// Downloads www.zip, validates structure, and extracts to documents/www/
  static Future<Map<String, dynamic>> downloadAndApplyUpdate(
    String downloadUrl,
    String targetVersion,
  ) async {
    try {
      debugPrint('[OTA Update] Downloading from $downloadUrl...');
      final response = await http.get(
        Uri.parse(downloadUrl),
        headers: {'User-Agent': 'Flutter-POS-OTA-Client'},
      ).timeout(const Duration(seconds: 45));

      if (response.statusCode != 200) {
        return {
          'ok': false,
          'error': 'Download failed with HTTP ${response.statusCode}',
        };
      }

      final bytes = response.bodyBytes;
      if (bytes.isEmpty) {
        return {'ok': false, 'error': 'Downloaded file is empty.'};
      }

      // Decode ZIP archive
      final archive = ZipDecoder().decodeBytes(bytes);
      final docs = await getApplicationDocumentsDirectory();
      final tempDir = Directory('${docs.path}/www_temp');
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
      await tempDir.create(recursive: true);

      // Extract each file
      for (final file in archive) {
        final filename = file.name;
        if (file.isFile) {
          final outFile = File('${tempDir.path}/$filename');
          await outFile.parent.create(recursive: true);
          await outFile.writeAsBytes(file.content as List<int>, flush: true);
        } else {
          await Directory('${tempDir.path}/$filename').create(recursive: true);
        }
      }

      // Verify that index.html exists in extracted contents
      bool hasIndex = await File('${tempDir.path}/index.html').exists();
      if (!hasIndex) {
        // Check if root of zip has a subfolder like www/index.html
        final subIndex = File('${tempDir.path}/www/index.html');
        if (await subIndex.exists()) {
          // Flatten contents up one directory
          final subDir = Directory('${tempDir.path}/www');
          for (final entity in subDir.listSync()) {
            final targetPath = '${tempDir.path}/${entity.uri.pathSegments.last}';
            await entity.rename(targetPath);
          }
          await subDir.delete(recursive: true);
          hasIndex = true;
        }
      }

      if (!hasIndex) {
        await tempDir.delete(recursive: true);
        return {
          'ok': false,
          'error': 'Corrupt bundle: index.html was not found in the root of www.zip.',
        };
      }

      // Safely replace documents/www with tempDir
      final targetDir = Directory('${docs.path}/www');
      if (await targetDir.exists()) {
        await targetDir.delete(recursive: true);
      }
      await tempDir.rename(targetDir.path);

      // Save version marker
      final versionFile = File('${docs.path}/ota_version.txt');
      await versionFile.writeAsString(targetVersion, flush: true);

      debugPrint('[OTA Update] Successfully applied version $targetVersion');
      return {
        'ok': true,
        'version': targetVersion,
      };
    } catch (e) {
      debugPrint('[OTA Update Error]: $e');
      return {
        'ok': false,
        'error': 'Extraction or download failure: $e',
      };
    }
  }

  /// Deletes downloaded OTA web assets and restores factory bundled APK assets
  static Future<Map<String, dynamic>> rollbackToBundled() async {
    try {
      final docs = await getApplicationDocumentsDirectory();
      final targetDir = Directory('${docs.path}/www');
      if (await targetDir.exists()) {
        await targetDir.delete(recursive: true);
      }
      final versionFile = File('${docs.path}/ota_version.txt');
      if (await versionFile.exists()) {
        await versionFile.delete();
      }
      return {'ok': true, 'version': _bundledVersion};
    } catch (e) {
      return {'ok': false, 'error': e.toString()};
    }
  }
}
