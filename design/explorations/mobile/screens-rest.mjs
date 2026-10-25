import {
  C, t, mono, ic, fav, swatch, nbTag, one, statusBar, glass, navBar, composerDock, capsule, btn, chip, toggle,
  checkbox, sheet, divider, groupLabel, threadRow, tray, trayBtn, trayRow, cite, logRow, userBubble, ruthText,
  workedHeader, homeIndicator, selectionDock, cover, underlineTabs,
} from "./lib.mjs";

const MESH_HELLO = "https://app.paper.design/file-assets/01M5A26NEVB5HPNE8V8V35JSDH/6GF4H9QX6XJRZNH0FA8FE0BFH7.png";
const MESH_DIM = "https://app.paper.design/file-assets/01M5A26NEVB5HPNE8V8V35JSDH/3KFTJJ0DVJK5TDP9ND11FXNGBW.png";

const chatNav = (title) => navBar({ title, sub: "Thermodynamics", right: ["more"] });

// ---------------------------------------------------------------- Chat
const expFit = () => `<svg width="100%" height="100%" viewBox="0 0 170 120" preserveAspectRatio="xMidYMid meet" style="display:block;">
  <text x="8" y="12" fill="#6E6E6E" font-family="Geist Mono, monospace" font-size="6">Fig 1</text><text x="162" y="12" fill="#6E6E6E" font-family="Geist Mono, monospace" font-size="6" text-anchor="end">EXPONENTIAL FIT</text>
  <path d="M22 20V86H160" stroke="#4A4A4A" stroke-width="0.6" fill="none"/>
  <path d="M24 26C50 52 80 70 158 80" stroke="#EDEDED" stroke-width="1" fill="none"/>
  ${[[26, 28], [34, 36], [42, 44], [52, 52], [62, 57], [72, 63], [84, 67], [96, 71], [110, 74], [124, 77], [140, 78], [154, 80]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="none" stroke="#BDBDBD" stroke-width="0.6"/>`).join("")}
  <path d="M22 100H160" stroke="#4A4A4A" stroke-width="0.6"/>${[30, 44, 58, 72, 86, 100, 114, 128, 142, 156].map((x, i) => `<path d="M${x} 100v${(i % 3) - 1.5}" stroke="#BDBDBD" stroke-width="0.8"/>`).join("")}
  <text x="8" y="114" fill="#6E6E6E" font-family="Geist Mono, monospace" font-size="5.5">RESIDUAL · NO PATTERN</text>
</svg>`;

const media = () => `<div layer-name="Generated media" style="display:flex;gap:10px;flex-shrink:0;">
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;"><div style="height:128px;border-radius:8px;border:1px solid ${C.line2};background:#0E0E0E;overflow:hidden;">${expFit()}</div>${t("Figure · exponential fit, R² 0.993", 12, C.t2, 400, 16, one)}</div>
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;"><div style="height:128px;border-radius:8px;border:1px solid ${C.line2};background:#141418;position:relative;display:flex;align-items:center;justify-content:center;">
    <div style="width:46px;height:46px;background:#A9B6F2;transform:rotate(12deg);border-radius:4px;"></div>
    <div style="position:absolute;width:36px;height:36px;border-radius:18px;background:#000000A0;display:flex;align-items:center;justify-content:center;">${ic("play", 14, "#fff")}</div>
    <div style="position:absolute;right:6px;bottom:6px;padding:1px 5px;border-radius:3px;background:#000000CC;">${mono("0:02", 10, "#fff")}</div>
  </div>${t("Animation · cube cooling · 0:02", 12, C.t2, 400, 16, one)}</div>
</div>`;

const M21 = {
  id: "M21", name: "Chat · generated figure + video", col: 6, row: 0,
  body: `${statusBar()}${chatNav("Lab 4 cooling readings")}
<div style="display:flex;flex-direction:column;gap:14px;padding:8px 20px 0;">
  ${userBubble("Can you fit my lab 4 cooling readings and show me why the cube cools fast at first and then slows down?")}
  ${workedHeader("Worked for 12s")}
  <div style="display:flex;flex-direction:column;">${logRow("image", "Read lab4-readings.csv · 25 points")}${logRow("video", "Fitted an exponential and rendered a short animation")}</div>
  ${ruthText("Your readings fall off exponentially: the cube loses heat in proportion to how much hotter it is than the room, so the gap shrinks by the same fraction every second.")}
  ${media()}
  ${ruthText("The residual strip shows no pattern, so Newton's law of cooling fits your data well. The time constant is about 1.9 s.")}
