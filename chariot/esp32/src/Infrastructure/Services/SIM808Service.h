#ifndef SIM808_SERVICE_H
#define SIM808_SERVICE_H

#include "../../BSP.h"
#include "../../Domain/Interfaces/IGSMModem.h"
#include <HardwareSerial.h>
#include <PubSubClient.h>
#include <TinyGsmClient.h>

namespace Infrastructure {

class SIM808Service : public Domain::IGSMModem {
private:
  HardwareSerial *serial;
  TinyGsm *modem;
  TinyGsmClient *gsmClient;
  PubSubClient *mqtt;

  // Connection state
  bool gpsEnabled;
  bool networkRegistered;
  bool gprsConnected;
  bool mqttConnected;

  // Reconnection management
  unsigned long lastGprsReconnectAttempt;
  unsigned long lastMqttReconnectAttempt;
  int gprsReconnectAttempts;
  int mqttReconnectAttempts;

  // Network quality
  int signalQuality;
  unsigned long lastSignalCheck;

  // Debouncing for flaky status checks
  int gprsDisconnectCount;
  unsigned long lastGprsCheck;
  float lastSpeed;
  bool motionUnlocked;

public:
  SIM808Service();
  ~SIM808Service();

  bool initialize() override;
  bool isConnected() override;
  bool enableGPS() override;
  Domain::GPSCoordinates getGPSPosition(bool isStationary = false) override;

  bool sendData(const char *topic, const char *payload) override;
  void maintainConnection() override;

  // MQTT callback registration
  void setCallback(void (*callback)(char *, uint8_t *, unsigned int));

  // Subscribe to an MQTT topic
  bool subscribe(const char *topic);

  // HTTP fallback: fetch calibration JSON from backend REST API
  String fetchCalibration(const char *deviceId);

  // HTTP fallback: POST telemetry directly to backend when MQTT is down
  bool sendTelemetryHTTP(const char *payload);

private:
  void powerOn();
  bool waitForNetwork();
  bool checkSignalQuality();
  bool connectToGPRS();
  bool connectToMQTT();
  void resetConnectionState();
};

} // namespace Infrastructure

#endif
