---
name: anatomy-motion
description: Drive anatomy figures with a small truthful model, calm input response, and accessible controls.
---

# Anatomy motion

Use one state model for pose, labels, readout and caption. Treat pointer and keyboard as ways to set the *same* target. Ease the displayed state with `shown += (target-shown)*(1-Math.exp(-dt/0.12))`; clamp `dt` after tab inactivity. For physics use the `simulation` skill and math kit instead. Start from a legible settled pose, move only parts whose motion teaches the idea, and stop scheduling frames once motion settles. Pause when hidden or outside the viewport. Reduced motion should jump to the target state and keep controls usable.

Use native `<input type="range">` or buttons for the primary control. A draggable stage needs `tabindex="0"`, an appropriate `role="slider"`, `aria-valuemin/max/now`, a concise `aria-valuetext`, Arrow/Home/End handling, and visible focus. Call `setPointerCapture` on a *real* pointerdown only; release it on pointerup/cancel. If a demonstration tour exists, stop it at the first user action and do not fight the user. Speak discrete meaningful changes through an `aria-live="polite"` text node, not every frame. Keep all controls reachable at phone width.

Animate an exploded view only if it reveals the path of assembly or a hidden causal chain. Stagger parts so the outside leaves first, keep every connector attached to the moving group or show an intentional unplug, and check intermediate states. For one-shot light, use attack and decay envelopes; no abrupt phase or colour switch. Any shader should ease its uniforms and render only while active.

After writing HTML, call `preview_widget` at start, midpoint and endpoint; inspect the console, readout, clipping, focus and both themes. Test pointer and keyboard actions. Render only after the object and number agree.