</div>
${composerDock({ placeholder: "Ask Ruth, @ a source or note" })}`,
};

// Approval: same composer tray as file changes and errors
const approvalTray = () => tray({
  title: "Move 3 duplicates to Trash", meta: "Needs your approval · kept for 30 days",
  rows: [["Lecture 7 · Entropy (1).pdf", "Duplicate"], ["Lecture 7 · Entropy (2).pdf", "Duplicate"], ["Screenshot 2026-10-09.png", "Duplicate"]].map(([l, d]) => trayRow({ lead: ic("trash", 14, C.t2, 1.4), label: l, detail: d })).join("")
    + trayRow({ lead: ic("check", 14, C.green, 1.6), label: "Lecture 7 · Entropy.pdf", detail: "Kept · has your 6 highlights" }),
  start: trayBtn("Always allow", "ghost"),
  actions: trayBtn("Decline") + trayBtn("Approve", "primary"),
});

const M22 = {
  id: "M22", name: "Mid-chat approval (composer tray)", col: 6, row: 1,
  body: `${statusBar()}${chatNav("Tidy Thermodynamics")}
<div style="display:flex;flex-direction:column;gap:14px;padding:8px 20px 0;">
  ${userBubble("Can you tidy my Thermodynamics sources? I think I captured some things twice.")}
  ${workedHeader("Working for 6s")}
  <div style="display:flex;flex-direction:column;">${logRow("search", "Compared 22 sources in Thermodynamics")}${logRow("copy", "Found 3 copies of files you already have")}${logRow("spinner", "Waiting for you to approve moving them to Trash", { iconColor: C.accent, color: C.text, chevron: false })}</div>
  ${ruthText("These are byte-for-byte duplicates. I'll keep the copy with your highlights and move the other three to Trash for 30 days.")}
</div>
${composerDock({ placeholder: "Ask Ruth, @ a source or note", banner: approvalTray() })}`,
};

// Question: same composer tray; the composer stays for a typed answer
const questionTray = () => tray({
  title: "Which exam should the plan build up to?", meta: "Ruth needs one answer to continue", step: "1/2",
  rows: [["Midterm · Oct 28", "Lectures 1–8, two weeks away", 1], ["Final · Dec 12", "Everything, eight weeks away", 0], ["No exam, just keep up", "A light weekly review instead", 0]]
    .map(([l, d, on], i) => trayRow({ label: l, detail: d, trail: on ? ic("check", 16, C.accent, 1.8) : mono(String(i + 1), 11, C.t3, "flex-shrink:0;") })).join(""),
  start: trayBtn("Skip", "ghost"),
  actions: trayBtn("Next", "primary"),
});

const M23 = {
  id: "M23", name: "Mid-chat question from Ruth (composer tray)", col: 6, row: 2,
  body: `${statusBar()}${chatNav("Revision plan")}
<div style="display:flex;flex-direction:column;gap:14px;padding:8px 20px 0;">
  ${userBubble("Make me a revision plan for the next two weeks.")}
  ${workedHeader("Working for 4s")}
  <div style="display:flex;flex-direction:column;">${logRow("doc", "Read your course outline and 9 notes")}${logRow("spinner", "Waiting for your answer", { iconColor: C.accent, color: C.text, chevron: false })}</div>
  ${ruthText("Your outline lists two exams, and the plan looks very different for each. Two quick questions first.")}
</div>
${composerDock({ placeholder: "Or type your own answer", banner: questionTray() })}`,
};

// ---------------------------------------------------------------- Chats and Tasks
const nbLead = (color) => `<div style="width:16px;display:flex;justify-content:center;flex-shrink:0;">${swatch(color)}</div>`;
const moonLead = () => ic("moon", 15, C.t2, 1.4);
const chatLead = () => ic("chat", 15, C.t3, 1.4);

const M24 = {
  id: "M24", name: "Chats and Tasks · see all (swipe for task actions)", col: 7, row: 0,
  body: `${statusBar()}${navBar({ right: [{ icon: "moon", label: "New task" }] })}
<div style="padding:4px 20px 12px;">${t("Chats and Tasks", 28, C.text, 600, 34, "letter-spacing:-0.02em;")}</div>
<div style="display:flex;gap:8px;padding:0 20px 6px;overflow:hidden;">${chip("All", { active: true, count: 24 })}${chip("Chats", { count: 17 })}${chip("Overnight", { count: 6 })}${chip("Scheduled", { count: 1 })}</div>
${groupLabel("Scheduled", { pad: "16px 20px 4px" })}
<div layer-name="Swiped row" style="display:flex;overflow:hidden;">
  <div style="width:390px;flex-shrink:0;display:flex;gap:12px;padding:12px 20px;position:relative;left:-186px;background:${C.bg};">${ic("clock", 16, C.accent, 1.5)}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">${t("Thermodynamics revision", 16, C.text, 500, 21, one)}${t("Weeknights · ready by 7:00 AM · asks first", 13, C.t3, 400, 17, one)}</div></div>
  <div style="display:flex;position:relative;left:-186px;flex-shrink:0;">${[["Run now", C.accent, C.onAccent], ["Pause", "#3A3A3C", C.text], ["Edit", "#2C2C2E", C.text]].map(([l, bg, fg]) => `<div style="width:62px;background:${bg};display:flex;align-items:center;justify-content:center;">${t(l, 13, fg, 600, 16, "white-space:nowrap;")}</div>`).join("")}</div>
