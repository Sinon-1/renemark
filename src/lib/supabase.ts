import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// If the env vars are missing the app still works as a guest (no accounts or presets).
export const supabase = url && key ? createClient(url, key) : null;
