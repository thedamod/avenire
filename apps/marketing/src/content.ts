// Every word and link on the page. Components only lay this out.

export const appUrl: string = import.meta.env.PUBLIC_APP_URL ?? "https://app.avenire.space";

export const nav = {
  links: [
    { label: "Capture", href: "#capture" },
    { label: "Morning report", href: "#morning-report" },
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
  dim: ["Wake up to your", "study material,"],
  bright: "already worked on.",
  lead: "Avenire organizes what you study and has it ready by morning.",
  screenshotAlt:
    "Avenire home: the morning toast above your notebooks, chats and tasks, ready when you open the app.",
};

export const statement = {
  dim: "Studying got messier.",
  bright: "Avenire does the organizing, then brings you what to study.",
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

export const morningReport = {
  id: "morning-report",
  eyebrow: "02 · The morning report",
  dim: "You don’t go to your material.",
  bright: "Ruth Cloud brings it to you.",
  aside: "Notes, summaries and quizzes, ready when you log in. You approve every change.",
  video: {
    src: "/media/ruth-cloud.mp4",
    label: "Play: Ruth Cloud working through a CartPole control project overnight",
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
      video: { src: "/media/cartpole.mp4", label: "Play: CartPole explainer" },
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
    { icon: "doc", name: "Entropy and the second law.md", kind: "Note", modified: "6:02 am" },
    { icon: "doc", name: "Carnot cycle, step by step.md", kind: "Note", modified: "Yesterday" },
    { icon: "pdf", name: "Lecture 8 · Heat engines.pdf", kind: "Source", modified: "Yesterday" },
    { icon: "youtube", name: "MIT 5.60 L9 · Entropy", kind: "Source", modified: "Mon" },
    { icon: "doc", name: "Quiz · Clausius inequality.md", kind: "Note", modified: "6:02 am" },
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
  dim: "Close the laptop.",
  bright: "Ruth has the rest.",
};

export const footer = {
  tagline: "The study companion that works while you’re away.",
  columns: [
    {
      heading: "Product",
      links: [
        { label: "Capture", href: "#capture" },
        { label: "Morning report", href: "#morning-report" },
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