</div>
${groupLabel("Today", { pad: "16px 20px 0" })}
${threadRow({ lead: nbLead(C.nb.thermo), meta: "Thermodynamics", right: "Waiting for you", rightColor: C.amber, titleLead: chatLead(), title: "Tidy Thermodynamics" })}${divider()}
${threadRow({ lead: nbLead(C.nb.thermo), meta: "Thermodynamics", right: "Running · 12s", rightColor: C.accentText, titleLead: chatLead(), title: "Lab 4 cooling readings" })}${divider()}
${threadRow({ lead: nbLead(C.nb.thermo), meta: "Thermodynamics · 5:48 AM", right: "3 made", titleLead: moonLead(), title: "Overnight · summary, quiz and revision notes" })}
${groupLabel("This week", { pad: "16px 20px 0" })}
${threadRow({ lead: nbLead(C.nb.thermo), meta: "Thermodynamics · Mon", right: "Didn't finish", rightColor: C.red, titleLead: moonLead(), title: "Overnight · summary and quiz" })}${divider()}
${threadRow({ lead: nbLead(C.nb.ethics), meta: "Ethics Project", right: "Sun", titleLead: chatLead(), title: "Is lying ever allowed? Kant vs. Mill" })}
${homeIndicator()}`,
};

const M25 = {
  id: "M25", name: "Task detail · failed overnight run", col: 7, row: 1,
  body: `${statusBar()}${navBar({ title: "Overnight · summary and quiz", sub: "Didn't finish", subColor: C.red, right: ["more"] })}
<div style="display:flex;flex-direction:column;gap:12px;padding:8px 20px 0;">
  ${workedHeader("Ran overnight for 6m 12s", "Mon 2:08–2:14 AM")}
  <div style="display:flex;flex-direction:column;">
    ${logRow("doc", "Read Lecture 7 · Entropy and the Clausius…", { right: "48s", chevron: false })}
    ${logRow("video", "Watched MIT 5.60 L9 · Entropy", { right: "2m 40s", chevron: false })}
    ${logRow("alert", "Couldn't open Lecture 9 · Free energy.pdf", { right: "2:13 AM", chevron: false, iconColor: C.red, color: C.text })}
    <div style="padding:4px 0 8px 24px;display:flex;"><div style="flex:1;border-left:2px solid ${C.line2};padding:2px 0 2px 12px;">${mono("The file is password-protected. Ruth tried twice, then stopped so she wouldn't write a quiz from half the material.", 11, C.t2)}</div></div>
    ${logRow("ring", "Write the summary and 8-question quiz", { right: "not started", chevron: false, color: C.t3 })}
  </div>
  ${ruthText("Nothing in your notebooks changed. Lecture 9 covers half of what the quiz was meant to test, so I didn't want to guess. Give me the password, or say to skip it, and I'll finish now or tonight.")}
