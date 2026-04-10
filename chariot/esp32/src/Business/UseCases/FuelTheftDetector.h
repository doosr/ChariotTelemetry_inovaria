#ifndef FUEL_THEFT_DETECTOR_H
#define FUEL_THEFT_DETECTOR_H

#include "../../Domain/ValueObjects/FuelLevel.h"
#include "../../Domain/Entities/GPSCoordinates.h"
#include "../../Domain/Interfaces/IAlertNotifier.h"
#include "../../Domain/Interfaces/IPersistenceStorage.h"
#include "../../BSP.h"

namespace Business {

class FuelTheftDetector {
private:
    Domain::IAlertNotifier* alertNotifier;
    Domain::IPersistenceStorage* storage;
    Domain::FuelLevel lastFuelLevel;
    unsigned long lastCaptureTime;
    
    // Configurable thresholds (could be moved to BSP.h)
    static constexpr float RAPID_DROP_THRESHOLD_LITERS = 2.0f;
    static constexpr unsigned long RAPID_DROP_WINDOW_MS = 2000; // 2 seconds
    static constexpr float STATIONARY_DROP_THRESHOLD_LITERS = 5.0f;
    static constexpr unsigned long STATIONARY_WINDOW_MS = 30000; // 30 seconds

public:
    FuelTheftDetector(Domain::IAlertNotifier* alerter, Domain::IPersistenceStorage* store);

    void initialize();
    void checkForTheft(float currentFuelLiters, float gpsSpeed, unsigned long timestamp);
    void updateFuelLevel(float currentFuelLiters, unsigned long timestamp);

private:
    bool isVehicleStationary(float speed) const;
};

} // namespace Business

#endif
