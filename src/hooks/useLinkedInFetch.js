import { useState } from "react";
import { api } from "../lib/api";
import { applyProfile } from "../lib/contact";

// Owns a single LinkedIn profile fetch plus its loading/status. Every trigger
// (search-result select, manual URL entry, and the contact card's own field)
// shares one instance per tab, so the "Fetching / Profile loaded" feedback fires
// no matter how the fetch was started. `setContact` is the tab's contact setter;
// the fetched fields are merged in via applyProfile.
export function useLinkedInFetch(setContact) {
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState(null); // "ok" | "error" | null

  async function fetchLinkedIn(url) {
    if (!url || !url.includes("linkedin.com/in/")) return;
    setFetching(true);
    setFetchStatus(null);
    try {
      const data = await api.fetchLinkedIn(url);
      setContact((c) => applyProfile(c, data));
      setFetchStatus("ok");
    } catch (err) {
      console.error("fetchLinkedIn:", err.message);
      setFetchStatus("error");
    } finally {
      setFetching(false);
    }
  }

  return { fetching, fetchStatus, setFetchStatus, fetchLinkedIn };
}
