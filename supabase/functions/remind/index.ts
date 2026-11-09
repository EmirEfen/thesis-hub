// Retired: reminders are now written in the browser and copied by the supervisor. No email is sent from here.
Deno.serve(() => new Response(JSON.stringify({ error: "Retired. Use Copy message in the app." }), { status: 410, headers: { "Content-Type": "application/json" } }));
