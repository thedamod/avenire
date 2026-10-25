import {
  C, t, mono, ic, fav, swatch, nbTag, one, statusBar, glass, navBar, composerDock, capsule, btn, chip,
  underlineTabs, sectionHead, groupLabel, threadRow, divider, cover, nightArt, keyboard, workingPill,
  userBubble, ruthText, workedHeader, logRow, cite, homeIndicator, coverArt,
} from "./lib.mjs";

export const tabsHome = (active, counts = [5, 24, 61]) =>
  `<div style="padding-top:20px;display:flex;flex-direction:column;">${underlineTabs([["Notebooks", counts[0]], ["Notes", counts[1]], ["Sources", counts[2]]], active)}</div>`;

export const homeHeader = () =>
  `<div layer-name="Header" style="display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 16px 0 20px;flex-shrink:0;">${t("Avenire", 22, C.text, 600, 28, "letter-spacing:-0.02em;")}${glass("more")}</div>`;

export const homeComposer = () => composerDock({ placeholder: "Search or ask Ruth" });

function toast({ failed = false } = {}) {
  if (failed) {
    return `<div style="padding:8px 16px 0;display:flex;flex-shrink:0;"><div layer-name="Toast · failed run" style="flex:1;min-width:0;height:64px;border-radius:10px;border:1px solid ${C.line2};background:linear-gradient(135deg,#17171C 0%,#1C1C24 100%);display:flex;align-items:center;gap:12px;padding:0 14px;">
  <div style="width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic("moon", 16, C.t2, 1.4)}</div>
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">${t("Last night's run didn't finish.", 14, C.text, 500, 18, one)}${t("Two PDFs wouldn't open. Nothing changed.", 12, C.t2, 400, 16, one)}</div>
  ${t("Details", 13, C.text, 500, 16, "flex-shrink:0;")}
</div></div>`;
  }
  return `<div style="padding:8px 16px 0;display:flex;flex-shrink:0;"><div layer-name="Toast · morning report" style="position:relative;flex:1;min-width:0;height:64px;border-radius:10px;overflow:hidden;border:1px solid #C8D7FF29;box-shadow:0 0 28px #5165D833;background:#151443;display:flex;align-items:center;gap:12px;padding:0 14px;">
  ${nightArt(358, 64)}
  <div style="position:relative;width:30px;height:30px;border-radius:8px;background:#E4EAFF1A;border:1px solid #E4EAFF24;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic("moon", 16, "#E4EAFF", 1.4)}</div>
  <div style="position:relative;flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">${t("Ruth finished 3 things overnight.", 14, "#F4F6FF", 500, 18, one)}${t("Summary, quiz and revision notes", 12, "#C8D0F0", 400, 16, one)}</div>
  <div style="position:relative;display:flex;">${ic("chevR", 16, "#F4F6FF", 1.6)}</div>
</div></div>`;
}

export const shelf = () =>
  `<div layer-name="Notebook shelf" style="display:flex;gap:12px;padding:16px 20px 0;overflow:hidden;flex-shrink:0;">
  <div style="width:120px;height:156px;flex-shrink:0;border:1px dashed ${C.line2};border-radius:3px 8px 8px 3px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">${ic("plus", 18, C.t2, 1.4)}${t("New notebook", 12, C.t3, 400, 16)}</div>
  ${cover("thermo")}${cover("ethics")}${cover("options")}
</div>`;

const nbLead = (color) => `<div style="width:16px;display:flex;justify-content:center;flex-shrink:0;">${swatch(color)}</div>`;
const cloudLead = () => ic("cloud", 15, C.accent, 1.5);

function chatRows({ failed = false } = {}) {
  return [
    failed
      ? threadRow({ lead: nbLead(C.nb.thermo), meta: "Thermodynamics", right: "Didn't finish", rightColor: C.red, titleLead: cloudLead(), title: "Overnight: summary and quiz" })
      : threadRow({ lead: nbLead(C.nb.thermo), meta: "Thermodynamics", right: "Today", titleLead: cloudLead(), title: "Overnight: summary, quiz and revision notes" }),
    divider(),
    threadRow({ lead: nbLead(C.nb.thermo), meta: "Thermodynamics", right: "Yesterday", title: "Why does entropy only go up?" }),
    divider(),
    threadRow({ lead: nbLead(C.nb.ethics), meta: "Ethics Project", right: "2d ago", title: "Is lying ever allowed? Kant vs. Mill" }),
    divider(),
    threadRow({ lead: nbLead(C.nb.research), meta: "Research Reading", right: "3d ago", titleLead: cloudLead(), title: "Overnight: filed 7 captures into notebooks" }),
  ].join("");
}

