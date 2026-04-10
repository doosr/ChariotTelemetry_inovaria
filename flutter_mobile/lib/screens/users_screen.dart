import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../core/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../widgets/common_widgets.dart';

class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});
  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  final ApiService _api = ApiService();
  List<dynamic> _users = [];
  bool _loading = true;
  String _filterRole = 'all';

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    final auth = context.read<AuthProvider>();
    final data = await _api.getUsers(
      parentAdminId: auth.isSystemAdmin ? null : auth.userId,
      requesterRole: auth.userRole,
    );
    if (mounted)
      setState(() {
        _users = data;
        _loading = false;
      });
  }

  List<dynamic> get _filtered {
    if (_filterRole == 'all') return _users;
    return _users.where((u) => (u['role'] ?? '') == _filterRole).toList();
  }

  Future<void> _toggleLock(dynamic user) async {
    final locked = user['locked'] == true;
    final confirm = await showConfirm(
      context,
      title: locked ? 'Débloquer ce compte' : 'Bloquer ce compte',
      content: locked
          ? '${user['email']} sera débloqué et pourra se connecter.'
          : '${user['email']} ne pourra plus se connecter.',
      confirmLabel: locked ? 'Débloquer' : 'Bloquer',
      confirmColor: locked ? AppColors.success : AppColors.warning,
    );
    if (confirm == true) {
      await _api.updateUserStatus(user['_id'], locked: !locked);
      _fetch();
    }
  }

  Future<void> _deleteUser(dynamic user) async {
    final confirm = await showConfirm(
      context,
      title: 'Supprimer ${user['email']}',
      content: 'Cette action est irréversible.',
    );
    if (confirm == true) {
      await _api.deleteUser(user['_id']);
      _fetch();
    }
  }

  Future<void> _impersonateUser(dynamic user) async {
    final confirm = await showConfirm(
      context,
      title: 'Entrer dans le compte',
      content: 'Voulez-vous agir en tant que ${user['email']} ?',
    );
    if (confirm == true) {
      final res = await context.read<AuthProvider>().impersonate(user['_id']);
      if (res['success'] == true) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Connecté en tant que ${user['email']}')));
        // Will rebuild and auth_provider will trigger root navigation since listen: true in main.dart
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['error'] ?? 'Accès refusé')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final filtered = _filtered;

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: RefreshIndicator(
        onRefresh: _fetch,
        color: AppColors.primary,
        backgroundColor: AppColors.card,
        child: CustomScrollView(slivers: [
          SliverAppBar(
            expandedHeight: 150,
            pinned: true,
            backgroundColor: AppColors.bg,
            actions: [
              IconButton(
                icon: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                        gradient: AppColors.gradientPurpleBlue,
                        borderRadius: BorderRadius.circular(10)),
                    child: const Icon(Icons.person_add_outlined,
                        color: Colors.white, size: 18)),
                onPressed: () async {
                  final ok = await Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => AddUserScreen(parentAdmin: auth)));
                  if (ok == true) _fetch();
                },
              ),
              const SizedBox(width: 8),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 44),
                        Text('Équipe', style: AppText.heading1),
                        const SizedBox(height: 4),
                        Text(
                            '${_users.length} membre${_users.length != 1 ? 's' : ''}',
                            style: AppText.bodySecondary),
                      ]),
                ),
              ),
            ),
          ),

          // Role Filter
          SliverToBoxAdapter(
            child: SizedBox(
                height: 44,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children:
                      ['all', 'Super Admin', 'Admin', 'Technicien'].map((role) {
                    final active = _filterRole == role;
                    final color = role == 'all'
                        ? AppColors.primary
                        : AppRoles.color(role);
                    return GestureDetector(
                      onTap: () => setState(() => _filterRole = role),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        margin:
                            const EdgeInsets.only(right: 8, top: 5, bottom: 5),
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        decoration: BoxDecoration(
                          color: active ? color.withAlpha(40) : AppColors.card,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                              color: active ? color : AppColors.cardBorder),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                            role == 'all' ? 'Tous' : AppRoles.label(role),
                            style: GoogleFonts.inter(
                                color: active ? color : AppColors.textMuted,
                                fontSize: 12,
                                fontWeight: FontWeight.w600)),
                      ),
                    );
                  }).toList(),
                )),
          ),

          if (_loading)
            const SliverFillRemaining(child: LoadingOverlay())
          else if (filtered.isEmpty)
            const SliverFillRemaining(
                child: EmptyState(
                    icon: Icons.people_outline, title: 'Aucun membre trouvé'))
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (_, i) => _UserCard(
                          user: filtered[i],
                          index: i,
                          onLock: () => _toggleLock(filtered[i]),
                          onDelete: () => _deleteUser(filtered[i]),
                          onImpersonate: () => _impersonateUser(filtered[i]))
                      .animate()
                      .fadeIn(delay: (i * 60).ms)
                      .slideY(begin: 0.15),
                  childCount: filtered.length,
                ),
              ),
            ),
        ]),
      ),
    );
  }
}

class _UserCard extends StatelessWidget {
  final dynamic user;
  final int index;
  final VoidCallback onLock;
  final VoidCallback onDelete;
  final VoidCallback onImpersonate;
  const _UserCard(
      {required this.user,
      required this.index,
      required this.onLock,
      required this.onDelete,
      required this.onImpersonate});

