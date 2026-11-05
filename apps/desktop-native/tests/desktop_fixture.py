"""A disposable synthetic target. Never reads user files or browser content."""
import json
import sys
from PySide6.QtWidgets import QApplication, QWidget, QPushButton, QLabel
from PySide6.QtCore import Qt, QTimer

app = QApplication(sys.argv[:1])
window = QWidget()
window.setWindowTitle("Avenire native overlay E2E fixture")
window.setWindowFlags(Qt.FramelessWindowHint)
window.setGeometry(80, 80, 900, 600)
window.setStyleSheet("QWidget { background: #f0f4fa; color: #19283c; } QPushButton { background: #bddcf8; border: 2px solid #567899; border-radius: 5px; font-size: 18px; }")
heading = QLabel("Ruth native overlay · behavioral test", window)
heading.setGeometry(35, 25, 800, 45)
heading.setStyleSheet("font-size: 25px; font-weight: bold")
text = QLabel("Synthetic study window — no personal desktop content", window)
text.setGeometry(35, 90, 800, 35)
text.setStyleSheet("font-size: 17px")
button = QPushButton("Click through the transparent annotation", window)
button.setGeometry(50, 200, 530, 70)
status = QLabel("Clicks received: 0", window)
status.setGeometry(50, 290, 700, 40)
status.setStyleSheet("font-size: 21px")
caption = QLabel("The overlay must preserve this window and its input.", window)
caption.setGeometry(35, 500, 800, 50)
caption.setStyleSheet("font-size: 17px")
count = 0

def clicked():
    global count
    count += 1
    status.setText(f"Clicks received: {count}")
    print(json.dumps({"event": "click", "count": count}), flush=True)

button.clicked.connect(clicked)
window.show()
window.raise_()
window.activateWindow()
QTimer.singleShot(500, lambda: print(json.dumps({"event": "ready", "windowId": int(window.winId()),
                                               "button": {"x": 80 + 315, "y": 80 + 235}}), flush=True))
sys.exit(app.exec())
