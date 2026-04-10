#ifndef FUEL_LEVEL_SENSOR_H
#define FUEL_LEVEL_SENSOR_H
#include "../../BSP.h"
#include "../../Domain/Interfaces/ISensorReader.h"
#include "ADS1115Adapter.h"

namespace Infrastructure {
class FuelLevelSensor : public Domain::IFuelLevelSensor {
private:
  ADS1115Adapter *ads;
  float lastLiters;     // Store last reading in liters
  float lastPercentage; // Store last reading in percentage
  float rEmpty;         // Calibrated resistance when empty (0%)
  float rMiddle;        // Calibrated resistance at middle (50%)
  float rFull;          // Calibrated resistance when full (100%)
  float tankCapacity;   // Current tank capacity used for conversion
public:
  FuelLevelSensor(ADS1115Adapter *adsAdapter);
  float readFuelLevel() override;     // Returns liters
  float readRawResistance() override; // Read raw resistance value override
  bool isDisconnected() override { return lastIsDisconnected; }
  float getPercentage(); // Returns percentage (0-100)
  float getLiters();     // Returns liters
  // Calibration methods

  // Calibration methods (needed by main.cpp for remote dashboard config)
  void setCalibration(float resistanceEmpty, float resistanceMiddle,
                      float resistanceFull);
  void setTankCapacity(float capacity);
  float getTankCapacity() const;

private:
  bool lastIsDisconnected = false;
  float voltageToResistance(float voltage);
  float resistanceToLiters(float resistance);
  float resistanceToPercentage(float resistance);
};
} // namespace Infrastructure
#endif