</div>
${composerDock({
    placeholder: "Ask Ruth, @ a source or note",
    banner: tray({ tone: "danger", icon: "alert", title: "Run stopped", meta: "Lecture 9 is password-protected",
      start: trayBtn("Skip it", "ghost"), actions: trayBtn("Retry tonight") + trayBtn("Enter password", "primary") }),
  })}`,
};


const field = (label, value, { h = 44, focus = false } = {}) => `<div style="display:flex;flex-direction:column;gap:7px;padding:0 20px;">${t(label, 13, C.text, 500, 18)}<div style="min-height:${h}px;border-radius:10px;background:${C.s2};border:${focus ? 1.5 : 1}px solid ${focus ? C.accent : C.line2};display:flex;align-items:${h > 44 ? "flex-start" : "center"};padding:${h > 44 ? "11px" : "0"} 12px;">${t(value, 15, C.text, 400, 21)}</div></div>`;

const M26 = {
  id: "M26", name: "Ruth Cloud · schedule an overnight task (sheet)", col: 7, row: 2,
  body: `${statusBar()}${sheet(`<div layer-name="Form (scrolls)" style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;">
<div style="display:flex;flex-direction:column;gap:18px;padding-top:6px;">
  ${field("Task", "Turn today's Thermodynamics lectures into revision material", { focus: true, h: 64 })}
  ${field("Instructions", "Keep the quiz to 8 questions and use my notes' wording.", { h: 64 })}
  <div style="display:flex;flex-direction:column;gap:8px;padding:0 20px;">${t("Ruth can read", 13, C.text, 500, 18)}<div style="display:flex;gap:6px;flex-wrap:wrap;">${chip("Thermodynamics", { active: true, lead: swatch(C.nb.thermo) })}${chip("Unfiled sources", { active: true })}${chip("Organic Chemistry", { lead: swatch(C.nb.ochem) })}${chip("The web")}${chip("More", { lead: ic("plus", 12, C.t2, 1.5) })}</div></div>
  <div style="display:flex;flex-direction:column;gap:8px;padding:0 20px;">${t("Make", 13, C.text, 500, 18)}<div style="display:flex;gap:6px;flex-wrap:wrap;">${[["doc", "Summary", 1], ["quiz", "Quiz", 1], ["lines", "Revision", 1], ["widget", "Widget", 0], ["video", "Animation", 0], ["image", "Diagram", 0]].map(([i, l, on]) => chip(l, { active: !!on, lead: ic(i, 13, on ? C.text : C.t2, 1.4) })).join("")}</div></div>
  <div style="display:flex;flex-direction:column;gap:8px;padding:0 20px;">${t("Ruth can change", 13, C.text, 500, 18)}<div style="display:flex;padding:2px;border-radius:9px;background:${C.s2};border:1px solid ${C.line};">${[["Nothing", 0], ["Propose, I accept", 1], ["On her own", 0]].map(([l, on]) => `<div style="flex:1;height:34px;border-radius:7px;${on ? `background:${C.s4};` : ""}display:flex;align-items:center;justify-content:center;">${t(l, 12.5, on ? C.text : C.t2, on ? 600 : 400, 16, "white-space:nowrap;")}</div>`).join("")}</div></div>
</div></div>
<div layer-name="Footer (pinned)" style="flex-shrink:0;display:flex;flex-direction:column;gap:10px;padding:14px 20px 40px;border-top:1px solid ${C.line};background:${C.sheet};">
  <div style="display:flex;gap:10px;">${["Weeknights", "Ready by 7:00 AM"].map((v) => `<div style="flex:1;height:40px;border-radius:10px;background:${C.s2};border:1px solid ${C.line2};display:flex;align-items:center;justify-content:space-between;padding:0 12px;">${t(v, 14, C.text, 400, 18, "white-space:nowrap;")}${ic("chevD", 12, C.t3, 1.5)}</div>`).join("")}</div>
  ${btn("Schedule", "accent")}
  ${t("Uses 1 of 5 overnight runs this week", 12, C.t3, 400, 16, "text-align:center;")}
</div>${homeIndicator()}`, { top: 58, title: "New overnight task" })}`,
};

// ---------------------------------------------------------------- Filing
function srcRow(icon, title, meta, sel, right = "") {
  return `<div style="display:flex;align-items:center;gap:12px;padding:11px 20px;${sel ? `background:${C.s2};` : ""}">${checkbox(sel)}<div style="width:32px;height:32px;border-radius:8px;background:${C.s2};border:1px solid ${C.line};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${fav(icon, 16)}</div><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">${t(title, 15, C.text, 500, 20, one)}${t(meta, 12, C.t3, 400, 16, one)}</div>${right ? t(right, 12, C.t3, 400, 16, "flex-shrink:0;") : ""}</div>`;
}
const selectHeader = (n) => `<div layer-name="Selection header" style="display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 20px;">${t("Cancel", 16, C.text, 400, 20)}${t(`${n} selected`, 16, C.text, 600, 20)}${t("Select all", 16, C.text, 400, 20)}</div>`;
const selectList = () => `${selectHeader(2)}
<div style="padding-top:4px;">${underlineTabs([["Notebooks", 5], ["Notes", 24], ["Sources", 61]], 2)}</div>
${groupLabel("Just captured · 3", { pad: "14px 20px 4px" })}
${srcRow("doc", "Lecture 8 · Heat engines.pdf", "canvas.university.edu · Ruth thinks: Thermodynamics", true)}
${srcRow("youtube", "MIT 5.60 L9 · Entropy", "YouTube · Ruth thinks: Thermodynamics", true)}
${srcRow("wiki", "Carnot cycle · Wikipedia", "en.wikipedia.org · 9 min read", false, "Just now")}
${groupLabel("Earlier · 1", { pad: "14px 20px 4px" })}
${srcRow("image", "Whiteboard · Tuesday study group", "Photo · handwriting read", false, "2d ago")}`;

const M27 = {
  id: "M27", name: "Filing · select sources (long-press), icon dock", col: 8, row: 0,
  body: `${statusBar()}${selectList()}${selectionDock(2, [["move", C.text, true], ["moon", C.accent], ["split"], ["download"], ["trash", C.red]])}`,
};

const M28 = {
  id: "M28", name: "Filing · move 2 sources to a notebook (sheet)", col: 8, row: 1,
  body: `${statusBar()}${selectList()}
