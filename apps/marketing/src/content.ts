// Every word and link on the page. Components only lay this out.

export const appUrl: string = import.meta.env.PUBLIC_APP_URL ?? "https://app.avenire.space";

export const nav = {
  links: [
    { label: "Capture", href: "#capture" },
    { label: "Brought to you", href: "#brought-to-you" },
    { label: "Ruth", href: "#ruth" },
    { label: "Your files", href: "#files" },
  ],
  signIn: { label: "Sign in", href: `${appUrl}/sign-in` },
  cta: { label: "Get early access", href: "#early-access" },
};

export const emailCta = {
  action: `${appUrl}/sign-up`,
  placeholder: "you@university.edu",
  button: "Get early access",
};

export const hero = {
  dim: ["Stop searching", "for your notes."],
  bright: "They come to you.",
  lead: "Everything you study, filed and handed back to you.",
  screenshotAlt:
    "Avenire home: your notebooks, recent notes and what Ruth has ready for you, in one place.",
};

export const statement = {
  dim: "Studying shouldn’t mean searching.",
  bright: "Avenire keeps your material in order and puts the right part in front of you.",
};

export const capture = {
  id: "capture",
  eyebrow: "01 · Capture",
  dim: "One key.",
  bright: "Everything you have open, saved.",
  aside:
    "Tabs, PDFs, papers and videos in one press. A toast lets you undo for a few seconds, then it’s in your library.",
  screenshotAlt: "A paper being captured from the browser, with the capture toast in the corner.",
  sources: {
    title: "Takes in what you actually study from",
    copy: "arXiv, YouTube, web pages, PDFs, docx, audio and Markdown.",
  },
  features: [
    {
      title: "Files itself into notebooks",
      copy: "Related captures cluster together. You never make a folder.",
    },
    {
      title: "Picks up where you left off",
      copy: "Reopen a notebook and the apps you had it in come back.",
    },
  ],
};

export const broughtToYou = {
  id: "brought-to-you",
  eyebrow: "02 · Brought to you",
  dim: "You don’t go looking for it.",
  bright: "Ruth brings it to you.",
  aside:
    "Ruth turns your sources into notes, summaries and quizzes and puts them where you’ll see them. You approve every change.",
  video: {
    src: "/media/ruth-cloud.mp4",
    alt: "Ruth turning four papers on a CartPole controller into a cited report, with the sources beside it.",
  },
};

export const ruth = {
  id: "ruth",
  eyebrow: "03 · Ruth",
  dim: "Ask about your own material.",
  bright: "Ruth picks how to answer.",
  aside: "Summon it with ⌥ Space. Answers come from your own notes.",
  shortcut: "⌥ Space",
  answers: [
    {
      question: "Why can’t any engine beat Carnot?",
      title: "A cited answer, a sentence at a time",
      alt: "Ruth answering with citations from your thermodynamics notes.",
    },
    {
      question: "Fit my lab 4 cooling readings.",
      title: "Python on your data, with a live chart",
      alt: "An exponential cooling fit plotted over lab readings.",
    },
    {
      question: "Why does the PID wobble at 10°?",
      title: "A short explainer video",
      alt: "A generated video of a cart balancing a pole.",
      video: { src: "/media/cartpole.mp4" },
    },
  ],
};

export const files = {
  id: "files",
  eyebrow: "04 · Your files",
  dim: "One library,",
  bright: "right in your file explorer.",
  copy: "Your notebooks show up in your file explorer, on laptop and phone.",
  path: ["Avenire", "Thermodynamics"],
  columns: ["Name", "Kind", "Modified"],
  rows: [
    { icon: "doc", name: "Entropy and the second law.md", kind: "Note", modified: "Today" },
    { icon: "doc", name: "Carnot cycle, step by step.md", kind: "Note", modified: "Yesterday" },
    { icon: "pdf", name: "Lecture 8 · Heat engines.pdf", kind: "Source", modified: "Yesterday" },
    { icon: "youtube", name: "MIT 5.60 L9 · Entropy", kind: "Source", modified: "Mon" },
    { icon: "doc", name: "Quiz · Clausius inequality.md", kind: "Note", modified: "Today" },
  ],
} as const;

export const trust = {
  eyebrow: "05 · You stay in charge",
  heading: "Nothing changes until you say so.",
  points: [
    {
      title: "Approvals first",
      copy: "Ruth proposes. Every new, moved or edited file waits for your Accept or Skip.",
    },
    {
      title: "30 days to change your mind",
      copy: "Deleted notes and notebooks stay in Trash for 30 days before they’re gone.",
    },
    {
      title: "Your logins stay yours",
      copy: "Pages behind a sign-in are only captured if you turn that on.",
    },
  ],
};

export const finalCta = {
  id: "early-access",
  dim: "Stop searching.",
  bright: "Start studying.",
};

export const footer = {
  tagline: "Your study material, organized and brought to you.",
  columns: [
    {
      heading: "Product",
      links: [
        { label: "Capture", href: "#capture" },
        { label: "Brought to you", href: "#brought-to-you" },
        { label: "Ruth", href: "#ruth" },
        { label: "Your files", href: "#files" },
      ],
    },
    {
      heading: "Avenire",
      links: [
        { label: "Sign in", href: `${appUrl}/sign-in` },
        { label: "Get early access", href: "#early-access" },
        { label: "Contact", href: "mailto:hello@avenire.space" },
      ],
    },
  ],
  contact: { label: "Email us", href: "mailto:hello@avenire.space" },
  copyright: "© 2026 Avenire",
};
