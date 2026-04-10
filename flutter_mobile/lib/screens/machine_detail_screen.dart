import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:percent_indicator/percent_indicator.dart';
import 'package:provider/provider.dart';
import '../core/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../widgets/common_widgets.dart';

class MachineDetailScreen extends StatefulWidget {
  final dynamic machine;
  const MachineDetailScreen({super.key, required this.machine});
  @override
  State<MachineDetailScreen> createState() => _MachineDetailScreenState();
}

class _MachineDetailScreenState extends State<MachineDetailScreen> {
  final ApiService _api = ApiService();
  late dynamic _machine;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _machine = widget.machine;
  }

  Future<void> _refresh() async {
    setState(() => _loading = true);
    final auth = context.read<AuthProvider>();
    final machines = await _api.getMachines(
      ownerId: auth.isAdminOrAbove ? null : auth.userId,
      role: auth.userRole,
    );
    final updated = machines.firstWhere(
      (m) => m['deviceId'] == _machine['deviceId'],
      orElse: () => _machine,
    );
    if (mounted) {
      setState(() {
        _machine = updated;
        _loading = false;
      });
    }
  }

  Future<void> _deleteMachine() async {
    final confirm = await showConfirm(
      context,
      title: 'Supprimer ce chariot',
      content:
          'Cette action est irréversible. Toutes les données seront perdues.',
    );
    if (confirm == true && mounted) {
      await _api.deleteMachine(_machine['deviceId']);
      if (mounted) {
        Navigator.pop(context, true);
      }
    }
  }
  Future<void> _editGeofence() async {
    final geo = _machine['geofence'] ?? {'isActive': false, 'radius': 1000};
    final lat = (_machine['telemetry']?['gps']?['lat'] ??
            _machine['gps']?['lat'] as num?)
        ?.toDouble();
    final lng = (_machine['telemetry']?['gps']?['lng'] ??
            _machine['gps']?['lng'] as num?)
        ?.toDouble();

    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _GeofenceEditModal(
        initialActive: geo['isActive'] ?? false,
        initialRadius: (geo['radius'] ?? 1000).toDouble(),
        hasGps: lat != null && lng != null,
      ),
    );

    if (result != null && mounted) {
      final body = {
        'geofence': {
          'isActive': result['isActive'],
          'radius': result['radius'],
          if (result['useCurrentPos'] == true && lat != null && lng != null)
            'center': {'lat': lat, 'lng': lng}
        }
      };
      await _api.updateMachine(_machine['deviceId'], body);
      _refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isOnline = _machine['status'] == 'online';
    final t = _machine['telemetry'];
    final temp = t?['temp'] != null ? double.tryParse('${t['temp']}') : null;
    final fuelRaw = t?['fuel_percent'] ?? _machine['health']?['fuel'];
    final fuel =
        fuelRaw != null ? (double.tryParse('$fuelRaw')?.round() ?? 0) : null;
    final isRunning = _machine['trip']?['isRunning'] == true;
    final m = _machine['maintenance'];
    final geo = _machine['geofence'];

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: RefreshIndicator(
        onRefresh: _refresh,
        color: AppColors.primary,
        backgroundColor: AppColors.card,
        child: CustomScrollView(slivers: [
          SliverAppBar(
            expandedHeight: 200,
            pinned: true,
            backgroundColor: AppColors.bg,
            leading: IconButton(
              icon: const Icon(Icons.arrow_back_ios_new, size: 18),
              onPressed: () => Navigator.pop(context),
            ),
            actions: [
              if (auth.isAdminOrAbove)
                IconButton(
                  icon:
                      const Icon(Icons.delete_outline, color: AppColors.danger),
                  onPressed: _deleteMachine,
                ),
              const SizedBox(width: 8),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      isOnline
                          ? AppColors.success.withAlpha(30)
                          : AppColors.textMuted.withAlpha(15),
                      Colors.transparent
                    ],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 50, 20, 0),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Container(
                              width: 56,
                              height: 56,
                              decoration: BoxDecoration(
                                color: isOnline
                                    ? AppColors.success.withAlpha(30)
                                    : AppColors.textMuted.withAlpha(20),
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Icon(Icons.local_shipping_rounded,
                                  color: isOnline
                                      ? AppColors.success
                                      : AppColors.textMuted,
                                  size: 28),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                  Text(_machine['name'] ?? '',
                                      style: AppText.heading2),
                                  Text(_machine['model'] ?? '',
                                      style: AppText.bodySecondary),
                                  const SizedBox(height: 6),
                                  StatusBadge(
                                      label:
                                          isOnline ? 'EN LIGNE' : 'HORS LIGNE',
                                      color: isOnline
                                          ? AppColors.success
                                          : AppColors.danger),
                                ])),
                          ]),
                        ]),
                  ),
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
            sliver: SliverList(
                delegate: SliverChildListDelegate([
              // Live Metrics
              _Section(title: '📊 Télémétrie en temps réel', children: [
                Row(children: [
                  Expanded(
                      child: _MetricCard(
                    label: 'Température',
                    icon: Icons.thermostat_rounded,
                    value: temp != null ? '${temp.toStringAsFixed(1)}°C' : '--',
                    color: temp == null
                        ? AppColors.textSecondary
                        : temp >= 90
                            ? AppColors.danger
                            : temp >= 75
                                ? AppColors.warning
                                : AppColors.success,
                  )),
                  const SizedBox(width: 10),
                  Expanded(
                      child: _MetricCard(
                    label: 'Carburant',
                    icon: Icons.local_gas_station_rounded,
                    value: fuel != null ? '$fuel%' : '--',
                    color: fuel == null
                        ? AppColors.textSecondary
                        : fuel <= 15
                            ? AppColors.danger
                            : fuel <= 30
                                ? AppColors.warning
                                : AppColors.success,
                  )),
                ]),
                if (fuel != null) ...[
                  const SizedBox(height: 12),
                  LinearPercentIndicator(
                    lineHeight: 8,
                    percent: (fuel / 100).clamp(0, 1).toDouble(),
                    backgroundColor: AppColors.cardBorder,
                    progressColor: fuel <= 15
                        ? AppColors.danger
                        : fuel <= 30
                            ? AppColors.warning
                            : AppColors.success,
                    barRadius: const Radius.circular(10),
                    padding: EdgeInsets.zero,
                  ),
                ],
              ]),

              _Section(title: '🚗 Trajet en cours', children: [
                if (isRunning) ...[
                  _InfoRow(
                      label: 'Statut',
                      value: '▶ En cours',
                      valueColor: AppColors.success),
                  if (_machine['trip']?['fuelConsumed'] != null)
                    _InfoRow(
                        label: 'Carburant consommé',
                        value:
                            '${(_machine['trip']['fuelConsumed'] as num).toStringAsFixed(1)} L'),
                  if (_machine['trip']?['mileage'] != null)
                    _InfoRow(
                        label: 'Distance trajet',
                        value:
                            '${(_machine['trip']['mileage'] as num).toStringAsFixed(1)} km'),
                ] else
                  const Center(
                      child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text('Aucun trajet actif',
                        style: TextStyle(color: AppColors.textMuted)),
                  )),
              ]),

              // Machine Info
              _Section(title: '📋 Informations', children: [
                _InfoRow(
                    label: 'Device ID', value: _machine['deviceId'] ?? '--'),
                _InfoRow(
                    label: 'Numéro de série',
                    value: _machine['serial'] ?? '--'),
                _InfoRow(
                    label: 'Description',
                    value: _machine['description'] ?? '--'),
                _InfoRow(
                    label: 'Odomètre',
                    value: '${_machine['odometer'] ?? 0} km'),
                if (_machine['lastSeen'] != null)
                  _InfoRow(
                      label: 'Vu pour la dernière fois',
                      value: _formatDate(
                          DateTime.tryParse(_machine['lastSeen'].toString()))),
              ]),

              // Maintenance
              if (m != null)
                _Section(title: '🔧 Maintenance', children: [
                  _InfoRow(
                      label: 'Heures moteur',
                      value: '${m['engineHours'] ?? 0} h'),
                  _InfoRow(
                      label: 'Dernier chang. d\'huile',
                      value: '${m['lastOilChangeKm'] ?? 0} km'),
                  _InfoRow(
                      label: 'Prochain chang. d\'huile',
                      value: '${m['nextOilChangeKm'] ?? 'N/A'} km'),
                  _InfoRow(
                      label: 'Prochain chang. (heures)',
                      value: '${m['nextOilChangeHours'] ?? 'N/A'} h'),
                ]),

              // Calibration
              if (_machine['calibration'] != null) ...[
                Builder(builder: (context) {
                  final cal = _machine['calibration'];
                  return _Section(title: '⚙️ Calibration', children: [
                    _InfoRow(
                        label: '⚠️ Température Alerte',
                        value: '${cal['tempWarn'] ?? '--'} °C',
                        valueColor: AppColors.warning),
                    _InfoRow(
                        label: '🚨 Température Critique',
                        value: '${cal['tempDanger'] ?? '--'} °C',
                        valueColor: AppColors.danger),
                    _InfoRow(
                        label: '⚠️ Pression Huile Alerte',
                        value: '${cal['oilWarn'] ?? '--'} Bar',
                        valueColor: AppColors.warning),
                    _InfoRow(
                        label: '🚨 Pression Huile Critique',
                        value: '${cal['oilDanger'] ?? '--'} Bar',
                        valueColor: AppColors.danger),
                    _InfoRow(
                        label: '⚠️ Carburant Bas',
                        value: '${cal['fuelLow'] ?? '--'} %',
                        valueColor: AppColors.warning),
                  ]);
                }),
              ],

              // Geofence & Mini-Map
              Builder(builder: (context) {
                final lat = (_machine['telemetry']?['gps']?['lat'] ?? _machine['gps']?['lat'] as num?)?.toDouble();
                final lng = (_machine['telemetry']?['gps']?['lng'] ?? _machine['gps']?['lng'] as num?)?.toDouble();
                final point = (lat != null && lng != null) ? LatLng(lat, lng) : null;
                
                return _Section(title: '📍 Géozone & Position', children: [
                  if (geo != null) ...[
                    _InfoRow(
                        label: 'Active',
                        value: geo['isActive'] == true ? 'Oui' : 'Non',
                        valueColor: geo['isActive'] == true
                            ? AppColors.success
                            : AppColors.textSecondary),
                    if (geo['radius'] != null)
                      _InfoRow(label: 'Rayon', value: '${geo['radius']} m'),
                    const SizedBox(height: 12),
                  ],
                  if (auth.isAdminOrAbove) ...[
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _editGeofence,
                        icon: const Icon(Icons.edit_location_alt_rounded,
                            size: 16),
                        label: const Text('Définir la zone'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          side: BorderSide(
                              color: AppColors.primary.withAlpha(50)),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (point != null) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: SizedBox(
                        height: 200,
                        width: double.infinity,
                        child: FlutterMap(
                          options: MapOptions(
                            initialCenter: point,
                            initialZoom: geo != null ? 14 : 15,
                            interactionOptions: const InteractionOptions(flags: InteractiveFlag.none),
                          ),
                          children: [
                            TileLayer(
                              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                              userAgentPackageName: 'com.inovaria.telemetry',
                              tileBuilder: (ctx, tile, img) => ColorFiltered(
                                colorFilter: const ColorFilter.matrix([-0.9, 0, 0, 0, 255, 0, -0.9, 0, 0, 255, 0, 0, -0.9, 0, 255, 0, 0, 0, 1, 0]),
                                child: tile,
                              ),
                            ),
                            if (geo?['radius'] != null && geo?['radius'] > 0)
                              CircleLayer(circles: [
                                CircleMarker(point: point, radius: geo!['radius'].toDouble(), useRadiusInMeter: true, color: AppColors.primary.withAlpha(30), borderColor: AppColors.primary, borderStrokeWidth: 2),
                              ]),
                            MarkerLayer(markers: [
                              Marker(point: point, width: 40, height: 40, child: Container(decoration: BoxDecoration(color: AppColors.success, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)), child: const Icon(Icons.location_on, color: Colors.white, size: 20))),
                            ]),
                          ],
                        ),
                      ),
                    ),
                  ] else
                    const Center(
                      child: Padding(padding: EdgeInsets.symmetric(vertical: 20), child: Text('Aucune position GPS connue', style: TextStyle(color: AppColors.textMuted))),
                    ),
                ]);
              }),
            ])),

          ),
        ]),
      ),
    );
  }

  String _formatDate(DateTime? dt) {
    if (dt == null) return '--';
    return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year} '
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}

