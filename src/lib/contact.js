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
