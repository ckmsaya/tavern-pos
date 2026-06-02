import { createClient } from "@supabase/supabase-js";
import { getRequiredEnv } from "./api-security";

export function createServiceSupabaseClient() {
  return createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}
