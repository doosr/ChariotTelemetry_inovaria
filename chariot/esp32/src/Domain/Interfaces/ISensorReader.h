#ifndef I_SENSOR_READER_H
#define I_SENSOR_READER_H
namespace Domain {
class ITemperatureSensor {
public:
  virtual ~ITemperatureSensor() = default;
  virtual float readTemperature() = 0;
  virtual float readRawResistance() = 0;
  virtual bool isDisconnected() = 0;
};
class IOilPressureSensor {
public:
  virtual ~IOilPressureSensor() = default;
  virtual float readPressure() = 0; // Returns pressure in Bar
  virtual bool isDisconnected() = 0;
};
class IFuelLevelSensor {
public:
  virtual ~IFuelLevelSensor() = default;
  virtual float readFuelLevel() = 0; // Returns fuel in Liters
  virtual float readRawResistance() = 0;
  virtual bool isDisconnected() = 0;
};
class IRPMSensor {
public:
  virtual ~IRPMSensor() = default;
  virtual int readRPM() = 0;
};
class IProximitySensor {
public:
  virtual ~IProximitySensor() = default;
  // Returns distance in cm. Returns -1.0f on timeout (no obstacle in range).
  virtual float readDistance() = 0;
};
} // namespace Domain
#endif
