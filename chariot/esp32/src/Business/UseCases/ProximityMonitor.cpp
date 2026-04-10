/**
 * @file ProximityMonitor.cpp
 * @brief Business Use Case — Rear Proximity Monitoring (Implementation)
 */

#include "ProximityMonitor.h"
#include <Arduino.h>

namespace Business {

// ─────────────────────────────────────────────────────────────────────────────
// Constructor
// ─────────────────────────────────────────────────────────────────────────────
ProximityMonitor::ProximityMonitor(
    Domain::IProximitySensor* proxSensor,
    Domain::IAlertNotifier*   alerter,
    unsigned long             cooldownMs
)
    : sensor(proxSensor),
      alertNotifier(alerter),
      lastZone(ProximityZone::CLEAR),
      lastAlertTime(0),
      alertCooldownMs(cooldownMs)
{}

float ProximityMonitor::read() {
    return sensor->readDistance();
}

void ProximityMonitor::check(float distanceCm, unsigned long timestamp) {
    ProximityZone currentZone = classifyDistance(distanceCm);

    // --- State transition logic ---
    switch (currentZone) {
        case ProximityZone::DANGER:
            // Send alert only on first entry OR after cooldown
            if (lastZone != ProximityZone::DANGER ||
                (timestamp - lastAlertTime) >= alertCooldownMs) {
                triggerObstacleAlert(distanceCm, timestamp);
                lastAlertTime = timestamp;
            }
            #if DEBUG_PROXIMITY_SENSOR
            Serial.print("[PROXIMITY] !! ALERT zone !! Obstacle at ");
            Serial.print(distanceCm, 1);
            Serial.println(" cm");
            #endif
            break;

        case ProximityZone::CAUTION:
            #if DEBUG_PROXIMITY_SENSOR
            Serial.print("[PROXIMITY] CAUTION - ");
            Serial.print(distanceCm, 1);
            Serial.println(" cm");
            #endif
            break;

        case ProximityZone::CLEAR:
        default:
            #if DEBUG_PROXIMITY_SENSOR
            if (distanceCm >= 0) {
                Serial.print("[PROXIMITY] ✓ - ");
                Serial.print(distanceCm, 1);
                Serial.println(" cm");
            }
            #endif
            break;
    }

    lastZone = currentZone;
}

// ─────────────────────────────────────────────────────────────────────────────
// classifyDistance()
// Applies BSP thresholds to determine current danger zone
// ─────────────────────────────────────────────────────────────────────────────
ProximityZone ProximityMonitor::classifyDistance(float distanceCm) const {
    if (distanceCm < 0.0f) {
        return ProximityZone::CLEAR; // No echo = clear path
    }
    if (distanceCm <= PROXIMITY_ALERT_CM) {
        return ProximityZone::DANGER;
    }
    if (distanceCm <= PROXIMITY_WARNING_CM) {
        return ProximityZone::CAUTION;
    }
    return ProximityZone::CLEAR;
}

// ─────────────────────────────────────────────────────────────────────────────
// triggerObstacleAlert()
// Builds and dispatches a Domain::Alert for OBSTACLE_DETECTED
// ─────────────────────────────────────────────────────────────────────────────
void ProximityMonitor::triggerObstacleAlert(float distanceCm, unsigned long timestamp) {
    Domain::Alert alert(
        Domain::AlertType::OBSTACLE_DETECTED,
        "Obstacle detected at rear of forklift",
        distanceCm,           // value1 = distance in cm
        PROXIMITY_ALERT_CM    // value2 = configured threshold
    );
    alert.timestamp = timestamp;

    if (alertNotifier) {
        alertNotifier->sendAlert(alert);
    }
}

} // namespace Business
