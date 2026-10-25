"use client";

import { useEffect } from "react";

export const SITE_NAME = "Avenire";

/** The tab title for a page whose name comes from data (a notebook, note, source or chat). */
export const pageTitle = (title: string | undefined): string =>
  title?.trim() ? `${title.trim()} · ${SITE_NAME}` : SITE_NAME;

/**
 * Sets the tab title once the page knows its name. Next renders the route's static title first;
 * this overrides it and puts it back on unmount, so a following route that shares the static
 * title (Next sees no change and does not rewrite it) doesn't inherit this page's name.
 */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    const previous = document.title;
    return () => {
      document.title = previous;
    };
  }, []);
  useEffect(() => {
    if (title?.trim()) document.title = pageTitle(title);
  }, [title]);
}
