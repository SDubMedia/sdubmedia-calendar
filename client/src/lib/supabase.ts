import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://fjnfmvzdnhgiapuawzpp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqbmZtdnpkbmhnaWFwdWF3enBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDczOTQsImV4cCI6MjA4ODQ4MzM5NH0.xupmrDaz5IKLK5QzFwnnl8rZCDiox6bzNXvmJUXgxEQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
