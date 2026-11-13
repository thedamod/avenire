"""Behavioral protocol checks against a real Qt subprocess; no mocked engine."""
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
import unittest

ENGINE = os.environ["AVENIRE_NATIVE_OVERLAY_EXECUTABLE"]


class EngineTest(unittest.TestCase):
    def setUp(self):
        env = dict(os.environ, QT_QPA_PLATFORM=os.environ.get("QT_QPA_PLATFORM", "offscreen"))
        self.process = subprocess.Popen([ENGINE], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        text=True, encoding="utf-8", env=env)
        self.messages = queue.Queue()
        self.errors = []
        self.sequence = 0
        def read():
            for line in self.process.stdout:
                self.messages.put(json.loads(line))
        def diagnostics():
            for line in self.process.stderr:
                self.errors.append(line)
        threading.Thread(target=read, daemon=True).start()
        threading.Thread(target=diagnostics, daemon=True).start()

    def receive(self):
        try:
            return self.messages.get(timeout=10)
        except queue.Empty:
            self.fail("Qt process did not respond: " + "".join(self.errors)[-2000:])

    def send(self, method, params=None):
        self.sequence += 1
        self.process.stdin.write(json.dumps({"id": self.sequence, "method": method, "params": params or {}}) + "\n")
        self.process.stdin.flush()
        return self.sequence

    def call(self, method, params=None):
        ident = self.send(method, params)
        response = self.receive()
        self.assertEqual(response["id"], ident)
        return response

    def tearDown(self):
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait(timeout=5)
        for stream in [self.process.stdin, self.process.stdout, self.process.stderr]:
            stream.close()

    def test_protocol_and_validation(self):
        self.assertTrue(self.call("inspect")["ok"])
        self.assertTrue(self.call("show")["result"]["flags"]["transparentForInput"])
        self.assertTrue(self.call("set_state", {"phase": "thinking", "reducedMotion": True})["result"]["reducedMotion"])
        self.assertFalse(self.call("annotate", {"items": [{"id": "x", "kind": "rect", "x": .9, "y": 0, "width": .2}]})["ok"])
        self.assertTrue(self.call("annotate", {"items": [{"id": "x", "kind": "cursor", "x": .1, "y": .2, "text": "hello"}]})["ok"])
        self.assertEqual(self.call("clear")["result"]["items"], [])
        self.assertEqual(self.call("not-a-method")["error"]["code"], "METHOD_NOT_FOUND")
        self.process.stdin.write("{malformed\n")
        self.process.stdin.flush()
        self.assertFalse(self.receive()["ok"])
        self.assertTrue(self.call("hide")["ok"])
        self.assertTrue(self.call("shutdown")["ok"])
        self.assertEqual(self.process.wait(timeout=5), 0)

    def test_hide_during_capture_does_not_restore_overlay(self):
        self.call("show")
        capture = self.send("capture")
        hide = self.send("hide")
        responses = [self.receive(), self.receive()]
        by_id = {response["id"]: response for response in responses}
        self.assertIn(capture, by_id)  # Capture can refuse on the offscreen platform.
        self.assertTrue(by_id[hide]["ok"])
        state = self.call("inspect")["result"]
        self.assertFalse(state["visible"])
        self.assertFalse(state["visualizationVisible"])
        self.assertFalse(state["capturing"])
        self.call("shutdown")
        self.assertEqual(self.process.wait(timeout=5), 0)

    def test_bounded_input_recovers_and_rejects_unsafe_scene(self):
        self.process.stdin.write("x" * (1024 * 1024 + 1) + "\n")
        self.process.stdin.flush()
        self.assertEqual(self.receive()["error"]["code"], "INVALID_REQUEST")
        before = self.call("inspect")["result"]
        invalid = {"title": "unsafe", "cameraDistance": 450, "objects": [
            {"id": "mesh", "shape": "file:///private/model.obj", "position": [0, 0, 0],
             "rotation": [0, 0, 0], "scale": [1, 1, 1], "color": "#8171ef"}]}
        self.assertFalse(self.call("visualize", {"visible": True, "scene": invalid})["ok"])
        self.assertFalse(self.call("show", {"screenId": "does-not-exist"})["ok"])
        after = self.call("inspect")["result"]
        self.assertEqual(after["sceneTitle"], before["sceneTitle"])
        self.assertFalse(after["visualizationVisible"])
        self.assertFalse(after["visible"])

    def test_thinking_animation_stops_when_window_hides(self):
        self.call("show")
        self.call("set_state", {"phase": "thinking", "reducedMotion": False})
        self.assertTrue(self.call("inspect")["result"]["thinkingAnimationRunning"])
        hidden = self.call("hide")["result"]
        self.assertEqual(hidden["phase"], "thinking")
        self.assertFalse(hidden["thinkingAnimationRunning"])

    def test_startup_failure_reports_on_stderr_and_exits(self):
        env = dict(os.environ, QT_QPA_PLATFORM="avenire-missing-test-plugin")
        failed = subprocess.run([ENGINE], input="", capture_output=True, text=True,
                                env=env, timeout=10)
        self.assertNotEqual(failed.returncode, 0)
        self.assertEqual(failed.stdout, "")
        self.assertIn("platform plugin", failed.stderr)

    def test_read_only_cursor_and_parameterized_diagram(self):
        point = self.call("get_cursor")["result"]
        self.assertIsInstance(point["globalX"], int)
        self.assertIsInstance(point["globalY"], int)
        self.assertIn(point["screenId"], [s["id"] for s in self.call("inspect")["result"]["screens"]])
        self.assertIn("observedAt", point)
        self.assertFalse(self.call("get_cursor", {"screenId": "unknown-test-display"})["ok"])
        diagram = {"kind": "cart-pole", "title": "Direct geometry", "angleDegrees": -20,
                   "cartPosition": .2, "poleLength": 1.8, "showForce": True, "theme": "dark"}
        state = self.call("visualize", {"visible": True, "interactive": False, "diagram": diagram})["result"]
        self.assertEqual(state["visualizationMode"], "cart-pole")
        self.assertEqual(state["diagram"], diagram)
        self.assertFalse(state["visualizationInteractive"])
        self.assertFalse(self.call("visualize", {"visible": True, "diagram": dict(diagram, angleDegrees=1000)})["ok"])
        self.assertEqual(self.call("inspect")["result"]["diagram"], diagram)

    def test_text_bubbles_stay_inside_display_at_edges(self):
        state = self.call("show")["result"]
        screen = next(s for s in state["screens"] if s["id"] == state["screenId"])
        self.call("annotate", {"items": [{"id": kind, "kind": kind, "x": .99, "y": .99,
            "text": "Readable annotation " * 20} for kind in ["cursor", "rect", "arrow", "label"]]})
        for _ in range(20):
            bubbles = self.call("inspect")["result"].get("annotationBubbles", [])
            if len(bubbles) == 4 and all(b["width"] > 0 and b["height"] > 0 for b in bubbles): break
            time.sleep(.02)
        self.assertEqual(len(bubbles), 4)
        for bubble in bubbles:
            self.assertGreaterEqual(bubble["x"], 0)
            self.assertGreaterEqual(bubble["y"], 0)
            self.assertLessEqual(bubble["x"] + bubble["width"], screen["width"])
            self.assertLessEqual(bubble["y"] + bubble["height"], screen["height"])
        self.assertFalse(any("Binding loop" in line or "ReferenceError" in line for line in self.errors), "".join(self.errors))

    def test_diagram_stays_within_explicit_capture_bounds(self):
        diagram = {"kind": "cart-pole", "title": "Confined figure", "angleDegrees": 20,
                   "cartPosition": 0, "poleLength": 1.8, "showForce": True, "theme": "dark"}
        requests = [{"id": 1, "method": "visualize", "params": {"visible": True, "diagram": diagram}},
                    {"id": 2, "method": "shutdown", "params": {}}]
        result = subprocess.run([ENGINE, "--geometry", "100,100,400,400"],
            input="".join(json.dumps(r) + "\n" for r in requests), capture_output=True,
            text=True, timeout=10, env=dict(os.environ, QT_QPA_PLATFORM="offscreen", QT_QUICK_BACKEND="software"))
        self.assertEqual(result.returncode, 0, result.stderr)
        bounds = json.loads(result.stdout.splitlines()[0])["result"]["visualizationBounds"]
        self.assertGreaterEqual(bounds["x"], 100)
        self.assertGreaterEqual(bounds["y"], 100)
        self.assertLessEqual(bounds["x"] + bounds["width"], 500)
        self.assertLessEqual(bounds["y"] + bounds["height"], 500)

    def test_capture_suspension_preserves_figure_and_clears_only_fresh_annotations(self):
        self.call("show")
        diagram = {"kind": "cart-pole", "title": "Preserve manipulation", "angleDegrees": 21,
                   "cartPosition": .3, "poleLength": 1.8, "showForce": True, "theme": "dark"}
        self.call("visualize", {"visible": True, "interactive": True, "diagram": diagram})
        items = [{"id": "old", "kind": "label", "x": .2, "y": .3, "text": "Old view"}]
        self.call("annotate", {"items": items})
        suspended = self.call("suspend_capture")["result"]
        self.assertTrue(suspended["captureSuspended"])
        self.assertFalse(suspended["visible"])
        self.assertFalse(suspended["visualizationVisible"])
        self.assertFalse(self.call("annotate", {"items": items})["ok"])
        self.assertFalse(self.call("resume_capture", {"fresh": "yes"})["ok"])
        self.assertFalse(self.call("resume_capture", {"fresh": True, "excludedRegion": {"x": .9, "y": 0, "width": .2, "height": .1}})["ok"])
        failed_capture = self.call("resume_capture", {"fresh": False})["result"]
        self.assertEqual(failed_capture["items"], items)
        self.assertTrue(failed_capture["visualizationVisible"])
        self.call("suspend_capture")
        fresh = self.call("resume_capture", {"fresh": True})["result"]
        self.assertEqual(fresh["items"], [])
        self.assertTrue(fresh["visible"])
        self.assertTrue(fresh["visualizationVisible"])
        self.assertTrue(fresh["visualizationInteractive"])
        self.assertEqual(fresh["diagram"], diagram)
        self.assertFalse(fresh["captureSuspended"])

    def test_hide_during_external_capture_does_not_resurrect_figure(self):
        self.call("show")
        self.call("visualize", {"visible": True, "interactive": True})
        self.call("suspend_capture")
        self.call("hide")
        state = self.call("resume_capture", {"fresh": True})["result"]
        self.assertFalse(state["visible"])
        self.assertFalse(state["visualizationVisible"])

    def test_explicit_screen_selection_is_retained_and_invalid_selection_is_atomic(self):
        initial = self.call("inspect")["result"]
        for screen in initial["screens"]:
            selected = self.call("select_screen", {"screenId": screen["id"]})
            self.assertTrue(selected["ok"])
            self.assertEqual(selected["result"]["screenId"], screen["id"])
            self.assertEqual(selected["result"]["bounds"], {k: screen[k] for k in ["x", "y", "width", "height"]})
            self.assertEqual(self.call("show")["result"]["screenId"], screen["id"])
            self.assertEqual(self.call("get_cursor")["result"]["screenId"], screen["id"])
        before = self.call("inspect")["result"]["screenId"]
        self.assertFalse(self.call("select_screen", {"screenId": "nonexistent"})["ok"])
        self.assertEqual(self.call("inspect")["result"]["screenId"], before)
        self.call("suspend_capture")
        self.assertFalse(self.call("select_screen", {"screenId": before})["ok"])
        self.call("resume_capture", {"fresh": False})

    def test_same_screen_refresh_rejects_stale_annotations_but_preserves_figure(self):
        self.call("show")
        self.call("visualize", {"visible": True, "interactive": True})
        items = [{"id": "old", "kind": "label", "x": .2, "y": .3, "text": "Old view"}]
        self.call("annotate", {"items": items})
        screen = self.call("inspect")["result"]["screenId"]
        self.assertTrue(self.call("select_screen", {"screenId": screen})["ok"])
        refreshed = self.call("inspect")["result"]
        self.assertEqual(refreshed["items"], [])
        self.assertTrue(refreshed["visualizationVisible"])
        self.assertFalse(self.call("annotate", {"items": items})["ok"])
        self.call("suspend_capture")
        self.assertTrue(self.call("resume_capture", {"fresh": True})["ok"])
        self.assertTrue(self.call("annotate", {"items": items})["ok"])

    def test_parent_eof_exits_cleanly(self):
        self.call("inspect")
        self.process.stdin.close()
        self.assertEqual(self.process.wait(timeout=5), 0)


if __name__ == "__main__":
    unittest.main()
