import { useState } from "react";
import { api } from "../lib/api";
import { classifyContact, mapLinkedInResult, mergeContacts } from "../lib/contacts";
import Card from "./Card";
import Field from "./Field";
import Button from "./Button";
import ContactCard from "./ContactCard";

// Step 2 of the flow: get a person. This is the merge of the old "Research a
// person" and "Find contacts" cards, which were two cards doing one job. The
// split forced a choice up front ("am I searching a company or looking up one
// person?") that the actual work never makes, and it duplicated a Company input
// and a URL input across the two.
//
// Everything this card produces lands in the Contact card, which is where a
// person is edited and researched. This card only finds them.
export default function FindPeople({
  step, done, note,
  search, patchSearch,
  lookup, patchLookup,
  searchTitles,
  onSelectContact,
  onLookup,
  fetching, fetchStatus,
}) {
  const [linkedinLoading, setLinkedinLoading] = useState(false);

  const { company, domain, searching, results, done: searchDone, error: searchError, selIdx } = search;
  const isUrlMode = lookup.mode === "url";

  // Hunter (fast, has emails) runs first and its results render immediately.
  // The LinkedIn web search is slow, unreliable, and paid, so it runs ONLY as a
  // fallback when Hunter returned fewer than 2 contacts. Its errors are
  // swallowed: a LinkedIn miss must never wipe out Hunter's results.
  async function handleSearch() {
    const hasDomain = domain.trim();
    const hasCompany = company.trim();
    if (!hasDomain && !hasCompany) return;

    // Clear stale look-up feedback so the only status on screen belongs to the
    // action that is running now.
    patchSearch({ searching: true, error: null, done: false, selIdx: null, results: [] });
    patchLookup({ status: null, error: null });

    const sortByScore = (list) => [...list].sort((a, b) => b.score - a.score);
    let merged = [];

    if (hasDomain) {
      try {
        const data = await api.findContacts(domain);
        merged = sortByScore(
          (data.data?.emails || [])
            .map((p) => classifyContact(p, searchTitles || []))
            .filter(Boolean),
        );
        patchSearch({ results: merged, done: true });
      } catch (err) {
        patchSearch({ error: err.message || "Hunter search failed." });
      }
    }

    if (hasCompany && merged.length < 2) {
      setLinkedinLoading(true);
      try {
        const data = await api.searchLinkedIn(company, searchTitles || []);
        const linkedinResults = (Array.isArray(data) ? data : [])
          .map(mapLinkedInResult)
          .filter(Boolean);
        merged = sortByScore(mergeContacts(merged, linkedinResults));
        patchSearch({ results: merged });
      } catch (err) {
        console.error("searchLinkedIn:", err.message);
      } finally {
        setLinkedinLoading(false);
      }
    }

    patchSearch({ done: true, searching: false });
  }

  const lookupBusy = fetching || lookup.loading;
  const lookupDisabled =
    lookupBusy || (isUrlMode ? !lookup.url.trim() : !lookup.name.trim());

  return (
    <Card title="Find people" step={step} done={done} note={note}>
      <div className="grid-2">
        <Field label="Company">
          <input
            value={company}
            onChange={(e) => patchSearch({ company: e.target.value })}
            placeholder="Acme Corp"
          />
        </Field>
        <Field label="Company domain (for Hunter.io)">
          <input
            value={domain}
            onChange={(e) => patchSearch({ domain: e.target.value })}
            placeholder="acmecorp.com"
          />
        </Field>
      </div>

      <div className="btn-row">
        <Button
          variant="green"
          onClick={handleSearch}
          disabled={searching || (!domain.trim() && !company.trim())}
        >
          {searching ? "Searching..." : "Search"}
        </Button>
      </div>

      {searchError && <div className="notice notice-error">{searchError}</div>}

      {searchDone && results.length > 0 && (
        <>
          <div className="divider" />
          <div className="results-header">
            {results.length} contact(s) found -- select one to fill in the Contact card
          </div>
          {linkedinLoading && (
            <div className="results-header muted">Also checking LinkedIn...</div>
          )}
          <div className="results-list">
            {results.map((r, i) => (
              <ContactCard
                key={i}
                contact={r}
                selected={selIdx === i}
                onSelect={() => onSelectContact(i)}
              />
            ))}
          </div>
        </>
      )}

      {/* "No results" is a normal outcome, not a failure, so it uses the neutral
          notice style. Hidden once a profile has loaded, since the prompt it
          makes has been fulfilled by then. */}
      {searchDone && !searching && results.length === 0 && fetchStatus !== "ok" && (
        <div className="notice notice-info">
          No design or recruiting contacts found for {company || domain}. Add someone by URL below.
        </div>
      )}

      <div className="divider" />

      {/* The direct-add path, always rendered rather than toggled: it is the
          reliable route when a company search misses, and it is the only route
          for the founder/CEO case where there is no company to search.
          One input covers both of the old cards' URL fields -- a LinkedIn
          profile goes to the cheap field extraction, anything else goes to the
          research endpoint that can actually read a Product Hunt or company page. */}
      <div className="section-label">Or add someone directly</div>

      {isUrlMode ? (
        <Field label="LinkedIn, Product Hunt, Crunchbase, or company URL">
          <div className="input-with-button">
            <input
              value={lookup.url}
              onChange={(e) => patchLookup({ url: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && !lookupDisabled) onLookup(); }}
              placeholder="https://linkedin.com/in/... or https://producthunt.com/@..."
            />
            <Button variant="green" onClick={onLookup} disabled={lookupDisabled}>
              {lookupBusy ? "Looking up..." : "Look up"}
            </Button>
          </div>
        </Field>
      ) : (
        <>
          <div className="grid-2">
            <Field label="Name">
              <input
                value={lookup.name}
                onChange={(e) => patchLookup({ name: e.target.value })}
                placeholder="First Last"
              />
            </Field>
            <Field label="Company">
              <input
                value={lookup.company}
                onChange={(e) => patchLookup({ company: e.target.value })}
                placeholder="Acme Corp"
              />
            </Field>
          </div>
          <div className="btn-row">
            <Button variant="green" onClick={onLookup} disabled={lookupDisabled}>
              {lookupBusy ? "Looking up..." : "Look up"}
            </Button>
          </div>
        </>
      )}

      <button
        type="button"
        className="link-button"
        onClick={() => patchLookup({ mode: isUrlMode ? "name" : "url", error: null, status: null })}
      >
        {isUrlMode ? "No URL? Look up by name and company" : "Look up by URL instead"}
      </button>

      {fetchStatus === "ok" && (
        <div className="notice notice-success">Profile loaded into the Contact card.</div>
      )}
      {fetchStatus === "error" && (
        <div className="notice notice-error">
          Couldn't load that profile. Check the URL, or fill in the Contact card by hand.
        </div>
      )}
      {lookup.status === "ok" && (
        <div className="notice notice-success">
          Research loaded into the Contact card.
        </div>
      )}
      {lookup.error && <div className="notice notice-error">{lookup.error}</div>}
    </Card>
  );
}