<div layer-name="Dim" style="position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.55);"></div>
<div layer-name="Sheet · Move to" style="position:absolute;left:0;right:0;bottom:0;background:${C.sheet};border-radius:24px 24px 0 0;border-top:1px solid #2A2A2A;display:flex;flex-direction:column;padding-bottom:34px;">
  <div style="display:flex;justify-content:center;padding:7px 0;"><div style="width:36px;height:5px;border-radius:3px;background:#3A3A3A;"></div></div>
  <div style="padding:6px 20px 10px;">${t("Move 2 sources to", 18, C.text, 600, 24)}</div>
  ${[["thermo", "Thermodynamics", "Ruth's guess", true], ["stat", "Statistical Mechanics", "", false], ["ochem", "Organic Chemistry", "", false], ["ethics", "Ethics Project", "", false]].map(([k, n, g, on]) => `<div style="display:flex;align-items:center;gap:12px;height:52px;padding:0 20px;${on ? `background:${C.s3};` : ""}">${swatch(C.nb[k], 10, 13)}${t(n, 16, C.text, on ? 500 : 400, 20, "flex:1;")}${g ? t(g, 12, C.t3, 400, 16) : ""}</div>`).join("")}
  <div style="height:1px;background:${C.line};"></div>
  <div style="display:flex;align-items:center;gap:12px;height:52px;padding:0 20px;">${ic("plus", 14, C.t2, 1.5)}${t("New notebook…", 16, C.t2, 400, 20)}</div>
  ${homeIndicator()}
</div>`,
};

function clusterRow(icon, title, where) {
  return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid ${C.line};">${fav(icon, 16)}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;">${t(title, 15, C.text, 400, 20, one)}${t(where, 12, C.t3, 400, 16, one)}</div>${ic("close", 14, C.t3, 1.5)}</div>`;
}
const M29 = {
  id: "M29", name: "Filing · review Ruth's clusters", col: 8, row: 2,
  body: `${statusBar()}${navBar({ title: "", right: [] })}
<div style="display:flex;flex-direction:column;padding:0 20px;">
  ${t("Sort 12 unfiled sources", 26, C.text, 600, 32, "letter-spacing:-0.02em;")}
  ${t("Ruth grouped them overnight. Remove anything that doesn't belong. Nothing moves until you accept.", 14, C.t2, 400, 20, "padding-top:6px;")}
  <div style="display:flex;flex-direction:column;padding-top:22px;">
    <div style="display:flex;align-items:baseline;gap:8px;">${t("New notebook", 13, C.t3, 400, 18)}${t("Statistical Mechanics", 17, C.text, 600, 22)}</div>
    ${t("All six cover microstates and S = k ln W, which none of your notebooks have yet.", 13, C.t3, 400, 18, "padding:4px 0 8px;")}
    ${clusterRow("arxiv", "The statistical origin of irreversibility", "arxiv.org")}
    ${clusterRow("youtube", "Boltzmann entropy in 10 minutes", "youtube.com")}
    ${clusterRow("doc", "Schroeder · Ch. 2 The second law.pdf", "Downloads")}
    <div style="display:flex;align-items:center;gap:8px;padding:10px 0 0;border-top:1px solid ${C.line};">${t("3 more", 13, C.t3, 400, 18, "flex:1;")}${btn("Rename", "ghost", { h: 32, size: 13 })}${btn("Skip", "ghost", { h: 32, size: 13 })}${btn("Create", "secondary", { h: 32, size: 13 })}</div>
  </div>
  <div style="display:flex;flex-direction:column;padding-top:22px;">
    <div style="display:flex;align-items:baseline;gap:8px;">${t("Add to", 13, C.t3, 400, 18)}${t("Thermodynamics", 17, C.text, 600, 22)}</div>
    ${t("These match Lectures 7 and 8 and the problem set you're working on.", 13, C.t3, 400, 18, "padding:4px 0 8px;")}
    ${clusterRow("doc", "Lecture 8 · Heat engines.pdf", "canvas.university.edu")}
    ${clusterRow("wiki", "Carnot cycle", "wikipedia.org")}
  </div>
</div>
<div layer-name="Accept bar" style="position:absolute;left:0;right:0;bottom:0;padding:24px 20px 34px;display:flex;gap:10px;background:linear-gradient(180deg, rgba(11,11,11,0) 0%, #0B0B0B 35%);">${btn("Skip all", "secondary", { grow: true })}${btn("Accept all", "primary", { grow: true })}</div>${homeIndicator()}`,
};

