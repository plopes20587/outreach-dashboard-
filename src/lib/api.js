const API_BASE = "";

async function request(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // One endpoint for both job descriptions and freelance contracts. It detects
  // which rubric to run; forceType ("full-time" | "freelance") overrides that.
  analyzePosting: (posting, forceType) => request("/api/analyze-posting",       { method: "POST", body: JSON.stringify({ posting, forceType }) }),
  findContacts:   (domain, limit=10)=> request(`/api/find-contacts?domain=${encodeURIComponent(domain)}&limit=${limit}`),
  fetchLinkedIn:  (url)             => request("/api/fetch-linkedin",            { method: "POST", body: JSON.stringify({ url }) }),
  searchLinkedIn: (company, titles) => request("/api/search-linkedin",           { method: "POST", body: JSON.stringify({ company, titles }) }),
  researchPerson: ({ url, name, company }) => request("/api/research-person",     { method: "POST", body: JSON.stringify({ url, name, company }) }),
  pushNotion:     (contact)         => request("/api/push-notion",               { method: "POST", body: JSON.stringify({ contact }) }),
  // analysis is optional freelance context from analyzePosting; pitch works without it
  generatePitch:  (posting, analysis) => request("/api/generate-pitch",          { method: "POST", body: JSON.stringify({ posting, analysis }) }),
};
