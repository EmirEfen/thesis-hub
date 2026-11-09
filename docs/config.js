// Public settings. The anon key is meant to be public: the database rules (RLS) protect the data.
// NEVER put the service_role key here.
window.CONFIG = {
  SUPERVISOR_NAME: "Emir", // used to sign the reminder and login messages
  SUPABASE_URL: "https://hjjovbrkqbnrhjsrixpg.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhqam92YnJrcWJucmhqc3JpeHBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2Mjg0NTksImV4cCI6MjEwOTIwNDQ1OX0.mxIWOXmd6i6AsAeSiDMkAAupgW0ZeVLQ1WIH9fhbYXM",
};
