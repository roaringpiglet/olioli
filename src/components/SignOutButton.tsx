"use client";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface Props {
  children: React.ReactNode;
  className?: string;
}

export function SignOutButton({ children, className = "btn" }: Props) {
  const router = useRouter();
  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/sign-in");
    router.refresh();
  };
  return (
    <button className={className} onClick={signOut}>
      {children}
    </button>
  );
}
