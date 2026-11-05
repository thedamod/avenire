"""Real desktop E2E: compositor pixels, click-through and native 3D input.

Opt-in because this creates synthetic windows. Windows and X11 are supported.
AVENIRE_QT_VISUAL_E2E=1 AVENIRE_QT_EVIDENCE=/tmp/evidence python -m unittest discover ...
"""
import base64
import ctypes
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
import unittest

from PySide6.QtCore import Qt
from PySide6.QtGui import QGuiApplication, QCursor, QImage
from PySide6.QtTest import QTest

HERE = Path(__file__).resolve().parent
MAIN = HERE.parent / "main.py"
WINDOWS = sys.platform == "win32"


class Peer:
    def __init__(self, command):
        self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, text=True, encoding="utf-8")
        self.messages = queue.Queue()
        self.errors = []
        def read():
            for line in self.process.stdout:
                try:
                    self.messages.put(json.loads(line))
                except ValueError:
                    self.messages.put({"invalid": line})
        def errors():
            for line in self.process.stderr:
                self.errors.append(line)
        threading.Thread(target=read, daemon=True).start()
        threading.Thread(target=errors, daemon=True).start()
        self.counter = 0

    def receive(self):
        try:
            return self.messages.get(timeout=15)
        except queue.Empty:
            raise AssertionError("No response from child: " + "".join(self.errors)[-2000:])

    def call(self, method, params=None):
        self.counter += 1
        self.process.stdin.write(json.dumps({"id": self.counter, "method": method, "params": params or {}}) + "\n")
        self.process.stdin.flush()
        response = self.receive()
        if response.get("id") != self.counter or response.get("ok") is not True:
            raise AssertionError(response)
        return response["result"]

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
        self.process.wait(timeout=10)
        for stream in [self.process.stdin, self.process.stdout, self.process.stderr]:
            stream.close()


def xdo(*args):
    return subprocess.check_output([os.environ.get("AVENIRE_XDOTOOL", "xdotool"), *map(str, args)], text=True).strip()


def foreground():
    return int(ctypes.windll.user32.GetForegroundWindow()) if WINDOWS else int(xdo("getactivewindow"))


def click(x, y):
    if WINDOWS:
        QCursor.setPos(x, y)
        QTest.qWait(100)
        ctypes.windll.user32.mouse_event(2, 0, 0, 0, 0)
        ctypes.windll.user32.mouse_event(4, 0, 0, 0, 0)
    else:
        xdo("mousemove", "--sync", x, y)
        xdo("click", 1)


