---
title: Privacy policy
description: What Avenire collects, why, who processes it, and how to get it deleted.
updated: 2026-11-12
---

Avenire is a study app: it saves what you study, files it into notebooks, and an assistant called Ava works on it with you. To do that, we have to hold your study material. This page explains what we collect, what we do with it, and what you can change. If anything here is unclear, email [hello@avenire.space](mailto:hello@avenire.space).

## What we collect

### Your account

- Your name, email address and, if you sign up with a password, a hash of it. If you sign in with Google, we receive your name, email address and profile picture from Google.
- For each signed-in device: when the session started and expires, its IP address and its browser or device name. Settings shows your active sessions and lets you sign out of all of them.
- Your settings, such as what Avenire may capture and how Ava handles changes to your files.

### What you capture

When you press the capture key, or use the browser extension, Avenire saves what you have open:

- **Web pages** as text, with their address and title, and where you were on the page.
- **Files** such as PDFs, Word documents, audio and video, with the page or minute you were at. For files on your computer we keep the file name, size and a fingerprint of its contents, not its full path.
- **YouTube videos** as a link and transcript.

To know what you have open, the desktop app reads the name of the app in front, its window title and the files it has open, at the moment you press the key. This source-saving flow does not take screenshots or record your screen. Optional screen sharing is separate, as described below.

### Source-saving protections

When saving sources, Avenire refuses to capture email, banking, messaging, password managers, checkout pages, social media feeds, streaming services with copy protection, and private or incognito windows.

**Pages behind a sign-in are off by default.** Then Avenire only fetches the public version of a page, without your cookies. If you turn on capturing signed-in pages in Settings, the page is read inside your own browser session. Paywalled pages are saved as their title and abstract unless you choose to skip them.

### Optional screen sharing with Ava

**Share screen with Ava** in **Settings → Capture** is off by default and applies to your account. Enabling it authorizes Ava to request snapshots when your question needs screen context. Opening the prompt does not automatically take a screenshot, and there is no per-snapshot confirmation.

A snapshot shows the entire selected display viewport, not the whole document. It can include personal or sensitive content in any visible window, including the apps and pages excluded from source saving above. Source-saving filters do not filter whole-display images. You control what is visible before asking for screen context. The prompt and Avenire presentation overlays are excluded where supported. Cursor coordinates and current presentation state may accompany the image.

The snapshot and accompanying context are sent through Avenire to the configured AI service and its model providers to answer your request. Raw screenshots are supplied for the request rather than persisted as canonical chat messages or library files. Derived answers and requested annotations or presentation descriptions may remain in your chat. Providers process requests under their own terms; we do not promise a particular provider retention period here.

During an active screen explanation, the desktop companion may compare local screen fingerprints to detect changes and clear stale presentations. These samples are not saved or sent to AI providers. Turning sharing off blocks future snapshots; pending captures are checked again before delivery. Local retained screen context and presentations are cleared when revocation is detected. It does not remove answers already retained in chats or recall information already sent for processing.

### What you and Ava create

Your notes, notebooks, chats with Ava, and the files, charts and videos Ava makes for you.

### How the product is used

We use PostHog to understand how Avenire is used:

- **On the website and in the apps:** pages viewed and errors, without linking them to your account.
- **When Ava uses a tool**, such as searching your library: the tool's name, whether it worked and how long it took, linked to your account. **Not** your messages or files.

## How we use it

We use your information to run Avenire for you: to save, organize and search your material, to let Ava answer questions and prepare notes, to sign you in and keep your account secure, to send you emails you've asked for (account verification, password resets, and summaries of Ava's work if you turn them on), and to find and fix problems.

We don't sell your information, we don't show ads, and we don't use your library to train AI models.

## Who processes it for us

Some of the work is done by other companies on our behalf. Each receives only what it needs for its job:

- **AI models.** When you ask Ava something, or Ava works on your library, your request and the relevant parts of your material go to the model that answers. Ava's models run through **OpenRouter** (which routes to **Anthropic**) and **Fireworks**. **Groq** writes chat titles and helps file and transcribe material. **Mistral** reads text from scanned pages and images. **Cohere** indexes your material so it can be searched, and ranks search results.
- **Daytona** runs the sandboxes where Ava executes code and makes files. It receives the files Ava needs for that task.
- **Resend** sends our emails, so it receives your email address and the content of each email.
- **PostHog** records the usage information described above.
- **Google**, if you sign in with Google.
- Our cloud database and file storage providers, which store your account and library.

## How long we keep it

- **Your library** is kept while your account exists.
- **Deleted files** stay in Trash for 30 days, so you can restore them, and are then deleted for good. You can empty Trash sooner.
- **Ava's sandboxes for a chat** are deleted after at most 60 minutes. **Ava's workspace for scheduled tasks** keeps copies of the files a task uses, so the next run can pick up where it left off. You can set a task to delete its workspace after each run.
- **Files you start uploading but never finish** are discarded after an hour.

## Your choices

- Choose whether Ava may request whole-display snapshots with Share screen with Ava in Settings → Capture (off by default).
- Choose whether Avenire may capture signed-in pages, and how it treats paywalled pages.
- Choose whether Ava's changes to your files wait for your approval. By default, edits, moves, renames and deletions all do.
- Sign out of every device from Settings.
- **Delete your account or get a copy of your data**: email [hello@avenire.space](mailto:hello@avenire.space) from the address on your account. Deleting your account deletes your library, notes, chats and settings. We're building both into Settings.

## Cookies and local storage

We use a cookie to keep you signed in. PostHog stores an anonymous identifier in a cookie and in your browser's local storage. Avenire also uses local storage for preferences, such as recent prompts and your progress through a quiz. We don't use advertising cookies.

## Children

Avenire isn't meant for children under 13, and we don't knowingly collect information from them. If you think a child under 13 has an account, email us and we'll delete it.

## Changes to this policy

If we change this policy, we'll update the date at the top. If a change affects how we use information you've already given us, we'll tell you by email before it takes effect.

## Contact

Email [hello@avenire.space](mailto:hello@avenire.space).
