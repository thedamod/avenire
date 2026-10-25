import {
  C, t, mono, ic, fav, swatch, one, statusBar, glass, navBar, composerDock, btn, sheetTabs, sheet, divider,
  tray, trayBtn, trayRow, cite, logRow, userBubble, ruthText, workedHeader, homeIndicator, aside, actionBtn,
} from "./lib.mjs";

export const reportNav = () => navBar({ title: "Morning report", sub: "Thermodynamics · Tue, Oct 14", right: [{ icon: "panel" }] });
const TABS = [["doc", "Summary"], ["quiz", "Quiz"], ["lines", "Revision"], ["widget", "Carnot"], ["doc", "Lecture 7"]];

// Carnot cycle figure in the anatomy "Fig N" frame, redrawn to scale for 358px
export function carnotFigure() {
  const lbl = (x, y, s, anchor = "start") => `<text x="${x}" y="${y}" fill="#8A8A8A" font-family="Geist Mono, monospace" font-size="8.5" text-anchor="${anchor}">${s}</text>`;
  return `<div layer-name="Widget · Carnot cycle" style="display:flex;flex-direction:column;gap:10px;flex-shrink:0;">
  <div layer-name="Figure" style="border:1px solid #3A3A3A;background:#0E0E0E;display:flex;flex-direction:column;padding:10px 12px;gap:6px;">
    <div style="display:flex;justify-content:space-between;">${mono("Fig 1", 9.5, C.t2)}${mono("CARNOT CYCLE", 9.5, C.t2, "letter-spacing:0.08em;")}</div>
    <svg width="326" height="150" viewBox="0 0 326 150" fill="none" style="flex-shrink:0;">
      <path d="M40 8V138H300" stroke="#5A5A5A" stroke-width="0.8"/>
      <path d="M70 24Q110 50 160 62Q220 108 280 126Q200 120 130 108Q92 70 70 24Z" fill="#FFFFFF0D"/>
      <path d="M70 24Q110 50 160 62" stroke="#EDEDED" stroke-width="1.2"/>
      <path d="M160 62Q220 108 280 126" stroke="#BDBDBD" stroke-width="1" stroke-dasharray="3 3"/>
      <path d="M280 126Q200 120 130 108" stroke="#EDEDED" stroke-width="1.2"/>
      <path d="M130 108Q92 70 70 24" stroke="#BDBDBD" stroke-width="1" stroke-dasharray="3 3"/>
      <circle cx="70" cy="24" r="3" fill="#0E0E0E" stroke="#EDEDED"/><circle cx="160" cy="62" r="3" fill="#0E0E0E" stroke="#EDEDED"/>
      <circle cx="280" cy="126" r="3" fill="#0E0E0E" stroke="#EDEDED"/><circle cx="130" cy="108" r="3" fill="#0E0E0E" stroke="#EDEDED"/>
      <circle cx="222" cy="100" r="4.5" fill="#ABC4FF"/>
      ${lbl(44, 16, "P / kPa")}${lbl(296, 148, "V / L", "end")}${lbl(62, 22, "1", "end")}${lbl(166, 58, "2")}${lbl(286, 124, "3")}${lbl(122, 118, "4", "end")}
      ${lbl(108, 42, "Th 500 K")}${lbl(200, 132, "Tc 300 K")}
    </svg>
    <div style="display:flex;justify-content:space-between;">${mono("DRAG TH TO CHANGE IT", 9, C.t2, "letter-spacing:0.06em;")}${mono("η 0.40 · W 1.21 kJ", 9, C.t2)}</div>
  </div>
  <div style="display:flex;gap:14px;">${[["—", "Isotherm"], ["---", "Adiabat"], ["●", "Gas state"]].map(([m, l], i) => `<div style="display:flex;align-items:center;gap:6px;">${mono(m, 10, i === 2 ? C.accent : C.text)}${t(l, 12, C.t2, 400, 16)}</div>`).join("")}</div>
  <div style="display:flex;align-items:center;gap:6px;">${["Step", "Run", "Reset"].map((b) => `<div style="height:30px;padding:0 10px;border:1px solid #3A3A3A;display:flex;align-items:center;">${mono(b, 11, C.text)}</div>`).join("")}
    <div style="flex:1;display:flex;align-items:center;gap:8px;padding-left:8px;">${mono("Th", 10, C.t2)}<div style="flex:1;height:3px;background:#3A3A3A;border-radius:2px;display:flex;align-items:center;"><div style="width:62%;height:3px;background:#EDEDED;border-radius:2px;"></div><div style="width:14px;height:14px;border-radius:7px;background:#EDEDED;flex-shrink:0;"></div></div>${mono("500 K", 10, C.text)}</div></div>
</div>`;
}

