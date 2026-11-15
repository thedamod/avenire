const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  withAppBuildGradle,
} = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

const namespace = "com.thedamod.avenire.essentialkey";
const ownedActivities = [
  "KeyInputActivity",
  "AvaActivity",
  "AvaEntryActivity",
  "CaptureShareActivity",
];
const generatePolicy = require("../native/essential-key/generate-policy.cjs");
const generateDesign = require("../native/essential-key/generate-design.cjs");
module.exports = function withEssentialKey(config, { enabled = false } = {}) {
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.service = (app.service ?? []).filter(
      (s) =>
        ![
          `${namespace}.EssentialKeyService`,
          `${namespace}.AvaTaskService`,
          `${namespace}.CaptureJobService`,
          `${namespace}.AvaAssistService`,
          `${namespace}.AvaAssistSessionService`,
          `${namespace}.AvaAssistRecognitionService`,
        ].includes(s.$["android:name"]),
    );
    app.activity = (app.activity ?? []).filter(
      (a) => !ownedActivities.some((name) => a.$["android:name"] === `${namespace}.${name}`),
    );
    app.receiver = (app.receiver ?? []).filter(
      (r) => r.$["android:name"] !== `${namespace}.AvaWidget`,
    );
    const queries = (config.modResults.manifest.queries ??= []);
    // Visibility is limited to web handlers and launchable apps; never QUERY_ALL_PACKAGES.
    // Query entries are added idempotently by their exact shapes below.
    for (const query of [
      {
        intent: [
          {
            action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
            category: [{ $: { "android:name": "android.intent.category.BROWSABLE" } }],
            data: [{ $: { "android:scheme": "https" } }],
          },
        ],
      },
      {
        intent: [
          {
            action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
            category: [{ $: { "android:name": "android.intent.category.HOME" } }],
          },
        ],
      },
      {
        intent: [
          {
            action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
            category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }],
          },
        ],
      },
    ]) {
      const index = queries.findIndex((q) => JSON.stringify(q) === JSON.stringify(query));
      if (enabled && index < 0) queries.push(query);
    }
    if (!enabled) return config;
    app.service.push(
      {
        $: {
          "android:name": `${namespace}.AvaAssistService`,
          "android:enabled": "@bool/ava_supported",
          "android:label": "Ava",
          "android:permission": "android.permission.BIND_VOICE_INTERACTION",
          "android:exported": "true",
        },
        "intent-filter": [
          { action: [{ $: { "android:name": "android.service.voice.VoiceInteractionService" } }] },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.voice_interaction",
              "android:resource": "@xml/ava_assist",
            },
          },
        ],
      },
      {
        $: {
          "android:name": `${namespace}.AvaAssistSessionService`,
          "android:enabled": "@bool/ava_supported",
          "android:permission": "android.permission.BIND_VOICE_INTERACTION",
          "android:exported": "true",
        },
      },
      {
        $: {
          "android:name": `${namespace}.AvaAssistRecognitionService`,
          "android:enabled": "@bool/ava_supported",
          "android:permission": "android.permission.BIND_SPEECH_RECOGNITION_SERVICE",
          "android:exported": "true",
        },
        "intent-filter": [
          { action: [{ $: { "android:name": "android.speech.RecognitionService" } }] },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.speech",
              "android:resource": "@xml/ava_assist_recognizer",
            },
          },
        ],
      },
    );
    app.activity.push({
      $: {
        "android:name": `${namespace}.CaptureShareActivity`,
        "android:enabled": "@bool/ava_supported",
        "android:label": "Avenire",
        "android:theme": "@android:style/Theme.Translucent.NoTitleBar",
        "android:exported": "true",
        "android:excludeFromRecents": "true",
        "android:taskAffinity": "",
      },
      "intent-filter": [
        {
          action: ["android.intent.action.SEND", "android.intent.action.SEND_MULTIPLE"].map(
            (name) => ({ $: { "android:name": name } }),
          ),
          category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
          data: [
            "application/pdf",
            "image/*",
            "audio/*",
            "video/*",
            "text/*",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ].map((type) => ({ $: { "android:mimeType": type } })),
        },
      ],
    });
    app.activity.push({
      $: {
        "android:name": `${namespace}.AvaEntryActivity`,
        "android:enabled": "@bool/ava_supported",
        "android:label": "Ava",
        "android:theme": "@android:style/Theme.NoDisplay",
        "android:exported": "true",
        "android:excludeFromRecents": "true",
        "android:taskAffinity": "",
        "android:noHistory": "true",
      },
      "intent-filter": [
        {
          action: [
            { $: { "android:name": "android.intent.action.ASSIST" } },
            { $: { "android:name": "com.thedamod.avenire.OPEN_AVA" } },
          ],
          category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
        },
      ],
    });
    app.receiver.push({
      $: {
        "android:name": `${namespace}.AvaWidget`,
        "android:enabled": "@bool/ava_supported",
        "android:label": "Ask Ava",
        "android:exported": "false",
      },
      "intent-filter": [
        { action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }] },
      ],
      "meta-data": [
        {
          $: {
            "android:name": "android.appwidget.provider",
            "android:resource": "@xml/ava_widget_info",
          },
        },
      ],
    });
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
      $: {
        "android:name": `${namespace}.CaptureJobService`,
        "android:permission": "android.permission.BIND_JOB_SERVICE",
        "android:exported": "true",
        "android:enabled": "@bool/ava_supported",
      },
    });
    for (const permission of [
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.ACCESS_NETWORK_STATE",
    ]) {
      if (
        !config.modResults.manifest["uses-permission"].some(
          (p) => p.$["android:name"] === permission,
        )
      )
        config.modResults.manifest["uses-permission"].push({ $: { "android:name": permission } });
    }
    app.service.push({
      $: {
        "android:name": `${namespace}.AvaTaskService`,
        "android:exported": "false",
        "android:enabled": "@bool/ava_supported",
      },
    });
    app.service.push({
      $: {
        "android:name": `${namespace}.EssentialKeyService`,
        "android:enabled": "@bool/ava_supported",
        "android:label": "Avenire Ava",
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
        "xml/ava_assist.xml",
        "xml/ava_assist_recognizer.xml",
        "values/essential_key_strings.xml",
        "values/essential_key_styles.xml",
        "raw/essential_key_keep.xml",
        "values/essential_key_tokens.xml",
        "font/avenire_geist.ttf",
        "font/avenire_geist_mono.ttf",
        "xml/ava_widget_info.xml",
        "layout/ava_widget.xml",
        "values/ava_supported.xml",
        "values-v31/ava_supported.xml",
      ];
      await fs.rm(java, { recursive: true, force: true });
      await Promise.all(
        resources.map((resource) => fs.rm(path.join(main, "res", resource), { force: true })),
      );
      if (enabled) {
        await fs.cp(path.join(source, "src"), path.join(main, "java"), { recursive: true });
        await Promise.all(
          resources
            .filter((resource) => !resource.includes("font/") && !resource.includes("tokens"))
            .map(async (resource) => {
              await fs.mkdir(path.dirname(path.join(main, "res", resource)), { recursive: true });
              await fs.copyFile(
                path.join(source, "res", resource),
                path.join(main, "res", resource),
              );
            }),
        );
        await generatePolicy(java);
        await generateDesign(config.modRequest.projectRoot, path.join(main, "res"));
      }
      return config;
    },
  ]);
};
