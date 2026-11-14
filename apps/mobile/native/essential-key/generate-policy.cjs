const fs = require("node:fs/promises");
const path = require("node:path");
const urlPolicy = require("../../../../packages/capture/src/url-policy.json");
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
    static boolean privateMarker(String value) { return Pattern.compile("incognito|inprivate|private browsing|private tab|secret mode|secret tab", Pattern.CASE_INSENSITIVE).matcher(value == null ? "" : value).find(); }
    static boolean permitsUrl(String raw) {
        java.util.ArrayList<String> urls = new java.util.ArrayList<>(); urls.add(raw);
        for(int i=0;i<urls.size() && i<64;i++) {
            String value=urls.get(i);
            try {
                java.net.URI uri=new java.net.URI(value); String host=uri.getHost();
                if(host==null || uri.getUserInfo()!=null || !(uri.getScheme().equalsIgnoreCase("https") || uri.getScheme().equalsIgnoreCase("http"))) return false;
                host=host.toLowerCase(Locale.ROOT);
                ${urlPolicy.map((rule) => (rule.hosts ? `for(String blocked : new String[]{${rule.hosts.map((x) => JSON.stringify(x)).join(",")}}) if(host.equals(blocked) || host.endsWith("."+blocked)) return false;` : rule.patterns.map((pattern) => `if(Pattern.compile(${JSON.stringify(pattern)},Pattern.CASE_INSENSITIVE).matcher(value).find()) return false;`).join("\n                "))).join("\n                ")}
                if(uri.getRawQuery()!=null) for(String part:uri.getRawQuery().split("&")) { String[] pair=part.split("=",2); if(pair.length==2) { String nested=java.net.URLDecoder.decode(pair[1],"UTF-8"); if(nested.matches("(?i)^https?://.*") && !urls.contains(nested)) urls.add(nested); } }
            } catch(Exception invalid) { return false; }
        }
        return urls.size()<=64;
    }
    static boolean allows(String name, String label, boolean browser, boolean system, int applicationWindows) {
        if (name == null || name.isEmpty() || system || applicationWindows != 1) return false;
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
