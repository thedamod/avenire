const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

const namespace = "com.thedamod.avenire.essentialkey";
const activities = ["AvaActivity"];
const ownedActivities = ["KeyInputActivity", ...activities];
const generateDesign = require("../native/essential-key/generate-design.cjs");
module.exports = function withEssentialKey(config, { enabled = false } = {}) {
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.service = (app.service ?? []).filter(
      (s) => s.$["android:name"] !== `${namespace}.EssentialKeyService`,
    );
    app.activity = (app.activity ?? []).filter(
      (a) => !ownedActivities.some((name) => a.$["android:name"] === `${namespace}.${name}`),
    );
    if (!enabled) return config;
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
    for (const name of activities)
      app.activity.push({
        $: {
          "android:name": `${namespace}.${name}`,
          "android:exported": "false",
          "android:launchMode": name === "AvaActivity" ? "singleTask" : "singleTop",
          ...(name === "AvaActivity"
            ? {
                "android:taskAffinity": `${config.android?.package ?? "com.thedamod.avenire"}.essentialkey`,
                "android:excludeFromRecents": "true",
              }
            : {}),
          "android:windowSoftInputMode": "adjustResize",
          "android:theme":
            name === "AvaActivity"
              ? "@style/AvenireKeySheet"
              : "@android:style/Theme.Material.NoActionBar",
        },
      });
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
