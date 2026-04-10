#include "FuelTheftDetector.h"
#include <Arduino.h>

namespace Business {

FuelTheftDetector::FuelTheftDetector(Domain::IAlertNotifier* alerter, Domain::IPersistenceStorage* store)
    : alertNotifier(alerter), storage(store), lastFuelLevel(0.0f), lastCaptureTime(0) {}

void FuelTheftDetector::initialize() {
    float savedLevel = storage->loadFuelLevel();
    lastFuelLevel = Domain::FuelLevel(savedLevel);
}

bool FuelTheftDetector::isVehicleStationary(float speed) const {
    return speed < FUEL_THEFT_MAX_SPEED_KMH;
}

void FuelTheftDetector::checkForTheft(float currentFuelLiters, float gpsSpeed, unsigned long timestamp) {
    Domain::FuelLevel currentLevel(currentFuelLiters);
    float delta = lastFuelLevel.getLiters() - currentLevel.getLiters(); // Positive means drop

    // 1. RAPID THEFT DETECTION (2L in 2s)
    if (timestamp - lastCaptureTime <= RAPID_DROP_WINDOW_MS && timestamp > lastCaptureTime) {
        // GLITCH REJECTION: Ignore drops larger than 15L in 2 seconds (likely sensor error)
        if (delta >= RAPID_DROP_THRESHOLD_LITERS && delta < 100.0f) {
            Domain::Alert alert(
                Domain::AlertType::FUEL_THEFT,
                "Vol rapide détecté (>2L en 2s)",
                lastFuelLevel.getLiters(),
                currentLevel.getLiters()
            );
            alertNotifier->sendAlert(alert);
            // Update baseline immediately to avoid double alerts
            lastFuelLevel = currentLevel;
            lastCaptureTime = timestamp;
            return;
        } else if (delta >= 100.0f) {
            #if DEBUG_FUEL_SENSOR
            Serial.print("[THEFT] Glitch detected: ");
            Serial.print(delta);
            Serial.println(" L drop ignored.");
            #endif
            // Optional: reset baseline to current level to recover from glitch faster
            lastFuelLevel = currentLevel;
            lastCaptureTime = timestamp;
            return;
        }
    }

    // 2. STATIONARY THEFT DETECTION (Slow drop while parked)
    if (isVehicleStationary(gpsSpeed)) {
        if (delta >= STATIONARY_DROP_THRESHOLD_LITERS) {
            Domain::Alert alert(
                Domain::AlertType::FUEL_THEFT,
                "Vol stationnaire détecté",
                lastFuelLevel.getLiters(),
                currentLevel.getLiters()
            );
            alertNotifier->sendAlert(alert);
            lastFuelLevel = currentLevel;
        }
    }

    // Update periodic baseline if enough time has passed
    if (timestamp - lastCaptureTime >= RAPID_DROP_WINDOW_MS) {
        lastFuelLevel = currentLevel;
        lastCaptureTime = timestamp;
    }
}

void FuelTheftDetector::updateFuelLevel(float currentFuelLiters, unsigned long timestamp) {
    lastFuelLevel = Domain::FuelLevel(currentFuelLiters);
    lastCaptureTime = timestamp;
    storage->saveFuelLevel(currentFuelLiters);
}

} // namespace Business
