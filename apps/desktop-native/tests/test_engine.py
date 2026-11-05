"""Behavioral protocol checks against a real Qt subprocess; no mocked engine."""
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import unittest

MAIN = Path(__file__).resolve().parents[1] / "main.py"


class EngineTest(unittest.TestCase):
    def setUp(self):
        env = dict(os.environ, QT_QPA_PLATFORM=os.environ.get("QT_QPA_PLATFORM", "offscreen"))
        self.process = subprocess.Popen([sys.executable, str(MAIN)], stdin=subprocess.PIPE,
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
        self.assertTrue(self.call("annotate", {"items": [{"id": "x", "kind": "label", "x": .1, "y": .2, "text": "hello"}]})["ok"])
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

    def test_parent_eof_exits_cleanly(self):
        self.call("inspect")
        self.process.stdin.close()
        self.assertEqual(self.process.wait(timeout=5), 0)


if __name__ == "__main__":
    unittest.main()
