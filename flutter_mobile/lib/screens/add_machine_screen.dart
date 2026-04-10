import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../core/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../widgets/common_widgets.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// ADD MACHINE SCREEN — with admin assignment (Super Admin) + calibration
// ═══════════════════════════════════════════════════════════════════════════════

class AddMachineScreen extends StatefulWidget {
  const AddMachineScreen({super.key});
  @override
  State<AddMachineScreen> createState() => _AddMachineScreenState();
}

class _AddMachineScreenState extends State<AddMachineScreen>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();
  final _deviceIdCtrl = TextEditingController();
  final _serialCtrl = TextEditingController();
  final _descCtrl = TextEditingController();

  // Calibration fields
  final _tempWarnCtrl = TextEditingController(text: '85');
  final _tempDangerCtrl = TextEditingController(text: '100');
  final _oilWarnCtrl = TextEditingController(text: '1.5');
  final _oilDangerCtrl = TextEditingController(text: '1.0');
  final _fuelLowCtrl = TextEditingController(text: '20');
  final _intervalHCtrl = TextEditingController(text: '500');
  final _intervalKmCtrl = TextEditingController(text: '10000');

  bool _loading = false;
  bool _loadingAdmins = false;
  String? _error;
  late TabController _tabCtrl;

  // Owner assignment
  String _ownerType = 'self'; // 'self' | 'admin'
  String? _selectedAdminId;
  List<dynamic> _admins = [];

  // Technician assignment
  List<dynamic> _techs = [];
  final List<String> _selectedTechIds = [];
  bool _loadingTechs = false;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 3, vsync: this);
    final auth = context.read<AuthProvider>();
    _loadData(auth);
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    for (final c in [
      _nameCtrl,
      _modelCtrl,
      _deviceIdCtrl,
      _serialCtrl,
      _descCtrl,
      _tempWarnCtrl,
      _tempDangerCtrl,
      _oilWarnCtrl,
      _oilDangerCtrl,
      _fuelLowCtrl,
      _intervalHCtrl,
      _intervalKmCtrl
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadData(AuthProvider auth) async {
    setState(() {
      _loadingAdmins = true;
      _loadingTechs = true;
    });

    try {
      final allUsers = await ApiService().getUsers(
        parentAdminId: auth.userId,
        requesterRole: auth.userRole,
      );

      if (mounted) {
        setState(() {
          _admins = allUsers.where((u) => u['role'] == 'Admin').toList();
          _techs = allUsers.where((u) => u['role'] == 'Technicien').toList();
          _loadingAdmins = false;
          _loadingTechs = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadingAdmins = false;
          _loadingTechs = false;
          _error = "Erreur lors du chargement des utilisateurs";
        });
      }
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      if (_tabCtrl.index != 0) _tabCtrl.animateTo(0);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });

    final auth = context.read<AuthProvider>();
    final ownerId =
        _ownerType == 'self' ? auth.userId : (_selectedAdminId ?? auth.userId);

    final result = await ApiService().createMachine({
      'ownerId': ownerId,
      'name': _nameCtrl.text.trim(),
      'model': _modelCtrl.text.trim(),
      'deviceId': _deviceIdCtrl.text.trim(),
      'serial': _serialCtrl.text.trim(),
      'description': _descCtrl.text.trim(),
      'calibration': {
        'tempWarn': double.tryParse(_tempWarnCtrl.text) ?? 85,
        'tempDanger': double.tryParse(_tempDangerCtrl.text) ?? 100,
        'oilWarn': double.tryParse(_oilWarnCtrl.text) ?? 1.5,
        'oilDanger': double.tryParse(_oilDangerCtrl.text) ?? 1.0,
        'fuelLow': double.tryParse(_fuelLowCtrl.text) ?? 20,
      },
      'maintenance': {
        'nextOilChangeHours': double.tryParse(_intervalHCtrl.text) ?? 500,
        'nextOilChangeKm': double.tryParse(_intervalKmCtrl.text) ?? 10000,
      },
    });

    if (!mounted) return;
    if (result['statusCode'] == 201) {
      final newMachine = result['body'];
      final devId = newMachine['deviceId'];

      // Assign technicians if any selected
      if (_selectedTechIds.isNotEmpty && devId != null) {
        await ApiService().assignTechnicians(devId, _selectedTechIds);
      }

      if (mounted) Navigator.pop(context, true);
    } else {
      setState(() {
        _error = result['body']?['error'] ?? 'Erreur lors de la création';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isSuperAdmin = auth.isSuperAdminOrSystemAdmin;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        leading: IconButton(
            icon: const Icon(Icons.close, size: 20),
            onPressed: () => Navigator.pop(context)),
        title: ShaderMask(
          shaderCallback: (b) => AppColors.gradientPurpleBlue.createShader(b),
          child: Text('🚜 Ajouter un chariot',
              style: GoogleFonts.inter(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w800)),
        ),
        bottom: TabBar(
          controller: _tabCtrl,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textMuted,
          labelStyle:
              GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 13),
          indicatorColor: AppColors.primary,
          indicator: const UnderlineTabIndicator(
            borderSide: BorderSide(color: AppColors.primary, width: 2.5),
          ),
          tabs: const [
            Tab(
                icon: Icon(Icons.info_outline_rounded, size: 18),
                text: 'Infos'),
            Tab(icon: Icon(Icons.tune_rounded, size: 18), text: 'Calibration'),
            Tab(
                icon: Icon(Icons.engineering_outlined, size: 18),
                text: 'Techniciens'),
          ],
        ),
      ),
      body: Form(
        key: _formKey,
        child: TabBarView(
          controller: _tabCtrl,
          children: [
            // ── TAB 1 : Machine Info + Owner Assignment
            SingleChildScrollView(
              padding: const EdgeInsets.all(20),
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
                    child: Row(children: [
                      const Icon(Icons.error_outline,
                          color: AppColors.danger, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                          child: Text(_error!,
                              style: const TextStyle(
                                  color: AppColors.danger, fontSize: 13))),
                    ]),
                  ).animate().fadeIn().shakeX(),

                // Basic info card
                AppCard(
                  child: Column(children: [
                    _SectionLabel(
                        icon: Icons.local_shipping_rounded,
                        title: 'Informations de base'),
                    const SizedBox(height: 12),
                    AppTextField(
                      hint: 'Nom du chariot *',
                      controller: _nameCtrl,
                      prefix: const Icon(Icons.drive_file_rename_outline,
                          color: AppColors.textMuted, size: 18),
                      validator: (v) =>
                          (v == null || v.isEmpty) ? 'Requis' : null,
                    ),
                    const SizedBox(height: 12),
                    AppTextField(
                      hint: 'Modèle *',
                      controller: _modelCtrl,
                      prefix: const Icon(Icons.category_outlined,
                          color: AppColors.textMuted, size: 18),
                      validator: (v) =>
                          (v == null || v.isEmpty) ? 'Requis' : null,
                    ),
                    const SizedBox(height: 12),
                    AppTextField(
                      hint: 'Device ID (unique) *',
                      controller: _deviceIdCtrl,
                      prefix: const Icon(Icons.fingerprint,
                          color: AppColors.textMuted, size: 18),
                      validator: (v) =>
                          (v == null || v.isEmpty) ? 'Requis' : null,
                    ),
                    const SizedBox(height: 12),
                    AppTextField(
                      hint: 'Numéro de série',
                      controller: _serialCtrl,
                      prefix: const Icon(Icons.tag,
                          color: AppColors.textMuted, size: 18),
                    ),
                    const SizedBox(height: 12),
                    AppTextField(
                      hint: 'Description / Notes',
                      controller: _descCtrl,
                      maxLines: 3,
                      prefix: const Icon(Icons.notes,
                          color: AppColors.textMuted, size: 18),
                    ),
                  ]),
                ).animate().fadeIn(delay: 100.ms).slideY(begin: 0.1),

                const SizedBox(height: 16),

                // Owner assignment (Super Admin only)
                if (isSuperAdmin)
                  AppCard(
                    borderColor: AppColors.primary.withAlpha(60),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SectionLabel(
                              icon: Icons.assignment_ind_rounded,
                              title: 'Assignation du propriétaire'),
                          const SizedBox(height: 12),
                          Text('Ce chariot sera géré par :',
                              style:
                                  AppText.bodySecondary.copyWith(fontSize: 12)),
                          const SizedBox(height: 10),

                          // Self
                          _OwnerOption(
                            selected: _ownerType == 'self',
                            title: 'Moi-même (Super Admin)',
                            subtitle: auth.userEmail,
                            icon: Icons.admin_panel_settings_rounded,
                            color: AppColors.primary,
                            onTap: () => setState(() {
                              _ownerType = 'self';
                              _selectedAdminId = null;
                            }),
                          ),
                          const SizedBox(height: 8),

                          // Specific Admin
                          _OwnerOption(
                            selected: _ownerType == 'admin',
                            title: 'Assigner à un Admin',
                            subtitle: 'Choisir parmi les admins créés',
                            icon: Icons.person_rounded,
                            color: AppColors.accent,
                            onTap: () => setState(() => _ownerType = 'admin'),
                          ),

                          if (_ownerType == 'admin') ...[
                            const SizedBox(height: 12),
                            _loadingAdmins
                                ? const Center(
                                    child: CircularProgressIndicator(
                                        color: AppColors.primary,
                                        strokeWidth: 2))
                                : _admins.isEmpty
                                    ? Container(
                                        padding: const EdgeInsets.all(12),
                                        decoration: BoxDecoration(
                                            color:
                                                AppColors.warning.withAlpha(15),
                                            borderRadius:
                                                BorderRadius.circular(10),
                                            border: Border.all(
                                                color: AppColors.warning
                                                    .withAlpha(60))),
                                        child: Row(children: [
                                          const Icon(Icons.info_outline,
                                              color: AppColors.warning,
                                              size: 16),
                                          const SizedBox(width: 8),
                                          const Expanded(
                                              child: Text(
                                                  'Aucun Admin trouvé. Créez d\'abord un Admin dans la section Équipe.',
                                                  style: TextStyle(
                                                      color: AppColors.warning,
                                                      fontSize: 12))),
                                        ]),
                                      )
                                    : Column(
                                        children: _admins
                                            .map((admin) => _AdminTile(
                                                  admin: admin,
                                                  selected: _selectedAdminId ==
                                                      admin['_id'],
                                                  onTap: () => setState(() =>
                                                      _selectedAdminId =
                                                          admin['_id']),
                                                ))
                                            .toList()),
                          ],
                        ]),
                  ).animate().fadeIn(delay: 200.ms).slideY(begin: 0.1),

                const SizedBox(height: 24),
                GradientButton(
                    label: 'Ajouter le chariot',
                    loading: _loading,
                    onPressed: _submit),
              ]),
            ),

            // ── TAB 2 : Calibration
            SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(children: [
                AppCard(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _SectionLabel(
                            icon: Icons.thermostat_rounded,
                            title: 'Températures Moteur (°C)'),
                        const SizedBox(height: 12),
                        Row(children: [
                          Expanded(
                              child: _CalibField(
                                  label: '⚠️ Seuil Avertissement',
                                  controller: _tempWarnCtrl,
                                  hint: 'Ex: 85')),
                          const SizedBox(width: 12),
                          Expanded(
                              child: _CalibField(
                                  label: '🚨 Seuil Critique',
                                  controller: _tempDangerCtrl,
                                  hint: 'Ex: 100')),
                        ]),
                      ]),
                ).animate().fadeIn(delay: 100.ms).slideY(begin: 0.1),
                const SizedBox(height: 12),
                AppCard(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _SectionLabel(
                            icon: Icons.opacity_rounded,
                            title: 'Pression Huile (Bar)'),
                        const SizedBox(height: 12),
                        Row(children: [
                          Expanded(
                              child: _CalibField(
                                  label: '⚠️ Seuil Avertissement',
                                  controller: _oilWarnCtrl,
                                  hint: 'Ex: 1.5')),
                          const SizedBox(width: 12),
                          Expanded(
                              child: _CalibField(
                                  label: '🚨 Seuil Critique',
                                  controller: _oilDangerCtrl,
                                  hint: 'Ex: 1.0')),
                        ]),
                      ]),
                ).animate().fadeIn(delay: 150.ms).slideY(begin: 0.1),
                const SizedBox(height: 12),
                AppCard(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _SectionLabel(
                            icon: Icons.local_gas_station_rounded,
                            title: 'Carburant'),
                        const SizedBox(height: 12),
                        _CalibField(
                            label: '⚠️ Niveau bas (%)',
                            controller: _fuelLowCtrl,
                            hint: 'Ex: 20'),
                      ]),
                ).animate().fadeIn(delay: 200.ms).slideY(begin: 0.1),
                const SizedBox(height: 12),
                AppCard(
                  borderColor: AppColors.teal.withAlpha(60),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _SectionLabel(
                            icon: Icons.build_rounded,
                            title: 'Intervalles Maintenance'),
                        const SizedBox(height: 12),
                        Row(children: [
                          Expanded(
                              child: _CalibField(
                                  label: '⏱ Intervalle (heures)',
                                  controller: _intervalHCtrl,
                                  hint: 'Ex: 500')),
                          const SizedBox(width: 12),
                          Expanded(
                              child: _CalibField(
                                  label: '🛣 Intervalle (km)',
                                  controller: _intervalKmCtrl,
                                  hint: 'Ex: 10000')),
                        ]),
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                              color: AppColors.teal.withAlpha(15),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                  color: AppColors.teal.withAlpha(50))),
                          child: Row(children: [
                            const Icon(Icons.info_outline,
                                color: AppColors.teal, size: 14),
                            const SizedBox(width: 8),
                            Expanded(
                                child: Text(
                                    'La maintenance sera notifiée à ces intervalles',
                                    style: AppText.caption)),
                          ]),
                        ),
                      ]),
                ).animate().fadeIn(delay: 250.ms).slideY(begin: 0.1),
                const SizedBox(height: 24),
                GradientButton(
                    label: 'Ajouter le chariot',
                    loading: _loading,
                    onPressed: _submit),
              ]),
            ),

            // ── TAB 3 : Technicians Assignment
            SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _SectionLabel(
                        icon: Icons.engineering_rounded,
                        title: 'Assignation techniciens'),
                    const SizedBox(height: 12),
                    Text(
                        'Techniciens ayant accès à ce chariot :',
                        style: AppText.bodySecondary.copyWith(fontSize: 12)),
                    const SizedBox(height: 16),
                    if (_loadingTechs)
                      const Center(child: Padding(
                        padding: EdgeInsets.all(40.0),
                        child: LoadingOverlay(),
                      ))
                    else if (_techs.isEmpty)
                      Center(
                        child: Column(children: [
                          const SizedBox(height: 40),
                          Icon(Icons.people_outline,
                              size: 48, color: AppColors.textMuted.withAlpha(50)),
                          const SizedBox(height: 12),
                          const Text('Aucun technicien trouvé',
                              style: TextStyle(color: AppColors.textMuted)),
                        ]),
                      )
                    else
                      ..._techs.map((t) {
                        final tid = t['_id']?.toString() ?? '';
                        final isSelected = _selectedTechIds.contains(tid);
                        return _TechTile(
                          tech: t,
                          selected: isSelected,
                          onTap: () {
                            setState(() {
                              if (isSelected) {
                                _selectedTechIds.remove(tid);
                              } else {
                                _selectedTechIds.add(tid);
                              }
                            });
                          },
                        );
                      }),
                    const SizedBox(height: 40),
                    GradientButton(
                        label: 'Créer le chariot',
                        loading: _loading,
                        onPressed: _submit),
                  ]),
            ).animate().fadeIn(delay: 200.ms),
          ],
        ),
      ),
    );
  }
}

