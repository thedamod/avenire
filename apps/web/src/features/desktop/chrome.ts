/**
 * Inline in the root layout's head, so the title bar row is reserved before first paint. Only
 * desktop windows whose native caption buttons overlay the page qualify: the frameless prompt
 * window has the bridge but no Window Controls Overlay. DesktopFrame repeats the check (the
 * bundled setup page cannot run inline scripts) and corrects it once the main process answers.
 */
export const desktopChromeScript =
  'try{var a=window.avenire,o=navigator.windowControlsOverlay;if(a&&o&&o.visible)document.documentElement.dataset.desktopChrome=a.platform||""}catch(e){}';