const outputs = () =>
  `<div layer-name="Made overnight" style="display:flex;flex-direction:column;gap:8px;flex-shrink:0;">${t("Made overnight", 13, C.t3, 400, 18)}<div style="display:flex;gap:6px;overflow:hidden;">${actionBtn("doc", "Summary", { on: true })}${actionBtn("quiz", "Quiz")}${actionBtn("lines", "Revision")}${actionBtn("widget", "Carnot")}</div></div>`;

const changesBanner = () => tray({ title: "3 file changes", meta: "1 accepted · 2 waiting", chevron: "chevU", inline: trayBtn("Accept all", "primary") });

function reportThread({ figure = true } = {}) {
  return `<div style="display:flex;flex-direction:column;gap:14px;padding:6px 20px 0;">
  ${workedHeader("Worked overnight for 14m 08s", "5:48 AM")}
  ${ruthText("Good morning. I went through what you studied yesterday and made a summary, a short quiz and revision notes. Start with the summary, since the quiz builds on it.")}
  ${outputs()}
  <div style="display:flex;flex-direction:column;">
    ${logRow("doc", "Read Lecture 7 · Entropy and the Clausius inequality.pdf")}
    ${logRow("video", "Watched Entropy, explained · 18:40 to 31:05")}
    ${logRow("search", "Searched your notes for “Carnot”, “reversible”")}
    ${logRow("pencil", "Wrote a summary, an 8-question quiz and revision notes")}
    ${logRow("widget", "Built a Carnot cycle widget, checked against Lecture 8")}
  </div>
  ${figure ? carnotFigure() : ""}
</div>`;
}

const M12 = {
  id: "M12", name: "Morning report · chat", col: 4, row: 0,
  body: `${statusBar()}${reportNav()}${reportThread()}${composerDock({ placeholder: "Ask Ruth, @ a source or note", banner: changesBanner() })}`,
};

const peek = () => `${statusBar()}${reportNav()}`;

const M13 = {
  id: "M13", name: "Morning report · Summary sheet", col: 4, row: 1,
  body: `${peek()}${sheet(`${sheetTabs(TABS, 0)}
<div style="display:flex;flex-direction:column;gap:14px;padding:6px 20px 0;">
  ${aside(`<div style="display:flex;align-items:flex-start;gap:8px;">${ic("moon", 14, C.accentText, 1.4)}${t("Start here. The quiz asks about the Clausius inequality, which this sets up.", 13, C.accentText, 400, 18, "flex:1;")}</div>`, { color: C.accent })}
  <div style="display:flex;flex-direction:column;gap:6px;">${t("Entropy and the second law", 22, C.text, 600, 28, "letter-spacing:-0.01em;")}${t("Written overnight from 3 sources · accepted 6:02 AM", 12, C.t3, 400, 16)}</div>
  ${t("Entropy counts how many microscopic arrangements match what you can observe. For an isolated system it never decreases: it stays constant for a reversible process and grows for every real one.", 16, C.text, 400, 25)}
  <div style="display:flex;gap:6px;flex-wrap:wrap;">${cite("Lecture 7 · p.4", "doc", { tone: "amber" })}${cite("Entropy, explained · 18:40", "video", { tone: "red" })}</div>
  <div style="height:52px;border-top:1px solid ${C.line};border-bottom:1px solid ${C.line};display:flex;align-items:center;justify-content:center;">${t("dS ≥ δQ / T", 17, C.text, 600, 22, "letter-spacing:0.04em;")}</div>
  ${t("The Clausius inequality makes this measurable: around any cycle ∮ δQ/T ≤ 0, with equality only when every step is reversible. That is why no engine beats the Carnot efficiency.", 16, C.text, 400, 25)}
  ${t("Key points", 15, C.text, 600, 20)}
  ${t("• Entropy is a state function; heat and work are not.", 16, C.text, 400, 24)}
</div>`, { top: 64 })}`,
};

