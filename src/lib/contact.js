// Returns a blank contact record. Each tab seeds its own independent `contact`
// state from this (the Outreach tab and the Freelance Pitch tab keep separate
// state; only the ContactPanel UI + its local actions are shared).
export function initContact() {
  return {
    name: "", company: "", title: "", location: "",
    email: "", linkedin: "", contactType: "", leadType: "",
    status: "Did not send",
  };
}

// Merges the profile fields returned by fetch-linkedin / research-person into an
// existing contact, keeping current values when the incoming field is empty.
export function applyProfile(contact, data) {
  return {
    ...contact,
    name:     data.name     || contact.name,
    title:    data.title    || contact.title,
    company:  data.company  || contact.company,
    location: data.location || contact.location,
  };
}
