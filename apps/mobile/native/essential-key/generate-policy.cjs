const fs = require("node:fs/promises");
const path = require("node:path");
const policy = require("../../../../packages/capture/src/android-policy.json");
// The native gate is generated from capture policy, never maintained as a second package list.
module.exports = async function generatePolicy(destination) {
  const packages = [...Object.values(policy.packages).flat(), ...policy.unverifiablePackages]
    .map((p) => JSON.stringify(p.toLowerCase()))
    .join(", ");
  const source = `package com.thedamod.avenire.essentialkey;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
/** Generated at prebuild from @avenire/capture android-policy.json. */
final class AndroidScreenPolicy {
    private static final Set<String> BLOCKED = new HashSet<>(Arrays.asList(${packages}));
    private static final Pattern LABEL = Pattern.compile(${JSON.stringify(policy.blockedLabelPattern)}, Pattern.CASE_INSENSITIVE);
    static boolean allows(String name, String label, boolean browser, boolean system, int applicationWindows) {
        if (name == null || name.isEmpty() || browser || system || applicationWindows != 1) return false;
        String normalized = name.toLowerCase(Locale.ROOT);
        for (String blocked : BLOCKED) if (normalized.equals(blocked) || normalized.startsWith(blocked + ".")) return false;
        return !LABEL.matcher(label == null ? "" : label).find();
    }
}
`;
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(destination, "AndroidScreenPolicy.java"), source);
};
if (require.main === module)
  module.exports(process.argv[2]).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
