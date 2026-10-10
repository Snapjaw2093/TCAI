import { localStore } from "@/lib/data/localStore";
import { supabaseStore } from "@/lib/data/supabaseStore";
import { supabaseConfigured } from "@/lib/supabase";

// The one place that decides which front desk the app uses:
// Supabase when its two settings are present, browser storage otherwise.
export const usingSupabase = supabaseConfigured;
export const db = usingSupabase ? supabaseStore : localStore;
