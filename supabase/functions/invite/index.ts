// Edge function: sends the login email (link + 6-digit code) to students. Only the admin can call it.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are set by Supabase. You set SITE_URL.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("SITE_URL") ?? "";
const cors = {
  "Access-Control-Allow-Origin": SITE_URL ? new URL(SITE_URL).origin : "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
  const { data: who } = await service.auth.getUser(jwt);
  const callerEmail = who?.user?.email?.toLowerCase();
  if (!callerEmail) return json({ error: "Not logged in" }, 401);
  const { data: admins } = await service.from("admins").select("email");
  if (!admins?.some((a) => a.email.toLowerCase() === callerEmail)) return json({ error: "Not allowed" }, 403);

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.student_ids) ? body.student_ids.slice(0, 200) : [];
  if (!ids.length) return json({ error: "No students given" }, 400);
  const { data: students, error } = await service.from("students").select("id,email").in("id", ids);
  if (error) return json({ error: error.message }, 500);

  const results: { email: string; ok: boolean; error?: string }[] = [];
  for (const s of students ?? []) {
    // Make sure an account exists (ignore "already exists"), then send the login email.
    const created = await service.auth.admin.createUser({ email: s.email, email_confirm: true });
    if (created.error && !/already|registered|exists/i.test(created.error.message)) {
      results.push({ email: s.email, ok: false, error: created.error.message });
      continue;
    }
    const { error: e } = await anon.auth.signInWithOtp({
      email: s.email,
      options: { shouldCreateUser: false, emailRedirectTo: SITE_URL },
    });
    if (e) results.push({ email: s.email, ok: false, error: e.message });
    else {
      await service.from("students").update({ invited_at: new Date().toISOString() }).eq("id", s.id);
      results.push({ email: s.email, ok: true });
    }
  }
  return json({ results });
});
