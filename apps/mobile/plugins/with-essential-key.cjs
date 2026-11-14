const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  withAppBuildGradle,
} = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

const namespace = "com.thedamod.avenire.essentialkey";
const ownedActivities = ["KeyInputActivity", "AvaActivity"];
const generateDesign = require("../native/essential-key/generate-design.cjs");
module.exports = function withEssentialKey(config, { enabled = false } = {}) {
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.service = (app.service ?? []).filter(
      (s) =>
        ![`${namespace}.EssentialKeyService`, `${namespace}.AvaTaskService`].includes(
          s.$["android:name"],
        ),
    );
    app.activity = (app.activity ?? []).filter(
      (a) => !ownedActivities.some((name) => a.$["android:name"] === `${namespace}.${name}`),
    );
    if (!enabled) return config;
    config.modResults.manifest["uses-permission"] ??= [];
    if (
      !config.modResults.manifest["uses-permission"].some(
        (p) => p.$["android:name"] === "android.permission.WAKE_LOCK",
      )
    )
      config.modResults.manifest["uses-permission"].push({
        $: { "android:name": "android.permission.WAKE_LOCK" },
      });
    app.service.push({
      $: { "android:name": `${namespace}.AvaTaskService`, "android:exported": "false" },
    });
    app.service.push({
      $: {
        "android:name": `${namespace}.EssentialKeyService`,
        "android:label": "Avenire Essential Key",
        "android:permission": "android.permission.BIND_ACCESSIBILITY_SERVICE",
        "android:exported": "true",
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": "android.accessibilityservice.AccessibilityService" } }],
        },
      ],
      "meta-data": [
        {
          $: {
            "android:name": "android.accessibilityservice",
            "android:resource": "@xml/essential_key_service",
          },
        },
      ],
    });
    return config;
  });
  config = withMainApplication(config, (config) => {
    const start = "// avenire-essential-key:start";
    const end = "// avenire-essential-key:end";
    let code = config.modResults.contents.replace(
      /\s*\/\/ avenire-essential-key:start[\s\S]*?\/\/ avenire-essential-key:end/g,
      "",
    );
    if (enabled) {
      const kotlin = /PackageList\(this\)\.packages\.apply\s*\{/;
      const java = /List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);/;
      if (kotlin.test(code))
        code = code.replace(
          kotlin,
          (match) =>
            `${match}\n          ${start}\n          add(${namespace}.AvenireScreenPackage())\n          ${end}`,
        );
      else if (java.test(code))
        code = code.replace(
          java,
          (match) =>
            `${match}\n        ${start}\n        packages.add(new ${namespace}.AvenireScreenPackage());\n        ${end}`,
        );
      else
        throw new Error(
          "Cannot register Avenire screen bridge in MainApplication. Use the standard Expo package list.",
        );
    }
    config.modResults.contents = code;
    return config;
  });
  config = withAppBuildGradle(config, (config) => {
    let code = config.modResults.contents.replace(
      /\n?\/\/ avenire-markdown:start[\s\S]*?\/\/ avenire-markdown:end\n?/g,
      "",
    );
    if (enabled)
      code +=
        '\n// avenire-markdown:start\ndependencies {\n    implementation("io.noties.markwon:core:4.6.2")\n}\n// avenire-markdown:end\n';
    config.modResults.contents = code;
    return config;
  });
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const source = path.join(config.modRequest.projectRoot, "native/essential-key");
      const main = path.join(config.modRequest.platformProjectRoot, "app/src/main");
      // Clean owned files when switching the flag off, including incremental prebuilds.
      const java = path.join(main, "java/com/thedamod/avenire/essentialkey");
      const resources = [
        "xml/essential_key_service.xml",
        "values/essential_key_strings.xml",
        "values/essential_key_styles.xml",
        "raw/essential_key_keep.xml",
        "values/essential_key_tokens.xml",
        "font/avenire_geist.ttf",
        "font/avenire_geist_mono.ttf",
      ];
      await fs.rm(java, { recursive: true, force: true });
      await Promise.all(
        resources.map((resource) => fs.rm(path.join(main, "res", resource), { force: true })),
      );
      if (enabled) {
        await fs.cp(path.join(source, "src"), path.join(main, "java"), { recursive: true });
        await Promise.all(
          resources.slice(0, 4).map(async (resource) => {
            await fs.mkdir(path.dirname(path.join(main, "res", resource)), { recursive: true });
            await fs.copyFile(path.join(source, "res", resource), path.join(main, "res", resource));
          }),
        );
        await generateDesign(config.modRequest.projectRoot, path.join(main, "res"));
      }
      return config;
    },
  ]);
};