function option(letter, text, state = null) {
  const s = { wrong: ["#1E1213", "Your answer", C.red], right: ["#0F1A14", "Correct", C.green] }[state] ?? ["transparent", "", C.t3];
  return `<div style="min-height:52px;border-top:1px solid ${C.line};background:${s[0]};display:flex;align-items:center;gap:12px;padding:10px 12px;flex-shrink:0;">${mono(letter, 11, s[2], "width:10px;")}${t(text, 15, C.text, state ? 500 : 400, 20, "flex:1;")}${s[1] ? t(s[1], 12, s[2], 500, 16, "flex-shrink:0;") : ""}</div>`;
}
const segs = (pattern) => `<div style="display:flex;gap:4px;">${pattern.split("").map((c) => `<div style="flex:1;height:4px;border-radius:2px;background:${{ g: C.green, r: C.red, o: "#3A3A3A" }[c]};"></div>`).join("")}</div>`;

const M14 = {
  id: "M14", name: "Morning report · Quiz, answered with feedback", col: 4, row: 2,
  body: `${peek()}${sheet(`${sheetTabs(TABS, 1)}
<div style="display:flex;flex-direction:column;gap:12px;padding:8px 20px 0;">
  <div style="display:flex;align-items:center;gap:10px;">${t("Question 3 of 8", 13, C.t2, 400, 18, "flex-shrink:0;")}<div style="flex:1;">${segs("ggrooooo")}</div>${mono("2 / 3", 11, C.text)}</div>
  ${t("A gas expands freely into a vacuum. No heat flows in. What happens to its entropy?", 19, C.text, 600, 25, "padding:4px 0 2px;")}
  <div style="display:flex;flex-direction:column;border-bottom:1px solid ${C.line};">${option("A", "It decreases, because the gas cools")}${option("B", "It stays the same, because Q = 0", "wrong")}${option("C", "It increases by nR ln(V₂/V₁)", "right")}${option("D", "It can't be defined for an irreversible process")}</div>
  ${aside(`${t("Q = 0 doesn't mean ΔS = 0", 15, C.text, 600, 20)}${t("dS = δQ/T only holds along a reversible path. Entropy is a state function, so compute it along a reversible isothermal path between the same two states.", 14, C.t2, 400, 20)}<div style="display:flex;gap:6px;padding-top:2px;">${cite("Lecture 7 · p.6")}${cite("Your summary · §2", "note")}</div>`, { color: C.green, gap: 8 })}
</div>
<div style="flex:1;"></div>
<div style="display:flex;align-items:center;gap:12px;padding:12px 20px 42px;border-top:1px solid ${C.line};">${t("Ruth will ask this again in a different form at the end.", 12, C.t3, 400, 16, "flex:1;")}${btn("Next question", "primary")}</div>
${homeIndicator()}`, { top: 64 })}`,
};

const M15 = {
  id: "M15", name: "Morning report · Quiz score", col: 4, row: 3,
  body: `${peek()}${sheet(`${sheetTabs(TABS, 1)}
<div style="display:flex;flex-direction:column;gap:14px;padding:14px 20px 0;">
  <div style="display:flex;align-items:center;gap:16px;">${t("6/8", 60, C.text, 500, 64, "letter-spacing:-0.04em;")}<div style="display:flex;flex-direction:column;gap:3px;">${t("Solid on Carnot. Shaky on free expansion.", 15, C.text, 600, 20)}${t("Finished in 6 min · 2 retried", 12, C.t3, 400, 16)}</div></div>
  ${segs("ggrgggrg".replace(/./g, (c) => c))}
  ${t("Missed", 13, C.t3, 400, 18, "padding-top:8px;")}
  <div style="display:flex;flex-direction:column;border-bottom:1px solid ${C.line};">
    <div style="padding:12px 0;border-top:1px solid ${C.line};display:flex;flex-direction:column;gap:3px;">${t("Q3 · Entropy change in a free expansion", 15, C.text, 500, 20)}${t("You said ΔS = 0 because Q = 0. Use a reversible path: nR ln 2.", 13, C.t2, 400, 18)}</div>
    <div style="padding:12px 0;border-top:1px solid ${C.line};display:flex;flex-direction:column;gap:3px;">${t("Q6 · Sign of ΔS for the surroundings", 15, C.text, 500, 20)}${t("The reservoir loses heat Q at T, so its entropy falls by Q/T.", 13, C.t2, 400, 18)}</div>
  </div>
  <div style="display:flex;flex-direction:column;gap:10px;padding-top:8px;">
    <div style="display:flex;align-items:center;gap:8px;">${ic("moon", 14, C.accentText, 1.4)}${t("Ruth suggests", 14, C.accentText, 600, 18)}</div>
    ${t("Two short questions on reversible paths tonight, and add the free-expansion trick to your Entropy note.", 15, C.text, 400, 22)}
    <div style="display:flex;gap:8px;flex-wrap:wrap;">${btn("Add to tonight", "primary", { h: 32, size: 13 })}${btn("Update my note", "secondary", { h: 32, size: 13 })}${btn("Retry missed", "ghost", { h: 32, size: 13 })}</div>
  </div>
</div>`, { top: 64 })}`,
};

