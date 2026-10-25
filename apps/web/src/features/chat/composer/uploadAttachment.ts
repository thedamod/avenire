"use client";

// Chat and manual Sources uploads use the same durable ingestion path.
export { kindForFile, uploadSource as uploadAttachment } from "../../library/uploadSource.ts";
