#!/usr/bin/env python3
"""Native Qt presentation host. Stdio is the only control channel; no browser engine."""
import argparse
import base64
import json
import math
import os
from pathlib import Path
import sys
import threading
from datetime import datetime, timezone

from PySide6.QtCore import QObject, Signal, Slot, QBuffer, QByteArray, QIODevice, QTimer, QUrl, Qt, QRect
from PySide6.QtGui import QGuiApplication, QColor, QSurfaceFormat
from PySide6.QtQuick import QQuickView, QQuickWindow

MAX_REQUEST = 1024 * 1024
MAX_IMAGE_BYTES = 768 * 1024  # base64 remains at or below 1 MiB for the bounded chat request
QQuickWindow.setDefaultAlphaBuffer(True)
format_ = QSurfaceFormat.defaultFormat()
format_.setAlphaBufferSize(8)
QSurfaceFormat.setDefaultFormat(format_)
parser = argparse.ArgumentParser()
parser.add_argument("--geometry", "--test-geometry", dest="test_geometry", help="Bounded region x,y,width,height; confines captures and overlays")
options = parser.parse_args()
test_geometry = None
if options.test_geometry:
    values = [int(value) for value in options.test_geometry.split(",")]
    if len(values) != 4 or values[2] < 400 or values[3] < 400:
        parser.error("test geometry must contain x,y,width,height with dimensions >= 400")
    test_geometry = QRect(*values)
app = QGuiApplication(sys.argv[:1])
app.setQuitOnLastWindowClosed(False)