// ---------------------------------------------------------------- read me
const readme = {
  id: "M00", name: "Mobile · how it maps from desktop", col: 0, row: 0, w: 480, h: 1180,
  body: `<div style="display:flex;flex-direction:column;gap:28px;padding:48px 40px;">
  <div style="display:flex;flex-direction:column;gap:8px;">${t("Avenire on a phone", 28, C.text, 600, 34, "letter-spacing:-0.02em;")}${t("Every desktop interaction, one column wide. Navigation copies t3code mobile.", 15, C.t2, 400, 22)}</div>
  ${[
    ["Navigation", [
      "No sidebar. Home is the root list; notebooks, notes, chats and tasks open on top of it with a back button (t3code's compact layout, where the sidebar list becomes the home screen).",
      "Glass header: back · title + subtitle · one or two trailing buttons. More actions live in the ⋯ menu.",
      "Anything in the desktop right pane (summary, quiz, revision, widget, cited PDF, video or image) opens as a sheet over the chat with the same tabs. Citations open at half height so the answer stays visible; outputs open at full height.",
    ]],
    ["Composer", [
      "One capsule at rest: attach · text · dictate · send (t3code). It grows into the full composer with Ruth / notebook / time controls when focused.",
      "File changes and run errors attach above the capsule as a banner. Mid-chat approvals dock above it as a card; Ruth's questions replace it.",
      "Search vs Ask Ruth is two buttons on the focused composer instead of ⌘ Enter / Enter.",
    ]],
    ["Selection", [
      "Long-press a row to select. The icon-only dock takes the composer's place; moves open a sheet of notebooks.",
    ]],
    ["Not on mobile, and what covers for it", [
      "Capture (⌥C, the capture toast, 'Press ⌥C anywhere'). Sources still sync from the computer. On the phone you see them, file them, and fix the ones that need you. The empty state and onboarding point to the computer app instead.",
      "Ruth anywhere (⌥ Space, the ephemeral corner answer). Ask Ruth lives in the home composer and answers as a normal chat with Save to notebook and Copy.",
      "Hotkey and window-access permissions, shortcut setup, connected folders and the WebDAV drive. Shown read-only in Settings, managed on the computer.",
    ]],
    ["Added for mobile", [
      "Notifications: the morning report and 'Ruth needs you' arrive as push. One permission screen in onboarding and two toggles in Settings.",
    ]],
  ].map(([head, items]) => `<div style="display:flex;flex-direction:column;gap:10px;">${t(head, 15, C.text, 600, 20)}${items.map((s) => `<div style="display:flex;gap:10px;"><div style="padding-top:9px;display:flex;flex-shrink:0;"><div style="width:4px;height:4px;border-radius:2px;background:${C.t3};"></div></div>${t(s, 14, C.t2, 400, 21, "flex:1;")}</div>`).join("")}</div>`).join("")}
</div>`,
};

// ---------------------------------------------------------------- Home
const M01 = {
  id: "M01", name: "Home · morning toast", col: 1, row: 0,
  body: `${statusBar()}${homeHeader()}${toast()}${tabsHome(0)}${shelf()}${sectionHead("Chats and Tasks", "See all", { pad: "26px 20px 4px" })}${chatRows()}${homeComposer()}`,
};

const M02 = {
  id: "M02", name: "Home · failed overnight run", col: 1, row: 1,
  body: `${statusBar()}${homeHeader()}${toast({ failed: true })}${tabsHome(0)}${shelf()}${sectionHead("Chats and Tasks", "See all", { pad: "26px 20px 4px" })}${chatRows({ failed: true })}${homeComposer()}`,
};

function noteRow(title, snippet, nb, color, when, { ruth = false } = {}) {
  return `<div style="display:flex;flex-direction:column;gap:3px;padding:12px 20px;flex-shrink:0;">
  <div style="display:flex;align-items:baseline;gap:8px;">${t(title, 16, C.text, 500, 21, "flex:1;min-width:0;" + one)}${t(when, 12, C.t3, 400, 16, "flex-shrink:0;")}</div>
  ${t(snippet, 14, C.t2, 400, 20, one)}
  <div style="display:flex;align-items:center;gap:8px;padding-top:2px;">${nbTag(nb, color, 12, C.t3)}${ruth ? `${t("·", 12, C.t3, 400, 16)}${t("Written by Ruth", 12, C.accentText, 400, 16)}` : ""}</div>
</div>`;
}