const M16 = {
  id: "M16", name: "Morning report · Widget (Raptor 2), full height", col: 4, row: 4,
  body: `${peek()}${sheet(`${sheetTabs([["doc", "Summary"], ["quiz", "Quiz"], ["lines", "Revision"], ["widget", "Raptor 2"], ["doc", "Lecture 7"]], 3)}
<div style="display:flex;flex-direction:column;gap:12px;padding:8px 16px 0;">
  <x-paper-clone node-id="1XZ-0" style="width:358px;height:447px;flex-shrink:0;" data-preview="Raptor 2 test-stand figure from 16c" />
  <div style="display:flex;align-items:flex-start;gap:12px;padding:0 4px;">${t("Built by Ruth overnight · a real heat engine to compare with Carnot · runs on your phone", 13, C.t3, 400, 18, "flex:1;")}${t("Ask about a part", 13, C.accentText, 500, 18, "flex-shrink:0;")}</div>
</div>`, { top: 64, bg: "#0E0E0E" })}`,
};

function changeRow(icon, iconColor, verb, name, detail, state) {
  const trail = state === "accepted"
    ? t("Accepted", 12, C.t3, 500, 16, "flex-shrink:0;")
    : `<div style="display:flex;gap:4px;flex-shrink:0;">${trayBtn("Skip", "ghost")}${trayBtn("Accept")}</div>`;
  return trayRow({ lead: ic(icon, 14, iconColor, 1.6), label: `${verb} · ${name}`, detail, trail });
}

const M17 = {
  id: "M17", name: "Morning report · file changes expanded", col: 4, row: 5,
  body: `${statusBar()}${reportNav()}${reportThread()}${composerDock({
    placeholder: "Ask Ruth, @ a source or note",
    banner: tray({
      title: "3 file changes", meta: "1 accepted · 2 waiting",
      rows: changeRow("plus", C.green, "Create note", "Summary: Entropy and the second law", "in Thermodynamics", "accepted")
        + changeRow("move", C.accent, "Move", "Lecture 8 · Heat engines.pdf", "Unfiled → Thermodynamics", "waiting")
        + changeRow("pencil", C.amber, "Rename", "Untitled note (3)", "→ Lecture 6 notes", "waiting"),
      actions: trayBtn("Skip all", "ghost") + trayBtn("Accept all", "primary"),
    }),
  })}`,
};

// ---------------------------------------------------------------- Citations (half-height sheet keeps the answer visible)
const citedChat = (active) => `${statusBar()}${reportNav()}
<div style="display:flex;flex-direction:column;gap:12px;padding:6px 20px 0;">
  ${userBubble("Before the quiz: why can't any engine beat the Carnot efficiency?")}
  ${ruthText("Because beating it would let you break the second law. Hook a “better” engine to a Carnot engine running backwards and the pair would move heat from cold to hot with no other change.")}
  <div style="display:flex;gap:6px;flex-wrap:wrap;">${cite("Lecture 8 · p.11", "doc", { active: active === 0 })}${cite("MIT 5.60 L9 · 18:40", "fav:youtube", { active: active === 1 })}${cite("Whiteboard · Tue", "image", { active: active === 2 })}</div>
</div>`;

