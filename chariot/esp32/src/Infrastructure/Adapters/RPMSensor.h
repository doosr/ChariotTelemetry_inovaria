#ifndef RPM_SENSOR_H
#define RPM_SENSOR_H

#include <Arduino.h>
#include "../../Domain/Interfaces/ISensorReader.h"
#include "../../BSP.h"

namespace Infrastructure {

class RPMSensor : public Domain::IRPMSensor {
private:
    static volatile unsigned long lastPulseTime;
    static volatile unsigned long pulseInterval;
    static volatile bool pulseDetected;

    static void IRAM_ATTR handleInterrupt();

public:
    RPMSensor();
    int readRPM() override;
};

} // namespace Infrastructure

#endif
