import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';
import '../core/app_theme.dart';
import '../services/api_service.dart';
import '../widgets/common_widgets.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// GEOFENCE SCREEN — define a zone radius per machine, just like web
// ═══════════════════════════════════════════════════════════════════════════════

class GeofenceScreen extends StatefulWidget {
  final dynamic machine;
  const GeofenceScreen({super.key, required this.machine});

  @override
  State<GeofenceScreen> createState() => _GeofenceScreenState();
}

class _GeofenceScreenState extends State<GeofenceScreen> {
  final ApiService _api = ApiService();
  late double _radius;
  bool _enabled = false;
  bool _loading = false;
  bool _saved = false;
  final MapController _mapCtrl = MapController();

  static const _defaultCenter = LatLng(36.7525, 3.042);

  LatLng get _center {
    final gps =
        widget.machine['telemetry']?['gps'] ?? widget.machine['gps'] ?? {};
    final lat = (gps['lat'] as num?)?.toDouble();
    final lng = (gps['lng'] as num?)?.toDouble();
    if (lat == null || lng == null) return _defaultCenter;
    return LatLng(lat, lng);
  }

  @override
  void initState() {
    super.initState();
    final geo = widget.machine['geofence'];
    _radius = (geo?['radius'] as num?)?.toDouble() ?? 200;
    _enabled = (geo?['enabled'] == true) ||
        (geo != null && (geo['radius'] as num? ?? 0) > 0);
  }