// ── Widgets helpers ────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  final IconData icon;
  final String title;
  const _SectionLabel({required this.icon, required this.title});

  @override
  Widget build(BuildContext context) => Row(children: [
        Container(
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
              gradient: AppColors.gradientPurpleBlue,
              borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, color: Colors.white, size: 16),
        ),
        const SizedBox(width: 10),
        Text(title, style: AppText.heading3),
      ]);
}

class _CalibField extends StatelessWidget {
  final String label, hint;
  final TextEditingController controller;
  const _CalibField(
      {required this.label, required this.controller, required this.hint});

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: AppText.label.copyWith(fontSize: 11)),
        const SizedBox(height: 6),
        AppTextField(
          hint: hint,
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
        ),
      ]);
}

class _OwnerOption extends StatelessWidget {
  final bool selected;
  final String title, subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  const _OwnerOption(
      {required this.selected,
      required this.title,
      required this.subtitle,
      required this.icon,
      required this.color,
      required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: selected ? color.withAlpha(20) : AppColors.bgCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
                color: selected ? color.withAlpha(100) : AppColors.cardBorder,
                width: selected ? 1.5 : 1),
          ),
          child: Row(children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                  color: selected ? color.withAlpha(30) : AppColors.card,
                  shape: BoxShape.circle),
              child: Icon(icon,
                  color: selected ? color : AppColors.textMuted, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(title,
                      style: GoogleFonts.inter(
                          color: selected ? color : AppColors.textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w700)),
                  Text(subtitle, style: AppText.caption),
                ])),
            if (selected)
              Icon(Icons.check_circle_rounded, color: color, size: 20),
          ]),
        ),
      );
}

