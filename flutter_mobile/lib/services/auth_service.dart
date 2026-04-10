import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../core/app_theme.dart';

class AuthService {
  static const String _tokenKey = 'accessToken';
  static const String _refreshKey = 'refreshToken';
  static const String _userKey = 'user';

  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  Future<String?> getRefreshToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_refreshKey);
  }

  Future<Map<String, dynamic>?> getUser() async {
    final prefs = await SharedPreferences.getInstance();
    final str = prefs.getString(_userKey);
    if (str == null) return null;
    return jsonDecode(str);
  }

  Future<void> _saveSession(Map<String, dynamic> data) async {
    final prefs = await SharedPreferences.getInstance();
    if (data['accessToken'] != null)
      await prefs.setString(_tokenKey, data['accessToken']);
    if (data['refreshToken'] != null)
      await prefs.setString(_refreshKey, data['refreshToken']);
    if (data['user'] != null)
      await prefs.setString(_userKey, jsonEncode(data['user']));
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> login(String email, String password) async {
    try {
      final r = await http
          .post(
            Uri.parse('${AppConstants.authUrl}/login'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'email': email, 'password': password}),
          )
          .timeout(const Duration(seconds: 12));
      final data = jsonDecode(r.body);
      if (r.statusCode == 200 && data['success'] == true) {
        await _saveSession(data);
        return {'success': true, 'user': data['user']};
      }
      return {
        'success': false,
        'error': data['error'] ?? 'Erreur de connexion'
      };
    } catch (_) {
      return {'success': false, 'error': 'Impossible de joindre le serveur'};
    }
  }

  // ── Impersonate ────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> impersonate(String targetUserId) async {
    try {
      final token = await getToken();
      final r = await http
          .post(
            Uri.parse('${AppConstants.authUrl}/impersonate'),
            headers: {
              'Content-Type': 'application/json',
              if (token != null) 'Authorization': 'Bearer $token'
            },
            body: jsonEncode({'targetUserId': targetUserId}),
          )
          .timeout(const Duration(seconds: 12));
      final data = jsonDecode(r.body);
      if (r.statusCode == 200 && data['success'] == true) {
        await _saveSession(data);
        return {'success': true, 'user': data['user']};
      }
      return {'success': false, 'error': data['error'] ?? 'Accès refusé'};
    } catch (_) {
      return {'success': false, 'error': 'Erreur réseau'};
    }
  }

  // ── Google Auth ────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> googleAuth({
    required String googleId,
    required String email,
    String? name,
    String? avatar,
  }) async {
    try {
      final r = await http
          .post(
            Uri.parse('${AppConstants.authUrl}/google'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'googleId': googleId,
              'email': email,
              'name': name,
              'avatar': avatar
            }),
          )
          .timeout(const Duration(seconds: 12));
      final data = jsonDecode(r.body);
      if (r.statusCode == 200 && data['success'] == true) {
        await _saveSession(data);
        return {'success': true, 'user': data['user']};
      }
      if (data['needsVerification'] == true) {
        return {
          'success': false,
          'needsVerification': true,
          'email': data['email']
        };
      }
      return {'success': false, 'error': data['error'] ?? 'Erreur Google'};
    } catch (_) {
      return {'success': false, 'error': 'Erreur réseau'};
    }
  }

  // ── Register Super Admin ────────────────────────────────────────────────────

  Future<Map<String, dynamic>> registerSuperAdmin({
    required String email,
    required String password,
    required String confirmPassword,
    required String inviteCode,
  }) async {
    try {
      final r = await http
          .post(
            Uri.parse('${AppConstants.authUrl}/register-superadmin'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'email': email,
              'password': password,
              'confirmPassword': confirmPassword,
              'inviteCode': inviteCode
            }),
          )
          .timeout(const Duration(seconds: 12));
      final data = jsonDecode(r.body);
      if (r.statusCode == 201 && data['success'] == true) {
        return {'success': true, 'email': data['email']};
      }
      return {'success': false, 'error': data['error'] ?? 'Erreur inscription'};
    } catch (_) {
      return {'success': false, 'error': 'Erreur réseau'};
    }
  }

  // ── Verify Email ───────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> verifyEmail(
      {required String email, required String code}) async {
    try {
      final r = await http
          .post(
            Uri.parse('${AppConstants.authUrl}/verify-email'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'email': email, 'code': code}),
          )
          .timeout(const Duration(seconds: 12));
      final data = jsonDecode(r.body);
      if (r.statusCode == 200 && data['success'] == true) {
        await _saveSession(data);
        return {'success': true};
      }
      return {'success': false, 'error': data['error'] ?? 'Code invalide'};
    } catch (_) {
      return {'success': false, 'error': 'Erreur réseau'};
    }
  }

  // ── Forgot Password ────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> forgotPassword({required String email}) async {
    try {
      final r = await http
          .post(
            Uri.parse('${AppConstants.authUrl}/forgot-password'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'email': email}),
          )
          .timeout(const Duration(seconds: 12));
      return {'success': r.statusCode == 200};
    } catch (_) {
      return {'success': false, 'error': 'Erreur réseau'};
    }
  }

  // ── Reset Password ─────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> checkResetCode(String email, String code) async {
    try {
      final r = await http
          .post(
            Uri.parse('${AppConstants.authUrl}/check-reset-code'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'email': email, 'code': code}),
          )
          .timeout(const Duration(seconds: 12));
      final data = jsonDecode(r.body);
      if (r.statusCode == 200 && data['valid'] == true) {
        return {'success': true};
      }
      return {'success': false, 'error': data['error'] ?? 'Code invalide ou expiré'};
    } catch (_) {
      return {'success': false, 'error': 'Erreur réseau'};
    }
  }

  Future<Map<String, dynamic>> resetPassword({
    required String email,
    required String code,
    required String password,
    required String confirmPassword,
  }) async {
    try {
      final r = await http
          .post(
            Uri.parse('${AppConstants.authUrl}/reset-password'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'email': email,
              'code': code,
              'password': password,
              'confirmPassword': confirmPassword
            }),
          )
          .timeout(const Duration(seconds: 12));
      final data = jsonDecode(r.body);
      if (r.statusCode == 200 && data['success'] == true)
        return {'success': true};
      return {
        'success': false,
        'error': data['error'] ?? 'Code invalide ou expiré'
      };
    } catch (_) {
      return {'success': false, 'error': 'Erreur réseau'};
    }
  }

  // ── Refresh Token ──────────────────────────────────────────────────────────

  Future<bool> refreshAccessToken() async {
    try {
      final rt = await getRefreshToken();
      if (rt == null) return false;
      final r = await http
          .post(
            Uri.parse('${AppConstants.authUrl}/refresh'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refreshToken': rt}),
          )
          .timeout(const Duration(seconds: 10));
      final data = jsonDecode(r.body);
      if (r.statusCode == 200 && data['success'] == true) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_tokenKey, data['accessToken']);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  // ── Change Password ────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> changePassword(
      String userId, String currentPwd, String newPwd) async {
    try {
      final token = await getToken();
      final r = await http
          .put(
            Uri.parse('${AppConstants.authUrl}/password'),
            headers: {
              'Content-Type': 'application/json',
              if (token != null) 'Authorization': 'Bearer $token'
            },
            body: jsonEncode({
              'userId': userId,
              'currentPassword': currentPwd,
              'newPassword': newPwd
            }),
          )
          .timeout(const Duration(seconds: 10));
      final data = jsonDecode(r.body);
      return {'success': r.statusCode == 200, 'error': data['error']};
    } catch (_) {
      return {'success': false, 'error': 'Erreur réseau'};
    }
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_refreshKey);
    await prefs.remove(_userKey);
  }

  Future<bool> isLoggedIn() async {
    final token = await getToken();
    final user = await getUser();
    return token != null && user != null;
  }
}
