#ifndef WEB_SERVICE_H
#define WEB_SERVICE_H

#include <WebServer.h>
#include "../../Domain/Entities/TruckStatus.h"
#include "../../Business/UseCases/EngineMonitor.h"

namespace Infrastructure {

class WebService {
private:
    WebServer* server;
    Business::EngineMonitor* engineMonitor;
    static WebService* instance;

    void handleRoot();
    void handleStatus();
    void handleResetHours();
    void handleNotFound();

public:
    WebService(Business::EngineMonitor* monitor);
    ~WebService();

    void initialize();
    void handleClient();
    
    // Static callback for the server
    static void handleRootStatic() { if(instance) instance->handleRoot(); }
    static void handleStatusStatic() { if(instance) instance->handleStatus(); }
    static void handleResetHoursStatic() { if(instance) instance->handleResetHours(); }
    static void handleNotFoundStatic() { if(instance) instance->handleNotFound(); }
};

} // namespace Infrastructure

#endif
