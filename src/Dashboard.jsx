import { useState } from "react";
import { api } from "./lib/api";
import { initContact, applyProfile } from "./lib/contact";
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
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalysis(null);
    try {
      const data = await api.analyzePosting(posting, forceType);
      setAnalysis(data);

      // Pre-fill the search fields so Find people is ready without retyping.
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

  function handleClearPosting() {
    setPosting("");
    setAnalysis(null);
    setAnalyzeError(null);
  }

  // The single research entry point. Both the direct look-up in Find people and
  // the "Research this person" button in the Contact card go through here, so
  // the endpoint is called exactly one way and the result is applied exactly one
  // way. Throws on failure; each caller renders the error where it belongs.
  async function runResearch(payload, resolvedLinkedin = "") {
    const result = await api.researchPerson(payload);
    setContact((c) => ({
      ...applyProfile(c, result),
      linkedin: resolvedLinkedin || c.linkedin,
    }));
    setResearchData({ research_notes: result.research_notes, hook: result.hook });
    setContactSource("Research");
    return result;
  }

  async function handleSelectContact(idx) {
    const result = search.results[idx];
    patchSearch({ selIdx: idx });
    setContact((c) => ({
      ...c,
      name:        result.name         || c.name,
      title:       result.title        || c.title,
      email:       result.email        || c.email,
      linkedin:    result.linkedin     || c.linkedin,
      contactType: result.contact_type || c.contactType,
      company:     search.company      || c.company,
    }));
    setContactSource(result.email ? "Hunter.io" : "LinkedIn");
    if (result.linkedin && result.linkedin.includes("linkedin.com/in/")) {
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

    patchLookup({ loading: true, status: null, error: null });
    setFetchStatus(null);
    try {
      if (isUrl && value.includes("linkedin.com/in/")) {
        setContact((c) => ({ ...c, linkedin: value }));
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

  // Reset clears everything that belonged to the cleared contact: the search
  // selection, the direct look-up inputs, the research, and any outreach prompt
  // built from them. The posting analysis and the generated pitch survive on
  // purpose, since they belong to the posting rather than to the person.
  function handleResetContact() {
    patchSearch({ selIdx: null });
    patchLookup({ url: "", name: "", company: "", status: null, error: null });
    setResearchData(null);
    setContactSource(null);
    setOutreachPrompt(null);
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
          onFetchLinkedIn={fetchLinkedIn}
          research={researchData}
          onResearch={runResearch}
          onReset={handleResetContact}
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