// ---------------------------------------------------------------- Settings + Trash
const group = (title, rows, foot = "") => `<div style="display:flex;flex-direction:column;gap:7px;padding:22px 16px 0;">${title ? t(title.toUpperCase(), 12, C.t3, 500, 16, "letter-spacing:0.04em;padding:0 4px;") : ""}<div style="border-radius:10px;background:#141414;display:flex;flex-direction:column;">${rows.join(`<div style="height:1px;background:${C.line};width:calc(100% - 16px);align-self:flex-end;"></div>`)}</div>${foot ? t(foot, 12, C.t3, 400, 16, "padding:0 4px;") : ""}</div>`;
const srow = (label, { sub = "", value = "", chevron = true, trail = "", lead = "" } = {}) => `<div style="display:flex;align-items:center;gap:12px;min-height:${sub ? 60 : 48}px;padding:8px 16px;">${lead}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">${t(label, 16, C.text, 400, 21)}${sub ? t(sub, 13, C.t3, 400, 17) : ""}</div>${value ? t(value, 15, C.t2, 400, 20, "white-space:nowrap;") : ""}${trail}${chevron ? ic("chevR", 13, C.t3, 1.6) : ""}</div>`;
const meter = (label, value, pct) => `<div style="display:flex;flex-direction:column;gap:8px;padding:12px 16px;"><div style="display:flex;justify-content:space-between;">${t(label, 16, C.text, 400, 21)}${mono(value, 12, C.text)}</div><div style="height:4px;border-radius:2px;background:${C.line2};display:flex;"><div style="width:${pct}%;height:4px;border-radius:2px;background:${C.text};"></div></div></div>`;

