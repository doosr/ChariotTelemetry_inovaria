#include "WebService.h"
#include <WiFi.h>
#include <ArduinoJson.h>
#include "../../BSP.h"

namespace Infrastructure {

WebService* WebService::instance = nullptr;

WebService::WebService(Business::EngineMonitor* monitor) : engineMonitor(monitor) {
    server = new WebServer(WEB_SERVER_PORT);
    instance = this;
}

WebService::~WebService() {
    delete server;
}

void WebService::initialize() {
    Serial.println("[WEB] Starting WiFi Access Point...");
    WiFi.softAP(WIFI_AP_SSID, WIFI_AP_PASS);
    
    IPAddress IP = WiFi.softAPIP();
    Serial.print("[WEB] AP IP address: ");
    Serial.println(IP);

    server->on("/", HTTP_GET, handleRootStatic);
    server->on("/api/status", HTTP_GET, handleStatusStatic);
    server->on("/telemetry", HTTP_GET, handleStatusStatic);  // Dashboard endpoint
    server->on("/api/reset-hours", HTTP_POST, handleResetHoursStatic);
    server->onNotFound(handleNotFoundStatic);

    server->begin();
    Serial.println("[WEB] HTTP server started");
}

void WebService::handleClient() {
    server->handleClient();
}

void WebService::handleRoot() {
    server->send(200, "text/plain", "Truck Telemetry Web API. Use /api/status for JSON data.");
}

void WebService::handleStatus() {
    // Get current status from engine monitor
    Domain::TruckStatus status = engineMonitor->readCurrentStatus(millis());
    
    StaticJsonDocument<512> doc;
    doc["temp"] = status.engineTemperature;
    doc["oil_pressure"] = status.oilPressure;
    doc["fuel_liters"] = status.fuelLevel;
    doc["fuel_percent"] = (status.fuelLevel / FUEL_TANK_CAPACITY) * 100.0f;
    doc["fuel_res"] = status.fuelResistance;
    doc["temp_res"] = status.tempResistance;
    doc["rpm"] = status.rpm;
    doc["gear"] = status.gear; // Added missing Gear field
    doc["engine_hours"] = status.engineHours / 3600.0f;
    doc["engine_on"] = status.engineRunning;
    doc["lat"] = status.gpsPosition.latitude;
    doc["lon"] = status.gpsPosition.longitude;
    doc["speed"] = status.gpsPosition.speed;
    doc["timestamp"] = status.timestamp;

    String jsonResponse;
    serializeJson(doc, jsonResponse);
    
    // Add CORS headers so the local dashboard can fetch the data
    server->sendHeader("Access-Control-Allow-Origin", "*");
    server->send(200, "application/json", jsonResponse);
}

void WebService::handleResetHours() {
    Serial.println("[WEB] Manual hours reset requested");
    engineMonitor->resetEngineHours();
    server->sendHeader("Access-Control-Allow-Origin", "*");
    server->send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Engine hours reset successful\"}");
}

void WebService::handleNotFound() {
    server->send(404, "text/plain", "Not Found");
}

} // namespace Infrastructure
