import QtQuick

Item {
    id: glow
    property bool animate: false
    property bool errorState: false
    property real flow: 0
    property real pulse: 0.85
    readonly property bool running: drift.running || breathe.running
    readonly property real band: 40
    // Dawn tokens from the landing page's marketing.css.
    readonly property color dawnBlue: "#abc4ff"
    readonly property color dawnViolet: "#7a6cf0"
    readonly property color dawnOrchid: "#b05be0"

    NumberAnimation on flow {
        id: drift
        from: 0; to: 1; duration: 16000
        loops: Animation.Infinite
        running: glow.animate && glow.visible
    }
    SequentialAnimation on pulse {
        id: breathe
        loops: Animation.Infinite
        running: glow.animate && glow.visible
        NumberAnimation { to: 0.62; duration: 1800; easing.type: Easing.InOutSine }
        NumberAnimation { to: 0.92; duration: 1800; easing.type: Easing.InOutSine }
    }
    Repeater {
        model: [
            { x: 0, y: 0, w: glow.width, h: glow.band },
            { x: 0, y: glow.height - glow.band, w: glow.width, h: glow.band },
            { x: 0, y: glow.band, w: glow.band, h: Math.max(0, glow.height - 2 * glow.band) },
            { x: glow.width - glow.band, y: glow.band, w: glow.band, h: Math.max(0, glow.height - 2 * glow.band) }
        ]
        delegate: ShaderEffect {
            required property var modelData
            x: modelData.x; y: modelData.y
            width: modelData.w; height: modelData.h
            property vector2d surfaceSize: Qt.vector2d(glow.width, glow.height)
            property vector2d regionOffset: Qt.vector2d(x, y)
            property vector2d regionSize: Qt.vector2d(width, height)
            property real flow: glow.flow
            property real strength: glow.animate ? glow.pulse : 0.85
            property real errorState: glow.errorState ? 1 : 0
            property color dawnBlue: glow.dawnBlue
            property color dawnViolet: glow.dawnViolet
            property color dawnOrchid: glow.dawnOrchid
            fragmentShader: "qrc:/avenire/shaders/edge-glow.frag.qsb"
        }
    }
}
