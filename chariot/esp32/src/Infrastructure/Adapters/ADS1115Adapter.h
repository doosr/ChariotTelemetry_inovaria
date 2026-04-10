#ifndef ADS1115_ADAPTER_H
#define ADS1115_ADAPTER_H

#include <Adafruit_ADS1X15.h>
#include "../../BSP.h"

namespace Infrastructure {

class ADS1115Adapter {
private:
    Adafruit_ADS1115 ads;
    bool initialized;
    SemaphoreHandle_t i2cMutex;

public:
    ADS1115Adapter();
    ~ADS1115Adapter();

    bool initialize();
    int16_t readADC(uint8_t channel);
    float readVoltage(uint8_t channel);
};

} // namespace Infrastructure

#endif
