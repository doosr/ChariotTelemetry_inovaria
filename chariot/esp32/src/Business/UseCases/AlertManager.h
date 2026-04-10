#ifndef ALERT_MANAGER_H
#define ALERT_MANAGER_H
#include "../../Domain/Interfaces/IAlertNotifier.h"
#include "../../Domain/Interfaces/IGSMModem.h"
#include <cstddef>

namespace Business {
// Alert state for smart triggering
enum class AlertState {
  NORMAL,         // No alert condition
  TRIGGERED,      // Alert condition detected, alert sent
  ACTIVE_NOTIFIED // Alert still active, already notified (don't resend)
};
struct AlertTracker {
  Domain::AlertType type;
  AlertState state;
  unsigned long lastAlertTime;
  float lastValue;
};
class AlertManager : public Domain::IAlertNotifier {
private:
  Domain::IGSMModem *modem;
  const char *alertTopic;
  // Track alert states to prevent spam
  AlertTracker highTempAlert;
  AlertTracker lowOilAlert;
  AlertTracker engineCriticalAlert;
  AlertTracker obstacleAlert; // Rear proximity obstacle alert
  // Fuel theft is different - each theft is unique
  unsigned long lastFuelTheftAlert;
  // Fixed buffer for JSON formatting (to save stack)
  char alertBuffer[384];

public:
  AlertManager(Domain::IGSMModem *gsmModem, const char *topic);
  void sendAlert(const Domain::Alert &alert) override;
  // Call these when conditions are checked to update state
  void checkCondition(Domain::AlertType type, bool isAlertCondition,
                      float currentValue = 0.0f);

private:
  void formatAlertMessage(const Domain::Alert &alert, char *buffer,
                          size_t bufferSize);
  bool shouldSendAlert(const Domain::Alert &alert);
  void updateAlertState(Domain::AlertType type, bool conditionActive);
  AlertTracker *getAlertTracker(Domain::AlertType type);
};
} // namespace Business
#endif