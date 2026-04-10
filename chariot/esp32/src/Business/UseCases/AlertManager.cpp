#include "AlertManager.h"
#include <Arduino.h>
#include <cstddef>
#include <cstdio>
#include "../../BSP.h"
namespace Business {
AlertManager::AlertManager(Domain::IGSMModem *gsmModem, const char *topic)
    : modem(gsmModem), alertTopic(topic), lastFuelTheftAlert(0) {
  // Initialize alert trackers
  highTempAlert.type = Domain::AlertType::HIGH_TEMPERATURE;
  highTempAlert.state = AlertState::NORMAL;
  highTempAlert.lastAlertTime = 0;
  highTempAlert.lastValue = 0.0f;
  lowOilAlert.type = Domain::AlertType::LOW_OIL_PRESSURE;
  lowOilAlert.state = AlertState::NORMAL;
  lowOilAlert.lastAlertTime = 0;
  lowOilAlert.lastValue = 0.0f;
  engineCriticalAlert.type = Domain::AlertType::ENGINE_CRITICAL;
  engineCriticalAlert.state = AlertState::NORMAL;
  engineCriticalAlert.lastAlertTime = 0;
  engineCriticalAlert.lastValue = 0.0f;
  obstacleAlert.type = Domain::AlertType::OBSTACLE_DETECTED;
  obstacleAlert.state = AlertState::NORMAL;
  obstacleAlert.lastAlertTime = 0;
  obstacleAlert.lastValue = 0.0f;
  Serial.println(
      "[ALERT] Manager initialized with smart edge-triggered alerts");
}
void AlertManager::sendAlert(const Domain::Alert &alert) {
  // Check if we should send this alert
  if (!shouldSendAlert(alert)) {
    return; // Silently skip (already notified)
  }
  // Format the alert message
  formatAlertMessage(alert, alertBuffer, sizeof(alertBuffer));
  // Try to send the alert
  Serial.println("========================================");
  Serial.print("[ALERT] !! NEW ALERT: ");
  Serial.println(alert.message);
  Serial.print("[ALERT] Type: ");
  switch (alert.type) {
  case Domain::AlertType::HIGH_TEMPERATURE:
    Serial.println("HIGH_TEMPERATURE");
    break;
  case Domain::AlertType::LOW_OIL_PRESSURE:
    Serial.println("LOW_OIL_PRESSURE");
    break;
  case Domain::AlertType::FUEL_THEFT:
    Serial.println("FUEL_THEFT");
    break;
  case Domain::AlertType::ENGINE_CRITICAL:
    Serial.println("ENGINE_CRITICAL");
    break;
  case Domain::AlertType::OBSTACLE_DETECTED:
    Serial.println("OBSTACLE_DETECTED");
    break;
  }
  Serial.print("[ALERT] Payload: ");
  Serial.println(alertBuffer);
  bool success = modem->sendData(alertTopic, alertBuffer);
  if (success) {
    Serial.println("[ALERT] ✓ Successfully sent and confirmed!");
    Serial.println(
        "[ALERT] State: ACTIVE_NOTIFIED (won't resend until cleared)");
    Serial.println("========================================");
    // Mark alert as notified
    updateAlertState(alert.type, true);
    // Track fuel theft separately
    if (alert.type == Domain::AlertType::FUEL_THEFT) {
      lastFuelTheftAlert = millis();
    }
  } else {
    Serial.println("[ALERT] ✗ Failed to send - will retry on next check");
    Serial.println("========================================");
    // Don't update state - will retry
  }
}
bool AlertManager::shouldSendAlert(const Domain::Alert &alert) {
  AlertTracker *tracker = getAlertTracker(alert.type);
  if (tracker == nullptr) {
    // Fuel theft - special handling
    if (alert.type == Domain::AlertType::FUEL_THEFT) {
      unsigned long timeSinceLastTheft = millis() - lastFuelTheftAlert;
      if (timeSinceLastTheft <
          5000) { // 5 seconds cooldown between theft alerts
        Serial.println(
            "[ALERT] ⚠ Fuel theft detected but within cooldown (1 min)");
        return false;
      }
      return true; // Send theft alert
    }
    return true; // Unknown type, send it
  }
  // Check alert state
  switch (tracker->state) {
  case AlertState::NORMAL:
    // First time alert triggered - SEND IT!
    Serial.println("[ALERT] Edge detected: NORMAL → ALERT");
    return true;
  case AlertState::TRIGGERED:
  case AlertState::ACTIVE_NOTIFIED:
    // Already sent, condition still active - DON'T RESEND
    Serial.print("[ALERT] Suppressed (already notified, state: ");
    Serial.print(tracker->state == AlertState::TRIGGERED ? "TRIGGERED"
                                                         : "ACTIVE_NOTIFIED");
    Serial.println(")");
    return false;
  }
  return false;
}
void AlertManager::checkCondition(Domain::AlertType type, bool isAlertCondition,
                                  float currentValue) {

  // IGNORE alerts if the sensor reading is invalid (Disconnected < 0 or I2C
  // Error)
  if (currentValue < 0.0f)
    return;
  AlertTracker *tracker = getAlertTracker(type);
  if (tracker == nullptr)
    return;
  // Update state based on condition
  if (isAlertCondition) {
    // Alert condition is active
    if (tracker->state == AlertState::NORMAL) {
      // Transition: NORMAL → TRIGGERED
      tracker->state = AlertState::TRIGGERED;
      tracker->lastValue = currentValue;
      // Alert will be sent by sendAlert() call
    } else {
      // Already in alert state, keep as ACTIVE_NOTIFIED
      tracker->state = AlertState::ACTIVE_NOTIFIED;
    }
  } else {
    // Alert condition cleared
    if (tracker->state != AlertState::NORMAL) {
      Serial.print("[ALERT] Condition cleared for ");
      switch (type) {
      case Domain::AlertType::HIGH_TEMPERATURE:
        Serial.println("HIGH_TEMPERATURE");
        break;
      case Domain::AlertType::LOW_OIL_PRESSURE:
        Serial.println("LOW_OIL_PRESSURE");
        break;
      case Domain::AlertType::ENGINE_CRITICAL:
        Serial.println("ENGINE_CRITICAL");
        break;
      case Domain::AlertType::OBSTACLE_DETECTED:
        Serial.println("OBSTACLE_DETECTED");
        break;
      default:
        break;
      }
      Serial.println(
          "[ALERT] State: NORMAL (can alert again if condition returns)");
    }
    tracker->state = AlertState::NORMAL;
    tracker->lastValue = currentValue;
  }
}
void AlertManager::updateAlertState(Domain::AlertType type,
                                    bool conditionActive) {
  AlertTracker *tracker = getAlertTracker(type);
  if (tracker == nullptr) {
    return;
  }
  if (conditionActive) {
    tracker->state = AlertState::ACTIVE_NOTIFIED;
    tracker->lastAlertTime = millis();
  } else {
    tracker->state = AlertState::NORMAL;
  }
}
AlertTracker *AlertManager::getAlertTracker(Domain::AlertType type) {
  switch (type) {
  case Domain::AlertType::HIGH_TEMPERATURE:
    return &highTempAlert;
  case Domain::AlertType::LOW_OIL_PRESSURE:
    return &lowOilAlert;
  case Domain::AlertType::ENGINE_CRITICAL:
    return &engineCriticalAlert;
  case Domain::AlertType::OBSTACLE_DETECTED:
    return &obstacleAlert;
  case Domain::AlertType::FUEL_THEFT:
    return nullptr; // Fuel theft handled separately
  default:
    return nullptr;
  }
}
void AlertManager::formatAlertMessage(const Domain::Alert &alert, char *buffer,
                                      size_t bufferSize) {
  const char *alertTypeStr = "";
  switch (alert.type) {
  case Domain::AlertType::HIGH_TEMPERATURE:
    alertTypeStr = "HIGH_TEMP";
    snprintf(buffer, bufferSize,
             "{\"deviceId\":\"%s\",\"alert\":\"%s\",\"message\":\"%s\","
             "\"temp\":%.1f,\"timestamp\":%lu}",
             DEVICE_ID, alertTypeStr, alert.message, alert.value1, millis());
    break;
  case Domain::AlertType::LOW_OIL_PRESSURE:
    alertTypeStr = "LOW_OIL_PRESSURE";
    snprintf(buffer, bufferSize,
             "{\"deviceId\":\"%s\",\"alert\":\"%s\",\"message\":\"%s\","
             "\"pressure\":%.2f,\"rpm\":%.0f,\"timestamp\":%lu}",
             DEVICE_ID, alertTypeStr, alert.message, alert.value1, alert.value2,
             millis());
    break;
  case Domain::AlertType::FUEL_THEFT:
    alertTypeStr = "FUEL_THEFT";
    snprintf(
        buffer, bufferSize,
        "{\"deviceId\":\"%s\",\"alert\":\"%s\",\"message\":\"%s\",\"level_"
        "before\":%.1f,\"level_after\":%.1f,\"stolen\":%.1f,\"timestamp\":%lu}",
        DEVICE_ID, alertTypeStr, alert.message, alert.value1, alert.value2,
        alert.value1 - alert.value2, millis());
    break;
  case Domain::AlertType::ENGINE_CRITICAL:
    alertTypeStr = "ENGINE_CRITICAL";
    snprintf(buffer, bufferSize,
             "{\"deviceId\":\"%s\",\"alert\":\"%s\",\"message\":\"%s\","
             "\"timestamp\":%lu}",
             DEVICE_ID, alertTypeStr, alert.message, millis());
    break;
  case Domain::AlertType::OBSTACLE_DETECTED:
    alertTypeStr = "OBSTACLE_DETECTED";
    snprintf(buffer, bufferSize,
             "{\"deviceId\":\"%s\",\"alert\":\"%s\",\"message\":\"%s\","
             "\"distance_cm\":%.1f,\"threshold_cm\":%.1f,\"timestamp\":%lu}",
             DEVICE_ID, alertTypeStr, alert.message, alert.value1, alert.value2,
             millis());
    break;
  }
}
} // namespace Business