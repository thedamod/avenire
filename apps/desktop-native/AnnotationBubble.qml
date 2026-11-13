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
        width: Math.min(248, Math.max(1, bubble.width - 16))
        height: Math.min(caption.contentHeight + 20, Math.max(1, bubble.height - 16))
        x: Math.max(4, Math.min(bubble.width - width - 4, bubble.targetX + 14 + width <= bubble.width - 4 ? bubble.targetX + 14 : bubble.targetX - width - 14))
        y: Math.max(4, Math.min(bubble.height - height - 4, bubble.targetY + 12 + height <= bubble.height - 4 ? bubble.targetY + 12 : bubble.targetY - height - 12))
        radius: 10
        color: "#f3222120"
        border.color: "#665b5751"
        border.width: 1
        Text {
            id: caption
            x: 12; y: 10
            width: parent.width - 24
            text: bubble.label.slice(0, 240)
            textFormat: Text.PlainText
            wrapMode: Text.Wrap
            maximumLineCount: 4
            elide: Text.ElideRight
            color: "#f5f1eb"
            font.pixelSize: 15
            font.weight: Font.Medium
        }
    }
    Shape {
        anchors.fill: parent
        z: -1
        ShapePath {
            strokeColor: bubble.accent; strokeWidth: 2; fillColor: "transparent"
            startX: bubble.targetX; startY: bubble.targetY
            PathLine { x: Math.max(tag.x, Math.min(tag.x + tag.width, bubble.targetX)); y: Math.max(tag.y, Math.min(tag.y + tag.height, bubble.targetY)) }
        }
    }
}
