import { getSupabaseServer } from "../lib/supabase/server-client"
import LoginButton from "./login-button"
import LogoutButton from "./logout-button"

export default async function UserPill() {
  const supabase = await getSupabaseServer()
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } }
  const user = data?.user
  if (!user) return <LoginButton />
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-sm text-neutral-700 truncate max-w-[160px]">{user.email}</span>
      <LogoutButton />
    </div>
  )
}

