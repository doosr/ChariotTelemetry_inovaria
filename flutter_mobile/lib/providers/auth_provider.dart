import 'package:flutter/foundation.dart';
import '../services/auth_service.dart';

class AuthProvider extends ChangeNotifier {
  final AuthService _authService = AuthService();

  Map<String, dynamic>? _user;
  bool _isLoading = true;

  Map<String, dynamic>? get user => _user;
  bool get isLoading => _isLoading;
  bool get isLoggedIn => _user != null;

  String get userId => _user?['id'] ?? _user?['_id'] ?? '';
  String get userName => _user?['name'] ?? _user?['email'] ?? 'Utilisateur';
  String get userRole => _user?['role'] ?? '';
  String get userEmail => _user?['email'] ?? '';
  String? get userAvatar => _user?['avatar'];
  String? get parentAdminId => _user?['parentAdminId'];

  bool get isSuperAdmin => userRole == 'Super Admin';
  bool get isAdmin => userRole == 'Admin';
  bool get isTechnician => userRole == 'Technicien';
  bool get isSystemAdmin => userRole == 'System Admin';
  bool get isAdminOrAbove =>
      ['Super Admin', 'Admin', 'System Admin'].contains(userRole);
  bool get isSuperAdminOrSystemAdmin => isSuperAdmin || isSystemAdmin;

  AuthProvider() {
    _loadUser();
  }

  Future<void> _loadUser() async {
    _isLoading = true;
    notifyListeners();
    try {
      if (await _authService.isLoggedIn()) {
        _user = await _authService.getUser();
      }
    } catch (_) {}
    _isLoading = false;
    notifyListeners();
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final result = await _authService.login(email, password);
    if (result['success'] == true) {
      _user = result['user'];
      notifyListeners();
    }
    return result;
  }

  Future<void> reload() async {
    _user = await _authService.getUser();
    notifyListeners();
  }

  Future<Map<String, dynamic>> impersonate(String targetUserId) async {
    final result = await _authService.impersonate(targetUserId);
    if (result['success'] == true) {
      _user = result['user'];
      notifyListeners();
    }
    return result;
  }

  Future<void> logout() async {
    await _authService.logout();
    _user = null;
    notifyListeners();
  }

  Future<Map<String, dynamic>> changePassword(
      String currentPwd, String newPwd) async {
    return _authService.changePassword(userId, currentPwd, newPwd);
  }
}
