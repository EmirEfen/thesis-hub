// Edge function: sends a reminder email when you click the button. Only the admin can call it.
// The wording is fixed in this file (no AI). You can add one short custom line per send.
// Secrets you set: SITE_URL, SENDER_NAME, REPLY_TO, EMAIL_FROM, and ONE of RESEND_API_KEY or BREVO_API_KEY.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("SITE_URL") ?? "";
const SENDER_NAME = Deno.env.get("SENDER_NAME") ?? "Your supervisor";
const REPLY_TO = Deno.env.get("REPLY_TO") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? ""; // e.g. thesis@yourdomain.com (must be verified with the provider)
const MIN_DAYS_BETWEEN = 3; // same reminder type to the same student: at most once per 3 days

const cors = {
  "Access-Control-Allow-Origin": SITE_URL ? new URL(SITE_URL).origin : "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Kind = "note" | "snapshot" | "checkin";

function compose(kind: Kind, name: string, extra: string, missing: string[]) {
  const first = name.split(/\s+/)[0];
  const tail = (extra ? `\n${extra}\n` : "") + `\nBest,\n${SENDER_NAME}`;
  if (kind === "note") {
    return {
      subject: "Thesis meeting: please fill in your meeting note",
      text: `Hi ${first},\n\nPlease fill in your meeting note at least one day before our next meeting:\n${SITE_URL}\n\nIt takes about five minutes: what you did, what I should look at, your questions, and what you will do next.\n${tail}`,
    };
  }
  if (kind === "snapshot") {
    return {
      subject: "Thesis: please complete your overview",
      text: `Hi ${first},\n\nYour thesis overview is not complete yet${missing.length ? ` (missing: ${missing.join(", ")})` : ""}. Please fill it in here:\n${SITE_URL}\n\nI use it to prepare for our meetings.\n${tail}`,
    };
  }
  return {
    subject: "Thesis: checking in",
    text: `Hi ${first},\n\nI have not seen an update from you in a while. Please update your progress and add a meeting note here:\n${SITE_URL}\n\nTo book a meeting, use the MEET ME link in my email signature. Meeting is up to you; I will not remind you again about it.\n${tail}`,
  };
}

async function send(to: string, subject: string, text: string) {
  const resend = Deno.env.get("RESEND_API_KEY");
  const brevo = Deno.env.get("BREVO_API_KEY");
  if (resend) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${SENDER_NAME} <${EMAIL_FROM}>`, to: [to], subject, text, ...(REPLY_TO ? { reply_to: REPLY_TO } : {}) }),
    });
    if (!r.ok) throw new Error(`Resend: ${(await r.text()).slice(0, 200)}`);
  } else if (brevo) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevo, "Content-Type": "application/json" },
      body: JSON.stringify({ sender: { name: SENDER_NAME, email: EMAIL_FROM }, to: [{ email: to }], subject, textContent: text, ...(REPLY_TO ? { replyTo: { email: REPLY_TO } } : {}) }),
    });
    if (!r.ok) throw new Error(`Brevo: ${(await r.text()).slice(0, 200)}`);
  } else throw new Error("No email provider key set (RESEND_API_KEY or BREVO_API_KEY)");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!EMAIL_FROM || !SITE_URL) return json({ error: "EMAIL_FROM and SITE_URL secrets are not set" }, 500);

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
  const { data: who } = await service.auth.getUser(jwt);
  const callerEmail = who?.user?.email?.toLowerCase();
  if (!callerEmail) return json({ error: "Not logged in" }, 401);
  const { data: admins } = await service.from("admins").select("email");
  if (!admins?.some((a) => a.email.toLowerCase() === callerEmail)) return json({ error: "Not allowed" }, 403);

  const body = await req.json().catch(() => ({}));
  const kind = body.kind as Kind;
  if (!["note", "snapshot", "checkin"].includes(kind)) return json({ error: "Unknown reminder type" }, 400);
  const ids: string[] = Array.isArray(body.student_ids) ? body.student_ids.slice(0, 100) : [];
  if (!ids.length) return json({ error: "No students given" }, 400);
  const extra = String(body.extra ?? "").replace(/[\r\n]+/g, " ").slice(0, 300);

  const { data: students, error } = await service
    .from("students").select("id,name,email, thesis_info(title,iv,dv)").in("id", ids);
  if (error) return json({ error: error.message }, 500);
  const since = new Date(Date.now() - MIN_DAYS_BETWEEN * 864e5).toISOString();
  const { data: recent } = await service.from("reminders_log").select("student_id").eq("kind", kind).gte("sent_at", since).in("student_id", ids);
  const recentSet = new Set((recent ?? []).map((r) => r.student_id));

  const results: { name: string; status: "sent" | "skipped" | "failed"; detail?: string }[] = [];
  for (const s of students ?? []) {
    if (recentSet.has(s.id)) { results.push({ name: s.name, status: "skipped", detail: `already sent in the last ${MIN_DAYS_BETWEEN} days` }); continue; }
    const t = (Array.isArray(s.thesis_info) ? s.thesis_info[0] : s.thesis_info) ?? {};
    const missing = [!t.title && "title", !t.iv && "IV", !t.dv && "DV"].filter(Boolean) as string[];
    try {
      const m = compose(kind, s.name, extra, missing);
      await send(s.email, m.subject, m.text);
      await service.from("reminders_log").insert({ student_id: s.id, kind });
      results.push({ name: s.name, status: "sent" });
    } catch (e) {
      results.push({ name: s.name, status: "failed", detail: (e as Error).message });
    }
  }
  return json({ results });
});
