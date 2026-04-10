#ifndef PROXIMITY_MONITOR_H
#define PROXIMITY_MONITOR_H

/**
 * @file ProximityMonitor.h
 * @brief Business Use Case — Rear Proximity Monitoring
 *
 * Reads the JSN-SR04T sensor and applies business rules:
 *  - Distance < PROXIMITY_ALERT_CM   → Send OBSTACLE_DETECTED alert (DANGER)
 *  - Distance < PROXIMITY_WARNING_CM → Log warning only (CAUTION, no alert spam)
 *  - Distance = -1                   → No obstacle in range (clear path)
 *
 * Smart anti-spam: alert sent once when condition appears,
 * suppressed while active, cleared when obstacle removed.
 */

#include "../../Domain/Interfaces/ISensorReader.h"
#include "../../Domain/Interfaces/IAlertNotifier.h"
#include "../../BSP.h"

namespace Business {

// Proximity zone classification
enum class ProximityZone {
    CLEAR,      // > PROXIMITY_WARNING_CM  or -1 (no echo)
    CAUTION,    // <= PROXIMITY_WARNING_CM
    DANGER      // <= PROXIMITY_ALERT_CM — triggers alert
};

class ProximityMonitor {
private:
    Domain::IProximitySensor* sensor;
    Domain::IAlertNotifier*   alertNotifier;

    ProximityZone lastZone;
    unsigned long lastAlertTime;
    unsigned long alertCooldownMs;

    ProximityZone classifyDistance(float distanceCm) const;
    void          triggerObstacleAlert(float distanceCm, unsigned long timestamp);

public:
    /**
     * @param proxSensor     Injected proximity sensor (JSN-SR04T adapter)
     * @param alerter        Injected alert notifier (AlertManager)
     * @param cooldownMs     Minimum ms between repeated alerts (default 5000ms)
     */
    ProximityMonitor(
        Domain::IProximitySensor* proxSensor,
        Domain::IAlertNotifier*   alerter,
        unsigned long             cooldownMs = 5000UL
    );

    /**
     * @brief Perform the proximity threshold check and evaluate business rules
     * @param distanceCm Current distance read from sensor
     * @param timestamp  Current millis() timestamp
     */
    void check(float distanceCm, unsigned long timestamp);

    /**
     * @brief Raw read from the sensor (fast, non-blocking logic)
     * @return Current distance in cm, or -1.0f 
     */
    float read();

    /**
     * @return Last classified proximity zone
     */
    ProximityZone getCurrentZone() const { return lastZone; }
};

} // namespace Business

#endif // PROXIMITY_MONITOR_H
