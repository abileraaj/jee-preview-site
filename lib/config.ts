// Product name and wording. Change them here and they change everywhere.
export const brand = {
  name: "TestNex",
  series: "JEE Main 2027",
  company: "Edu Secure",
  tagline: "JEE Main mock tests that show you where every minute went",
  supportEmail: "support@example.com",
};

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