const M03 = {
  id: "M03", name: "Home · Notes tab (quiet day, no toast)", col: 1, row: 2,
  body: `${statusBar()}${homeHeader()}${tabsHome(1)}
<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px 4px 20px;flex-shrink:0;">${t("Sorted by last edited", 13, C.t3, 400, 18)}${btn("New note", "secondary", { h: 32, icon: "plus", size: 13 })}</div>
${noteRow("Entropy and the second law", "An isolated system's entropy never decreases.", "Thermodynamics", C.nb.thermo, "2h ago", { ruth: true })}${divider()}
${noteRow("Black-Scholes assumptions", "Constant volatility, no dividends, frictionless markets.", "Options Pricing", C.nb.options, "Yesterday")}${divider()}
${noteRow("Reading notes: utilitarianism", "Mill: the right act is the one that produces the most happiness.", "Ethics Project", C.nb.ethics, "3d ago")}${divider()}
${noteRow("Carnot cycle, step by step", "Two isotherms and two adiabats.", "Thermodynamics", C.nb.thermo, "4d ago", { ruth: true })}${divider()}
${noteRow("Lecture 6 notes", "Heat engines vs. refrigerators. Ask why COP can exceed 1.", "Thermodynamics", C.nb.thermo, "6d ago")}
${homeComposer()}`,
};

const filterChips = (active = 1) =>
  `<div layer-name="Filters" style="display:flex;gap:8px;padding:14px 20px 4px;overflow:hidden;flex-shrink:0;">
  ${chip("All", { active: active === 0 })}${chip("Unfiled", { active: active === 1, count: 4 })}${chip("", { lead: ic("doc", 15, C.t2, 1.4) })}${chip("", { lead: ic("video", 15, C.t2, 1.4) })}${chip("", { lead: ic("globe", 15, C.t2, 1.4) })}${chip("", { lead: ic("image", 15, C.t2, 1.4) })}
</div>`;

