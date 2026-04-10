#include "FuelLevelSensor.h"
namespace Infrastructure {
FuelLevelSensor::FuelLevelSensor(ADS1115Adapter *adsAdapter)
    : ads(adsAdapter), lastLiters(0.0f), lastPercentage(0.0f),
      rEmpty(FUEL_R_EMPTY), rMiddle((FUEL_R_EMPTY + FUEL_R_FULL) / 2.0f),
      rFull(FUEL_R_FULL), tankCapacity(FUEL_TANK_CAPACITY) {}
float FuelLevelSensor::readFuelLevel() {
  float voltage = ads->readVoltage(ADS1115_CH_FUEL_LEVEL);
  float resistance = voltageToResistance(voltage);
  lastLiters = resistanceToLiters(resistance);
  lastPercentage = resistanceToPercentage(resistance);
  // NC (Not Connected) / Error Detection
  if (resistance < 0 || resistance > 500000.0f) {
    lastIsDisconnected = true;
    lastLiters = 0.0f; // Return 0 as requested by user
    lastPercentage = 0.0f;
  } else {
    lastIsDisconnected = false;
  }
#if DEBUG_FUEL_SENSOR
  Serial.print("[FUEL] V=");
  Serial.print(voltage, 3);
  Serial.print("V, R=");
  Serial.print(resistance, 1);
  Serial.print("Ω, L=");
  Serial.print(lastLiters, 1);
  Serial.print("L (");
  Serial.print(lastPercentage, 1);
  Serial.println("%)");
  if (lastIsDisconnected)
    Serial.print(" [NC]");
  Serial.println();
#endif
  return lastLiters;
}
float FuelLevelSensor::getPercentage() { return lastPercentage; }
float FuelLevelSensor::getLiters() { return lastLiters; }
void FuelLevelSensor::setTankCapacity(float capacity) {
  if (capacity <= 0.0f)
    return;
  tankCapacity = capacity;
}
float FuelLevelSensor::getTankCapacity() const { return tankCapacity; }
float FuelLevelSensor::voltageToResistance(float voltage) {
  if (voltage < 0)
    return -1.0f; // I2C Fail

  // Voltage divider: V = VCC * R_sensor / (R_pullup + R_sensor)
  // Solve for R_sensor: R_sensor = R_pullup * V / (VCC - V)

  // High resistance / Unplugged check
  // If voltage is > 98% of VCC, it's essentially an open circuit.
  if (voltage >= FUEL_V_REF * 0.99f)
    return 1000000.0f;

  if (voltage <= 0.0f)
    return 0.0f;
  float resistance = FUEL_R_PULLUP * voltage / (FUEL_V_REF - voltage);
  return resistance;
}
void FuelLevelSensor::setCalibration(float resistanceEmpty,
                                     float resistanceMiddle,
                                     float resistanceFull) {
  rEmpty = resistanceEmpty;
  rMiddle = resistanceMiddle;
  rFull = resistanceFull;
  // Sanity check: ensure middle is between bounds
  float minR = std::min(rEmpty, rFull);
  float maxR = std::max(rEmpty, rFull);

  if (rMiddle > maxR || rMiddle < minR) {
    rMiddle = (rEmpty + rFull) / 2.0f;
  }
#if DEBUG_CALIBRATION
  Serial.print("[CALIBRATION] Fuel sensor calibrated: Empty=");
  Serial.print(rEmpty);
  Serial.print("Ω, Middle=");
  Serial.print(rMiddle);
  Serial.print("Ω, Full=");
  Serial.print(rFull);
  Serial.println("Ω");
#endif
}
float FuelLevelSensor::readRawResistance() {
  float voltage = ads->readVoltage(ADS1115_CH_FUEL_LEVEL);
  return voltageToResistance(voltage);
}
float FuelLevelSensor::resistanceToLiters(float resistance) {
  float percentage = resistanceToPercentage(resistance);
  return (percentage / 100.0f) * tankCapacity;
}
float FuelLevelSensor::resistanceToPercentage(float resistance) {
  // Determine direction
  bool ascending = (rFull > rEmpty);

  // Clamp
  float minR = std::min(rEmpty, rFull);
  float maxR = std::max(rEmpty, rFull);
  if (resistance > maxR)
    resistance = maxR;
  if (resistance < minR)
    resistance = minR;
  float percentage = 0.0f;

  if (ascending) {
    // Empty (low R) to Full (high R)
    if (resistance <= rMiddle) {
      // Lower half: 0% to 50%
      float den = (rMiddle - rEmpty);
      percentage = (den != 0) ? 50.0f * (resistance - rEmpty) / den : 0.0f;
    } else {
      // Upper half: 50% to 100%
      float den = (rFull - rMiddle);
      percentage =
          (den != 0) ? 50.0f + 50.0f * (resistance - rMiddle) / den : 50.0f;
    }
  } else {
    // Empty (high R) to Full (low R)
    if (resistance >= rMiddle) {
      // Lower half: 0% to 50%
      float den = (rEmpty - rMiddle);
      percentage = (den != 0) ? 50.0f * (rEmpty - resistance) / den : 0.0f;
    } else {
      // Upper half: 50% to 100%
      float den = (rMiddle - rFull);
      percentage =
          (den != 0) ? 50.0f + 50.0f * (rMiddle - resistance) / den : 50.0f;
    }
  }
  if (percentage < 0.0f)
    percentage = 0.0f;
  if (percentage > 100.0f)
    percentage = 100.0f;

  return percentage;
}
} // namespace Infrastructure
