import { localStore } from "@/lib/data/localStore";
import { supabaseStore } from "@/lib/data/supabaseStore";
import { withValidation } from "@/lib/data/validate";
import { supabaseConfigured } from "@/lib/supabase";

// The one place that decides which front desk the app uses:
// Supabase when its two settings are present, browser storage otherwise.
// Either way, every save is checked first for friendly error messages.
export const usingSupabase = supabaseConfigured;
export const db = withValidation(usingSupabase ? supabaseStore : localStore);
