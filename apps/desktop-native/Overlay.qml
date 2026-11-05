import QtQuick
import QtQuick.Window
import QtQuick.Shapes

Item {
    id: root
    property string phase: "idle"
    property bool reducedMotion: false
    property var annotations: []
    readonly property bool thinkingAnimationRunning: thinkingGlow.running

    EdgeGlow {
        id: thinkingGlow
        anchors.fill: parent
        visible: root.phase !== "idle"
        errorState: root.phase === "error"
        animate: root.Window.window !== null && root.Window.window.visible && root.phase === "thinking" && !root.reducedMotion
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
            Item {
                visible: marker.modelData.kind === "cursor"
                width: 32; height: 32
                Rectangle {
                    x: -7; y: -7; width: 18; height: 18
                    radius: 9; color: "transparent"; border.width: 2; border.color: marker.ink
                }
                BibataCursor {}
                Text {
                    x: Math.max(-marker.x, Math.min(24, root.width - marker.x - width))
                    y: Math.max(-marker.y, Math.min(24, root.height - marker.y - height))
                    width: Math.min(280, root.width)
                    text: marker.modelData.text || ""
                    textFormat: Text.PlainText
                    wrapMode: Text.Wrap
                    color: marker.ink; font.pixelSize: 18
                    style: Text.Outline; styleColor: "#202033"
                }
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
