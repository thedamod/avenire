import QtQuick
import QtQuick.Shapes

Item {
    id: figure
    property var diagram: ({})
    property bool interactionEnabled: false
    property real angleDegrees: 0
    property real cartPosition: 0
    readonly property bool dark: diagram.theme === "dark"
    readonly property color ink: dark ? "#e6e6e6" : "#18181a"
    readonly property color muted: dark ? "#a3a3a3" : "#57575a"
    readonly property color line: dark ? "#6a6a6a" : "#8a8a8f"
    function clamp(v, low, high) { return Math.max(low, Math.min(high, v)) }
    function resetDiagram() {
        angleDegrees = clamp(Number(diagram.angleDegrees) || 0, -75, 75)
        cartPosition = clamp(Number(diagram.cartPosition) || 0, -1, 1)
    }
    onDiagramChanged: resetDiagram()
    Component.onCompleted: resetDiagram()
    readonly property real lengthValue: clamp(Number(diagram.poleLength) || 1, 0.5, 3)
    readonly property real pivotX: width / 2 + cartPosition * (width * 0.2)
    readonly property real pivotY: height * 0.68
    readonly property real rodLength: Math.min(height * 0.49, width * 0.26) * lengthValue / 3
    readonly property real radians: angleDegrees * Math.PI / 180
    readonly property real bobX: pivotX + Math.sin(radians) * rodLength
    readonly property real bobY: pivotY - Math.cos(radians) * rodLength

    Text { x: 18; y: 14; text: "FIG 1"; color: figure.muted; font.family: "monospace"; font.pixelSize: 11 }
    Text { anchors.right: parent.right; anchors.top: parent.top; anchors.margins: 14; width: parent.width - 95; horizontalAlignment: Text.AlignRight; elide: Text.ElideRight; text: String(figure.diagram.title || "CART–POLE").toUpperCase(); textFormat: Text.PlainText; color: figure.ink; font.family: "monospace"; font.pixelSize: 11 }
    Rectangle { x: 35; y: figure.pivotY + 35; width: parent.width - 70; height: 1; color: figure.line }
    Shape {
        anchors.fill: parent
        ShapePath {
            strokeColor: figure.line; strokeWidth: 1; strokeStyle: ShapePath.DashLine; dashPattern: [3, 4]; fillColor: "transparent"
            startX: figure.pivotX; startY: figure.pivotY
            PathLine { x: figure.pivotX; y: figure.pivotY - figure.rodLength - 12 }
        }
        ShapePath {
            strokeColor: figure.ink; strokeWidth: 4; fillColor: "transparent"
            startX: figure.pivotX; startY: figure.pivotY
            PathLine { x: figure.bobX; y: figure.bobY }
        }
        ShapePath {
            strokeColor: figure.muted; strokeWidth: 1; fillColor: "transparent"
            PathAngleArc { centerX: figure.pivotX; centerY: figure.pivotY; radiusX: 27; radiusY: 27; startAngle: -90; sweepAngle: figure.angleDegrees }
        }
    }
    Rectangle {
        x: figure.bobX - 9; y: figure.bobY - 9; width: 18; height: 18; radius: 9
        color: figure.dark ? "#262626" : "#ffffff"; border.color: figure.ink; border.width: 1.5
    }
    Rectangle {
        x: figure.pivotX - 36; y: figure.pivotY; width: 72; height: 22
        color: figure.dark ? "#262626" : "#ededea"; border.color: figure.ink; border.width: 1.5
    }
    Repeater {
        model: [-23, 23]
        delegate: Rectangle {
            required property real modelData
            x: figure.pivotX + modelData - 6; y: figure.pivotY + 22
            width: 12; height: 12; radius: 6
            color: figure.dark ? "#262626" : "#ededea"; border.color: figure.ink; border.width: 1.5
        }
    }
    Rectangle { x: figure.pivotX - 3; y: figure.pivotY - 3; width: 6; height: 6; radius: 3; color: figure.ink }
    Shape {
        visible: figure.diagram.showForce === true
        anchors.fill: parent
        ShapePath {
            strokeColor: "#c75d4c"; strokeWidth: 2; fillColor: "transparent"
            startX: figure.pivotX + 43; startY: figure.pivotY + 10
            PathLine { x: figure.pivotX + 73; y: figure.pivotY + 10 }
            PathLine { x: figure.pivotX + 66; y: figure.pivotY + 5 }
            PathMove { x: figure.pivotX + 73; y: figure.pivotY + 10 }
            PathLine { x: figure.pivotX + 66; y: figure.pivotY + 15 }
        }
    }
    Text { x: figure.bobX + 14; y: figure.bobY - 10; text: "m"; color: figure.ink; font.pixelSize: 14; font.italic: true }
    Text { x: figure.pivotX - 5; y: figure.pivotY + 1; text: "M"; color: figure.ink; font.pixelSize: 14; font.italic: true }
    Text { x: figure.pivotX + Math.sin(figure.radians / 2) * 40 + 5; y: figure.pivotY - Math.cos(figure.radians / 2) * 40 - 7; text: "θ"; color: figure.ink; font.pixelSize: 14 }
    Text { x: 18; anchors.bottom: parent.bottom; anchors.bottomMargin: 14; text: figure.interactionEnabled ? "← → cart   ↑ ↓ angle" : "GEOMETRY · STATIC"; color: figure.muted; font.family: "monospace"; font.pixelSize: 11 }
    Text { anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.margins: 14; text: "θ " + figure.angleDegrees.toFixed(0) + "°   x " + figure.cartPosition.toFixed(2) + "   l " + figure.lengthValue.toFixed(1) + " m"; color: figure.ink; font.family: "monospace"; font.pixelSize: 11 }
    MouseArea {
        anchors.fill: parent
        enabled: figure.interactionEnabled
        property bool movingPole: false
        onPressed: function(mouse) { figure.forceActiveFocus(); movingPole = mouse.y < figure.pivotY - 8; updatePosition(mouse) }
        onPositionChanged: function(mouse) { if (pressed) updatePosition(mouse) }
        function updatePosition(mouse) {
            if (movingPole) figure.angleDegrees = figure.clamp(Math.atan2(mouse.x - figure.pivotX, figure.pivotY - mouse.y) * 180 / Math.PI, -75, 75)
            else figure.cartPosition = figure.clamp((mouse.x - figure.width / 2) / (figure.width * 0.2), -1, 1)
        }
    }
}
