import type { BlockedCategory, CaptureSnapshot } from "@avenire/contracts";

export type BlockedFile = { readonly title: string; readonly category: BlockedCategory };
export type PolicyResult = {
  readonly snapshot: CaptureSnapshot;
  readonly blocked: readonly BlockedFile[];
};
type Rule = { readonly category: BlockedCategory; readonly test: (value: string) => boolean };

const hostRule = (category: BlockedCategory, hosts: readonly string[]): Rule => ({
  category,
  test: (value) => {
    try {
      const host = new URL(value).hostname.toLowerCase();
      return hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
    } catch {
      return false;
    }
  },
});
const urlRules: readonly Rule[] = [
  hostRule("email", ["mail.google.com", "outlook.live.com", "outlook.office.com"]),
  {
    category: "banking",
    test: (value) =>
      /(?:^|[/.])(?:chase|bankofamerica|wellsfargo|citi|citibank|capitalone|barclays|hsbc|revolut|wise)(?:[/.]|$)/i.test(
        value,
      ),
  },
  hostRule("messaging", ["web.whatsapp.com", "messenger.com", "slack.com"]),
  {
    category: "messaging",
    test: (value) => /^https?:\/\/(?:[^/]+\.)?discord\.com\/channels(?:[/?#]|$)/i.test(value),
  },
  { category: "password-manager", test: (value) => /1password|bitwarden|lastpass/i.test(value) },
  {
    category: "checkout",
    test: (value) =>
      /\/(?:checkout|cart)(?:\/|$|[?#])/i.test(value) || /amazon\.[^/]+\/gp\/buy/i.test(value),
  },
  {
    category: "social-feed",
    test: (value) =>
      /(?:twitter\.com|x\.com)\/home(?:[/?#]|$)|facebook\.com(?:\/?(?:[?#].*)?)$|instagram\.com(?:\/?(?:[?#].*)?)$|tiktok\.com(?:\/?(?:[?#].*)?)$|reddit\.com(?:\/?(?:[?#].*)?)$/i.test(
        value,
      ),
  },
  hostRule("drm-stream", ["netflix.com", "primevideo.com", "disneyplus.com", "hulu.com"]),
];
const appRules: readonly Rule[] = [
  { category: "password-manager", test: (value) => /1password|bitwarden|lastpass/i.test(value) },
  {
    category: "banking",
    test: (value) => /(?:^|\b)(?:bank|chase|wells fargo|revolut|wise)(?:\b|$)/i.test(value),
  },
];

function blockedCategory(
  url: string | undefined,
  appName: string,
  title: string,
): BlockedCategory | undefined {
  if (/\b(?:incognito|private browsing|inprivate)\b/i.test(`${appName} ${title}`))
    return "private-window";
  if (url) {
    for (const rule of urlRules) if (rule.test(url)) return rule.category;
  }
  for (const rule of appRules) if (rule.test(appName)) return rule.category;
  if (/netflix|prime video|disney\+?|hulu/i.test(`${appName} ${title}`)) return "drm-stream";
  return undefined;
}

export function applyPolicy(snapshot: CaptureSnapshot): PolicyResult {
  const blocked: BlockedFile[] = [];
  const tabs = snapshot.tabs.filter((tab) => {
    const category = blockedCategory(tab.finalUrl ?? tab.url, "", tab.title);
    if (category) blocked.push({ title: tab.title, category });
    return category === undefined;
  });
  const windows = snapshot.windows.filter((window) => {
    const category = blockedCategory(undefined, window.appName, window.title);
    if (category) blocked.push({ title: window.title, category });
    return category === undefined;
  });
  return { snapshot: { ...snapshot, tabs, windows }, blocked };
}
