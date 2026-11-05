import QtQuick
import QtQuick.Window
import QtQuick.Shapes

Item {
    id: root
    property string phase: "idle"
    property bool reducedMotion: false
    property var annotations: []
    readonly property var bubbleGeometry: {
        let result = []
        for (let i = 0; i < markers.count; ++i) {
            let item = markers.itemAt(i)
            if (item && item.annotationBubble.visible) result.push({x: item.annotationBubble.bubbleRect.x, y: item.annotationBubble.bubbleRect.y, width: item.annotationBubble.bubbleRect.width, height: item.annotationBubble.bubbleRect.height})
        }
        return result
    }
    readonly property bool thinkingAnimationRunning: thinkingGlow.running

    EdgeGlow {
        id: thinkingGlow
        anchors.fill: parent
        visible: root.phase !== "idle"
        errorState: root.phase === "error"
        animate: root.Window.window !== null && root.Window.window.visible && root.phase === "thinking" && !root.reducedMotion
    }
    Repeater {
        id: markers
        model: root.annotations
        delegate: Item {
            id: marker
            required property var modelData
            x: modelData.x * root.width
            y: modelData.y * root.height
            width: (modelData.width || 0) * root.width
            height: (modelData.height || 0) * root.height
            property color ink: modelData.color || "#c75d4c"
            property alias annotationBubble: bubble
            property real angle: Math.atan2(height, width)
            Rectangle {
                anchors.fill: parent
                visible: marker.modelData.kind === "rect"
                color: "transparent"
                border.width: 3
                border.color: marker.ink
            }
            Item {
                visible: marker.modelData.kind === "cursor"
                width: 32; height: 32
                Rectangle {
                    x: -7; y: -7; width: 18; height: 18
                    radius: 9; color: "transparent"; border.width: 2; border.color: marker.ink
                }
                BibataCursor {}

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
            AnnotationBubble {
                id: bubble
                parent: root
                targetX: Math.max(0, Math.min(root.width, marker.x + (marker.modelData.kind === "arrow" ? marker.width : 0)))
                targetY: Math.max(0, Math.min(root.height, marker.y + (marker.modelData.kind === "arrow" ? marker.height : 0)))
                accent: marker.ink
                label: String(marker.modelData.text || "")
            }
        }
    }
}