  Future<void> _save() async {
    setState(() => _loading = true);
    final result = await _api.updateMachine(widget.machine['deviceId'], {
      'geofence': {
        'enabled': _enabled,
        'lat': _center.latitude,
        'lng': _center.longitude,
        'radius': _radius.round(),
      },
    });
    if (!mounted) return;
    setState(() => _loading = false);
    if ((result['statusCode'] as int? ?? 500) < 300) {
      setState(() => _saved = true);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Row(children: [
          const Icon(Icons.check_circle_outline, color: Colors.white),
          const SizedBox(width: 8),
          const Text('Zone géofence sauvegardée !',
              style:
                  TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
        ]),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: const Text('Erreur lors de la sauvegarde',
            style: TextStyle(color: Colors.white)),
        backgroundColor: AppColors.danger,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ));
    }
  }

  Future<void> _clear() async {
    final ok = await showConfirm(context,
        title: 'Supprimer la zone',
        content:
            'Voulez-vous supprimer la zone géofence de ${widget.machine['name']} ?',
        confirmLabel: 'Supprimer');
    if (ok != true) return;
    setState(() => _loading = true);
    await _api.updateMachine(widget.machine['deviceId'], {'geofence': null});
    if (mounted) {
      setState(() {
        _loading = false;
        _enabled = false;
        _radius = 200;
      });
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new, size: 18),
            onPressed: () => Navigator.pop(context)),
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ShaderMask(
            shaderCallback: (b) => AppColors.gradientPurpleBlue.createShader(b),
            child: Text('🔒 Zone Géofence',
                style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w800)),
          ),
          Text(widget.machine['name'] ?? '', style: AppText.caption),
        ]),
        actions: [
          if (widget.machine['geofence'] != null)
            IconButton(
              icon: const Icon(Icons.delete_outline, color: AppColors.danger),
              tooltip: 'Supprimer la zone',
              onPressed: _clear,
            ),
        ],
      ),
      body: Column(children: [
        // ── Map with circle
        Expanded(
          child: FlutterMap(
            mapController: _mapCtrl,
            options: MapOptions(
              initialCenter: _center,
              initialZoom: 14,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.intellimetry.mobile',
                tileBuilder: _darkTileBuilder,
              ),

              // Geofence circle
              if (_enabled)
                CircleLayer(circles: [
                  CircleMarker(
                    point: _center,
                    radius: _radius,
                    useRadiusInMeter: true,
                    color: AppColors.primary.withAlpha(35),
                    borderColor: AppColors.primary,
                    borderStrokeWidth: 2.5,
                  ),
                ]),

              // Machine marker
              MarkerLayer(markers: [
                Marker(
                  point: _center,
                  width: 48,
                  height: 48,
                  child: Container(
                    decoration: BoxDecoration(
                      color: widget.machine['status'] == 'online'
                          ? AppColors.success
                          : AppColors.textMuted,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2.5),
                      boxShadow: [
                        BoxShadow(
                            color: AppColors.success.withAlpha(100),
                            blurRadius: 16)
                      ],
                    ),
                    child: const Center(
                        child: Icon(Icons.local_shipping_rounded,
                            color: Colors.white, size: 22)),
                  ),
                ),
              ]),
            ],
          ),
        ),

        // ── Control panel
        Container(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          decoration: const BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(children: [
            Center(
                child: Container(
                    width: 36,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                        color: AppColors.cardBorder,
                        borderRadius: BorderRadius.circular(4)))),

            // Enable toggle
            Row(children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                    gradient: AppColors.gradientPurpleBlue,
                    borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.fence_rounded,
                    color: Colors.white, size: 20),
              ),
              const SizedBox(width: 14),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text('Zone Géofence', style: AppText.heading3),
                    Text(
                        _enabled
                            ? 'Zone active — alerte si sortie'
                            : 'Désactivée',
                        style: AppText.bodySecondary.copyWith(fontSize: 12)),
                  ])),
              Switch(
                value: _enabled,
                onChanged: (v) => setState(() => _enabled = v),
                activeTrackColor: AppColors.primary,
                activeThumbColor: Colors.white,
              ),
            ]),

            if (_enabled) ...[
              const SizedBox(height: 20),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text('Rayon de la zone', style: AppText.bodySecondary),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                      color: AppColors.primary.withAlpha(20),
                      borderRadius: BorderRadius.circular(8)),
                  child: Text('${_radius.round()} m',
                      style: GoogleFonts.inter(
                          color: AppColors.primary,
                          fontSize: 14,
                          fontWeight: FontWeight.w800)),
                ),
              ]),
              const SizedBox(height: 8),
              SliderTheme(
                data: SliderTheme.of(context).copyWith(
                  activeTrackColor: AppColors.primary,
                  thumbColor: AppColors.primary,
                  overlayColor: AppColors.primary.withAlpha(30),
                  inactiveTrackColor: AppColors.cardBorder,
                  trackHeight: 5,
                ),
                child: Slider(
                  value: _radius,
                  min: 50,
                  max: 5000,
                  divisions: 99,
                  onChanged: (v) => setState(() => _radius = v),
                ),
              ),

              // Quick preset buttons
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                for (final r in [100, 250, 500, 1000, 2000])
                  GestureDetector(
                    onTap: () => setState(() => _radius = r.toDouble()),
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: _radius.round() == r
                            ? AppColors.primary.withAlpha(30)
                            : AppColors.bgCard,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                            color: _radius.round() == r
                                ? AppColors.primary.withAlpha(100)
                                : AppColors.cardBorder),
                      ),
                      child: Text('${r}m',
                          style: GoogleFonts.inter(
                              color: _radius.round() == r
                                  ? AppColors.primary
                                  : AppColors.textSecondary,
                              fontSize: 11,
                              fontWeight: FontWeight.w600)),
                    ),
                  ),
              ]),

              const SizedBox(height: 12),

              // Info row
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                    color: AppColors.bgCard,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.cardBorder)),
                child: Row(children: [
                  const Icon(Icons.info_outline_rounded,
                      color: AppColors.accent, size: 16),
                  const SizedBox(width: 10),
                  Expanded(
                      child: Text(
                    'Une alerte sera générée si ${widget.machine['name'] ?? 'le chariot'} sort d\'un rayon de ${_radius.round()} m',
                    style: AppText.caption,
                  )),
                ]),
              ),
            ],

            const SizedBox(height: 20),
            GradientButton(
                label: '💾 Sauvegarder la zone',
                loading: _loading,
                onPressed: _save),
          ]),
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