const M30 = {
  id: "M30", name: "Settings", col: 9, row: 0, h: 1660,
  body: `${statusBar()}${navBar({ title: "Settings", right: [] })}
${group("", [srow("Abhiram", { sub: "damodara.abhiram@gmail.com", lead: `<div style="width:40px;height:40px;border-radius:20px;background:${C.s4};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${t("AD", 14, C.text, 600, 18)}</div>` }), srow("Sign-in", { value: "Google" }), srow("Devices", { sub: "iPhone (this one) · MacBook Air" })])}
${group("Plan and usage", [srow("Student · free", { sub: "Verified with your .edu until June 2027", value: "Compare" }), meter("Overnight runs this week", "3 of 5", 60), meter("Storage", "1.3 of 2 GB", 65)], "Resets Monday. Chats are unlimited.")}
${group("Overnight runs", [srow("Have results ready by", { value: "7:00 AM" }), srow("Ruth can change files", { value: "Propose, I accept" }), srow("Sort Unfiled every night", { chevron: false, trail: toggle(true), sub: "Uses no runs" })])}
${group("Notifications", [srow("Morning report", { chevron: false, trail: toggle(true), sub: "When the overnight run finishes" }), srow("When Ruth needs you", { chevron: false, trail: toggle(true), sub: "Approvals, questions, failed runs" })])}
${group("Capture", [srow("Capture pages you're logged into", { chevron: false, trail: toggle(false), sub: "Applies to capture on your computer" }), srow("Paywalled pages", { value: "Title and abstract" }), srow("Capture shortcut", { chevron: false, value: "⌥ C on your computer" })], "Capture happens in Avenire for Mac and Windows. Everything you capture syncs here.")}
${group("On your computer", [srow("Connected folders", { value: "2", sub: "~/Documents/Uni · Google Drive · PHYS 201" }), srow("Open Avenire in Finder", { sub: "WebDAV drive · dav.avenire.app/abhiram", value: "Copy link", chevron: false })], "Folders and the drive are set up on the computer.")}
${group("", [srow("Trash", { value: "5" }), srow("Privacy")])}
<div style="padding:28px 20px 40px;display:flex;justify-content:center;">${t("Sign out", 16, C.red, 400, 20)}</div>`,
};

const trashRow = (sel, icon, title, nb, color, left, leftColor = C.t3) => `<div style="display:flex;align-items:center;gap:12px;padding:12px 20px;${sel ? `background:${C.s2};` : ""}">${checkbox(sel)}${fav(icon, 16)}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">${t(title, 15, C.text, 500, 20, one)}${color ? nbTag(nb, color, 12, C.t3) : t(nb, 12, C.t3, 400, 16)}</div>${t(left, 12, leftColor, 400, 16, "flex-shrink:0;")}</div>`;

const M31 = {
  id: "M31", name: "Trash · two selected, icon dock", col: 9, row: 2,
  body: `${statusBar()}${selectHeader(2)}
<div style="display:flex;flex-direction:column;gap:4px;padding:4px 20px 14px;">${t("Trash", 28, C.text, 600, 34, "letter-spacing:-0.02em;")}${t("Items are deleted for good after 30 days.", 14, C.t2, 400, 20)}</div>
${trashRow(true, "note", "Black-Scholes assumptions", "Options Pricing", C.nb.options, "27 days left")}
${trashRow(true, "youtube", "MIT 5.60 L9 · Entropy", "Thermodynamics", C.nb.thermo, "21 days left")}
${trashRow(false, "doc", "Lecture 6 · Ideal gases.pdf", "Thermodynamics", C.nb.thermo, "12 days left")}
${trashRow(false, "folder", "Organic Chemistry", "Notebook · 3 notes, 9 sources", null, "6 days left")}
${trashRow(false, "wiki", "Utilitarianism · Wikipedia", "Ethics Project", C.nb.ethics, "Tomorrow", C.red)}
<div style="padding:18px 20px;display:flex;justify-content:center;">${t("Empty trash", 15, C.red, 400, 20)}</div>
${selectionDock(2, [["restore"], ["trash", C.red]])}`,
};

// ---------------------------------------------------------------- Onboarding (mobile)
// Avenire wordmark: one monoline stroke (draw-on animation), our own lettering. Replaced Apple's "hello" script.
export const WORDMARK_PATH = "M79 104C72 90 46 88 34 108C24 126 32 151 50 150C66 149 76 128 79 100C76 120 74 140 82 148C88 154 96 146 100 138C104 124 106 104 108 96C112 116 116 140 122 150C128 136 134 112 138 98C140 110 150 120 168 116C182 112 186 94 172 92C158 92 154 112 156 124C158 142 168 151 180 150C192 149 200 140 204 132C208 120 210 104 212 96C213 112 213 136 214 150C216 124 224 98 238 97C250 96 248 124 248 136C248 148 256 152 264 144C268 130 272 108 274 96C274 116 274 138 280 148C286 154 294 146 298 138C300 122 302 104 304 96C305 116 305 136 306 150C308 126 316 102 330 98C336 97 340 100 342 104C346 116 354 120 364 118C378 114 382 96 368 94C354 94 350 114 352 126C354 144 364 152 378 150C392 148 402 136 410 126";
export const WORDMARK_DOT = "M276 72v.5";
const wordmark = (w = 290) => `<svg layer-name="Wordmark · avenire (stroke)" width="${w}" height="${Math.round(w * 112 / 404)}" viewBox="16 56 404 112" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="${WORDMARK_PATH}"/><path d="${WORDMARK_DOT}"/></svg>`;

const M32 = {
  id: "M32", name: "Onboarding · Welcome", col: 10, row: 0, bg: "#06111F",
  body: `<div layer-name="Mesh" style="position:absolute;left:0;top:0;right:0;bottom:0;background-image:url(${MESH_HELLO});background-size:cover;background-position:30% 50%;"></div>
<div style="position:relative;display:flex;flex-direction:column;">${statusBar()}</div>
<div style="position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:0 32px 60px;">${wordmark()}${t("Your study material, worked on while you're away.", 17, "#F2F2F2", 400, 24, "text-align:center;")}</div>
<div style="position:relative;padding:0 24px 50px;display:flex;flex-direction:column;">${btn("Continue", "white")}</div>${homeIndicator("#FFFFFF")}`,
};

const obFooter = (label = "Continue", extra = "") => `<div style="flex:1;"></div><div style="padding:0 24px 50px;display:flex;flex-direction:column;gap:14px;">${btn(label, "primary")}${extra}</div>${homeIndicator()}`;
const obTitle = (title, sub = "") => `<div style="display:flex;flex-direction:column;gap:8px;padding:56px 24px 0;">${t(title, 30, C.text, 600, 36, "letter-spacing:-0.02em;")}${sub ? t(sub, 15, C.t2, 400, 22) : ""}</div>`;

const M33 = {
  id: "M33", name: "Onboarding · About you", col: 10, row: 1,
  body: `${statusBar()}${obTitle("About you")}
<div style="display:flex;flex-direction:column;gap:10px;padding:32px 24px 0;">${t("What are you studying?", 15, C.text, 600, 20)}<div style="height:48px;border-radius:10px;background:${C.s2};border:1.5px solid ${C.accent};display:flex;align-items:center;padding:0 14px;gap:1px;">${t("Physics, second year", 16, C.text, 400, 20)}<div style="width:1.5px;height:20px;background:${C.accent};"></div></div>
<div style="display:flex;gap:8px;flex-wrap:wrap;">${["Physics", "Engineering", "Medicine", "Economics", "Law", "Computer science"].map((s, i) => i === 0 ? `<div style="height:32px;padding:0 13px;border-radius:16px;background:#EDEDED;display:flex;align-items:center;">${t(s, 13, "#0A0A0A", 500, 16)}</div>` : chip(s)).join("")}</div></div>
<div style="display:flex;flex-direction:column;gap:10px;padding:30px 24px 0;">${t("Where does your material live?", 15, C.text, 600, 20)}
<div style="display:flex;gap:8px;flex-wrap:wrap;">${[["LMS", "lines", 1], ["PDFs", "doc", 1], ["YouTube", "fav:youtube", 1], ["Notes apps", "note", 0], ["Other", "plus", 0]].map(([l, i, on]) => `<div style="height:40px;padding:0 13px;border-radius:9px;border:1px solid ${on ? "#4A4A4A" : C.line2};background:${on ? C.s4 : "transparent"};display:flex;align-items:center;gap:8px;">${i.startsWith("fav:") ? fav(i.slice(4), 15) : ic(i, 15, on ? C.text : C.t2, 1.4)}${t(l, 14, on ? C.text : C.t2, on ? 500 : 400, 18)}</div>`).join("")}</div></div>
${obFooter()}`,
};

const wheel = () => {
  const rows = [["6:00", 0.25, 16], ["6:30", 0.5, 19], ["7:00", 1, 24], ["7:30", 0.5, 19], ["8:00", 0.25, 16]];
  return `<div layer-name="Time wheel" style="position:relative;display:flex;flex-direction:column;align-items:center;padding:40px 24px 0;">
  <div style="position:absolute;left:24px;right:24px;top:${40 + 2 * 44}px;height:44px;border-radius:10px;background:${C.s3};"></div>
  ${rows.map(([v, o, s], i) => `<div style="position:relative;height:44px;width:100%;display:flex;align-items:center;justify-content:center;gap:22px;opacity:${o};">${t(v, s, C.text, i === 2 ? 600 : 400, 28, "width:70px;text-align:right;")}${t(i === 2 ? "AM" : i === 3 ? "PM" : "", s, C.text, i === 2 ? 600 : 400, 28, "width:44px;")}</div>`).join("")}
</div>`;
};

const M34 = {
  id: "M34", name: "Onboarding · Your morning", col: 10, row: 2,
  body: `${statusBar()}${obTitle("Your morning", "Ruth will have your notes and questions ready by this time.")}${wheel()}${obFooter()}`,
};

const M35 = {
  id: "M35", name: "Onboarding · Notifications (mobile only)", col: 10, row: 3,
  body: `${statusBar()}${obTitle("Hear from Ruth", "A note when the overnight run is done, and when she needs you. Nothing else.")}
<div style="display:flex;flex-direction:column;gap:10px;padding:40px 24px 0;">
  ${[["Ruth finished 3 things overnight.", "Summary, quiz and revision notes for Thermodynamics.", "7:00 AM"], ["Ruth needs you", "Lecture 9 is password-protected. Enter it, or skip it?", "2:14 AM"]].map(([h, b, w], i) => `<div style="display:flex;gap:12px;padding:13px 14px;border-radius:18px;background:rgba(40,40,44,0.75);border:1px solid rgba(255,255,255,0.06);opacity:${i ? 0.6 : 1};"><div style="width:36px;height:36px;border-radius:9px;background:#151443;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic("moon", 18, "#E4EAFF", 1.4)}</div><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;"><div style="display:flex;justify-content:space-between;">${t("Avenire", 13, C.t2, 500, 17)}${t(w, 12, C.t3, 400, 16)}</div>${t(h, 15, C.text, 600, 20)}${t(b, 14, C.t2, 400, 19)}</div></div>`).join("")}
</div>
${obFooter("Turn on notifications", t("Not now", 15, C.t2, 400, 20, "text-align:center;"))}`,
};

const M36 = {
  id: "M36", name: "Onboarding · Capture is on your computer (replaces 23d–23i)", col: 10, row: 4,
  body: `${statusBar()}${obTitle("Capture on your computer", "Press ⌥C in Avenire for Mac or Windows to save the PDF, lecture or page you have open. It shows up here a moment later.")}
<div style="display:flex;flex-direction:column;align-items:center;gap:18px;padding:52px 24px 0;">
  <div style="display:flex;gap:8px;">${["⌥", "C"].map((k) => `<div style="height:56px;min-width:56px;padding:0 14px;border-radius:12px;background:${C.s3};border:1px solid #3A3A3A;border-bottom-width:3px;display:flex;align-items:center;justify-content:center;">${mono(k, 22, C.text)}</div>`).join("")}</div>
  <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;border:1px solid ${C.line};background:${C.s1};">${ic("laptop", 16, C.t2, 1.4)}${t("No computer signed in yet", 14, C.t2, 400, 18)}</div>
</div>
${obFooter("Continue", t("Email me the computer app", 15, C.t2, 400, 20, "text-align:center;"))}`,
};

const M37 = {
  id: "M37", name: "Onboarding · You're set", col: 10, row: 5, bg: "#0B0B0B",
  body: `<div layer-name="Mesh (dimmed)" style="position:absolute;left:0;top:0;right:0;bottom:0;background-image:url(${MESH_DIM});background-size:cover;background-position:30% 50%;"></div>
<div style="position:relative;display:flex;flex-direction:column;">${statusBar()}</div>
<div style="position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:0 32px 40px;">${t("You're set.", 34, C.text, 600, 40, "letter-spacing:-0.02em;")}${t("Ruth starts tonight. Your first morning report will be here at 7:00 AM.", 16, C.t2, 400, 23, "text-align:center;")}</div>
<div style="position:relative;padding:0 24px 50px;display:flex;flex-direction:column;">${btn("Open Avenire", "white")}</div>${homeIndicator("#FFFFFF")}`,
};

export default [M21, M22, M23, M24, M25, M26, M27, M28, M29, M30, M31, M32, M33, M34, M35, M36, M37];
