// Contact classification and merging. These are pure functions with no React in
// them, so they live here rather than inside the card that calls them: keeping
// them out of FindPeople.jsx is the difference between a ~200-line component and
// a ~330-line one, and it means the ranking rules can be read (or tested)
// without reading the UI around them.

// Maps a job title to a relevance score + category. Pure: it never drops a
// title, it only classifies. Anything unmatched falls through to "Other", and
// the result mappers below are what actually drop those.
export function classifyTitle(title = "") {
  const designLeader =
    /(design|ux|user\s*experience)/i.test(title) &&
    /(head|director|vp|chief|lead|principal|staff|manager)/i.test(title);

  const creativeLeader =
    /(creative\s*director|head\s*of\s*creative|chief\s*creative)/i.test(title);

  const designIC =
    /(product\s*designer|ux\s*designer|ui\s*designer|senior\s*designer|interaction\s*designer|visual\s*designer|brand\s*designer)/i.test(title) ||
    (/(designer)/i.test(title) && !/(graphic|merchandise|fashion|interior|industrial|game)/i.test(title));

  const recruiter =
    /(recruit|talent\s*acquisition|sourcer|talent\s*partner)/i.test(title) &&
    !/(sales|finance|legal|operations|account|customer\s*success)\s*recruit/i.test(title);

  const informational =
    /(product\s*manager|product\s*lead|head\s*of\s*product|director\s*of\s*product|vp\s*of\s*product|chief\s*product)/i.test(title) ||
    /(design\s*ops|designops|design\s*operations)/i.test(title) ||
    /(ux\s*research|user\s*research|ux\s*researcher|user\s*researcher|design\s*research)/i.test(title) ||
    /(service\s*designer|content\s*designer|content\s*strategist|ux\s*writer)/i.test(title) ||
    /(design\s*technologist|design\s*engineer|prototyper)/i.test(title);

  const founder = /(founder|co-founder|ceo)/i.test(title);

  if (designLeader || creativeLeader) return { score: 100, contactType: "Hiring Manager" };
  if (designIC)                       return { score: 80,  contactType: "Referral" };
  if (recruiter)                      return { score: 70,  contactType: "Recruiter" };
  if (informational)                  return { score: 50,  contactType: "Informational" };
  if (founder)                        return { score: 40,  contactType: "Boss Hunt" };
  return { score: 10, contactType: "Other" };
}

// Hunter.io email record -> unified contact result. Dropped when there is no
// usable name, or when the title is not design-relevant: a company-wide search
// otherwise surfaces the whole org, which is mostly noise for design outreach.
export function classifyContact(person, targetTitles = []) {
  const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  if (!fullName) return null;

  const title = person.position || "";
  let { score, contactType } = classifyTitle(title);
  if (contactType === "Other") return null;

  const t = title.toLowerCase();
  targetTitles.forEach((target) => {
    const keyword = target.toLowerCase().split(" ")[0];
    if (keyword && t.includes(keyword)) score += 5;
  });

  return {
    name: fullName,
    email: person.value || "",
    title,
    linkedin: person.linkedin || "",
    contact_type: contactType,
    snippet: person.department ? `Dept: ${person.department}` : "",
    score,
  };
}

// /api/search-linkedin result -> the same unified shape, scored through the same
// classifyTitle so both sources rank on one scale.
export function mapLinkedInResult(r) {
  const name = (r.name || "").trim();
  if (!name) return null;

  const { score, contactType } = classifyTitle(r.title || "");
  const finalType = r.contact_type || contactType;
  if (finalType === "Other") return null;

  return {
    name,
    email: "",
    title: r.title || "",
    linkedin: r.linkedin || "",
    contact_type: finalType,
    snippet: r.snippet || "",
    score,
  };
}

// Merges two contact lists, de-duping by email, then normalized LinkedIn URL,
// then lowercased name. The record with an email (Hunter) wins a collision, and
// the other backfills whatever it is missing.
export function mergeContacts(primary, secondary) {
  const byKey = new Map();

  const keyFor = (c) =>
    (c.email || "").toLowerCase().trim() ||
    (c.linkedin || "").toLowerCase().replace(/\/+$/, "").trim() ||
    (c.name || "").toLowerCase().trim();

  for (const c of [...primary, ...secondary]) {
    const key = keyFor(c);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, c);
      continue;
    }
    const keep = existing.email ? existing : c;
    const other = existing.email ? c : existing;
    byKey.set(key, {
      ...keep,
      linkedin: keep.linkedin || other.linkedin,
      snippet:  keep.snippet  || other.snippet,
      title:    keep.title    || other.title,
    });
  }

  return [...byKey.values()];
}

// Both research entry points (the direct look-up in Find people and the
// "Research this person" button in the Contact card) surface the same failure,
// so they map it the same way. The endpoint's "not_found" is the one case worth
// rewording, because the fix is on the user's side.
export function researchErrorMessage(err) {
  return err.message === "not_found"
    ? "Could not find this person. Try a different URL or add a company."
    : err.message || "Research failed.";
}