const pdfPage = () => `<div layer-name="PDF page 11" style="width:342px;flex-shrink:0;background:#F3F2EC;padding:22px 20px;display:flex;flex-direction:column;gap:7px;align-self:center;">
  <div style="font-family:Georgia, serif;font-size:17px;line-height:22px;color:#1A1A1A;padding-bottom:6px;">8.5 No engine beats Carnot</div>
  ${[100, 92, 96].map((w) => `<div style="width:${w}%;height:4px;background:#CFCFC7;border-radius:1px;"></div>`).join("")}
  <div style="display:flex;background:#DCE5FB;"><div style="width:3px;background:#6B8BE8;flex-shrink:0;"></div><div style="padding:8px 10px;font-family:Georgia, serif;font-size:12.5px;line-height:18px;color:#1F1F1F;">Suppose an engine X had η_X > η_C. Use its work to drive a Carnot engine in reverse. The pair moves heat from the cold reservoir to the hot one with no other effect, contradicting the Clausius statement.</div></div>
  ${[98, 88, 94, 60].map((w) => `<div style="width:${w}%;height:4px;background:#CFCFC7;border-radius:1px;"></div>`).join("")}
</div>`;

const M18 = {
  id: "M18", name: "Citation → PDF opens at p.11 (half sheet)", col: 5, row: 0,
  body: `${citedChat(0)}${sheet(`${sheetTabs([["doc", "Summary"], ["quiz", "Quiz"], ["doc", "Lecture 8"]], 2)}
<div style="display:flex;align-items:center;gap:8px;padding:0 20px 12px;">${t("Page", 13, C.t2, 400, 16)}<div style="height:24px;padding:0 8px;border-radius:5px;background:${C.s3};display:flex;align-items:center;">${t("11", 13, C.text, 600, 16)}</div>${t("of 24", 13, C.t3, 400, 16, "white-space:nowrap;")}<div style="height:24px;padding:0 8px;border-radius:5px;background:${C.accentTint};border:1px solid ${C.accentLine};display:flex;align-items:center;">${t("Cited in Ruth's answer", 12, C.accentText, 400, 16, "white-space:nowrap;")}</div><div style="flex:1;"></div>${t("Open original", 13, C.t2, 400, 16, "white-space:nowrap;")}</div>
<div style="flex:1;background:#1A1A1A;display:flex;flex-direction:column;padding-top:16px;overflow:hidden;">${pdfPage()}</div>`, { top: 404 })}${homeIndicator()}`,
};

const player = () => `<div layer-name="Player" style="width:358px;height:201px;flex-shrink:0;border-radius:10px;background:#16161A;position:relative;overflow:hidden;align-self:center;">
  <div style="position:absolute;left:22px;top:18px;width:200px;height:122px;background:#22402E;border:5px solid #5A4630;"></div>
  <svg width="200" height="122" viewBox="0 0 200 122" style="position:absolute;left:27px;top:23px;"><path d="M18 22h70M18 36h46" stroke="#E6E6E6" stroke-width="1.4"/><path d="M24 104V54M24 104h150M24 100C60 60 110 48 160 44" stroke="#E6E6E6" stroke-width="1.4" fill="none"/></svg>
  <div style="position:absolute;left:262px;top:60px;width:46px;height:46px;border-radius:23px;background:#3A3A40;"></div>
  <div style="position:absolute;left:256px;top:110px;width:58px;height:70px;border-radius:18px;background:#3A3A40;"></div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:40px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,0.75));display:flex;align-items:center;gap:10px;padding:0 12px;">
    ${ic("pause", 14, "#fff", 2)}${mono("18:40 / 48:12", 10.5, "#fff")}
    <div style="flex:1;height:3px;background:#FFFFFF40;border-radius:2px;position:relative;display:flex;"><div style="width:38%;height:3px;background:#fff;border-radius:2px;"></div><div style="position:absolute;left:38%;top:-5px;width:2px;height:13px;background:#fff;"></div><div style="position:absolute;left:56%;top:-3px;width:2px;height:9px;background:#F2A14D;"></div></div>
  </div>
</div>`;

