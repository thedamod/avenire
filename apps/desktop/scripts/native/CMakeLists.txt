cmake_minimum_required(VERSION 3.25)
project(AvenireOverlayDistribution LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# Layout is relative to Electron's resources/native-overlay directory.
set(CMAKE_INSTALL_BINDIR "." CACHE STRING "Executable staging directory" FORCE)
set(CMAKE_INSTALL_LIBDIR "lib" CACHE STRING "Library staging directory" FORCE)
set(CMAKE_INSTALL_RPATH "$ORIGIN/lib")
find_package(Qt6 6.8.3 EXACT REQUIRED COMPONENTS Core Qml Quick Quick3D)
add_subdirectory("${CMAKE_CURRENT_LIST_DIR}/../../../desktop-native" native)
qt_import_plugins(avenire-overlay INCLUDE Qt6::QOffscreenIntegrationPlugin)
if(APPLE)
  set_target_properties(avenire-overlay PROPERTIES
    MACOSX_BUNDLE_GUI_IDENTIFIER "space.avenire.native-overlay"
    MACOSX_BUNDLE_BUNDLE_NAME "Ruth presentation"
    MACOSX_BUNDLE_BUNDLE_VERSION "0.1.0"
    MACOSX_BUNDLE_SHORT_VERSION_STRING "0.1.0")
endif()
install(TARGETS avenire-overlay BUNDLE DESTINATION . RUNTIME DESTINATION .)
if(APPLE)
  # Ensure the headless lifecycle plugin is present when macdeployqt scans the bundle.
  install(FILES $<TARGET_FILE:Qt6::QOffscreenIntegrationPlugin>
    DESTINATION avenire-overlay.app/Contents/PlugIns/platforms)
endif()
if(WIN32)
  # windeployqt does not honor qt_import_plugins for a shared Qt build.
  qt_generate_deploy_qml_app_script(TARGET avenire-overlay OUTPUT_SCRIPT deploy_script
    DEPLOY_TOOL_OPTIONS --include-plugins qoffscreen)
else()
  qt_generate_deploy_qml_app_script(TARGET avenire-overlay OUTPUT_SCRIPT deploy_script)
endif()
install(SCRIPT "${deploy_script}")
# Failure-injection process used by the transport E2E suite; never staged.
add_executable(overlay-protocol-fixture protocol-fixture.cpp)
