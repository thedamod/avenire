/** Environment adapter for pinned Figure shaders that cache their standalone build theme.
 * Source assets remain unchanged. Preserve current model/animation state on host theme changes. */
export function adaptFigureTheme(html: string): string {
  if (!html.includes("--figure-page")) return html;
  return html.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi,
    (whole, open: string, source: string, close: string) => {
      let event = "";
      if (source.includes("const LIGHT =") && source.includes("function paintPlume(")) {
        source = source.replace("const LIGHT =", "let LIGHT =");
        event = 'LIGHT=document.documentElement.dataset.theme==="light"?1:0;lastKey="";run();';
      } else if (source.includes("const LIGHT =") && source.includes("const backLayer =")) {
        source = source.replace("const LIGHT =", "let LIGHT =");
        event =
          'LIGHT=document.documentElement.dataset.theme==="light"?1:0;backLayer?.set({uLight:LIGHT});frontLayer?.set({uLight:LIGHT});paint();';
      } else if (
        source.includes("const pale =") &&
        source.includes("const FIXED = {") &&
        source.includes("const paperLayer =")
      ) {
        source = source
          .replace("const pale =", "let pale =")
          .replace("const FIXED = {", "const avenireFixed = () => ({")
          .replace(/};\s*const NAMES =/, "});\nconst FIXED = avenireFixed();\nconst NAMES =");
        event =
          'pale=document.documentElement.dataset.theme==="light";paperLayer?.set(avenireFixed());waterLayer?.set(avenireFixed());dirty=true;drawGl();run();';
      }
      return event
        ? open +
            source +
            '\nwindow.addEventListener("avenire:themechange",()=>{' +
            event +
            "});\n" +
            close
        : whole;
    },
  );
}
