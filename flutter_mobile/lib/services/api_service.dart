import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/constants.dart';
import 'auth_service.dart';

class ApiService {
  final AuthService _authService = AuthService();

  Future<Map<String, String>> _headers() async {
    final token = await _authService.getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<dynamic> _get(String path) async {
    try {
      final r = await http
          .get(Uri.parse('${AppConstants.baseUrl}$path'),
              headers: await _headers())
          .timeout(const Duration(seconds: 12));
      if (r.statusCode == 401) {
        final refreshed = await _authService.refreshAccessToken();
        if (refreshed) {
          final r2 = await http
              .get(Uri.parse('${AppConstants.baseUrl}$path'),
                  headers: await _headers())
              .timeout(const Duration(seconds: 10));
          return jsonDecode(r2.body);
        }
      }
      return jsonDecode(r.body);
    } catch (_) {
      return null;
    }
  }

  Future<dynamic> _post(String path, Map<String, dynamic> body) async {
    try {
      final r = await http
          .post(Uri.parse('${AppConstants.baseUrl}$path'),
              headers: await _headers(), body: jsonEncode(body))
          .timeout(const Duration(seconds: 12));
      return {'statusCode': r.statusCode, 'body': jsonDecode(r.body)};
    } catch (e) {
      return {
        'statusCode': 500,
        'body': {'error': 'Erreur réseau'}
      };
    }
  }

  Future<dynamic> _put(String path, Map<String, dynamic> body) async {
    try {
      final r = await http
          .put(Uri.parse('${AppConstants.baseUrl}$path'),
              headers: await _headers(), body: jsonEncode(body))
          .timeout(const Duration(seconds: 12));
      return {'statusCode': r.statusCode, 'body': jsonDecode(r.body)};
    } catch (e) {
      return {
        'statusCode': 500,
        'body': {'error': 'Erreur réseau'}
      };
    }
  }

  Future<dynamic> _delete(String path) async {
    try {
      final r = await http
          .delete(Uri.parse('${AppConstants.baseUrl}$path'),
              headers: await _headers())
          .timeout(const Duration(seconds: 12));
      return {'statusCode': r.statusCode, 'body': jsonDecode(r.body)};
    } catch (e) {
      return {
        'statusCode': 500,
        'body': {'error': 'Erreur réseau'}
      };
    }
  }

  // ── MACHINES ──────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getMachines(
      {String? ownerId,
      String? role,
      bool includeTelemetry = true,
      String? technicianId}) async {
    var path =
        '/machines?includeTelemetry=${includeTelemetry ? 'true' : 'false'}';
    if (ownerId != null) path += '&ownerId=$ownerId';
    if (role != null) path += '&requesterRole=${Uri.encodeComponent(role)}';
    if (technicianId != null) path += '&technicianId=$technicianId';
    final data = await _get(path);
    if (data is List) return data;
    return [];
  }

  Future<Map<String, dynamic>> createMachine(Map<String, dynamic> body) async {
    final r = await _post('/machines', body);
    return r;
  }

  Future<Map<String, dynamic>> updateMachine(
      String deviceId, Map<String, dynamic> body) async {
    final r = await _put('/machines/$deviceId', body);
    return r;
  }

  Future<Map<String, dynamic>> deleteMachine(String deviceId) async {
    final r = await _delete('/machines/$deviceId');
    return r;
  }

  // ── USERS ─────────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getUsers(
      {String? parentAdminId, String? requesterRole}) async {
    var path = '/users?';
    if (parentAdminId != null) path += 'parentAdminId=$parentAdminId&';
    if (requesterRole != null) {
      path += 'requesterRole=${Uri.encodeComponent(requesterRole)}';
    }
    final data = await _get(path);
    if (data is List) return data;
    return [];
  }

  Future<Map<String, dynamic>> createUser(Map<String, dynamic> body) async {
    final r = await _post('/users', body);
    return r;
  }

  Future<Map<String, dynamic>> deleteUser(String userId) async {
    final r = await _delete('/users/$userId');
    return r;
  }

  Future<Map<String, dynamic>> updateUserStatus(String userId,
      {bool? locked, bool? verified}) async {
    final body = <String, dynamic>{};
    if (locked != null) body['locked'] = locked;
    if (verified != null) body['verified'] = verified;
    final r = await _put('/users/$userId/status', body);
    return r;
  }

  Future<List<dynamic>> getTechnicians(
      {String? parentAdminId, String? requesterRole}) async {
    final users = await getUsers(
        parentAdminId: parentAdminId, requesterRole: requesterRole);
    return users.where((u) => u['role'] == 'Technicien').toList();
  }

  Future<Map<String, dynamic>> assignTechnicians(String deviceId, List<String> technicianIds) async {
    final res = await _put('/machines/$deviceId/technicians', {'technicianIds': technicianIds});
    return res as Map<String, dynamic>;
  }

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

  Future<List<dynamic>> getNotifications({int limit = 50}) async {
    final data = await _get('/notifications?limit=$limit');
    if (data is List) return data;
    return [];
  }

  Future<void> markAllNotificationsRead() =>
      _post('/notifications/read/all', {});
  Future<void> clearNotifications() => _delete('/notifications/clear');

  // ── TELEMETRY ─────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getTelemetry(String deviceId, {int limit = 20}) async {
    final data = await _get('/telemetry/$deviceId?limit=$limit');
    if (data is List) return data;
    return [];
  }

  // ── COMMANDS ──────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> sendCommand(
      String deviceId, String ownerId, String command, String state) async {
    final r = await _post('/command', {
      'deviceId': deviceId,
      'ownerId': ownerId,
      'feed': 'feeds/truck-commands',
      'command': command,
      'state': state,
    });
    return r;
  }
}
