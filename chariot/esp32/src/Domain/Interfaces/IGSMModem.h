#ifndef I_GSM_MODEM_H
#define I_GSM_MODEM_H

#include "../Entities/GPSCoordinates.h"

namespace Domain {

class IGSMModem {
public:
    virtual ~IGSMModem() = default;

    virtual bool initialize() = 0;
    virtual bool isConnected() = 0;
    virtual bool enableGPS() = 0;
    virtual GPSCoordinates getGPSPosition(bool isStationary = false) = 0;

    virtual bool sendData(const char* topic, const char* payload) = 0;
    virtual void maintainConnection() = 0;
};

} // namespace Domain

#endif
