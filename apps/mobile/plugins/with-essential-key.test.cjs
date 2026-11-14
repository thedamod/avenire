const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const plugin = require("./with-essential-key.cjs");
const projectRoot = path.resolve(__dirname, "..");

async function manifest(enabled, app = { $: {} }) {
  const config = plugin({ name: "Avenire", slug: "avenire" }, { enabled });
  const result = await config.mods.android.manifest({
    modResults: { manifest: { application: [app] } },
  });
  return result.modResults.manifest.application[0];
}
test("off by default; opt-in registers the service and no Activity launch", async () => {
  assert.equal((await manifest(undefined)).service.length, 0);
  const app = await manifest(true);
  assert.equal(app.service.length, 2);
  assert.equal(
    app.service.find((s) => s.$["android:name"].endsWith("EssentialKeyService")).$[
      "android:permission"
    ],
    "android.permission.BIND_ACCESSIBILITY_SERVICE",
  );
  assert.equal(app.activity.length, 0);
  assert.equal((await manifest(true, app)).service.length, 2);
});
test("turning flag off removes owned manifest entries and retains unrelated components", async () => {
  const app = await manifest(true);
  app.service.push({ $: { "android:name": "OtherService" } });
  app.activity.push({ $: { "android:name": ".MainActivity" } });
  app.activity.push({ $: { "android:name": "com.thedamod.avenire.essentialkey.AvaActivity" } });
  const off = await manifest(false, app);
  assert.deepEqual(
    off.service.map((s) => s.$["android:name"]),
    ["OtherService"],
  );
  assert.deepEqual(
    off.activity.map((s) => s.$["android:name"]),
    [".MainActivity"],
  );
});
test("incremental prebuild removes native sources/resources when disabled", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "avenire-key-test-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const main = path.join(temp, "app/src/main");
  await fs.mkdir(path.join(main, "res/values"), { recursive: true });
  await fs.writeFile(path.join(main, "res/values/strings.xml"), "unrelated");
  const request = { modRequest: { projectRoot, platformProjectRoot: temp } };
  await plugin({ name: "A", slug: "a" }, { enabled: true }).mods.android.dangerous(request);
  assert.match(
    await fs.readFile(
      path.join(main, "java/com/thedamod/avenire/essentialkey/AvaOverlay.java"),
      "utf8",
    ),
    /class AvaOverlay/,
  );
  const xml = await fs.readFile(path.join(main, "res/xml/essential_key_service.xml"), "utf8");
  assert.match(
    await fs.readFile(path.join(main, "res/values/essential_key_tokens.xml"), "utf8"),
    /name="ava_accent">#ABC4FF/,
  );
  assert.deepEqual(
    await fs.readFile(path.join(main, "res/font/avenire_geist.ttf")),
    await fs.readFile(path.join(projectRoot, "assets/fonts/Geist-Variable.ttf")),
  );
  await fs.access(path.join(main, "res/font/avenire_geist_mono.ttf"));
  assert.match(xml, /canRetrieveWindowContent="false"/);
  assert.match(xml, /canTakeScreenshot="true"/);
  await plugin({ name: "A", slug: "a" }, { enabled: false }).mods.android.dangerous(request);
  await assert.rejects(fs.access(path.join(main, "java/com/thedamod/avenire/essentialkey")), {
    code: "ENOENT",
  });
  await assert.rejects(fs.access(path.join(main, "res/values/essential_key_styles.xml")), {
    code: "ENOENT",
  });
  await assert.rejects(fs.access(path.join(main, "res/font/avenire_geist.ttf")), {
    code: "ENOENT",
  });
  await assert.rejects(fs.access(path.join(main, "res/font/avenire_geist_mono.ttf")), {
    code: "ENOENT",
  });
  assert.equal(await fs.readFile(path.join(main, "res/values/strings.xml"), "utf8"), "unrelated");
});

test("MainApplication bridge registration is opt-in, repeatable and removed when disabled", async () => {
  for (const contents of [
    "PackageList(this).packages.apply {\n  add(OtherPackage())\n}",
    "List<ReactPackage> packages = new PackageList(this).getPackages();\npackages.add(new OtherPackage());",
  ]) {
    const apply = async (enabled, code) => {
      const config = plugin({ name: "A", slug: "a" }, { enabled });
      return (await config.mods.android.mainApplication({ modResults: { contents: code } }))
        .modResults.contents;
    };
    const enabled = await apply(true, contents);
    assert.equal((enabled.match(/AvenireScreenPackage/g) ?? []).length, 1);
    assert.equal((await apply(true, enabled)).match(/AvenireScreenPackage/g)?.length, 1);
    const off = await apply(false, enabled);
    assert.doesNotMatch(off, /AvenireScreenPackage/);
    assert.match(off, /OtherPackage/);
  }
});

test("Markdown dependency is opt-in, idempotent and removed without changing other dependencies", async () => {
  const apply = async (enabled, contents) => {
    const config = plugin({ name: "A", slug: "a" }, { enabled });
    return (
      await config.mods.android.appBuildGradle({ modResults: { contents, language: "groovy" } })
    ).modResults.contents;
  };
  const original = 'dependencies { implementation("example:other:1") }\n';
  const enabled = await apply(true, original);
  assert.equal((enabled.match(/io.noties.markwon:core/g) ?? []).length, 1);
  assert.equal((await apply(true, enabled)).match(/io.noties.markwon:core/g)?.length, 1);
  const disabled = await apply(false, enabled);
  assert.doesNotMatch(disabled, /markwon/);
  assert.match(disabled, /example:other:1/);
});
