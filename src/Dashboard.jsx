import { useState } from "react";
import { api } from "./lib/api";
import { initContact, diffProfile, isLinkedInProfile, sameAnchor } from "./lib/contact";
import { researchErrorMessage } from "./lib/contacts";
import { useLinkedInFetch } from "./hooks/useLinkedInFetch";
import PostingAnalyzer from "./components/PostingAnalyzer";
import FindPeople from "./components/FindPeople";
import ContactPanel from "./components/ContactPanel";
import ComposeCard from "./components/ComposeCard";

// The whole app: one page, four cards, two columns.
//
// Left is the posting and what the rubric said about it. Right is the working
// sequence: find a person, fill in their record, produce the message.
//
// The analysis is the only unbounded output in the app -- a real job posting
// runs well over a screen -- so it gets a column to itself and can grow to any
// height without displacing a step. It also reads as reference material: you
// consult it once to decide whether to pursue, which is a different activity
// from working through the flow beside it. An earlier version put Find people
// under the analyzer, and a long result pushed step 2 off screen while this
// column sat half empty.
//
// Dashboard owns everything shared across the cards, which is what lets a single
// Contact card serve every input path.
export default function Dashboard() {
  // Step 1: posting analysis. `analysis.posting_type` is the discriminator that
  // decides which rubric ran and therefore which layout renders.
  const [posting, setPosting] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  // The exact text the current analysis was run on. This is to a posting what
  // `contactAnchor` is to a person: what tells a new posting apart from a re-run
  // of the one already loaded.
  const [analyzedPosting, setAnalyzedPosting] = useState(null);

  // Step 2: finding a person. Two related clusters, each grouped into one object
  // instead of loose useState calls. The card that reads them took 20 props
  // before the merge and would have taken close to 30 after; a state object plus
  // a patcher keeps that at a readable size and means adding a field later does
  // not mean threading two more props through.
  const [search, setSearch] = useState({
    company: "", domain: "", searching: false,
    results: [], done: false, error: null, selIdx: null,
  });
  const [lookup, setLookup] = useState({
    mode: "url", url: "", name: "", company: "",
    loading: false, status: null, error: null,
  });
  const patchSearch = (fields) => setSearch((s) => ({ ...s, ...fields }));
  const patchLookup = (fields) => setLookup((l) => ({ ...l, ...fields }));

  // Step 3: the one shared contact, plus where its current contents came from.
  const [contact, setContact] = useState(initContact());
  const [contactSource, setContactSource] = useState(null);
  // Which person this record is about: a LinkedIn URL, or "name at company".
  // Set by every path that loads someone, and compared against the next look-up
  // so a different person replaces the record instead of merging onto it.
  const [contactAnchor, setContactAnchor] = useState(null);
  const [researchData, setResearchData] = useState(null); // { research_notes, hook }
  const { fetching, fetchStatus, setFetchStatus, fetchLinkedIn } = useLinkedInFetch(setContact);

  // Step 4: composed output.
  const [outreachPrompt, setOutreachPrompt] = useState(null);
  const [pitch, setPitch] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [pitchError, setPitchError] = useState(null);

  // `forceType` is passed only by the re-run override in the analyzer card.
  async function handleAnalyze(forceType) {
    if (!posting.trim()) return;
    // Captured once so a mid-request edit cannot make the comparison below
    // target text the analysis was not actually run on.
    const text = posting;
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalysis(null);
    try {
      const data = await api.analyzePosting(text, forceType);
      setAnalysis(data);

      // A different posting is a different hunt, so everything below it goes.
      // The re-run type override passes the same text and so keeps the person:
      // that is the same posting being re-scored, not a new one.
      //
      // This fires on success rather than on click on purpose. Clearing at click
      // time would destroy a contact you already had whenever an analyze failed.
      if (text !== analyzedPosting) clearHunt();
      setAnalyzedPosting(text);

      // Pre-fill the search fields so Find people is ready without retyping.
      // Runs after clearHunt so the prefill lands on cleared search state.
      // A job posting names the employer; a contract names the client.
      const org = data.posting_type === "freelance" ? data.client : data.company;
      if (org) {
        patchSearch({
          company: org,
          // A client name rarely maps to a searchable domain, so only a job
          // posting gets a guessed one.
          ...(data.posting_type !== "freelance" && {
            domain: org.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com",
          }),
        });
      }
    } catch (err) {
      setAnalyzeError(err.message || "Failed to analyze posting.");
    } finally {
      setAnalyzing(false);
    }
  }

  // The one manual start-over in the app, and the only control that throws away
  // work. It sits at the top of the flow because that is where a new hunt
  // begins: a new posting means a new company, a new person, and a new message.
  function handleClearPosting() {
    setPosting("");
    setAnalysis(null);
    setAnalyzeError(null);
    setAnalyzedPosting(null);
    clearHunt();
  }

  // The single place a person is started. Every path that loads somebody new
  // goes through here, so nothing from the previous contact can survive into the
  // new record: the email, the contact type, and the research notes are cleared
  // along with the name. Merging was how a message went out to the right name at
  // a previous contact's email address.
  //
  // The outreach prompt goes too, since it was built from the person who just
  // left. The posting analysis and the pitch stay: they belong to the posting.
  function startContact(seed = {}, anchor = null) {
    setContact({ ...initContact(), ...seed });
    setContactAnchor(anchor);
    setContactSource(null);
    setResearchData(null);
    setOutreachPrompt(null);
    setFetchStatus(null);
  }

  // Everything downstream of the posting: the person, how they were found, and
  // whatever was composed for them. Called when a new posting is analyzed and by
  // the start-over button, since all of it belongs to the posting that just left.
  function clearHunt() {
    startContact();
    patchSearch({
      company: "", domain: "",
      results: [], done: false, selIdx: null, error: null,
    });
    patchLookup({ url: "", name: "", company: "", status: null, error: null });
    setPitch(null);
    setPitchError(null);
  }

  // The single research entry point. Both the direct look-up in Find people and
  // the "Research this person" button in the Contact card go through here, so
  // the endpoint is called exactly one way and the result is applied exactly one
  // way. Throws on failure; each caller renders the error where it belongs.
  //
  // Research fills blanks but never overwrites. It is a web search, and the page
  // it lands on is often an old profile or a stale press mention, so a contact
  // that arrived correct from Hunter.io must not be quietly downgraded by it.
  // Anything research disagrees with is kept on `profile` unapplied and surfaces
  // in the Contact card as a suggestion Pat can accept or wave off.
  async function runResearch(payload, resolvedLinkedin = "") {
    const result = await api.researchPerson(payload);
    setContact((c) => {
      const { fills } = diffProfile(c, result);
      return { ...c, ...fills, linkedin: resolvedLinkedin || c.linkedin };
    });
    setResearchData({
      research_notes:  result.research_notes,
      company_context: result.company_context,
      hook:            result.hook,
      as_of:           result.as_of,
      confidence:      result.confidence,
      sources:         result.sources,
      // Kept unapplied. ContactPanel diffs it against the live contact on every
      // render rather than against a snapshot, so hand-editing a field after a
      // research run re-raises the mismatch instead of leaving stale notes
      // silently attached to a person they are no longer about.
      profile: {
        name:     result.name,
        title:    result.title,
        company:  result.company,
        location: result.location,
      },
    });
    setContactSource("Research");
    return result;
  }

  // Accepting one suggested field. The rest of the research profile stays
  // unapplied, so this is deliberately per-field rather than an "apply all".
  function acceptSuggestion(field, value) {
    setContact((c) => ({ ...c, [field]: value }));
  }

  async function handleSelectContact(idx) {
    const result = search.results[idx];
    patchSearch({ selIdx: idx });
    // A different search result is a different person, so the record starts
    // over. Picking B after A used to leave A's email in the field.
    startContact(
      {
        name:        result.name         || "",
        title:       result.title        || "",
        email:       result.email        || "",
        linkedin:    result.linkedin     || "",
        contactType: result.contact_type || "",
        company:     search.company      || "",
      },
      result.linkedin || `${result.name} at ${search.company}`,
    );
    setContactSource(result.email ? "Hunter.io" : "LinkedIn");
    // Enrichment of the record just created, so this one does merge.
    if (isLinkedInProfile(result.linkedin || "")) {
      await fetchLinkedIn(result.linkedin);
    }
  }

  // The direct-add path. One input covers what used to be two: a LinkedIn
  // profile goes to the cheap Haiku field extraction, and anything else (Product
  // Hunt, Crunchbase, a company site) goes to the research endpoint, which is
  // the only one that can actually read those pages.
  async function handleLookup() {
    const isUrl = lookup.mode === "url";
    const value = isUrl ? lookup.url.trim() : lookup.name.trim();
    if (!value) return;

    // A look-up names a person, so unless it names the one already loaded it
    // starts the record over. Re-running the same URL still enriches, which is
    // what keeps an email you already typed for that person.
    const anchor = isUrl ? value : `${value} at ${lookup.company.trim()}`;
    const linkedin = isUrl && isLinkedInProfile(value) ? { linkedin: value } : {};
    if (sameAnchor(contactAnchor, anchor)) {
      setContact((c) => ({ ...c, ...linkedin }));
    } else {
      startContact(linkedin, anchor);
    }

    patchLookup({ loading: true, status: null, error: null });
    setFetchStatus(null);
    try {
      if (isUrl && isLinkedInProfile(value)) {
        // fetchLinkedIn reports its outcome through fetchStatus rather than
        // throwing, so this path renders no lookup status of its own. It returns
        // the outcome too, because state is not readable right after the await.
        if (await fetchLinkedIn(value)) setContactSource("LinkedIn");
      } else {
        const payload = isUrl
          ? { url: value }
          : { name: value, company: lookup.company.trim() };
        await runResearch(payload);
        patchLookup({ status: "ok" });
      }
    } catch (err) {
      patchLookup({ error: researchErrorMessage(err) });
    } finally {
      patchLookup({ loading: false });
    }
  }

  // The Contact card's own LinkedIn field. Pasting there is either filling in
  // the URL for the person already loaded or pointing at somebody else, and the
  // anchor is what tells them apart: a URL that does not match the loaded
  // profile is a different person, so the record starts over. With no anchor
  // (a contact typed by hand) the URL is taken as belonging to that person.
  //
  // This one deliberately leaves `contactSource` alone. That note means step 2
  // handed over this person, and typing into step 3 is not step 2 doing work.
  async function handleContactLinkedIn(url) {
    const value = (url || "").trim();
    if (!isLinkedInProfile(value)) return false;
    if (contactAnchor && !sameAnchor(contactAnchor, value)) {
      startContact({ linkedin: value }, value);
    } else if (!contactAnchor) {
      setContactAnchor(value);
    }
    return fetchLinkedIn(value);
  }

  async function handleGeneratePitch() {
    if (!posting.trim()) {
      setPitchError("Paste a posting into the Analyze card before generating a pitch.");
      return;
    }
    setGenerating(true);
    setPitchError(null);
    try {
      // Only freelance analysis steers a pitch. Passing a full-time fit analysis
      // would feed job-hunting language into a client proposal.
      const context = analysis?.posting_type === "freelance" ? analysis : undefined;
      const data = await api.generatePitch(posting, context);
      setPitch(data);
    } catch (err) {
      console.error("generatePitch:", err.message);
      setPitchError(err.message || "Failed to generate pitch. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  // Which steps have produced something. This is the whole progress model: a
  // step is done when it has output, not when it has been visited.
  // `contactSource` is set only by step 2's own actions, so it is the honest
  // signal that step 2 handed a person to step 3. Keying off fetchStatus instead
  // would light step 2 green when the Contact card's own LinkedIn field fired.
  const postingDone = Boolean(analysis);
  const peopleDone  = (search.done && search.results.length > 0) || Boolean(contactSource);
  const contactDone = Boolean(contact.name.trim() && contact.company.trim());
  const composeDone = Boolean(outreachPrompt || pitch);

  const analyzedOrg = analysis?.posting_type === "freelance" ? analysis?.client : analysis?.company;

  return (
    <div className="workspace">
      <div className="workspace-col">
        <PostingAnalyzer
          posting={posting}
          setPosting={setPosting}
          analysis={analysis}
          analyzing={analyzing}
          analyzeError={analyzeError}
          onAnalyze={handleAnalyze}
          onClear={handleClearPosting}
          step={1}
          done={postingDone}
        />
      </div>

      <div className="workspace-col">
        <FindPeople
          step={2}
          done={peopleDone}
          note={analyzedOrg ? `From ${analyzedOrg}` : undefined}
          search={search}
          patchSearch={patchSearch}
          lookup={lookup}
          patchLookup={patchLookup}
          searchTitles={analysis?.search_titles}
          onSelectContact={handleSelectContact}
          onLookup={handleLookup}
          fetching={fetching}
          fetchStatus={fetchStatus}
        />

        <ContactPanel
          step={3}
          done={contactDone}
          note={contactSource || undefined}
          contact={contact}
          setContact={setContact}
          fetching={fetching}
          fetchStatus={fetchStatus}
          setFetchStatus={setFetchStatus}
          onFetchLinkedIn={handleContactLinkedIn}
          research={researchData}
          onResearch={runResearch}
          onAcceptSuggestion={acceptSuggestion}
          personId={contactAnchor}
        />

        <ComposeCard
          step={4}
          done={composeDone}
          contact={contact}
          analysis={analysis}
          research={researchData}
          posting={posting}
          outreachPrompt={outreachPrompt}
          setOutreachPrompt={setOutreachPrompt}
          pitch={pitch}
          generating={generating}
          pitchError={pitchError}
          onGeneratePitch={handleGeneratePitch}
        />
      </div>
    </div>
  );
}
