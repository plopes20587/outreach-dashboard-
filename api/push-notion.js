export const config = { runtime: "edge" };

const CORS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function tenDaysFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  return d.toISOString().split("T")[0];
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!process.env.NOTION_API_KEY) {
    return json({ error: "NOTION_API_KEY is not configured" }, 500);
  }
  if (!process.env.NOTION_DATABASE_ID) {
    return json({ error: "NOTION_DATABASE_ID is not configured" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { contact } = body;
  if (!contact?.name?.trim()) {
    return json({ error: "contact.name is required" }, 400);
  }
  if (!contact?.company?.trim()) {
    return json({ error: "contact.company is required" }, 400);
  }

  const dateTriggered =
    contact.status === "Email Sent" || contact.status === "Follow-up Sent";

  const properties = {
    "Contact Name": { title: [{ text: { content: contact.name } }] },
    "Company":      { rich_text: [{ text: { content: contact.company } }] },
    ...(contact.title    && { "Title":    { rich_text: [{ text: { content: contact.title    } }] } }),
    ...(contact.location && { "Location": { rich_text: [{ text: { content: contact.location } }] } }),
    ...(contact.email    && { "Email":    { email: contact.email } }),
    ...(contact.linkedin && { "Linkedin": { url: contact.linkedin } }),
    ...(contact.contactType && { "Contact Type": { select: { name: contact.contactType } } }),
    ...(contact.leadType    && { "Lead Type":    { select: { name: contact.leadType    } } }),
    "Status": { select: { name: contact.status || "Did not send" } },
    ...(dateTriggered && {
      "Email Sent":     { date: { start: today() } },
      "Follow up date": { date: { start: tenDaysFromNow() } },
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
      const detail = await res.text();
      console.error("Notion error:", detail);
      return json({ error: `Notion API error ${res.status}: ${detail}` }, 502);
    }

    const page = await res.json();
    return json({ id: page.id, url: page.url });
  } catch (err) {
    console.error("push-notion:", err.message);
    return json({ error: "Failed to push to Notion" }, 500);
  }
}
