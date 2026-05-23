import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// TODO: switch to createClient<Database>(...) once AppContext.tsx CRUD
// payloads are made strict. Generated types are available at ./database.types.
// `import type { Database, Tables } from "@/lib/database.types"` is safe in
// isolation (e.g. for a single new helper) without flipping the global client.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Get the current session's access token for API calls */
export async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}
