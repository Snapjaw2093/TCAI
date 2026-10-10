import { localStore } from "@/lib/data/localStore";

// The one place that decides which front desk the app uses.
// To move to Supabase later, change this single line.
export const db = localStore;
