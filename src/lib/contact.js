// Returns a blank contact record. Dashboard holds exactly one of these, shared
// by every input path (company search, direct look-up, manual entry).
export function initContact() {
  return {
    name: "", company: "", title: "", location: "",
    email: "", linkedin: "", contactType: "", leadType: "",
    status: "Did not send",
  };
}

// Merges the profile fields returned by fetch-linkedin / research-person into an
// existing contact, keeping current values when the incoming field is empty.
// Both enrichment paths share it so they cannot drift apart on which fields win.
export function applyProfile(contact, data) {
  return {
    ...contact,
    name:     data.name     || contact.name,
    title:    data.title    || contact.title,
    company:  data.company  || contact.company,
    location: data.location || contact.location,
  };
}

// The four profile fields an enrichment call can speak to. Same list applyProfile
// writes, which is the point: diffProfile is its non-destructive counterpart.
const PROFILE_FIELDS = ["name", "title", "company", "location"];

// Splits an incoming research profile against the contact already loaded:
//   fills     - fields the contact has no value for, so writing them loses nothing
//   conflicts - fields where research disagrees with a value already there
//
// Research is a web search that frequently lands on an outdated profile or an old
// press mention, so a conflict is a question for Pat, not an instruction to the
// record. This is why research does not go through applyProfile: a contact that
// arrived correct from Hunter.io would be silently downgraded to older data, and
// that stale title then flowed into the outreach prompt and into Notion.
export function diffProfile(contact, data) {
  const normalize = (value) => String(value || "").trim().toLowerCase();
  const fills = {};
  const conflicts = {};

  PROFILE_FIELDS.forEach((field) => {
    const incoming = (data?.[field] || "").trim();
    if (!incoming) return;
    if (!contact[field]?.trim()) fills[field] = incoming;
    else if (normalize(contact[field]) !== normalize(incoming)) conflicts[field] = incoming;
  });

  return { fills, conflicts };
}

// True for a LinkedIn personal profile URL. The cheap Haiku extraction only
// works on these; anything else has to go to the research endpoint.
export function isLinkedInProfile(url = "") {
  return url.includes("linkedin.com/in/");
}

// The identity a contact record belongs to: a LinkedIn URL, or "name at company"
// when there is no URL. Dashboard keeps the anchor of the person currently
// loaded, and any look-up whose anchor does not match it is a different person,
// so the record is started over instead of merged onto.
//
// Matching is on the profile slug rather than the raw string, so the same person
// reached through a tracking-parameter URL is still recognised as the same
// person and keeps the email you already have for them.
export function sameAnchor(a, b) {
  if (!a || !b) return false;
  const normalize = (value) => {
    const slug = String(value).match(/linkedin\.com\/in\/([^/?#]+)/i);
    return (slug ? slug[1] : String(value)).trim().toLowerCase().replace(/\/+$/, "");
  };
  return normalize(a) === normalize(b);
}

// One line saying how old the research is and how much of it was actually
// confirmed. It leads the Notion note for the same reason it leads the research
// block on screen: a note read six weeks from now should say up front that its
// claims were never verified. Returns "" when the endpoint sent no metadata.
export function buildProvenanceLine(research) {
  if (!research?.as_of && !research?.confidence) return "";
  const dated = research.as_of && research.as_of !== "Unknown";
  return [
    `Web research${dated ? ` as of ${research.as_of}` : " (date unknown)"}`,
    research.confidence ? `confidence: ${research.confidence}` : "",
    "not verified, so check the title before sending.",
  ]
    .filter(Boolean)
    .join(", ");
}

// Composes the research into the plain-text value for Notion's Notes property,
// so the reasoning behind an outreach survives in the tracker rather than living
// only on screen. Returns "" when nothing was researched, which is the caller's
// signal to omit the property entirely.
//
// Capped at 2000 characters: that is Notion's limit for one rich_text object,
// and a longer value is rejected outright rather than truncated for you.
export function buildResearchNotes(research) {
  if (!research) return "";
  const sections = [
    buildProvenanceLine(research),
    research.research_notes,
    research.company_context && `Company: ${research.company_context}`,
    research.hook && `Hook: ${research.hook}`,
  ].filter(Boolean);
  return sections.join("\n\n").slice(0, 2000);
}
