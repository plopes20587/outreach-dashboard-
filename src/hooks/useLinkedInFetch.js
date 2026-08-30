import { useState } from "react";
import { api } from "../lib/api";
import { applyProfile } from "../lib/contact";

// Owns a single LinkedIn profile fetch plus its loading/status. Every trigger
// (search-result select, manual URL entry, and the contact card's own field)
// shares one instance per tab, so the "Fetching / Profile loaded" feedback fires
// no matter how the fetch was started. `setContact` is Dashboard's contact
// setter; the fetched fields are merged in via applyProfile.
//
// Returns whether the fetch succeeded. The status is reported through state for
// rendering, but state is not readable by the caller right after the await, and
// callers need the outcome to decide what else to update.
export function useLinkedInFetch(setContact) {
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState(null); // "ok" | "error" | null

  async function fetchLinkedIn(url) {
    if (!url || !url.includes("linkedin.com/in/")) return false;
    setFetching(true);
    setFetchStatus(null);
    try {
      const data = await api.fetchLinkedIn(url);
      setContact((c) => applyProfile(c, data));
      setFetchStatus("ok");
      return true;
    } catch (err) {
      console.error("fetchLinkedIn:", err.message);
      setFetchStatus("error");
      return false;
    } finally {
      setFetching(false);
    }
  }

  return { fetching, fetchStatus, setFetchStatus, fetchLinkedIn };
}