function sourceRow({ icon, title, meta, guess = "", accepted = false, right = "", selected = null }) {
  return `<div style="display:flex;align-items:center;gap:12px;padding:12px 20px;flex-shrink:0;">
  ${selected !== null ? `<div style="display:flex;">${selected ? `<div style="width:22px;height:22px;border-radius:11px;background:${C.accent};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic("check", 13, C.onAccent, 2)}</div>` : `<div style="width:22px;height:22px;border-radius:11px;border:1.5px solid ${C.line2};flex-shrink:0;"></div>`}</div>` : ""}
  <div style="width:32px;height:32px;border-radius:8px;background:${C.s2};border:1px solid ${C.line};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${fav(icon, 16)}</div>
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">${t(title, 15, C.text, 500, 20, one)}${t(meta, 12, C.t3, 400, 16, one)}
    ${guess ? `<div style="display:flex;align-items:center;gap:6px;padding-top:4px;">${swatch(C.nb.thermo)}${t(guess, 12, C.t2, 400, 16)}</div>` : ""}</div>
  ${accepted ? `<div style="width:32px;height:32px;border-radius:16px;background:${C.accentTint};border:1px solid ${C.accentLine};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic("check", 14, C.accentText, 1.8)}</div>` : ""}
  ${right ? t(right, 12, C.t3, 400, 16, "flex-shrink:0;") : ""}
</div>`;
}

const M04 = {
  id: "M04", name: "Home · Sources › Unfiled (synced from computer)", col: 1, row: 3,
  body: `${statusBar()}${homeHeader()}${tabsHome(2)}${filterChips(1)}
${groupLabel("Just captured on your MacBook · 3", { pad: "14px 20px 2px" })}
${sourceRow({ icon: "doc", title: "Lecture 8 · Heat engines.pdf", meta: "canvas.university.edu · 24 pages", guess: "Ruth thinks: Thermodynamics", accepted: true })}${divider(64)}
${sourceRow({ icon: "youtube", title: "MIT 5.60 L9 · Entropy", meta: "YouTube · 48 min · saved at 18:40", guess: "Ruth thinks: Thermodynamics", accepted: true })}${divider(64)}
${sourceRow({ icon: "wiki", title: "Carnot cycle · Wikipedia", meta: "en.wikipedia.org · 9 min read", guess: "Ruth thinks: Thermodynamics", right: "Just now" })}
${groupLabel("Earlier · 1", { pad: "18px 20px 2px" })}
${sourceRow({ icon: "image", title: "Whiteboard · Tuesday study group", meta: "Photo · handwriting read · no guess yet", right: "2d ago" })}
${homeComposer()}`,
};

function progressRow(icon, title, status, pct, eta) {
  return `<div style="display:flex;align-items:center;gap:12px;padding:12px 20px;flex-shrink:0;">
  <div style="width:32px;height:32px;border-radius:8px;background:${C.s2};border:1px solid ${C.line};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${fav(icon, 16)}</div>
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;">
    <div style="display:flex;align-items:baseline;gap:8px;">${t(title, 15, C.text, 500, 20, "flex:1;min-width:0;" + one)}${t(eta, 12, C.t3, 400, 16, "flex-shrink:0;")}</div>
    <div style="height:2px;border-radius:1px;background:${C.line2};display:flex;"><div style="width:${pct}%;height:2px;border-radius:1px;background:${C.text};"></div></div>
    ${t(status, 12, C.t3, 400, 16)}
  </div>
</div>`;
}

function needsRow(icon, title, problem, primary, secondary, color = C.red) {
  return `<div style="display:flex;gap:12px;padding:12px 20px 14px;flex-shrink:0;">
  <div style="width:32px;height:32px;border-radius:8px;background:${C.s2};border:1px solid ${C.line};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${fav(icon, 16)}</div>
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">
    ${t(title, 15, C.text, 500, 20, one)}${t(problem, 13, color, 400, 18)}
    <div style="display:flex;gap:8px;padding-top:8px;">${btn(primary, "secondary", { h: 32, size: 13 })}${btn(secondary, "ghost", { h: 32, size: 13 })}</div>
  </div>
</div>`;
}

const M05 = {
  id: "M05", name: "Home · Sources › processing and needs you", col: 1, row: 4,
  body: `${statusBar()}${homeHeader()}${tabsHome(2)}${filterChips(0)}
${groupLabel("Processing · 2", { pad: "14px 20px 0" })}
${progressRow("doc", "Problem set 4.pdf", "Reading page 14 of 38", 37, "about 20s")}
${progressRow("youtube", "MIT 5.60 L10 · Free energy", "Transcribing · 31 of 52 min", 60, "about 1 min")}
${groupLabel("Needs you · 3", { pad: "16px 20px 0" })}
${needsRow("doc", "Lab manual (protected).pdf", "Couldn't open it. The file is password-protected.", "Enter password", "Remove")}${divider(64)}
${needsRow("nature", "The arrow of time in open systems", "Behind a paywall. Saved the title and abstract only.", "Open in browser", "Keep", C.amber)}${divider(64)}
${needsRow("canvas", "Week 9 · Quiz review", "Needs your Canvas login. Capture it again on your computer with logged-in capture on.", "Remind me there", "Remove", C.amber)}
${homeComposer()}`,
};

const M06 = {
  id: "M06", name: "Home · empty (first run, capture lives on the computer)", col: 1, row: 5,
  body: `${statusBar()}${homeHeader()}${tabsHome(0, [0, 0, 0])}
<div style="display:flex;flex-direction:column;padding:16px 20px 0;gap:0;flex-shrink:0;">
  <div style="border:1px solid ${C.line};border-radius:10px;display:flex;flex-direction:column;">
    ${[
      ["01", `<div style="display:flex;gap:4px;">${["⌥", "C"].map((k) => `<div style="height:24px;min-width:24px;padding:0 7px;border-radius:6px;background:${C.s3};border:1px solid #3A3A3A;border-bottom-width:2px;display:flex;align-items:center;justify-content:center;">${mono(k, 11.5, C.text)}</div>`).join("")}</div>`, "Capture on your computer", "Press ⌥C in Avenire for Mac or Windows. PDFs, lecture videos and pages land in Sources here."],
      ["02", `<div style="display:flex;gap:3px;">${swatch(C.nb.thermo, 10, 14)}${swatch(C.nb.ethics, 10, 14)}${swatch(C.nb.ochem, 10, 14)}</div>`, "Make a notebook per course", "Or leave things unfiled. Ruth can sort them tonight."],
      ["03", `<div style="display:flex;"><div style="height:24px;padding:0 10px;border-radius:12px;background:#1A2236;display:flex;align-items:center;">${t("Ask Ruth", 12, C.accentText, 500, 16)}</div></div>`, "Ask about any of it", "Answers cite the exact page or minute."],
    ].map(([n, art, head, body], i) => `<div style="display:flex;gap:14px;padding:16px;${i ? `border-top:1px solid ${C.line};` : ""}">${mono(n, 11, C.t3, "width:18px;flex-shrink:0;padding-top:2px;")}<div style="flex:1;display:flex;flex-direction:column;gap:8px;">${art}${t(head, 15, C.text, 600, 20)}${t(body, 13, C.t2, 400, 19)}</div></div>`).join("")}
  </div>
  <div style="display:flex;flex-direction:column;gap:6px;padding-top:12px;">${btn("New notebook", "secondary", { icon: "plus" })}${btn("Get Avenire for your computer", "ghost", { icon: "laptop", size: 14 })}</div>
</div>
${sectionHead("Chats and Tasks", "", { pad: "26px 20px 8px" })}
<div style="padding:0 20px;display:flex;"><div style="flex:1;border:1px dashed ${C.line2};border-radius:10px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:4px;">${t("No chats or tasks yet.", 14, C.t2, 500, 18)}${t("Ask Ruth below, or leave her a task for tonight.", 13, C.t3, 400, 18, "text-align:center;")}</div></div>
${homeComposer()}`,
};

// ---------------------------------------------------------------- Search & Ask (replaces ⌘ Enter + ⌥ Space)
function thumb(kind) {
  const base = "width:60px;height:76px;border-radius:6px;flex-shrink:0;position:relative;overflow:hidden;display:flex;flex-direction:column;";
  if (kind === "pdf" || kind === "wiki") {
    const hl = kind === "pdf" ? `<div style="width:44px;height:10px;background:#C9D6F8;border-radius:1px;"></div>` : `<div style="width:30px;height:16px;border:1px solid #CFCFCF;align-self:flex-end;"></div>`;
    return `<div style="${base}background:#F3F2EC;padding:8px 7px;gap:4px;"><div style="width:30px;height:3px;background:#1A1A1A;border-radius:1px;"></div><div style="width:46px;height:1.5px;background:#BDBDB5;"></div><div style="width:40px;height:1.5px;background:#BDBDB5;"></div>${hl}<div style="width:44px;height:1.5px;background:#BDBDB5;"></div><div style="width:36px;height:1.5px;background:#BDBDB5;"></div><div style="width:46px;height:12px;border:1px solid #D2D2CB;"></div></div>`;
  }
  if (kind === "video") {
    return `<div style="${base}background:#141418;align-items:center;justify-content:center;"><div style="width:46px;height:30px;background:#26402E;border:2px solid #5A4630;display:flex;flex-direction:column;gap:3px;padding:5px;"><div style="width:20px;height:1.5px;background:#DADADA;"></div><div style="width:14px;height:1.5px;background:#DADADA;"></div></div><div style="position:absolute;right:4px;bottom:4px;padding:1px 4px;border-radius:3px;background:#000000CC;">${mono("18:40", 9, "#fff")}</div></div>`;
  }
  return `<div style="${base}background:${C.s2};border:1px solid ${C.line};align-items:center;justify-content:center;">${ic("note", 18, C.t3, 1.3)}</div>`;
}
function resultRow(kind, icon, title, where, snippet) {
  return `<div style="display:flex;gap:12px;padding:12px 20px;flex-shrink:0;">${thumb(kind)}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">
  <div style="display:flex;align-items:center;gap:7px;">${fav(icon, 15)}${t(title, 15, C.text, 600, 20, "flex:1;min-width:0;" + one)}</div>
  ${t(where, 12, C.t3, 400, 16)}${t(snippet, 13, C.t2, 400, 18, "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;")}
</div></div>`;
}

const focusedComposer = (text, { placeholder = false } = {}) =>
  `<div layer-name="Composer · focused" style="position:absolute;left:0;right:0;bottom:256px;padding:10px 12px 8px;display:flex;flex-direction:column;background:linear-gradient(180deg, rgba(11,11,11,0) 0%, #0B0B0B 30%);">
  <div style="border-radius:24px;background:rgba(20,20,20,0.92);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.08);box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);display:flex;flex-direction:column;padding:14px 8px 8px;gap:10px;">
    <div style="display:flex;align-items:center;gap:2px;padding:0 8px;"><div style="width:1.5px;height:20px;background:${C.accent};flex-shrink:0;"></div>${t(text, 16, placeholder ? C.t3 : C.text, 400, 22, one)}</div>
    <div style="display:flex;align-items:center;gap:4px;">
      <div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;">${ic("plus", 18, C.t2, 1.6)}</div>
      <div style="height:30px;padding:0 10px;border-radius:15px;border:1px solid ${C.line2};display:flex;align-items:center;gap:6px;">${ic("folder", 13, C.t2, 1.4)}${t("All notebooks", 13, C.t2, 400, 16, "white-space:nowrap;")}${ic("chevD", 10, C.t3, 1.4)}</div>
      <div style="flex:1;"></div>
      <div style="height:34px;padding:0 12px;border-radius:17px;display:flex;align-items:center;gap:6px;">${t("Search", 14, C.t2, 500, 18, "white-space:nowrap;")}</div>
      <div style="height:34px;padding:0 14px;border-radius:17px;background:${C.accent};display:flex;align-items:center;">${t("Ask Ruth", 14, C.onAccent, 600, 18, "white-space:nowrap;")}</div>
    </div>
  </div>
</div>`;

const M07 = {
  id: "M07", name: "Search results vs Ask Ruth (composer focused)", col: 2, row: 0,
  body: `${statusBar()}
<div style="display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 20px;flex-shrink:0;">${t("5 matching files", 13, C.t3, 400, 18)}${t("Cancel", 15, C.text, 500, 20)}</div>
${resultRow("pdf", "doc", "Lecture 8 · Heat engines.pdf", "Page 11", "8.5 No engine beats Carnot. Suppose an engine X had η_X > η_C. Use its work to drive a Carnot engine in reverse.")}
${resultRow("video", "youtube", "MIT 5.60 L9 · Entropy", "18:40 – 19:10", "“…take the better engine, use its work to run Carnot backwards, and look at the net heat.”")}
${resultRow("wiki", "wiki", "Carnot cycle · Wikipedia", "§ Carnot's theorem", "“…no engine operating between two heat reservoirs can be more efficient than a Carnot engine…”")}
${focusedComposer("why can't an engine beat carnot")}
${keyboard()}`,
};

const M08 = {
  id: "M08", name: "Ask Ruth from home · streaming (replaces ⌥ Space)", col: 2, row: 1,
  body: `${statusBar()}${navBar({ title: "Why can't an engine beat Carnot?", sub: "All notebooks", right: ["more"] })}
<div style="display:flex;flex-direction:column;gap:14px;padding:12px 20px 0;">
  ${userBubble("why can't an engine beat carnot")}
  ${workedHeader("Working for 4s")}
  <div style="display:flex;flex-direction:column;">${logRow("search", "Searched 5 files across your notebooks", { chevron: true })}${logRow("doc", "Reading Lecture 8 · Heat engines.pdf, p.11", { chevron: false, iconColor: C.accent })}</div>
  ${ruthText("Because beating it would let you break the second law. Hook a “better” engine to a Carnot engine running backwards and the pair would move heat from cold to hot with nothing else changing.")}
  <div style="display:flex;gap:6px;flex-wrap:wrap;">${cite("Lecture 8 · p.11")}${cite("MIT 5.60 L9 · 18:40", "fav:youtube")}</div>
  ${ruthText("So every engine between the same two reservoirs is capped at", "color:#EDEDED;opacity:0.55;")}
</div>
${workingPill("Working 4s", { bottom: 104 })}
${composerDock({ placeholder: "Ask a follow-up" })}`,
};

const M08b = {
  id: "M08b", name: "Ask Ruth from home · answer, save to notebook", col: 2, row: 2,
  body: `${statusBar()}${navBar({ title: "Why can't an engine beat Carnot?", sub: "All notebooks", right: ["more"] })}
<div style="display:flex;flex-direction:column;gap:14px;padding:12px 20px 0;">
  ${userBubble("why can't an engine beat carnot")}
  ${workedHeader("Worked for 9s")}
  ${ruthText("Because beating it would let you break the second law. Hook a “better” engine to a Carnot engine running backwards and the pair would move heat from cold to hot with nothing else changing.")}
  <div style="display:flex;gap:6px;flex-wrap:wrap;">${cite("Lecture 8 · p.11")}${cite("MIT 5.60 L9 · 18:40", "fav:youtube")}</div>
  ${ruthText("So every engine between the same two reservoirs is capped at η = 1 − Tc/Th, and real ones fall short because friction makes each step irreversible.")}
  <div layer-name="Answer actions" style="display:flex;align-items:center;gap:18px;padding-top:2px;">
    <div style="display:flex;align-items:center;gap:6px;">${ic("save", 15, C.accentText, 1.4)}${t("Save to notebook", 14, C.accentText, 500, 18)}</div>
    <div style="display:flex;align-items:center;gap:6px;">${ic("copy", 15, C.t2, 1.4)}${t("Copy", 14, C.t2, 400, 18)}</div>
  </div>
</div>
<div layer-name="Dim" style="position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.5);"></div>
<div layer-name="Save sheet" style="position:absolute;left:0;right:0;bottom:0;background:${C.sheet};border-radius:24px 24px 0 0;border-top:1px solid #2A2A2A;display:flex;flex-direction:column;padding-bottom:34px;">
  <div style="display:flex;justify-content:center;padding:7px 0;"><div style="width:36px;height:5px;border-radius:3px;background:#3A3A3A;"></div></div>
  <div style="padding:6px 20px 12px;display:flex;flex-direction:column;gap:2px;">${t("Save to notebook", 18, C.text, 600, 24)}${t("Saved as a note with its citations.", 13, C.t3, 400, 18)}</div>
  ${[["thermo", "Thermodynamics", "Ruth's guess"], ["research", "Research Reading", ""], ["ethics", "Ethics Project", ""]].map(([k, n, g], i) => `<div style="display:flex;align-items:center;gap:12px;height:52px;padding:0 20px;${i === 0 ? `background:${C.s3};` : ""}">${swatch(C.nb[k], 10, 13)}${t(n, 16, C.text, i === 0 ? 500 : 400, 20, "flex:1;")}${g ? t(g, 12, C.t3, 400, 16) : ""}${i === 0 ? ic("check", 16, C.accent, 1.8) : ""}</div>`).join("")}
  <div style="display:flex;align-items:center;gap:12px;height:52px;padding:0 20px;">${ic("plus", 14, C.t2, 1.5)}${t("New notebook…", 16, C.t2, 400, 20)}</div>
  <div style="padding:8px 20px 0;display:flex;">${btn("Save note", "primary", { grow: true })}</div>
  ${homeIndicator()}
</div>`,
};

// ---------------------------------------------------------------- Notebook + note
function nbNote(title, when, snippet, meta, ruth = false) {
  return `<div style="display:flex;flex-direction:column;gap:4px;padding:12px 20px;flex-shrink:0;">
  <div style="display:flex;align-items:baseline;gap:8px;">${t(title, 16, C.text, 600, 21, "flex:1;min-width:0;" + one)}${t(when, 12, C.t3, 400, 16)}</div>
  ${t(snippet, 14, C.t2, 400, 20, "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;")}
  ${t(meta, 12, ruth ? C.accentText : C.t3, 400, 16)}
</div>`;
}
function srcCard(icon, title, meta) {
  return `<div style="width:150px;height:118px;flex-shrink:0;border:1px solid ${C.line};border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;background:${C.s1};">${fav(icon, 16)}${t(title, 14, C.text, 500, 18, "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;")}<div style="flex:1;"></div>${t(meta, 12, C.t3, 400, 16, one)}</div>`;
}

const M09 = {
  id: "M09", name: "Notebook · Thermodynamics", col: 3, row: 0,
  body: `${statusBar()}${navBar({ right: [{ icon: "search" }, "more"] })}
<div style="display:flex;align-items:flex-end;gap:16px;padding:8px 20px 4px;flex-shrink:0;">${cover("thermo", { w: 64, h: 84, title: false, meta: false, art: 44 })}<div style="display:flex;flex-direction:column;gap:4px;padding-bottom:2px;">${t("Thermodynamics", 26, C.text, 600, 32, "letter-spacing:-0.02em;")}${t("9 notes · 22 sources · edited 2h ago", 13, C.t3, 400, 18)}</div></div>
<div style="display:flex;align-items:center;justify-content:space-between;padding:22px 16px 4px 20px;flex-shrink:0;"><div style="display:flex;align-items:baseline;gap:6px;">${t("Notes", 15, C.text, 600, 20)}${t("9", 13, C.t3, 400, 20)}</div>${btn("New note", "secondary", { h: 32, icon: "plus", size: 13 })}</div>
${nbNote("Entropy and the second law", "2h ago", "The entropy of an isolated system never decreases. It stays constant only for a reversible process, so dS ≥ δQ/T.", "Written by Ruth · 3 sources", true)}${divider()}
${nbNote("Carnot cycle, step by step", "4d ago", "Two isotherms and two adiabats. Efficiency depends only on the reservoir temperatures: η = 1 − Tc/Th.", "Saved from a chat · 2 sources")}${divider()}
${nbNote("Lecture 6 notes", "6d ago", "Heat engines vs. refrigerators. Ask in office hours why COP can exceed 1.", "Your note")}
${sectionHead("Sources · 22", "View all", { pad: "20px 20px 10px" })}
<div style="display:flex;gap:10px;padding:0 20px;overflow:hidden;flex-shrink:0;">${srcCard("doc", "Lecture 7 · Entropy and the Clausius inequality", "Course site · 38 pages")}${srcCard("arxiv", "The statistical origin of irreversibility", "arXiv · 12 pages")}${srcCard("youtube", "Entropy, explained · Lecture 7", "YouTube · 42 min")}</div>
${composerDock({ placeholder: "Search this notebook or ask" })}`,
};

const M10 = {
  id: "M10", name: "Note · Entropy and the second law", col: 3, row: 1,
  body: `${statusBar()}${navBar({ title: "", sub: "", right: [{ icon: "more" }] })}
<div style="display:flex;flex-direction:column;padding:4px 20px 0;gap:0;">
  <div style="display:flex;align-items:center;gap:6px;padding-bottom:8px;">${swatch(C.nb.thermo)}${t("Thermodynamics", 13, C.t2, 400, 18)}</div>
  ${t("Entropy and the second law", 26, C.text, 600, 32, "letter-spacing:-0.02em;")}
  ${t("Written by Ruth overnight · edited by you 2h ago · 3 sources", 12, C.t3, 400, 16, "padding-top:6px;")}
  <div style="display:flex;flex-direction:column;gap:6px;padding:22px 0 10px;border-bottom:1px solid ${C.line};">${t("What entropy measures", 18, C.text, 600, 24)}</div>
  ${t("Entropy counts how many microscopic arrangements are consistent with what you can observe. A gas spread through a box has vastly more arrangements than the same gas packed in a corner, which is why it spreads and never gathers back.", 16, C.text, 400, 26, "padding-top:12px;")}
  ${t("• State function: ΔS depends only on the start and end states, so you can compute it along any reversible path.", 16, C.text, 400, 26, "padding-top:12px;")}
  ${t("• Second law: for an isolated system, ΔS ≥ 0. Use dS ≥ δQ/T for anything else.", 16, C.text, 400, 26, "padding-top:10px;")}
  ${t("• My question for office hours: why can a refrigerator's COP be bigger than 1?", 16, C.text, 400, 26, "padding-top:10px;")}
  <div style="display:flex;flex-direction:column;padding:22px 0 10px;border-bottom:1px solid ${C.line};">${t("The Clausius inequality", 18, C.text, 600, 24)}</div>
</div>
${composerDock({ placeholder: "Ask about this note, or tell Ruth what to add", strip: noteStrip() })}`,
};
function noteStrip() {
  return `<div style="padding:0 22px;display:flex;flex-shrink:0;"><div layer-name="Context strip" style="flex:1;display:flex;align-items:center;padding:0 6px;border:1px solid ${C.line};border-top:none;border-radius:0 0 14px 14px;background:rgba(17,17,17,0.9);">${[["moon", "Ruth"], ["sw", "This note"], ["clock", "Now"]].map(([i, l]) => `<div style="display:flex;align-items:center;gap:5px;height:28px;padding:0 8px;">${i === "sw" ? swatch(C.nb.thermo) : ic(i, 13, C.t2, 1.4)}${t(l, 12, C.t2, 400, 16)}${ic("chevD", 10, C.t3, 1.4)}</div>`).join(`<div style="width:1px;height:12px;background:${C.line2};flex-shrink:0;"></div>`)}</div></div>`;
}

const M11 = {
  id: "M11", name: "New notebook (sheet)", col: 3, row: 2,
  body: `${statusBar()}${homeHeader()}${tabsHome(0)}${shelf()}
${newNotebookSheet()}`,
};
function newNotebookSheet() {
  const colors = ["#2B9BD8", "#EF4579", "#18803A", "#D9A50D", "#B48BF2", "#E8842C", "#9BE04A", "#B03BD6", "#3A3A3A", "#DADADA"];
  const drawings = ["stat", "ochem", "ethics", "thermo", "options", "research", "none"];
  return `<div layer-name="Dim" style="position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.55);"></div>
<div layer-name="Sheet · New notebook" style="position:absolute;left:0;right:0;top:64px;bottom:0;background:${C.sheet};border-radius:24px 24px 0 0;border-top:1px solid #2A2A2A;display:flex;flex-direction:column;">
  <div style="display:flex;justify-content:center;padding:7px 0;"><div style="width:36px;height:5px;border-radius:3px;background:#3A3A3A;"></div></div>
  <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 16px 0 20px;">${t("New notebook", 18, C.text, 600, 24)}${glass("close", { size: 34 })}</div>
  <div style="display:flex;justify-content:center;padding:18px 0 22px;">${cover("stat", { w: 132, h: 172, art: 76 })}</div>
  <div style="display:flex;flex-direction:column;gap:8px;padding:0 20px;">${t("Name", 13, C.text, 500, 18)}
    <div style="height:44px;border-radius:10px;background:${C.s2};border:1.5px solid ${C.accent};display:flex;align-items:center;padding:0 12px;gap:1px;">${t("Statistical Mechanics", 16, C.text, 400, 20)}<div style="width:1.5px;height:20px;background:${C.accent};"></div></div></div>
  <div style="display:flex;flex-direction:column;gap:10px;padding:20px 20px 0;">${t("Colour", 13, C.text, 500, 18)}
    <div style="display:flex;gap:8px;">${colors.map((c, i) => `<div style="width:28px;height:28px;border-radius:14px;background:${c};flex-shrink:0;${i === 4 ? `box-shadow:0 0 0 2px ${C.sheet}, 0 0 0 3.5px #EDEDED;` : ""}"></div>`).join("")}</div></div>
  <div style="display:flex;flex-direction:column;gap:10px;padding:20px 20px 0;">${t("Cover drawing", 13, C.text, 500, 18)}
    <div style="display:flex;gap:8px;">${drawings.map((d, i) => `<div style="width:44px;height:44px;border-radius:8px;border:1px ${d === "none" ? "dashed" : "solid"} ${i === 0 ? C.text : C.line2};${i === 0 ? `background:${C.s4};` : ""}display:flex;align-items:center;justify-content:center;flex-shrink:0;">${d === "none" ? t("None", 11, C.t2, 400, 14) : coverArt(d, 32, i === 0 ? C.text : C.t2)}</div>`).join("")}</div></div>
  <div style="flex:1;"></div>
  <div style="display:flex;flex-direction:column;gap:12px;padding:0 20px 42px;">${t("Ruth can file new captures here automatically.", 12, C.t3, 400, 16, "text-align:center;")}${btn("Create notebook", "primary")}</div>
  ${homeIndicator()}
</div>`;
}

export default [readme, M01, M02, M03, M04, M05, M06, M07, M08, M08b, M09, M10, M11];
