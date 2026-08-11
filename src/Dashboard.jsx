import { useState } from "react";
import { api } from "./lib/api";
import { initContact, applyProfile } from "./lib/contact";
import { useLinkedInFetch } from "./hooks/useLinkedInFetch";
import PostingAnalyzer from "./components/PostingAnalyzer";
import ResearchCard from "./components/ResearchCard";
import FindContacts from "./components/FindContacts";
import ContactPanel from "./components/ContactPanel";
import ComposeCard from "./components/ComposeCard";

// The whole app: one page, five cards, fixed order, all always visible.
//
// There are no tabs and no collapsing. The two-tab split used to force a choice
// up front ("am I doing a job or a freelance thing?") that the work does not
// actually make: the same contact, the same research, and the same posting feed
// both outcomes. Dashboard owns everything shared across the five cards, which
// is what lets a single Contact card serve all of them.
export default function Dashboard() {
  // Card 1: posting analysis. `analysis.posting_type` is the discriminator that
  // decides which rubric ran and therefore which layout renders.
  const [posting, setPosting] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);

  // Card 2: person research.
  const [researchData, setResearchData] = useState(null); // { research_notes, hook }
  const [researchKey, setResearchKey] = useState(0);      // bump to remount and clear

  // Card 3: contact search.
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchDone, setSearchDone] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selIdx, setSelIdx] = useState(null);
  const [manualUrl, setManualUrl] = useState("");

  // Card 4: the one shared contact.
  const [contact, setContact] = useState(initContact());
  const { fetching, fetchStatus, setFetchStatus, fetchLinkedIn } = useLinkedInFetch(setContact);

  // Card 5: composed output.
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

      // Pre-fill the search fields so Find contacts is ready without retyping.
      // A job posting names the employer; a contract names the client.
      const org = data.posting_type === "freelance" ? data.client : data.company;
      if (org) {
        setCompany(org);
        if (data.posting_type !== "freelance") {
          setDomain(org.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com");
        }
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

  function handleResearchResult(data, resolvedLinkedin) {
    setContact((c) => ({
      ...applyProfile(c, data),
      linkedin: resolvedLinkedin || c.linkedin,
    }));
    setResearchData({ research_notes: data.research_notes, hook: data.hook });
  }

  async function handleSelectContact(idx) {
    const result = searchResults[idx];
    setSelIdx(idx);
    setContact((c) => ({
      ...c,
      name:        result.name         || c.name,
      title:       result.title        || c.title,
      email:       result.email        || c.email,
      linkedin:    result.linkedin     || c.linkedin,
      contactType: result.contact_type || c.contactType,
      company:     company             || c.company,
    }));
    if (result.linkedin && result.linkedin.includes("linkedin.com/in/")) {
      await fetchLinkedIn(result.linkedin);
    }
  }

  async function handleFetchManual() {
    if (!manualUrl.trim()) return;
    setContact((c) => ({ ...c, linkedin: manualUrl }));
    await fetchLinkedIn(manualUrl);
  }

  async function handleGeneratePitch() {
    if (!posting.trim()) {
      setPitchError("Paste a posting above before generating a pitch.");
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <PostingAnalyzer
        posting={posting}
        setPosting={setPosting}
        analysis={analysis}
        analyzing={analyzing}
        analyzeError={analyzeError}
        onAnalyze={handleAnalyze}
        onClear={handleClearPosting}
      />

      <ResearchCard key={researchKey} onResult={handleResearchResult} />

      <FindContacts
        company={company}
        setCompany={setCompany}
        domain={domain}
        setDomain={setDomain}
        searchTitles={analysis?.search_titles}
        onSelectContact={handleSelectContact}
        manualUrl={manualUrl}
        setManualUrl={setManualUrl}
        onFetchManual={handleFetchManual}
        fetching={fetching}
        fetchStatus={fetchStatus}
        setFetchStatus={setFetchStatus}
        searching={searching}
        setSearching={setSearching}
        searchResults={searchResults}
        setSearchResults={setSearchResults}
        searchDone={searchDone}
        setSearchDone={setSearchDone}
        searchError={searchError}
        setSearchError={setSearchError}
        selIdx={selIdx}
        setSelIdx={setSelIdx}
      />

      <ContactPanel
        contact={contact}
        setContact={setContact}
        fetching={fetching}
        fetchStatus={fetchStatus}
        setFetchStatus={setFetchStatus}
        onFetchLinkedIn={fetchLinkedIn}
        onReset={() => {
          // Reset clears everything that belonged to the cleared contact:
          // the search selection, the research (inputs included, via the key
          // bump), and any outreach prompt built from them. The posting analysis
          // and the generated pitch survive on purpose, since they belong to the
          // posting rather than to the person.
          setSelIdx(null);
          setResearchData(null);
          setResearchKey((k) => k + 1);
          setOutreachPrompt(null);
        }}
      />

      <ComposeCard
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
  );
}
