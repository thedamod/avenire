import QtQuick
import QtQuick3D

Item {
    id: root
    focus: true
    signal dismissRequested()
    Keys.onEscapePressed: dismissRequested()
    property real rx: -20
    property real ry: 30
    property real cameraDistance: 450
    property string sceneTitle: "Spatial explanation"
    property var objects: [{ id: "cube", shape: "cube", position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], color: "#8171ef" }]
    Keys.onLeftPressed: ry -= 10
    Keys.onRightPressed: ry += 10
    Keys.onUpPressed: rx -= 10
    Keys.onDownPressed: rx += 10
    View3D {
        anchors.fill: parent
        environment: SceneEnvironment { backgroundMode: SceneEnvironment.Transparent }
        PerspectiveCamera { z: root.cameraDistance }
        DirectionalLight { eulerRotation.x: -30; eulerRotation.y: -30; brightness: 1.3 }
        Node {
            eulerRotation.x: root.rx
            eulerRotation.y: root.ry
            Repeater3D {
                model: root.objects
                delegate: Model {
                    required property var modelData
                    source: ({ cube: "#Cube", sphere: "#Sphere", cylinder: "#Cylinder", cone: "#Cone", plane: "#Rectangle" })[modelData.shape]
                    position: Qt.vector3d(modelData.position[0], modelData.position[1], modelData.position[2])
                    eulerRotation: Qt.vector3d(modelData.rotation[0], modelData.rotation[1], modelData.rotation[2])
                    scale: Qt.vector3d(modelData.scale[0], modelData.scale[1], modelData.scale[2])
                    materials: PrincipledMaterial { baseColor: modelData.color; metalness: 0.2; roughness: 0.4 }
                }
            }
        }
    }
    Text {
        anchors.top: parent.top; anchors.horizontalCenter: parent.horizontalCenter; anchors.topMargin: 12
        text: root.sceneTitle; textFormat: Text.PlainText
        color: "#8070df"; font.pixelSize: 16; font.bold: true
        width: parent.width - 24; horizontalAlignment: Text.AlignHCenter; elide: Text.ElideRight
    }
    MouseArea {
        anchors.fill: parent
        property real lastX
        property real lastY
        onPressed: function(mouse) { lastX = mouse.x; lastY = mouse.y; root.forceActiveFocus() }
        onPositionChanged: function(mouse) {
            if (pressed) {
                root.ry += mouse.x - lastX; root.rx += mouse.y - lastY
                lastX = mouse.x; lastY = mouse.y
            }
        }
    }
}