class _AdminTile extends StatelessWidget {
  final dynamic admin;
  final bool selected;
  final VoidCallback onTap;
  const _AdminTile(
      {required this.admin, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final initial = ((admin['name'] ?? admin['email'] ?? '?') as String)
        .characters
        .first
        .toUpperCase();
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent.withAlpha(20) : AppColors.bgCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: selected
                  ? AppColors.accent.withAlpha(100)
                  : AppColors.cardBorder),
        ),
        child: Row(children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: selected ? AppColors.accent : AppColors.card,
            child: Text(initial,
                style: GoogleFonts.inter(
                    color: selected ? Colors.white : AppColors.textSecondary,
                    fontWeight: FontWeight.w800,
                    fontSize: 14)),
          ),
          const SizedBox(width: 10),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(admin['name'] ?? admin['email'] ?? '—',
                    style: AppText.body
                        .copyWith(fontWeight: FontWeight.w700, fontSize: 13)),
                Text(admin['email'] ?? '', style: AppText.caption),
                if (admin['machines']?.length != null)
                  Text('${admin['machines'].length} chariot(s) actuels',
                      style: AppText.caption.copyWith(color: AppColors.accent)),
              ])),
          if (selected)
            const Icon(Icons.check_circle_rounded,
                color: AppColors.accent, size: 20),
        ]),
      ),
    );
  }
}

class _TechTile extends StatelessWidget {
  final dynamic tech;
  final bool selected;
  final VoidCallback onTap;
  const _TechTile(
      {required this.tech, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final initial = ((tech['name'] ?? tech['email'] ?? '?') as String)
        .characters
        .first
        .toUpperCase();
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary.withAlpha(20) : AppColors.bgCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: selected
                  ? AppColors.primary.withAlpha(100)
                  : AppColors.cardBorder),
        ),
        child: Row(children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: selected ? AppColors.primary : AppColors.card,
            child: Text(initial,
                style: GoogleFonts.inter(
                    color: selected ? Colors.white : AppColors.textSecondary,
                    fontWeight: FontWeight.w800,
                    fontSize: 14)),
          ),
          const SizedBox(width: 10),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(tech['name'] ?? tech['email'] ?? '—',
                    style: AppText.body
                        .copyWith(fontWeight: FontWeight.w700, fontSize: 13)),
                Text(tech['email'] ?? '', style: AppText.caption),
              ])),
          Checkbox(
            value: selected,
            onChanged: (_) => onTap(),
            activeColor: AppColors.primary,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
          ),
        ]),
      ),
    );
  }
}