  @override
  Widget build(BuildContext context) {
    final role = user['role'] ?? '';
    final isLocked = user['locked'] == true;
    final isVerified = user['verified'] == true;
    final email = user['email'] ?? '';
    final name = user['name'] ?? '';
    final initial = (name.isNotEmpty
            ? name[0]
            : email.isNotEmpty
                ? email[0]
                : '?')
        .toUpperCase();
    final roleColor = AppRoles.color(role);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
            color: isLocked
                ? AppColors.danger.withAlpha(60)
                : AppColors.cardBorder),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            // Avatar
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                    colors: [roleColor, roleColor.withAlpha(150)]),
                shape: BoxShape.circle,
              ),
              child: Center(
                  child: Text(initial,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w800))),
            ),
            const SizedBox(width: 12),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  if (name.isNotEmpty)
                    Text(name, style: AppText.heading3.copyWith(fontSize: 15)),
                  Text(email,
                      style: AppText.bodySecondary.copyWith(fontSize: 13)),
                  const SizedBox(height: 4),
                  Row(children: [
                    StatusBadge(label: AppRoles.label(role), color: roleColor),
                    const SizedBox(width: 6),
                    if (isLocked)
                      StatusBadge(label: 'BLOQUÉ', color: AppColors.danger),
                    if (!isVerified)
                      StatusBadge(
                          label: 'NON VÉRIFIÉ', color: AppColors.warning),
                  ]),
                ])),
          ]),
          const SizedBox(height: 12),
          const Divider(color: AppColors.divider, height: 1),
          const SizedBox(height: 10),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            // Impersonate
            _ActionBtn(
              label: 'Entrer',
              icon: Icons.login_rounded,
              color: AppColors.primary,
              onTap: onImpersonate,
            ),
            const SizedBox(width: 8),
            // Lock/Unlock
            _ActionBtn(
              label: isLocked ? 'Débloquer' : 'Bloquer',
              icon: isLocked ? Icons.lock_open_outlined : Icons.lock_outline,
              color: isLocked ? AppColors.success : AppColors.warning,
              onTap: onLock,
            ),
            const SizedBox(width: 8),
            _ActionBtn(
              label: 'Supprimer',
              icon: Icons.delete_outline,
              color: AppColors.danger,
              onTap: onDelete,
            ),
          ]),
        ]),
      ),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  const _ActionBtn(
      {required this.label,
      required this.icon,
      required this.color,
      required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: color.withAlpha(20),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: color.withAlpha(60)),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, color: color, size: 14),
            const SizedBox(width: 5),
            Text(label,
                style: GoogleFonts.inter(
                    color: color, fontSize: 11, fontWeight: FontWeight.w600)),
          ]),
        ),
      );
}

// ── Add User Screen ───────────────────────────────────────────────────────────

class AddUserScreen extends StatefulWidget {
  final AuthProvider parentAdmin;
  const AddUserScreen({super.key, required this.parentAdmin});
  @override
  State<AddUserScreen> createState() => _AddUserScreenState();
}

class _AddUserScreenState extends State<AddUserScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  String _role = 'Admin';
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final auth = widget.parentAdmin;
    // Admin can create: Admin, Technicien. Super Admin can create: Admin, Technicien.
    final result = await ApiService().createUser({
      'email': _emailCtrl.text.trim(),
      'password': _passCtrl.text,
      'role': _role,
      'parentAdminId': auth.userId,
    });
    if (!mounted) return;
    if (result['statusCode'] == 201) {
      Navigator.pop(context, true);
    } else {
      setState(() {
        _error = result['body']?['error'] ?? 'Erreur';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final allowedRoles = widget.parentAdmin.isSuperAdmin
        ? ['Admin', 'Technicien']
        : ['Technicien'];
    if (!allowedRoles.contains(_role)) _role = allowedRoles.first;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
          title: const Text('Ajouter un membre'),
          leading: IconButton(
              icon: const Icon(Icons.close),
              onPressed: () => Navigator.pop(context))),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
            key: _formKey,
            child: Column(children: [
              if (_error != null)
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                      color: AppColors.danger.withAlpha(20),
                      borderRadius: BorderRadius.circular(12),
                      border:
                          Border.all(color: AppColors.danger.withAlpha(60))),
                  child: Text(_error!,
                      style: const TextStyle(color: AppColors.danger)),
                ),
              AppCard(
                  child: Column(children: [
                AppTextField(
                    hint: 'Email *',
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    prefix: const Icon(Icons.email_outlined,
                        color: AppColors.textMuted, size: 18),
                    validator: (v) => (v == null || !v.contains('@'))
                        ? 'Email invalide'
                        : null),
                const SizedBox(height: 14),
                AppTextField(
                    hint: 'Mot de passe *',
                    controller: _passCtrl,
                    obscure: true,
                    prefix: const Icon(Icons.lock_outline,
                        color: AppColors.textMuted, size: 18),
                    validator: (v) => (v == null || v.length < 6)
                        ? 'Min. 6 caractères'
                        : null),
                const SizedBox(height: 14),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  decoration: BoxDecoration(
                      color: AppColors.card,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.cardBorder)),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _role,
                      isExpanded: true,
                      dropdownColor: AppColors.card,
                      style: const TextStyle(
                          color: AppColors.textPrimary, fontSize: 14),
                      items: allowedRoles
                          .map((r) => DropdownMenuItem(
                              value: r, child: Text(AppRoles.label(r))))
                          .toList(),
                      onChanged: (v) => setState(() => _role = v!),
                    ),
                  ),
                ),
              ])),
              const SizedBox(height: 24),
              GradientButton(
                  label: 'Créer le compte',
                  loading: _loading,
                  onPressed: _submit),
            ])),
      ),
    );
  }
}