const M19 = {
  id: "M19", name: "Citation → video opens at 18:40 (half sheet)", col: 5, row: 1,
  body: `${citedChat(1)}${sheet(`${sheetTabs([["doc", "Summary"], ["quiz", "Quiz"], ["fav:youtube", "MIT 5.60 L9 · Entropy"]], 2)}
<div style="display:flex;flex-direction:column;gap:10px;padding:0 16px;">
  ${player()}
  <div style="display:flex;align-items:center;gap:8px;padding:0 4px;"><div style="height:24px;padding:0 8px;border-radius:5px;background:${C.accentTint};border:1px solid ${C.accentLine};display:flex;align-items:center;">${t("Cited · 18:40–19:10", 12, C.accentText, 400, 16, "white-space:nowrap;")}</div>${t("orange mark: where you captured it", 12, C.t3, 400, 16, one)}</div>
  ${aside(`<div style="display:flex;gap:10px;">${mono("18:40", 10.5, C.accentText, "flex-shrink:0;padding-top:2px;")}${t("Take the better engine, use its work to run Carnot backwards, and look at the net heat.", 14, C.text, 500, 20, "flex:1;")}</div>`, { color: C.accent })}
</div>`, { top: 404 })}${homeIndicator()}`,
};

const board = () => `<div layer-name="Photo" style="width:358px;height:228px;flex-shrink:0;border-radius:10px;background:#E4E4DF;position:relative;overflow:hidden;align-self:center;">
  <div style="position:absolute;left:22px;top:24px;width:100px;height:62px;border:2px solid #3D4FB0;"></div>
  <div style="position:absolute;left:72px;top:24px;width:0;height:62px;border-left:1.5px dashed #3D4FB0;"></div>
  ${[[34, 36], [52, 48], [40, 64], [96, 40]].map(([x, y]) => `<div style="position:absolute;left:${x}px;top:${y}px;width:5px;height:5px;border-radius:3px;background:#3D4FB0;"></div>`).join("")}
  <div style="position:absolute;left:150px;top:30px;width:80px;height:2px;background:#C0392B;"></div>
  <div style="position:absolute;left:150px;top:44px;width:60px;height:2px;background:#C0392B;"></div>
  <div style="position:absolute;left:160px;top:62px;width:150px;height:96px;border:1.5px solid #7E98E8;background:#7E98E826;"></div>
  <svg width="140" height="80" viewBox="0 0 140 80" style="position:absolute;left:166px;top:70px;"><path d="M8 8V72H134" stroke="#2A2A2A" stroke-width="1.6" fill="none"/><path d="M12 66C40 30 80 18 126 14" stroke="#2A2A2A" stroke-width="1.8" fill="none"/><path d="M12 66C44 48 84 34 126 16" stroke="#2A2A2A" stroke-width="1.6" stroke-dasharray="4 4" fill="none"/></svg>
  <div style="position:absolute;left:164px;top:52px;padding:1px 6px;border-radius:3px;background:#ABC4FF;">${t("cited", 10, C.onAccent, 600, 14)}</div>
  ${[[22, 120, 120], [22, 140, 90], [22, 160, 104]].map(([x, y, w]) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:2px;background:#2A2A2A;"></div>`).join("")}
</div>`;

const M20 = {
  id: "M20", name: "Citation → image opens on the region", col: 5, row: 2,
  body: `${citedChat(2)}${sheet(`${sheetTabs([["doc", "Summary"], ["quiz", "Quiz"], ["image", "Whiteboard · Tuesday"]], 2)}
<div style="display:flex;flex-direction:column;gap:12px;padding:0 16px;">
  ${board()}
  <div style="display:flex;padding:0 4px;"><div style="height:24px;padding:0 8px;border-radius:5px;background:${C.accentTint};border:1px solid ${C.accentLine};display:flex;align-items:center;">${t("Cited · right half of the board", 12, C.accentText, 400, 16, "white-space:nowrap;")}</div></div>
  <div style="padding:0 4px;display:flex;flex-direction:column;">${aside(`${t("Read from the handwriting", 12, C.t3, 400, 16)}${t("“Engine X → drives Carnot backwards → net Q from cold to hot. ✗ Clausius”", 14, C.text, 500, 20)}${t("Tuesday study group · captured 2d ago · Unfiled", 12, C.t3, 400, 16)}`, { gap: 4 })}</div>
</div>`, { top: 330 })}${homeIndicator()}`,
};

export default [M12, M13, M14, M15, M16, M17, M18, M19, M20];
