import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../core/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../widgets/common_widgets.dart';
import 'geofence_screen.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// MAP SCREEN — GPS tracking + geofence + deployments like web
// ═══════════════════════════════════════════════════════════════════════════════

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});
  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen>
    with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  final MapController _mapCtrl = MapController();
  List<dynamic> _machines = [];
  bool _loading = true;
  dynamic _selectedMachine;
  Timer? _refreshTimer;
  late AnimationController _pulseCtrl;
  String _filter = 'all'; // all | online | offline | alert

  // Algeria default center (update if needed)
  static const _defaultCenter = LatLng(36.7525, 3.042);

  @override
  void initState() {
    super.initState();
    _pulseCtrl =
        AnimationController(vsync: this, duration: const Duration(seconds: 2))
          ..repeat(reverse: true);
    _fetch();
    _refreshTimer =
        Timer.periodic(const Duration(seconds: 30), (_) => _fetch());
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _fetch() async {
    final auth = context.read<AuthProvider>();
    final data = await _api.getMachines(
      includeTelemetry: true,
      ownerId: auth.isAdminOrAbove ? null : auth.userId,
      role: auth.userRole,
    );
    if (mounted) {
      setState(() {
        _machines = data;
        _loading = false;
      });
    }

    // Auto-fit map if machines have GPS
    final withGps = _machinesWithGps;
    if (withGps.isNotEmpty && mounted) {
      try {
        final points = withGps.map((m) => _gpsOf(m)).toList();
        if (points.length == 1) {
          _mapCtrl.move(points.first, 14);
        } else {
          final bounds = LatLngBounds.fromPoints(points);
          _mapCtrl.fitCamera(CameraFit.bounds(
              bounds: bounds, padding: const EdgeInsets.all(60)));
        }
      } catch (_) {}
    }
  }

  List<dynamic> get _machinesWithGps => _filtered.where((m) {
        final gps = m['telemetry']?['gps'] ?? m['gps'];
        return gps != null && gps['lat'] != null && gps['lng'] != null;
      }).toList();

  List<dynamic> get _filtered => _machines.where((m) {
        if (_filter == 'online') return m['status'] == 'online';
        if (_filter == 'offline') return m['status'] != 'online';
        if (_filter == 'alert') {
          return (m['alerts'] as List?)?.isNotEmpty == true;
        }
        return true;
      }).toList();

  LatLng _gpsOf(dynamic m) {
    final gps = m['telemetry']?['gps'] ?? m['gps'] ?? {};
    return LatLng(
      (gps['lat'] as num?)?.toDouble() ?? _defaultCenter.latitude,
      (gps['lng'] as num?)?.toDouble() ?? _defaultCenter.longitude,
    );
  }

  Color _markerColor(dynamic m) {
    final alerts = m['alerts'] as List?;
    if (alerts?.isNotEmpty == true) return AppColors.danger;
    if (m['status'] == 'online') return AppColors.success;
    return AppColors.textMuted;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Stack(children: [
        // ── Map
        _loading
            ? const LoadingOverlay()
            : FlutterMap(
                mapController: _mapCtrl,
                options: const MapOptions(
                  initialCenter: _defaultCenter,
                  initialZoom: 10,
                  interactionOptions: InteractionOptions(
                    flags: InteractiveFlag.all,
                  ),
                ),
                children: [
                  // OSM Tiles (no API key needed)
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.intellimetry.mobile',
                    tileBuilder: _darkTileBuilder,
                  ),

                  // Geofence circles
                  CircleLayer(
                    circles: _machinesWithGps
                        .map((m) {
                          final radius =
                              (m['geofence']?['radius'] as num?)?.toDouble() ??
                                  0;
                          if (radius <= 0) return null;
                          return CircleMarker(
                            point: _gpsOf(m),
                            radius: radius,
                            useRadiusInMeter: true,
                            color: AppColors.primary.withAlpha(25),
                            borderColor: AppColors.primary.withAlpha(120),
                            borderStrokeWidth: 2,
                          );
                        })
                        .whereType<CircleMarker>()
                        .toList(),
                  ),

                  // Machine markers
                  MarkerLayer(
                    markers: _machinesWithGps.map((m) {
                      final color = _markerColor(m);
                      final isSelected =
                          _selectedMachine?['deviceId'] == m['deviceId'];
                      return Marker(
                        point: _gpsOf(m),
                        width: isSelected ? 52 : 44,
                        height: isSelected ? 52 : 44,
                        child: GestureDetector(
                          onTap: () => setState(() => _selectedMachine =
                              (_selectedMachine?['deviceId'] == m['deviceId'])
                                  ? null
                                  : m),
                          child: AnimatedBuilder(
                            animation: _pulseCtrl,
                            builder: (_, child) {
                              final scale = m['status'] == 'online'
                                  ? 1.0 + _pulseCtrl.value * 0.07
                                  : 1.0;
                              return Transform.scale(
                                  scale: isSelected ? 1.1 : scale,
                                  child: child);
                            },
                            child: _MachineMarker(
                                color: color,
                                isSelected: isSelected,
                                hasAlert: _markerColor(m) == AppColors.danger),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),

        // ── Top bar overlay
        SafeArea(
          child: Column(children: [
            _TopBar(
              machineCount: _machines.length,
              onlineCount:
                  _machines.where((m) => m['status'] == 'online').length,
              filter: _filter,
              onFilter: (f) => setState(() {
                _filter = f;
                _selectedMachine = null;
              }),
              onRefresh: _fetch,
              loading: _loading,
            ),
          ]),
        ),

        // ── Machine detail popup
        if (_selectedMachine != null)
          Positioned(
            left: 12,
            right: 12,
            bottom: 24,
            child: _MachinePopup(
              machine: _selectedMachine!,
              onClose: () => setState(() => _selectedMachine = null),
              onGeofence: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => GeofenceScreen(machine: _selectedMachine!),
                  )).then((_) => _fetch()),
              onCenter: () {
                try {
                  _mapCtrl.move(_gpsOf(_selectedMachine!), 15);
                } catch (_) {}
              },
            ).animate().fadeIn(duration: 200.ms).slideY(begin: 0.3),
          ),

        // ── Bottom stats row
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: _loading
              ? const SizedBox()
              : _BottomStatsBar(machines: _machines),
        ),
      ]),
    );
  }

  Widget _darkTileBuilder(BuildContext ctx, Widget tile, TileImage image) {
    return ColorFiltered(
      colorFilter: const ColorFilter.matrix([
        -0.9,
        0,
        0,
        0,
        255,
        0,
        -0.9,
        0,
        0,
        255,
        0,
        0,
        -0.9,
        0,
        255,
        0,
        0,
        0,
        1,
        0,
      ]),
      child: tile,
    );
  }
}

// ── Machine Marker ─────────────────────────────────────────────────────────────

class _MachineMarker extends StatelessWidget {
  final Color color;
  final bool isSelected;
  final bool hasAlert;
  const _MachineMarker(
      {required this.color, required this.isSelected, required this.hasAlert});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: isSelected ? 3 : 2),
        boxShadow: [
          BoxShadow(
              color: color.withAlpha(140),
              blurRadius: isSelected ? 20 : 10,
              spreadRadius: isSelected ? 3 : 1)
        ],
      ),
      child: Center(
        child: Icon(
          hasAlert ? Icons.warning_rounded : Icons.local_shipping_rounded,
          color: Colors.white,
          size: isSelected ? 24 : 20,
        ),
      ),
    );
  }
}

