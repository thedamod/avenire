import type {
  BlockedCategory,
  CapturePosition,
  CaptureSnapshot,
  TextQuote,
} from "@avenire/contracts";

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
  hostRule("email", [
    "mail.google.com",
    "outlook.live.com",
    "outlook.office.com",
    "mail.yahoo.com",
    "proton.me",
    "fastmail.com",
    "hey.com",
  ]),
  {
    category: "banking",
    test: (value) =>
      /(?:^|[/.])(?:chase|bankofamerica|wellsfargo|citi|citibank|capitalone|barclays|hsbc|revolut|wise|paypal|coinbase|robinhood)(?:[/.]|$)/i.test(
        value,
      ),
  },
  hostRule("messaging", [
    "web.whatsapp.com",
    "web.telegram.org",
    "teams.microsoft.com",
    "messages.google.com",
    "messenger.com",
    "slack.com",
  ]),
  {
    category: "messaging",
    test: (value) => /^https?:\/\/(?:[^/]+\.)?discord\.com\/channels(?:[/?#]|$)/i.test(value),
  },
  {
    category: "password-manager",
    test: (value) => /1password|bitwarden|lastpass|dashlane|keepass|roboform|enpass/i.test(value),
  },
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
  hostRule("drm-stream", [
    "netflix.com",
    "primevideo.com",
    "disneyplus.com",
    "hulu.com",
    "hbomax.com",
    "crunchyroll.com",
  ]),
  {
    category: "drm-stream",
    test: (value) => /spotify\.com\/(?:track|episode)(?:[/?#]|$)/i.test(value),
  },
];
const appRules: readonly Rule[] = [
  {
    category: "password-manager",
    test: (value) => /1password|bitwarden|lastpass|dashlane|keepass|roboform|enpass/i.test(value),
  },
  {
    category: "email",
    test: (value) =>
      /(?:^|\b)(?:outlook|olk(?:\.exe)?|mail|gmail|thunderbird|spark|mailspring|mailclient)(?:\b|$)/i.test(
        value,
      ),
  },
  {
    category: "messaging",
    test: (value) =>
      /(?:^|\b)(?:slack|discord|whatsapp|messenger|messages|telegram|signal|teams|skype|wechat|imessage|line)(?:\b|$)/i.test(
        value,
      ),
  },
  {
    category: "banking",
    test: (value) =>
      /(?:^|\b)(?:bank|chase|wells fargo|bank of america|revolut|wise|paypal)(?:\b|$)/i.test(value),
  },
];

function blockedCategory(
  url: string | undefined,
  appName: string,
  title: string,
): BlockedCategory | undefined {
  if (/\b(?:incognito|private browsing|inprivate)\b/i.test(`${appName} ${title}`))
    return "private-window";
  // Titles and file paths can carry a blocked redirect URL too.
  const urls = [url, ...(`${appName} ${title}`.match(/https?:\/\/[^\s<>"']+/gi) ?? [])];
  // Redirect wrappers can encode a blocked destination in query parameters.
  for (let index = 0; index < urls.length && index < 64; index += 1) {
    const candidate = urls[index];
    if (!candidate) continue;
    for (const rule of urlRules) if (rule.test(candidate)) return rule.category;
    try {
      for (const value of new URL(candidate).searchParams.values()) {
        if (/^https?:\/\//i.test(value) && !urls.includes(value)) urls.push(value);
      }
    } catch {
      /* Non-URL app metadata still passes through the app rules below. */
    }
  }
  if (urls.length > 64) return "private-window"; // Unverifiable redirect chain: fail closed.
  for (const rule of appRules) if (rule.test(appName)) return rule.category;
  if (
    /^(?:spotify|netflix|hulu|disney\+|prime video|crunchyroll)(?:\.exe)?$/i.test(appName) ||
    /netflix|prime video|disney\+?|hulu|hbo\s?(?:max)?|crunchyroll|peacock|paramount\s?\+/i.test(
      `${appName} ${title}`,
    )
  )
    return "drm-stream";
  return undefined;
}

const copyQuote = (quote: TextQuote): TextQuote => ({
  exact: quote.exact,
  ...(quote.prefix === undefined ? {} : { prefix: quote.prefix }),
  ...(quote.suffix === undefined ? {} : { suffix: quote.suffix }),
});
const copyPosition = (position: CapturePosition): CapturePosition => ({
  ...(position.scrollPct === undefined ? {} : { scrollPct: position.scrollPct }),
  ...(position.textQuote === undefined ? {} : { textQuote: copyQuote(position.textQuote) }),
  ...(position.pdfPage === undefined ? {} : { pdfPage: position.pdfPage }),
  ...(position.mediaSec === undefined ? {} : { mediaSec: position.mediaSec }),
});

export function applyPolicy(snapshot: CaptureSnapshot): PolicyResult {
  const blocked: BlockedFile[] = [];
  const report = (category: BlockedCategory) => {
    // The renderer must not receive blocked source titles, which can themselves contain secrets.
    blocked.push({ title: "Blocked source", category });
  };
  const permittedUrl = (value: string) => {
    try {
      const url = new URL(value);
      if (
        /^https?:$/.test(url.protocol) &&
        [...url.searchParams.values()].some((value) => /^file:|^[a-z]:[\\/]|^\\\\/i.test(value))
      )
        return false;
      return (
        (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "file:") &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  };
  const tabs = snapshot.tabs.flatMap((tab) => {
    if (tab.incognito) {
      report("private-window");
      return [];
    }
    const category =
      blockedCategory(tab.url, "", tab.title) ?? blockedCategory(tab.finalUrl, "", tab.title);
    if (category) {
      report(category);
      return [];
    }
    if (!permittedUrl(tab.url) || (tab.finalUrl !== undefined && !permittedUrl(tab.finalUrl)))
      return [];
    return [
      {
        tabId: tab.tabId,
        windowId: tab.windowId,
        browser: tab.browser,
        ...(tab.position === undefined ? {} : { position: copyPosition(tab.position) }),
        ...(tab.selection === undefined ? {} : { selection: copyQuote(tab.selection) }),
        url: tab.url,
        title: tab.title,
        activeInWindow: tab.activeInWindow,
        ...(tab.finalUrl === undefined ? {} : { finalUrl: tab.finalUrl }),
        // Legacy free-form selection has no verified provenance.
        ...(tab.likelyPdf === undefined ? {} : { likelyPdf: tab.likelyPdf }),
        ...(tab.access === undefined ? {} : { access: tab.access }),
        ...(tab.summary === undefined ? {} : { summary: tab.summary }),
        engagement: {
          dwellMs: tab.engagement.dwellMs,
          scrollDepthPct: tab.engagement.scrollDepthPct,
          mediaPlaying: tab.engagement.mediaPlaying,
        },
      },
    ];
  });
  const windows = snapshot.windows.flatMap((window) => {
    const category = blockedCategory(window.filePath, window.appName, window.title);
    if (category) {
      report(category);
      return [];
    }
    if (
      !window.appName ||
      (window.filePath !== undefined && /[a-z][a-z0-9+.-]*:\/\//i.test(window.filePath))
    )
      return [];
    return [
      {
        appName: window.appName,
        title: window.title,
        foreground: window.foreground,
        ...(window.filePath === undefined ? {} : { filePath: window.filePath }),
      },
    ];
  });
  const media = snapshot.media.flatMap((entry) => {
    const category =
      blockedCategory(entry.url, entry.appName, entry.title) ??
      blockedCategory(entry.filePath, entry.appName, entry.title);
    if (category) {
      report(category);
      return [];
    }
    // A media session alone cannot establish which private/browser source it came from.
    const sourceTab =
      entry.url !== undefined &&
      tabs.some(
        (tab) => tab.title === entry.title && (tab.url === entry.url || tab.finalUrl === entry.url),
      ) &&
      windows.some((window) => window.appName === entry.appName && window.title === entry.title);
    const sourceWindow =
      entry.filePath !== undefined &&
      windows.some(
        (window) =>
          window.filePath === entry.filePath &&
          window.appName === entry.appName &&
          window.title === entry.title,
      );
    if (
      !entry.appName ||
      (!sourceTab && !sourceWindow) ||
      (entry.url !== undefined && !permittedUrl(entry.url)) ||
      (entry.filePath !== undefined &&
        (!sourceWindow || /[a-z][a-z0-9+.-]*:\/\//i.test(entry.filePath)))
    )
      return [];
    return [
      {
        appName: entry.appName,
        title: entry.title,
        ...(entry.url === undefined ? {} : { url: entry.url }),
        ...(entry.filePath === undefined ? {} : { filePath: entry.filePath }),
        ...(entry.positionSec === undefined ? {} : { positionSec: entry.positionSec }),
        ...(entry.durationSec === undefined ? {} : { durationSec: entry.durationSec }),
      },
    ];
  });
  return {
    snapshot: {
      id: snapshot.id,
      capturedAt: snapshot.capturedAt,
      deviceId: snapshot.deviceId,
      platform: snapshot.platform,
      tabs,
      windows,
      media,
      // Free-form diagnostics can include source content. Keep them on the device.
      collectorNotes: [],
    },
    blocked,
  };
}
