#ifndef TRUCK_STATUS_H
#define TRUCK_STATUS_H
#include "GPSCoordinates.h"
namespace Domain {
struct TruckStatus {
  float engineTemperature;   // °C
  float oilPressure;         // Bar
  float fuelLevel;           // Liters
  int rpm;                   // RPM
  float tempResistance;      // Raw resistance in Ohms
  float fuelResistance;      // Raw resistance in Ohms
  int8_t gear;               // 0=Neutral, 1=Forward, -1=Reverse
  unsigned long engineHours; // Total hours in seconds
  GPSCoordinates gpsPosition;
  float proximityDistance_cm; // Rear obstacle distance in cm (-1 = no obstacle
                              // / out of range)
  bool engineRunning;
  bool temp_nc; // Temperature Not Connected
  bool fuel_nc; // Fuel Not Connected
  bool oil_nc;  // Oil Pressure Not Connected
  unsigned long timestamp; // milliseconds
  TruckStatus()
      : engineTemperature(0.0f), oilPressure(0.0f), fuelLevel(0.0f), rpm(0),
        tempResistance(0.0f), fuelResistance(0.0f), gear(0), engineHours(0),
        proximityDistance_cm(-1.0f), temp_nc(false), fuel_nc(false),
        engineRunning(false), timestamp(0) {}
};
} // namespace Domain
#endif