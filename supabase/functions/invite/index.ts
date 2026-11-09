// Edge function: creates a login (or resets the password) for students. Only the admin can call it.
// It returns the generated passwords once. They are not stored anywhere in readable form.
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by Supabase. You may set SITE_URL.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("SITE_URL") ?? "";
const cors = {
  "Access-Control-Allow-Origin": SITE_URL ? new URL(SITE_URL).origin : "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alike characters
function genPassword(n = 12) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
  const { data: who } = await service.auth.getUser(jwt);
  const callerEmail = who?.user?.email?.toLowerCase();
  if (!callerEmail) return json({ error: "Not logged in" }, 401);
  const { data: admins } = await service.from("admins").select("email");
  const adminSet = new Set((admins ?? []).map((a) => a.email.toLowerCase()));
  if (!adminSet.has(callerEmail)) return json({ error: "Not allowed" }, 403);

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.student_ids) ? body.student_ids.slice(0, 100) : [];
  if (!ids.length) return json({ error: "No students given" }, 400);
  const { data: students, error } = await service.from("students").select("id,name,email").in("id", ids);
  if (error) return json({ error: error.message }, 500);

  async function findUserId(email: string) {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
      if (error || !data.users.length) return null;
      const u = data.users.find((x) => x.email?.toLowerCase() === email);
      if (u) return u.id;
      if (data.users.length < 200) return null;
    }
    return null;
  }

  const results: { id: string; name: string; email: string; ok: boolean; password?: string; error?: string }[] = [];
  for (const s of students ?? []) {
    const email = s.email.toLowerCase();
    if (adminSet.has(email)) { results.push({ id: s.id, name: s.name, email, ok: false, error: "This email is an admin; not touched" }); continue; }
    const password = genPassword();
    let err: string | null = null;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) {
      if (/already|registered|exists/i.test(created.error.message)) {
        const uid = await findUserId(email);
        if (!uid) err = "Account exists but could not be found";
        else {
          const upd = await service.auth.admin.updateUserById(uid, { password, email_confirm: true });
          if (upd.error) err = upd.error.message;
        }
      } else err = created.error.message;
    }
    if (err) { results.push({ id: s.id, name: s.name, email, ok: false, error: err }); continue; }
    await service.from("students").update({ invited_at: new Date().toISOString() }).eq("id", s.id);
    results.push({ id: s.id, name: s.name, email, ok: true, password });
  }
  return json({ results });
});
