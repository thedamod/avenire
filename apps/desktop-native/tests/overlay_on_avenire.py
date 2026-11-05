"""Run the real Qt companion over one explicit installed Avenire window on Windows.

The screenshot remains local unless the operator chooses to publish it. This is a
native presentation demo, not an authenticated model/Alt+Space end-to-end test.
"""
import argparse
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import sys
import time

from PySide6.QtGui import QGuiApplication
from PySide6.QtTest import QTest

sys.path.insert(0, str(Path(__file__).parent))
from test_visual_e2e import Peer, MAIN

parser = argparse.ArgumentParser()
parser.add_argument("--window-id", type=int, required=True)
parser.add_argument("--out", type=Path, required=True)
parser.add_argument("--hold-seconds", type=int, default=600)
options = parser.parse_args()
if sys.platform != "win32":
    parser.error("This demo must run in Windows Python")
app = QGuiApplication([])
user32 = ctypes.windll.user32
user32.GetForegroundWindow.restype = wintypes.HWND
hwnd = options.window_id
pid = wintypes.DWORD()
user32.GetWindowThreadProcessId(wintypes.HWND(hwnd), ctypes.byref(pid))
kernel32 = ctypes.windll.kernel32
kernel32.OpenProcess.restype = wintypes.HANDLE
handle = kernel32.OpenProcess(0x1000, False, pid.value)
try:
    path = ctypes.create_unicode_buffer(32768)
    length = wintypes.DWORD(len(path))
    if not handle or not kernel32.QueryFullProcessImageNameW(wintypes.HANDLE(handle), 0, path, ctypes.byref(length)):
        raise RuntimeError("Could not identify target process")
    if Path(path.value).name.lower() != "avenire.exe":
        raise RuntimeError("Target is not an Avenire process")
finally:
    if handle:
        kernel32.CloseHandle(wintypes.HANDLE(handle))
if not user32.IsWindowVisible(wintypes.HWND(hwnd)) or user32.IsIconic(wintypes.HWND(hwnd)):
    raise RuntimeError("Avenire window must be visible and restored")
rect = wintypes.RECT()
if not user32.GetClientRect(wintypes.HWND(hwnd), ctypes.byref(rect)):
    raise RuntimeError("Avenire client bounds unavailable")
origin = wintypes.POINT(0, 0)
user32.ClientToScreen(wintypes.HWND(hwnd), ctypes.byref(origin))
screen = app.primaryScreen()
dpr = screen.devicePixelRatio()
geometry = [round(origin.x / dpr), round(origin.y / dpr), round(rect.right / dpr), round(rect.bottom / dpr)]
if geometry[2] < 400 or geometry[3] < 400:
    raise RuntimeError("Avenire window is too small for this presentation")
if int(user32.GetForegroundWindow()) != hwnd:
    raise RuntimeError("Focus Avenire before starting this app-scoped demo")
options.out.mkdir(parents=True, exist_ok=True)
engine = Peer([sys.executable, str(MAIN), "--geometry", ",".join(map(str, geometry))])
scene = {
    "title": "Cart-pole geometry", "cameraDistance": 550,
    "objects": [
        {"id": "track", "shape": "cube", "position": [0, -95, 0], "rotation": [0, 0, 0], "scale": [3.2, .08, .8], "color": "#69718c"},
        {"id": "cart", "shape": "cube", "position": [0, -60, 0], "rotation": [0, 0, 0], "scale": [1.3, .45, .65], "color": "#8875ef"},
        {"id": "pole", "shape": "cylinder", "position": [20, 20, 0], "rotation": [0, 0, -18], "scale": [.09, 1.4, .09], "color": "#73bcdf"},
        {"id": "tip", "shape": "sphere", "position": [42, 87, 0], "rotation": [0, 0, 0], "scale": [.26, .26, .26], "color": "#66c5ef"},
    ],
}
try:
    engine.call("show")
    engine.call("set_state", {"phase": "thinking", "reducedMotion": True})
    engine.call("annotate", {"items": [
        {"id": "paper", "kind": "rect", "x": .497, "y": .16, "width": .30, "height": .455, "color": "#9685ff"},
        {"id": "context", "kind": "label", "x": .51, "y": .115, "text": "Ruth · controller architecture", "color": "#b4a7ff"},
        {"id": "pointer", "kind": "arrow", "x": .45, "y": .12, "width": .05, "height": .05, "color": "#9685ff"},
    ]})
    first = engine.call("visualize", {"visible": True, "interactive": True, "scene": scene})["visualFrames"]
    for attempt in range(50):
        QTest.qWait(100)
        state = engine.call("inspect")
        if state["visualFrames"] > first:
            break
    else:
        raise RuntimeError("Native scene did not render")
    QTest.qWait(500)
    # Only the app client region is sampled; no monitor-wide screenshot is written.
    image = screen.grabWindow(0, *geometry).toImage()
    destination = options.out / "07-overlay-on-avenire.png"
    if image.isNull() or not image.save(str(destination)):
        raise RuntimeError("Avenire overlay capture failed")
    result = {"application": "Avenire.exe", "windowId": hwnd, "scope": "Avenire client region only",
              "graphicsApi": state["graphicsApi"], "sceneTitle": state["sceneTitle"],
              "captureDimensions": [image.width(), image.height()], "nativeGeometry": geometry,
              "visibleNativeFrames": state["visualFrames"],
              "validation": "Actual installed Avenire window with Qt companion; not a live model/Alt+Space round trip"}
    (options.out / "avenire-overlay.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"running": True, "screenshot": str(destination), "dismiss": "Click the 3D window and press Escape", "graphicsApi": state["graphicsApi"]}), flush=True)
    deadline = time.monotonic() + options.hold_seconds
    while time.monotonic() < deadline and engine.process.poll() is None:
        QTest.qWait(100)
        try:
            event = engine.messages.get_nowait()
            if event.get("event") == "dismiss":
                break
        except Exception as error:
            import queue
            if not isinstance(error, queue.Empty):
                raise
    if engine.process.poll() is None:
        engine.call("shutdown")
        engine.process.wait(timeout=10)
finally:
    engine.close()