// ── Top Bar ────────────────────────────────────────────────────────────────────

class _TopBar extends StatelessWidget {
  final int machineCount, onlineCount;
  final String filter;
  final void Function(String) onFilter;
  final VoidCallback onRefresh;
  final bool loading;
  const _TopBar(
      {required this.machineCount,
      required this.onlineCount,
      required this.filter,
      required this.onFilter,
      required this.onRefresh,
      required this.loading});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.bgCard.withAlpha(240),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.cardBorder),
        boxShadow: [
          BoxShadow(color: Colors.black.withAlpha(80), blurRadius: 20)
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          ShaderMask(
            shaderCallback: (b) => AppColors.gradientPurpleBlue.createShader(b),
            child: Text('🗺 Carte en direct',
                style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w800)),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
                color: AppColors.success.withAlpha(20),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.success.withAlpha(60))),
            child: Text('$onlineCount/$machineCount En ligne',
                style: GoogleFonts.inter(
                    color: AppColors.success,
                    fontSize: 11,
                    fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: loading ? null : onRefresh,
            child: Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.cardBorder)),
              child: loading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppColors.primary))
                  : const Icon(Icons.refresh_rounded,
                      color: AppColors.textSecondary, size: 16),
            ),
          ),
        ]),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            _FilterChip('Tout', 'all', filter, onFilter),
            _FilterChip('🟢 En ligne', 'online', filter, onFilter),
            _FilterChip('🔴 Hors ligne', 'offline', filter, onFilter),
            _FilterChip('🚨 Alertes', 'alert', filter, onFilter),
          ]),
        ),
      ]),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label, value, current;
  final void Function(String) onTap;
  const _FilterChip(this.label, this.value, this.current, this.onTap);

  @override
  Widget build(BuildContext context) {
    final active = current == value;
    return GestureDetector(
      onTap: () => onTap(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(right: 6),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: active ? AppColors.primary.withAlpha(30) : AppColors.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: active
                  ? AppColors.primary.withAlpha(100)
                  : AppColors.cardBorder),
        ),
        child: Text(label,
            style: GoogleFonts.inter(
                color: active ? AppColors.primary : AppColors.textSecondary,
                fontSize: 11,
                fontWeight: active ? FontWeight.w700 : FontWeight.normal)),
      ),
    );
  }
}

// ── Machine Detail Popup ───────────────────────────────────────────────────────

