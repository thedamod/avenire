import QtQuick
import QtQuick.Shapes

Item {
    id: root
    property string phase: "idle"
    property bool reducedMotion: false
    property var annotations: []

    Rectangle {
        anchors.fill: parent
        color: "transparent"
        border.width: root.phase === "idle" ? 0 : 3
        border.color: root.phase === "error" ? "#cced637c" : "#aa786cff"
        opacity: root.phase === "thinking" && !root.reducedMotion ? pulse.value : 0.8
        QtObject {
            id: pulse
            property real value: 0.8
            SequentialAnimation on value {
                running: root.visible && root.phase === "thinking" && !root.reducedMotion
                loops: Animation.Infinite
                NumberAnimation { to: 0.4; duration: 1500 }
                NumberAnimation { to: 0.9; duration: 1500 }
            }
        }
    }
    Repeater {
        model: root.annotations
        delegate: Item {
            id: marker
            required property var modelData
            x: modelData.x * root.width
            y: modelData.y * root.height
            width: (modelData.width || 0) * root.width
            height: (modelData.height || 0) * root.height
            property color ink: modelData.color || "#8c7cff"
            property real angle: Math.atan2(height, width)
            Rectangle {
                anchors.fill: parent
                visible: marker.modelData.kind === "rect"
                color: "transparent"
                border.width: 3
                border.color: marker.ink
            }
            Text {
                visible: marker.modelData.kind === "label"
                text: marker.modelData.text || ""
                textFormat: Text.PlainText
                color: marker.ink
                font.pixelSize: 20
                style: Text.Outline
                styleColor: "#202033"
            }
            Shape {
                anchors.fill: parent
                visible: marker.modelData.kind === "arrow"
                ShapePath {
                    strokeColor: marker.ink
                    strokeWidth: 3
                    fillColor: "transparent"
                    startX: 0; startY: 0
                    PathLine { x: marker.width; y: marker.height }
                }
                ShapePath {
                    strokeColor: marker.ink
                    strokeWidth: 3
                    fillColor: "transparent"
                    startX: marker.width - 14 * Math.cos(marker.angle - 0.5)
                    startY: marker.height - 14 * Math.sin(marker.angle - 0.5)
                    PathLine { x: marker.width; y: marker.height }
                    PathLine {
                        x: marker.width - 14 * Math.cos(marker.angle + 0.5)
                        y: marker.height - 14 * Math.sin(marker.angle + 0.5)
                    }
                }
            }
        }
    }
}