@unittest.skipUnless(os.environ.get("AVENIRE_QT_VISUAL_E2E") == "1", "requires an explicitly selected test desktop")
class VisualE2E(unittest.TestCase):
    def test_real_desktop_flow(self):
        app = QGuiApplication.instance() or QGuiApplication([])
        directory = Path(os.environ.get("AVENIRE_QT_EVIDENCE", "/tmp/avenire-qt-evidence"))
        directory.mkdir(parents=True, exist_ok=True)
        fixture = Peer([sys.executable, str(HERE / "desktop_fixture.py")])
        engine = None
        previous_cursor = QCursor.pos()
        checks = []
        try:
            ready = fixture.receive()
            self.assertEqual(ready["event"], "ready")
            QTest.qWait(350)
            screen = app.primaryScreen()
            def pixels(filename):
                QTest.qWait(350)
                shot = screen.grabWindow(0, 80, 80, 900, 600).toImage()
                self.assertFalse(shot.isNull())
                self.assertTrue(shot.save(str(directory / filename)))
                return shot
            if WINDOWS:
                ctypes.windll.user32.SetForegroundWindow(ready["windowId"])
            baseline = pixels("01-synthetic-baseline.png")
            # DWM can return an initial black frame while a newly mapped window settles.
            for attempt in range(15):
                scale = baseline.width() / 900
                background = baseline.pixelColor(int(850 * scale), int(450 * scale))
                if (background.red(), background.green(), background.blue()) == (240, 244, 250):
                    break
                baseline = pixels("01-synthetic-baseline.png")
            else:
                self.fail("Synthetic fixture did not become visible; no desktop evidence accepted")
            expected_focus = foreground()
            engine = Peer([sys.executable, str(MAIN), "--test-geometry", "80,80,900,600"])
            engine.call("show")
            engine.call("set_state", {"phase": "thinking", "reducedMotion": True})
            engine.call("annotate", {"items": [
                {"id": "button", "kind": "rect", "x": .05, "y": .32, "width": .61, "height": .15},
                {"id": "label", "kind": "label", "x": .05, "y": .25, "text": "Ruth annotation · click the button below"},
                {"id": "arrow", "kind": "arrow", "x": .75, "y": .20, "width": .12, "height": .25},
            ]})
            overlay = pixels("02-thinking-annotations.png")
            focus_after = foreground()
            engine_windows = engine.call("inspect")["windowIds"]
            self.assertEqual(focus_after, expected_focus, f"Passive overlay focus changed: before={expected_focus}, after={focus_after}, native={engine_windows}, fixture={ready['windowId']}")
            scale = baseline.width() / 900
            # Interior far from all annotation geometry must remain the synthetic target's pixels.
            px, py = int(850 * scale), int(450 * scale)
            self.assertEqual(overlay.pixelColor(px, py), baseline.pixelColor(px, py))
            self.assertNotEqual(overlay.pixelColor(int(1 * scale), int(100 * scale)), baseline.pixelColor(int(1 * scale), int(100 * scale)))
            checks.append("Transparent interior and visible thinking border verified from compositor pixels")
            click(ready["button"]["x"], ready["button"]["y"])
            event = fixture.receive()
            self.assertEqual(event, {"event": "click", "count": 1})
            checks.append("Real OS mouse click passed through the annotation to the underlying QPushButton")
            after_click = pixels("03-click-through-confirmed.png")
            capture = engine.call("capture")
            acquired = QImage.fromData(base64.b64decode(capture["data"]))
            self.assertFalse(acquired.isNull())
            acquired.save(str(directory / "04-capture-excludes-overlays.png"))
            expected = after_click.pixelColor(int(1 * scale), int(100 * scale))
            clean = acquired.pixelColor(1, 100)
            self.assertNotEqual(clean, expected, "Capture retained the thinking border")
            self.assertEqual(clean, baseline.pixelColor(int(1 * scale), int(100 * scale)))
            checks.append("Native capture excluded annotations/thinking overlay and remained within synthetic region")
            scene = json.loads((HERE / "molecule-scene.json").read_text())
            initial_frames = engine.call("visualize", {"visible": True, "interactive": True, "scene": scene})["visualFrames"]
            for attempt in range(40):
                QTest.qWait(100)
                rendered = engine.call("inspect")
                if rendered["visualFrames"] > initial_frames:
                    break
            else:
                self.fail("Native 3D window never swapped a rendered frame")
            self.assertEqual(rendered["sceneTitle"], scene["title"])
            before_3d = pixels("05-native-3d.png")
            before_rotation = engine.call("inspect")["rotation"]
            # Visualization is placed at the lower right of the bounded test area.
            click(80 + 900 - 180, 80 + 600 - 180)
            if WINDOWS:
                ctypes.windll.user32.keybd_event(0x27, 0, 0, 0)
                ctypes.windll.user32.keybd_event(0x27, 0, 2, 0)
            else:
                xdo("key", "Right")
            QTest.qWait(200)
            after_rotation = engine.call("inspect")["rotation"]
            self.assertNotEqual(before_rotation, after_rotation)
            after_3d = pixels("06-native-3d-rotated.png")
            self.assertNotEqual(before_3d, after_3d)
            checks.append("Interactive Qt Quick 3D rotation changed via real keyboard input and changed rendered pixels")
            state = engine.call("inspect")
            if WINDOWS:
                ctypes.windll.user32.keybd_event(0x1B, 0, 0, 0)
                ctypes.windll.user32.keybd_event(0x1B, 0, 2, 0)
            else:
                xdo("key", "Escape")
            self.assertEqual(engine.receive(), {"event": "dismiss"})
            checks.append("Escape from the interactive native window dismissed both native surfaces")
            engine.call("hide")
            QTest.qWait(200)
            hidden = engine.call("inspect")
            self.assertFalse(hidden["visible"])
            self.assertFalse(hidden["visualizationVisible"])
            engine.call("shutdown")
            self.assertEqual(engine.process.wait(timeout=10), 0)
            self.assertFalse(any("Error:" in line or "ReferenceError" in line for line in engine.errors), "".join(engine.errors))
            (directory / "results.json").write_text(json.dumps({"platform": sys.platform, "passed": True, "checks": checks,
                "state": state, "stderr": engine.errors, "captureDimensions": [capture["width"], capture["height"]]}, indent=2), encoding="utf-8")
            print(json.dumps({"passed": True, "evidence": str(directory), "checks": checks}), flush=True)
        finally:
            QCursor.setPos(previous_cursor)
            if engine:
                engine.close()
            fixture.close()


if __name__ == "__main__":
    unittest.main()
