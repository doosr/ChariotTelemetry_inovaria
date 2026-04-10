#include "EngineMonitor.h"
#include "../../BSP.h"
#include <Arduino.h>
namespace Business {
EngineMonitor::EngineMonitor(Domain::ITemperatureSensor *temp,
                             Domain::IOilPressureSensor *oil,
                             Domain::IFuelLevelSensor *fuel,
                             Domain::IRPMSensor *rpm,
                             Domain::IAlertNotifier *alerter,
                             EngineHoursCalculator *calculator)
    : tempSensor(temp), oilSensor(oil), fuelSensor(fuel), rpmSensor(rpm),
      alertNotifier(alerter), hoursCalculator(calculator) {}
Domain::TruckStatus EngineMonitor::readCurrentStatus(unsigned long timestamp) {
  Domain::TruckStatus status;
  status.engineTemperature = tempSensor->readTemperature();
  status.oilPressure = oilSensor->readPressure();
  status.fuelLevel = fuelSensor->readFuelLevel();
  status.temp_nc = tempSensor->isDisconnected();
  status.fuel_nc = fuelSensor->isDisconnected();
  status.oil_nc = oilSensor->isDisconnected();
  status.tempResistance = tempSensor->readRawResistance();
  status.fuelResistance = fuelSensor->readRawResistance();
  status.rpm = rpmSensor->readRPM();
  status.timestamp = timestamp;
  // Update engine hours
  hoursCalculator->update(status.oilPressure, status.rpm, timestamp);
  status.engineHours = hoursCalculator->getTotalHours().getSeconds();
  // Determine if engine is running (using centralized logic)
  status.engineRunning =
      hoursCalculator->isEngineRunning(status.oilPressure, status.rpm);
  // Determine if engine is running (using BSP thresholds)
  //    status.engineRunning = (status.oilPressure >
  //    ENGINE_MIN_OIL_PRESSURE_BAR) && (status.rpm > ENGINE_MIN_RPM);
  // Read Transmission Sensors (Direct GPIO)
  // FINAL LOGIC: Active LOW
  // - Cut wires / Disconnected = HIGH (Internal Pullup) -> Neutral
  // - Switch Closed (Engaged) = LOW (Ground) -> Gear Active
  if (digitalRead(PIN_TRANSMISSION_FWD) == LOW) {
    status.gear = 1; // Forward
  } else if (digitalRead(PIN_TRANSMISSION_REV) == LOW) {
    status.gear = -1; // Reverse
  } else {
    status.gear = 0; // Neutral (both HIGH)
  }
  return status;
}
void EngineMonitor::checkForAlerts(const Domain::TruckStatus &status) {
  if (!status.temp_nc) {
    checkTemperatureAlert(status.engineTemperature);
  }

  if (!status.oil_nc) {
    checkOilPressureAlert(status.oilPressure, status.rpm);
  }
}
void EngineMonitor::checkTemperatureAlert(float temperature) {
  if (temperature > ALERT_HIGH_TEMP_CELSIUS) {
    Domain::Alert alert(Domain::AlertType::HIGH_TEMPERATURE,
                        "Engine temperature critical", temperature);
    alertNotifier->sendAlert(alert);
  }
}
void EngineMonitor::checkOilPressureAlert(float pressure, int rpm) {

  // Use the domain logic to check if pressure is critical for current RPM
  Domain::OilPressure oilPressure(pressure);
  if (oilPressure.isCriticalForRPM(rpm)) {
    Domain::Alert alert(Domain::AlertType::LOW_OIL_PRESSURE,
                        "Oil pressure too low for current RPM", pressure,
                        static_cast<float>(rpm));
    alertNotifier->sendAlert(alert);
  }
}
void EngineMonitor::resetEngineHours() { hoursCalculator->resetHours(); }
} // namespace Business