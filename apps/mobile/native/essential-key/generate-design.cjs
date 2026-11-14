const fs = require("node:fs/promises");
const path = require("node:path");

/** Share the real mobile tokens/font with native UI; no second palette to maintain. */
module.exports = async function generateDesign(projectRoot, res) {
  const { colors, tokens } = require(path.join(projectRoot, "src/theme/tokens.ts"));
  const names = {
    bg: "bg",
    surface: "surface-2",
    fg: "fg",
    muted: "fg-3",
    secondary: "fg-2",
    accent: "accent",
    on_accent: "on-accent",
    sky_blue: "sky-blue",
    sky_indigo: "sky-indigo",
    sky_purple: "sky-purple",
    amber: "amber",
    green: "green",
    error: "red",
  };
  const values = Object.entries(names).map(
    ([name, token]) => `  <color name="ava_${name}">${colors[token]}</color>`,
  );
  values.push(`  <dimen name="ava_composer_radius">${tokens.radius.composer}dp</dimen>`);
  await fs.mkdir(path.join(res, "values"), { recursive: true });
  await fs.mkdir(path.join(res, "font"), { recursive: true });
  await fs.writeFile(
    path.join(res, "values/essential_key_tokens.xml"),
    `<resources>\n${values.join("\n")}\n</resources>\n`,
  );
  await fs.copyFile(
    path.join(projectRoot, "assets/fonts/Geist-Variable.ttf"),
    path.join(res, "font/avenire_geist.ttf"),
  );
};
if (require.main === module)
  module.exports(path.resolve(__dirname, "../.."), process.argv[2]).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
