#ifndef I_ALERT_NOTIFIER_H
#define I_ALERT_NOTIFIER_H
namespace Domain {
enum class AlertType {
  HIGH_TEMPERATURE,
  LOW_OIL_PRESSURE,
  FUEL_THEFT,
  ENGINE_CRITICAL,
  OBSTACLE_DETECTED // Obstacle too close at the rear
};
struct Alert {
  AlertType type;
  const char *message;
  float value1;
  float value2;
  unsigned long timestamp;
  Alert(AlertType t, const char *msg, float v1 = 0.0f, float v2 = 0.0f)
      : type(t), message(msg), value1(v1), value2(v2), timestamp(0) {}
};
class IAlertNotifier {
public:
  virtual ~IAlertNotifier() = default;
  virtual void sendAlert(const Alert &alert) = 0;
};
} // namespace Domain
#endif