class Engine(QObject):
    request = Signal(object)
    eof = Signal()

    def __init__(self):
        super().__init__()
        self.phase, self.reduced, self.items = "idle", False, []
        self.screen = app.primaryScreen()
        if self.screen is None:
            raise RuntimeError("No graphical screen is available")
        self.overlay = self.view("Overlay.qml", True)
        self.visual = self.view("Visual.qml", True)
        self.visual.resize(320, 320)
        self.visual_frames = 0
        self.visual.frameSwapped.connect(self.visual_frame)
        self.visual.rootObject().dismissRequested.connect(self.dismiss)
        self.overlay_visible = False
        self.visual_visible = False
        self.capturing = False
        self.request.connect(self.handle)
        self.eof.connect(app.quit)
        self.sync()

    def view(self, name, passive):
        view = QQuickView()
        view.setColor(QColor("transparent"))
        view.setTitle("Ruth annotations" if name == "Overlay.qml" else "Ruth visualization")
        view.setFlags(self.flags(passive))
        view.setResizeMode(QQuickView.SizeRootObjectToView)
        view.setSource(QUrl.fromLocalFile(str(Path(__file__).with_name(name))))
        if view.status() == QQuickView.Error:
            raise RuntimeError("QML load failed: " + name)
        return view

    @staticmethod
    def flags(passive):
        result = Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool
        if passive:
            result |= Qt.WindowTransparentForInput | Qt.WindowDoesNotAcceptFocus
            # Some X11 WMs keep an input-bearing frame around otherwise transparent clients.
            if app.platformName() == "xcb":
                result |= Qt.X11BypassWindowManagerHint
        return result

    @Slot()
    def visual_frame(self):
        self.visual_frames += 1

    @Slot()
    def dismiss(self):
        self.overlay_visible = self.visual_visible = False
        self.overlay.hide()
        self.visual.hide()
        print(json.dumps({"event": "dismiss"}), flush=True)

    def sync(self):
        root = self.overlay.rootObject()
        root.setProperty("phase", self.phase)
        root.setProperty("reducedMotion", self.reduced)
        root.setProperty("annotations", self.items)

    @staticmethod
    def select(screen_id):
        if screen_id is None:
            return app.primaryScreen()
        for screen in app.screens():
            if screen.name() == screen_id:
                return screen
        raise ValueError("Unknown screenId")

    def state(self):
        api = str(self.overlay.rendererInterface().graphicsApi()).split(".")[-1]
        flags = self.overlay.flags()
        visual_root = self.visual.rootObject()
        return {
            "visible": self.overlay.isVisible(), "screenId": self.screen.name(),
            "phase": self.phase, "reducedMotion": self.reduced, "items": self.items,
            "capturing": self.capturing,
            "visualizationVisible": self.visual.isVisible(),
            "visualizationInteractive": not bool(self.visual.flags() & Qt.WindowTransparentForInput),
            "rotation": {"x": visual_root.property("rx"), "y": visual_root.property("ry")},
            "sceneTitle": visual_root.property("sceneTitle"),
            "visualFrames": self.visual_frames,
            "windowIds": {"overlay": int(self.overlay.winId()), "visualization": int(self.visual.winId())},
            "screens": [{"id": s.name(), "x": s.geometry().x(), "y": s.geometry().y(),
                         "width": s.geometry().width(), "height": s.geometry().height(),
                         "devicePixelRatio": s.devicePixelRatio()} for s in app.screens()],
            "graphicsApi": api, "softwareRendering": api.lower() == "software",
            "hardwareAcceleration": "unverified",  # OpenGL can itself be Mesa llvmpipe.
            "flags": {"alwaysOnTop": bool(flags & Qt.WindowStaysOnTopHint),
                      "transparentForInput": bool(flags & Qt.WindowTransparentForInput),
                      "doesNotAcceptFocus": bool(flags & Qt.WindowDoesNotAcceptFocus)},
        }

    @staticmethod
    def reply(ident, ok, value):
        print(json.dumps({"id": ident, "ok": ok, "result" if ok else "error": value},
                         separators=(",", ":")), flush=True)

    @Slot(object)
    def handle(self, request):
        ident = request.get("id") if isinstance(request, dict) else None
        try:
            if (not isinstance(request, dict) or not isinstance(request.get("method"), str)
                    or not isinstance(request.get("params", {}), dict)):
                raise ValueError("Expected method and params object")
            method, params = request["method"], request.get("params", {})
            if method == "inspect":
                result = self.state()
            elif method == "show":
                self.screen = self.select(params.get("screenId"))
                self.overlay.setScreen(self.screen)
                self.overlay.setGeometry(test_geometry or self.screen.geometry())
                self.overlay_visible = True
                if not self.capturing:
                    self.overlay.show()
                result = self.state()
            elif method == "hide":
                self.overlay_visible = self.visual_visible = False
                self.overlay.hide()
                self.visual.hide()
                result = self.state()
            elif method == "set_state":
                if (params.get("phase") not in ("idle", "thinking", "error")
                        or not isinstance(params.get("reducedMotion", False), bool)):
                    raise ValueError("Invalid phase or reducedMotion")
                self.phase = params["phase"]
                self.reduced = params.get("reducedMotion", False)
                self.sync()
                result = self.state()
            elif method == "annotate":
                self.items = self.validate_annotations(params.get("items"))
                self.sync()
                result = self.state()
            elif method == "clear":
                self.items = []
                self.sync()
                result = self.state()
            elif method == "visualize":
                if (not isinstance(params.get("visible"), bool)
                        or not isinstance(params.get("interactive", False), bool)):
                    raise ValueError("Invalid visualization options")
                if "scene" in params:
                    scene = self.validate_scene(params["scene"])
                    root = self.visual.rootObject()
                    root.setProperty("objects", scene["objects"])
                    root.setProperty("sceneTitle", scene["title"])
                    root.setProperty("cameraDistance", scene["cameraDistance"])
                self.visual.setFlags(self.flags(not params.get("interactive", False)))
                self.visual_visible = params["visible"]
                geometry = test_geometry or self.screen.availableGeometry()
                self.visual.setPosition(geometry.right() - 340, geometry.bottom() - 340)
                self.visual.setVisible(self.visual_visible and not self.capturing)
                result = self.state()
            elif method == "capture":
                if self.capturing:
                    self.reply(ident, False, {"code": "BUSY", "message": "Capture already in progress"})
                    return
                screen = self.select(params.get("screenId"))
                self.capturing = True
                self.overlay.hide()
                self.visual.hide()
                # Allow the compositor to retire both surfaces before sampling its screen.
                QTimer.singleShot(150, lambda: self.capture(ident, screen))
                return
            elif method == "shutdown":
                self.reply(ident, True, {})
                QTimer.singleShot(0, app.quit)
                return
            else:
                self.reply(ident, False, {"code": "METHOD_NOT_FOUND", "message": "Unknown method"})
                return
            self.reply(ident, True, result)
        except Exception as error:
            self.reply(ident, False, {"code": "INVALID_REQUEST", "message": str(error)})

    @staticmethod
    def validate_annotations(items):
        if not isinstance(items, list) or len(items) > 128:
            raise ValueError("Invalid items")
        ids = set()
        for item in items:
            if (not isinstance(item, dict) or not isinstance(item.get("id"), str)
                    or not 1 <= len(item["id"]) <= 100 or item["id"] in ids
                    or item.get("kind") not in ("rect", "arrow", "label")):
                raise ValueError("Invalid annotation")
            ids.add(item["id"])
            for key in ("x", "y", "width", "height"):
                value = item.get(key, 0)
                if (isinstance(value, bool) or not isinstance(value, (int, float))
                        or not math.isfinite(value) or not 0 <= value <= 1):
                    raise ValueError("Invalid coordinates")
            if ("x" not in item or "y" not in item
                    or item["x"] + item.get("width", 0) > 1
                    or item["y"] + item.get("height", 0) > 1):
                raise ValueError("Annotation exceeds bounds")
            for key, maximum in (("text", 2000), ("color", 32)):
                if key in item and (not isinstance(item[key], str) or len(item[key]) > maximum):
                    raise ValueError("Invalid text or color")
            if "color" in item and not QColor.isValidColor(item["color"]):
                raise ValueError("Invalid color")
        return items

    @staticmethod
    def validate_scene(scene):
        if not isinstance(scene, dict) or not isinstance(scene.get("title"), str) or len(scene["title"]) > 100:
            raise ValueError("Invalid scene title")
        distance = scene.get("cameraDistance")
        if isinstance(distance, bool) or not isinstance(distance, (int, float)) or not math.isfinite(distance) or not 200 <= distance <= 1500:
            raise ValueError("Invalid camera distance")
        objects = scene.get("objects")
        if not isinstance(objects, list) or not 1 <= len(objects) <= 32:
            raise ValueError("Scene requires 1..32 objects")
        ids = set()
        for obj in objects:
            if (not isinstance(obj, dict) or not isinstance(obj.get("id"), str)
                    or not 1 <= len(obj["id"]) <= 100 or obj["id"] in ids
                    or obj.get("shape") not in ("cube", "sphere", "cylinder", "cone", "plane")):
                raise ValueError("Invalid scene object")
            ids.add(obj["id"])
            for key, lower, upper in (("position", -500, 500), ("rotation", -500, 500), ("scale", .01, 20)):
                values = obj.get(key)
                if not isinstance(values, list) or len(values) != 3:
                    raise ValueError("Invalid scene transform")
                if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lower <= value <= upper for value in values):
                    raise ValueError("Invalid scene transform")
            color = obj.get("color")
            if not isinstance(color, str) or len(color) != 7 or not color.startswith("#") or not QColor.isValidColor(color):
                raise ValueError("Invalid scene color")
        return scene

    def capture(self, ident, screen):
        try:
            if test_geometry:
                origin = screen.geometry().topLeft()
                pixmap = screen.grabWindow(0, test_geometry.x() - origin.x(),
                                           test_geometry.y() - origin.y(),
                                           test_geometry.width(), test_geometry.height())
            else:
                pixmap = screen.grabWindow(0)
            if pixmap.isNull():
                raise RuntimeError("Screen capture unavailable")
            source_width, source_height = pixmap.width(), pixmap.height()
            if pixmap.width() > 1280 or pixmap.height() > 1280:
                pixmap = pixmap.scaled(1280, 1280, Qt.KeepAspectRatio, Qt.SmoothTransformation)
            for _ in range(8):
                data = QByteArray()
                buffer = QBuffer(data)
                buffer.open(QIODevice.WriteOnly)
                if not pixmap.save(buffer, "PNG"):
                    raise RuntimeError("PNG encoding failed")
                if len(data) <= MAX_IMAGE_BYTES:
                    break
                pixmap = pixmap.scaled(max(1, int(pixmap.width() * .8)),
                                       max(1, int(pixmap.height() * .8)),
                                       Qt.KeepAspectRatio, Qt.SmoothTransformation)
            else:
                raise RuntimeError("Screen image exceeds the payload budget")
            self.reply(ident, True, {"mimeType": "image/png", "data": base64.b64encode(bytes(data)).decode(),
                                   "width": pixmap.width(), "height": pixmap.height(),
                                   "sourceWidth": source_width, "sourceHeight": source_height,
                                   "screenId": screen.name(), "capturedAt": datetime.now(timezone.utc).isoformat()})
        except Exception as error:
            self.reply(ident, False, {"code": "CAPTURE_FAILED", "message": str(error)})
        finally:
            self.capturing = False
            self.overlay.setVisible(self.overlay_visible)
            self.visual.setVisible(self.visual_visible)


engine = Engine()


def read_requests():
    # Raw fd reads avoid daemon-thread locks on Python's buffered stdin during shutdown.
    pending = bytearray()
    oversized = False
    while True:
        chunk = os.read(sys.stdin.fileno(), 65536)
        if not chunk:
            break
        for line in chunk.splitlines(keepends=True):
            if not oversized:
                pending.extend(line)
                if len(pending) > MAX_REQUEST:
                    pending.clear()
                    oversized = True
            if line.endswith(b"\n"):
                if oversized:
                    engine.request.emit(None)
                else:
                    try:
                        engine.request.emit(json.loads(pending))
                    except (ValueError, UnicodeDecodeError):
                        engine.request.emit(None)
                pending.clear()
                oversized = False
    engine.eof.emit()


threading.Thread(target=read_requests, daemon=True).start()
exit_code = app.exec()
engine.overlay.close()
engine.visual.close()
sys.exit(exit_code)
