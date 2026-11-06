cmake_minimum_required(VERSION 3.25)
project(AvenireOverlay VERSION 0.1 LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
find_package(Qt6 6.8 REQUIRED COMPONENTS Core Gui Qml Quick Quick3D ShaderTools)
qt_standard_project_setup(REQUIRES 6.8)
qt_add_executable(avenire-overlay main.cpp)
if(APPLE)
    # Qt finalizes QML deployment at the end of this directory. Set the bundle
    # layout here, before it records QML/plugin destinations for the target.
    set_target_properties(avenire-overlay PROPERTIES MACOSX_BUNDLE TRUE)
endif()
qt_add_qml_module(avenire-overlay
    URI AvenireOverlay
    RESOURCE_PREFIX /avenire
    QML_FILES Overlay.qml Visual.qml BibataCursor.qml EdgeGlow.qml AnnotationBubble.qml CartPole.qml
)
qt_add_shaders(avenire-overlay edge_glow
    PREFIX /avenire/shaders
    BASE shaders
    FILES shaders/edge-glow.frag
)
target_link_libraries(avenire-overlay PRIVATE Qt6::Core Qt6::Gui Qt6::Qml Qt6::Quick Qt6::Quick3D)
if(WIN32)
    # Inherited stdio is the private transport; Electron hides the console on spawn.
    set_target_properties(avenire-overlay PROPERTIES WIN32_EXECUTABLE FALSE)
endif()
if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
    install(TARGETS avenire-overlay BUNDLE DESTINATION . RUNTIME DESTINATION .)
endif()
