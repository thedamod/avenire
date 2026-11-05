import QtQuick
import QtQuick.Shapes

Item {
    id: bubble
    property string label: ""
    property real targetX: 0
    property real targetY: 0
    property color accent: "#c75d4c"
    readonly property rect bubbleRect: Qt.rect(tag.x, tag.y, tag.width, tag.height)
    anchors.fill: parent
    visible: label.length > 0
    Rectangle {
        id: tag
        width: Math.min(Math.max(80, caption.implicitWidth + 20), Math.max(1, bubble.width - 8), 280)
        height: Math.min(caption.implicitHeight + 14, Math.max(1, bubble.height - 8))
        x: Math.max(4, Math.min(bubble.width - width - 4, bubble.targetX + 14 + width <= bubble.width - 4 ? bubble.targetX + 14 : bubble.targetX - width - 14))
        y: Math.max(4, Math.min(bubble.height - height - 4, bubble.targetY + 12 + height <= bubble.height - 4 ? bubble.targetY + 12 : bubble.targetY - height - 12))
        radius: 4
        color: "#fffaf5"
        border.color: bubble.accent
        border.width: 1
        Text {
            id: caption
            x: 10; y: 7
            width: parent.width - 20
            height: parent.height - 14
            text: bubble.label.slice(0, 512)
            textFormat: Text.PlainText
            wrapMode: Text.Wrap
            elide: Text.ElideRight
            color: "#29211f"
            font.pixelSize: 14
            font.weight: Font.DemiBold
        }
    }
    Shape {
        anchors.fill: parent
        z: -1
        ShapePath {
            strokeColor: bubble.accent; strokeWidth: 1.5; fillColor: "transparent"
            startX: bubble.targetX; startY: bubble.targetY
            PathLine { x: Math.max(tag.x, Math.min(tag.x + tag.width, bubble.targetX)); y: Math.max(tag.y, Math.min(tag.y + tag.height, bubble.targetY)) }
        }
    }
}
