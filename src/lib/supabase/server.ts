import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Server-side Supabase client, bound to the request's cookies. Use from
// Server Components, Route Handlers, and Server Actions. Respects RLS
// (the anon key is used; auth.uid() is the signed-in user).
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component — middleware will refresh instead.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Same caveat as above.
          }
        },
      },
    }
  );
}
