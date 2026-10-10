import { createClient } from "@supabase/supabase-js";

// The app talks to Supabase using two public values set as environment
// variables (see .env.example). If they are missing, the app falls back to
// saving in the browser, so it still runs on any computer without setup.
//
// These two values are safe to expose: your data is protected by the
// row-level-security locks in supabase/schema.sql, not by hiding the key.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);
export const supabase = supabaseConfigured ? createClient(url!, key!) : null;