class _MachinePopup extends StatelessWidget {
  final dynamic machine;
  final VoidCallback onClose;
  final VoidCallback onGeofence;
  final VoidCallback onCenter;
  const _MachinePopup(
      {required this.machine,
      required this.onClose,
      required this.onGeofence,
      required this.onCenter});

  @override
  Widget build(BuildContext context) {
    final gps = machine['telemetry']?['gps'] ?? machine['gps'] ?? {};
    final health = machine['health'] ?? {};
    final alerts = (machine['alerts'] as List?) ?? [];
    final isOnline = machine['status'] == 'online';
    final speed = (gps['speed'] as num?)?.toStringAsFixed(1) ?? '0';
    final lat = (gps['lat'] as num?)?.toStringAsFixed(5) ?? '—';
    final lng = (gps['lng'] as num?)?.toStringAsFixed(5) ?? '—';
    final geofence = machine['geofence'];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
            color: isOnline
                ? AppColors.success.withAlpha(80)
                : AppColors.cardBorder),
        boxShadow: [
          BoxShadow(color: Colors.black.withAlpha(120), blurRadius: 30)
        ],
      ),
      child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Row(children: [
              Container(
                  width: 10,
                  height: 10,
                  margin: const EdgeInsets.only(right: 8),
                  decoration: BoxDecoration(
                      color: isOnline ? AppColors.success : AppColors.textMuted,
                      shape: BoxShape.circle)),
              Expanded(
                  child: Text(machine['name'] ?? '', style: AppText.heading3)),
              IconButton(
                  icon: const Icon(Icons.close_rounded,
                      size: 18, color: AppColors.textMuted),
                  onPressed: onClose,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints()),
            ]),

            if (machine['model'] != null)
              Text('${machine['model']} · ${machine['deviceId'] ?? ''}',
                  style: AppText.caption),

            // Alerts banner
            if (alerts.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                    color: AppColors.danger.withAlpha(20),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.danger.withAlpha(60))),
                child: Row(children: [
                  const Icon(Icons.warning_rounded,
                      color: AppColors.danger, size: 14),
                  const SizedBox(width: 6),
                  Expanded(
                      child: Text('${alerts.length} alerte(s) active(s)',
                          style: GoogleFonts.inter(
                              color: AppColors.danger,
                              fontSize: 12,
                              fontWeight: FontWeight.w700))),
                ]),
              ),
            ],

            const SizedBox(height: 12),
            // Stats row
            Row(children: [
              _PopupStat('📍 GPS',
                  '$lat, $lng'.length > 25 ? '$lat\n$lng' : '$lat, $lng',
                  small: true),
              const SizedBox(width: 10),
              _PopupStat('💨 Vitesse', '$speed km/h'),
              const SizedBox(width: 10),
              _PopupStat('🌡️ Temp', '${health['temp'] ?? '—'} °C'),
              const SizedBox(width: 10),
              _PopupStat('⛽ Carb', '${health['fuel'] ?? '—'}%'),
            ]),

            if (geofence != null) ...[
              const SizedBox(height: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                    color: AppColors.primary.withAlpha(15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.primary.withAlpha(50))),
                child: Row(children: [
                  const Icon(Icons.fence_rounded,
                      color: AppColors.primary, size: 13),
                  const SizedBox(width: 6),
                  Text('Zone géofence: ${geofence['radius']} m',
                      style: GoogleFonts.inter(
                          color: AppColors.primary,
                          fontSize: 12,
                          fontWeight: FontWeight.w600)),
                ]),
              ),
            ],

            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                  child: GradientButton(
                      label: '📍 Centrer',
                      onPressed: onCenter,
                      height: 38,
                      gradient: AppColors.gradientTeal)),
              const SizedBox(width: 8),
              Expanded(
                  child: GradientButton(
                      label: '🔒 Zone', onPressed: onGeofence, height: 38)),
            ]),
          ]),
    );
  }
}

class _PopupStat extends StatelessWidget {
  final String label, value;
  final bool small;
  const _PopupStat(this.label, this.value, {this.small = false});

  @override
  Widget build(BuildContext context) => Expanded(
          child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
            color: AppColors.bgCard,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.cardBorder)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: AppText.caption.copyWith(fontSize: 9)),
          const SizedBox(height: 2),
          Text(value,
              style: GoogleFonts.inter(
                  color: AppColors.textPrimary,
                  fontSize: small ? 9 : 12,
                  fontWeight: FontWeight.w700),
              maxLines: 2,
              overflow: TextOverflow.ellipsis),
        ]),
      ));
}

// ── Bottom Stats Bar ──────────────────────────────────────────────────────────

class _BottomStatsBar extends StatelessWidget {
  final List<dynamic> machines;
  const _BottomStatsBar({required this.machines});

  @override
  Widget build(BuildContext context) {
    final online = machines.where((m) => m['status'] == 'online').length;
    final offline = machines.length - online;
    final alerts = machines
        .where((m) => (m['alerts'] as List?)?.isNotEmpty == true)
        .length;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
            colors: [AppColors.bg.withAlpha(0), AppColors.bg],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter),
      ),
    );
  }
}
