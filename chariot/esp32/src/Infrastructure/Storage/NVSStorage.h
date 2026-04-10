#ifndef NVS_STORAGE_H
#define NVS_STORAGE_H

#include <Preferences.h>
#include <nvs_flash.h>
#include "../../Domain/Interfaces/IPersistenceStorage.h"

namespace Infrastructure {

class NVSStorage : public Domain::IPersistenceStorage {
private:
    Preferences preferences;
    const char* namespaceName;
    bool isInitialized;

public:
    explicit NVSStorage(const char* ns = "truck");

    // Initialize NVS flash partition
    bool initialize();

    bool saveEngineHours(unsigned long hours) override;
    unsigned long loadEngineHours() override;

    bool saveFuelLevel(float liters) override;
    float loadFuelLevel() override;

    // Calibration data (Fuel + Temperature)
    struct CalibrationData {
        float fuel_r_empty;
        float fuel_r_middle;
        float fuel_r_full;
        float fuel_tank_capacity;
        float temp_beta;
        float temp_r0;
        float temp_offset;
    };

    bool saveCalibration(const CalibrationData& data);
    bool loadCalibration(CalibrationData& data);
    bool isCalibrated();
    bool setCalibrated(bool calibrated);
};

} // namespace Infrastructure

#endif // NVS_STORAGE_H