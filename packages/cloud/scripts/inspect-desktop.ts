/** Read-only v3 baseline; always destroys its one sandbox. */
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { mkdir, writeFile } from "node:fs/promises";
const root = "/tmp/avenire-snapshot/inspection-v3";
await mkdir(root, { recursive: true });
const daytona = new Daytona();
let box: Sandbox | undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  const snapshots = await daytona.snapshot.list({ limit: 100 });
  await writeFile(
    root + "/snapshots.json",
    JSON.stringify(
      snapshots.items.map((s) => ({
        name: s.name,
        id: s.id,
        state: s.state,
        imageName: s.imageName,
      })),
      null,
      2,
    ),
  );
  box = await daytona.create(
    {
      snapshot: "avenire-sandbox-v3",
      autoStopInterval: 15,
      autoDeleteInterval: 0,
      labels: { app: "avenire-desktop-inspect" },
    },
    { timeout: 300 },
  );
  await writeFile(root + "/sandbox.json", JSON.stringify({ id: box.id }));
  for (let n = 0; ; n++) {
    try {
      await box.process.executeCommand("true");
      break;
    } catch (e) {
      if (n === 5) throw e;
      await sleep(2000);
    }
  }
  const t = Date.now();
  await box.computerUse.start();
  await sleep(8000);
  const command = `id; cat /etc/os-release; printenv | sort | grep -E '^(DISPLAY|VNC_|XDG_|XCURSOR|PATH|HOME)='; ps -eo user,pid,ppid,args; ss -lntp; ls -la /usr/local/bin /opt; find /etc/xdg/xfce4 /home/daytona/.config/xfce4 /etc/xdg/autostart -maxdepth 4 -type f; cat /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/*.xml; for pid in $(pgrep -f 'Xvfb|xfdesktop|xfce4-panel|x11vnc|novnc|xfwm4|xfce4-session'); do echo PROCESS:$pid; tr '\\0' '\\n' < /proc/$pid/environ | grep -E '^(DISPLAY|VNC_|DBUS_SESSION_BUS_ADDRESS|XDG_|XCURSOR|PATH|HOME)='; done; export DISPLAY=:0; xrandr; xdpyinfo | head -25; dpkg-query -W xfwm4 xfce4-panel xfdesktop4 xfce4-session; find / -maxdepth 4 -iname '*toolbox*' 2>/dev/null`;
  const response = await box.process.executeCommand(command, undefined, undefined, 120);
  await writeFile(root + "/internals.txt", response.result);
  const display = await box.computerUse.display.getInfo();
  await writeFile(
    root + "/display.json",
    JSON.stringify(
      {
        startSeconds: (Date.now() - t) / 1000,
        display,
        windows: await box.computerUse.display.getWindows(),
      },
      null,
      2,
    ),
  );
  const shot = await box.computerUse.screenshot.takeFullScreen(true);
  const b64 = Object.values(shot).find(
    (v): v is string => typeof v === "string" && v.length > 1000,
  );
  if (!b64) throw Error("No screenshot");
  await writeFile(root + "/before.png", Buffer.from(b64, "base64"));
  console.log("Inspection saved", root);
} finally {
  if (box) {
    for (let n = 1; ; n++) {
      try {
        await box.delete(60, true);
        await writeFile(root + "/sandbox.json", JSON.stringify({ id: box.id, deleted: true }));
        break;
      } catch (e) {
        if (n === 4) throw e;
        await sleep(2000 * n);
      }
    }
  }
}
