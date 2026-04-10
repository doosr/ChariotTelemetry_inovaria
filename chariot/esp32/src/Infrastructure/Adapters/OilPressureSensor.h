#ifndef OIL_PRESSURE_SENSOR_H
#define OIL_PRESSURE_SENSOR_H
#include "../../BSP.h"
#include "../../Domain/Interfaces/ISensorReader.h"
#include "ADS1115Adapter.h"

namespace Infrastructure {
class OilPressureSensor : public Domain::IOilPressureSensor {
private:
  ADS1115Adapter *ads;

public:
  OilPressureSensor(ADS1115Adapter *adsAdapter);
  float readPressure() override;
  bool isDisconnected() override { return lastIsDisconnected; }

private:
  bool lastIsDisconnected = false;
  float resistanceToPressure(float resistance);
  float calculateResistance(float voltage);
};
} // namespace Infrastructure
#endif
