#ifndef ENGINE_MONITOR_H
#define ENGINE_MONITOR_H

#include "../../Domain/Entities/TruckStatus.h"
#include "../../Domain/ValueObjects/OilPressure.h"
#include "../../Domain/Interfaces/ISensorReader.h"
#include "../../Domain/Interfaces/IAlertNotifier.h"
#include "../../BSP.h"
#include "../Services/EngineHoursCalculator.h"

namespace Business {

class EngineMonitor {
private:
    Domain::ITemperatureSensor* tempSensor;
    Domain::IOilPressureSensor* oilSensor;
    Domain::IFuelLevelSensor* fuelSensor;
    Domain::IRPMSensor* rpmSensor;
    Domain::IAlertNotifier* alertNotifier;
    EngineHoursCalculator* hoursCalculator;

public:
    EngineMonitor(
        Domain::ITemperatureSensor* temp,
        Domain::IOilPressureSensor* oil,
        Domain::IFuelLevelSensor* fuel,
        Domain::IRPMSensor* rpm,
        Domain::IAlertNotifier* alerter,
        EngineHoursCalculator* calculator
    );

    Domain::TruckStatus readCurrentStatus(unsigned long timestamp);
    void checkForAlerts(const Domain::TruckStatus& status);
    void resetEngineHours();

private:
    void checkTemperatureAlert(float temperature);
    void checkOilPressureAlert(float pressure, int rpm);
};

} // namespace Business

#endif
