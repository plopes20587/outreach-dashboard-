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
    research.research_notes,
    research.company_context && `Company: ${research.company_context}`,
    research.hook && `Hook: ${research.hook}`,
  ].filter(Boolean);
  return sections.join("\n\n").slice(0, 2000);
}
