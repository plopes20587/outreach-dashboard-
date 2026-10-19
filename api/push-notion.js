export const config = { runtime: "edge" };

import { json, preflight, missingEnv, readBody, UpstreamError, upstreamMessage, errorResponse } from "./lib/http.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// "Today" has to be Pat's today. This function runs in UTC, so computing the
// date here stamped a 6pm US push with tomorrow's date. The browser sends its
// local date instead; UTC is only the fallback for a request without one.
function resolveToday(clientDate) {
  return DATE_PATTERN.test(clientDate || "")
    ? clientDate
    : new Date().toISOString().split("T")[0];
}

// Date-only math on a "YYYY-MM-DD" string. Done in UTC on purpose: the input
// is already Pat's local date, so no time zone should shift it again.
function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

export default async function handler(request) {
  const earlyResponse =
    preflight(request) || missingEnv("NOTION_API_KEY", "NOTION_DATABASE_ID");
  if (earlyResponse) return earlyResponse;

  const body = await readBody(request);
  if (!body) return json({ error: "Invalid request body" }, 400);

  const { contact } = body;
  if (!contact?.name?.trim()) {
    return json({ error: "contact.name is required" }, 400);
  }
  if (!contact?.company?.trim()) {
    return json({ error: "contact.company is required" }, 400);
  }

  const dateTriggered =
    contact.status === "Email Sent" || contact.status === "Follow-up Sent";
  const today = resolveToday(body.today);

  const properties = {
    "Contact Name": { title: [{ text: { content: contact.name } }] },
    "Company":      { rich_text: [{ text: { content: contact.company } }] },
    ...(contact.title    && { "Title":    { rich_text: [{ text: { content: contact.title    } }] } }),
    ...(contact.location && { "Location": { rich_text: [{ text: { content: contact.location } }] } }),
    ...(contact.email    && { "Email":    { email: contact.email } }),
    ...(contact.linkedin && { "Linkedin": { url: contact.linkedin } }),
    ...(contact.contactType && { "Contact Type": { select: { name: contact.contactType } } }),
    ...(contact.leadType    && { "Lead Type":    { select: { name: contact.leadType    } } }),
    // Composed by the frontend from the research output. Sliced because Notion
    // rejects a rich_text object over 2000 characters outright.
    ...(contact.notes && { "Notes": { rich_text: [{ text: { content: String(contact.notes).slice(0, 2000) } }] } }),
    "Status": { status: { name: contact.status || "Did not send" } },
    ...(dateTriggered && {
      "Email Sent":     { date: { start: today } },
      "Follow up date": { date: { start: addDays(today, 10) } },
    }),
  };

  try {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties,
      }),
    });

    if (!res.ok) {
      throw new UpstreamError("Notion", res.status, await upstreamMessage(res));
    }

    const page = await res.json();
    return json({ id: page.id, url: page.url });
  } catch (err) {
    return errorResponse(err, "push-notion", "Failed to push to Notion");
  }
}
