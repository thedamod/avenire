// Deliberately broken companion for transport failure E2E tests. Never installed.
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <string>
#include <thread>
int main() {
    const std::string mode = std::getenv("AVENIRE_OVERLAY_TEST_MODE") ? std::getenv("AVENIRE_OVERLAY_TEST_MODE") : "";
    std::string line;
    while (std::getline(std::cin, line)) {
        if (mode == "stall") { std::this_thread::sleep_for(std::chrono::seconds(60)); }
        else if (mode == "malformed") { std::cout << "not-json\n" << std::flush; }
        else if (mode == "oversized") { std::cout << std::string(1100000, 'x') << std::flush; }
        else if (mode == "dismiss") { std::cout << "{\"event\":\"dismiss\"}\n{\"id\":1,\"ok\":true,\"result\":{}}\n{\"id\":2,\"ok\":true,\"result\":{}}\n" << std::flush; }
        else { return 3; }
    }
}