class _GeofenceEditModal extends StatefulWidget {
  final bool initialActive;
  final double initialRadius;
  final bool hasGps;
  const _GeofenceEditModal(
      {required this.initialActive,
      required this.initialRadius,
      required this.hasGps});

  @override
  State<_GeofenceEditModal> createState() => _GeofenceEditModalState();
}

class _GeofenceEditModalState extends State<_GeofenceEditModal> {
  late bool _active;
  late double _radius;
  bool _useCurrentPos = false;

  @override
  void initState() {
    super.initState();
    _active = widget.initialActive;
    _radius = widget.initialRadius;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 20),
      decoration: const BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Center(
            child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                    color: AppColors.cardBorder,
                    borderRadius: BorderRadius.circular(2)))),
        const SizedBox(height: 20),
        ShaderMask(
          shaderCallback: (b) => AppColors.gradientPurpleBlue.createShader(b),
          child: Text('📍 Paramètres Géofence',
              style: GoogleFonts.inter(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w800)),
        ),
        const SizedBox(height: 24),
        SwitchListTile(
          title: const Text('Activer la surveillance',
              style: TextStyle(color: AppColors.textPrimary)),
          subtitle: const Text('Alerter si le chariot sort du périmètre',
              style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
          value: _active,
          onChanged: (v) => setState(() => _active = v),
          activeColor: AppColors.primary,
        ),
        const Divider(color: AppColors.divider),
        const SizedBox(height: 16),
        Row(children: [
          const Text('Rayon de sécurité : ',
              style: TextStyle(color: AppColors.textPrimary)),
          Text('${_radius.round()} m',
              style: GoogleFonts.inter(
                  color: AppColors.primary, fontWeight: FontWeight.bold)),
        ]),
        Slider(
          value: _radius,
          min: 100,
          max: 10000,
          divisions: 99,
          activeColor: AppColors.primary,
          inactiveColor: AppColors.cardBorder,
          onChanged: _active ? (v) => setState(() => _radius = v) : null,
        ),
        if (widget.hasGps)
          CheckboxListTile(
            title: const Text('Utiliser la position actuelle comme centre',
                style: TextStyle(color: AppColors.textPrimary, fontSize: 13)),
            value: _useCurrentPos,
            onChanged: _active ? (v) => setState(() => _useCurrentPos = v!) : null,
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: AppColors.primary,
          ),
        const SizedBox(height: 32),
        Row(children: [
          Expanded(
            child: TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Annuler',
                    style: TextStyle(color: AppColors.textMuted))),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: GradientButton(
                label: 'Enregistrer',
                onPressed: () => Navigator.pop(context, {
                      'isActive': _active,
                      'radius': _radius.round(),
                      'useCurrentPos': _useCurrentPos
                    })),
          ),
        ]),
      ]),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Section({required this.title, required this.children});

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(title, style: AppText.heading3),
        ),
        AppCard(child: Column(children: children)),
        const SizedBox(height: 20),
      ]);
}

class _MetricCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _MetricCard(
      {required this.label,
      required this.value,
      required this.icon,
      required this.color});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withAlpha(15),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withAlpha(40)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 8),
          Text(value,
              style: GoogleFonts.inter(
                  color: color, fontSize: 24, fontWeight: FontWeight.w800)),
          Text(label, style: AppText.caption),
        ]),
      );
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _InfoRow({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child:
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(label, style: AppText.bodySecondary),
          Flexible(
              child: Text(value,
                  style: AppText.body
                      .copyWith(fontWeight: FontWeight.w600, color: valueColor),
                  textAlign: TextAlign.right)),
        ]),
      );
}
