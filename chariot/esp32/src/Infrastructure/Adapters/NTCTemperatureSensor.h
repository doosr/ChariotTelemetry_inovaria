#ifndef NTC_TEMPERATURE_SENSOR_H
#define NTC_TEMPERATURE_SENSOR_H

#include <Arduino.h>
#include "../../Domain/Interfaces/ISensorReader.h"
#include "../../BSP.h"

namespace Infrastructure {

// Forward declaration
class ADS1115Adapter;

class NTCTemperatureSensor : public Domain::ITemperatureSensor {
private:
    ADS1115Adapter* ads1115;
    float vcc;
    float rFixed;
    float beta;
    float r0;
    float t0;
    float offset;  // Temperature offset for calibration
    bool  lastIsDisconnected = false;

public:
    // Constructor requires ADS1115Adapter pointer
    NTCTemperatureSensor(ADS1115Adapter* ads);

    float readTemperature() override;
    float readRawResistance() override;
    bool  isDisconnected() { return lastIsDisconnected; }
    void  setCalibration(float betaValue, float r0Value, float offsetCelsius);

private:
    float calculateResistance(float voltage);
    float calculateTemperature(float resistance);
};

} // namespace Infrastructure

#endif
