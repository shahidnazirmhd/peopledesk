import { Link } from '@tanstack/react-router'
import { Activity, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

const LINK =
  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 justify-center lg:justify-start'
const ACTIVE = '!bg-teal-50 !text-teal-800'

export function Sidebar() {
  const { isAdmin } = useAuth()
  return (
    <nav
      aria-label="Main navigation"
      className="flex w-16 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-2 lg:w-60 lg:p-3"
    >
      <Link to="/employees" className={LINK} activeProps={{ className: ACTIVE }} title="Employee Master">
        <Users className="size-5 shrink-0" aria-hidden />
        <span className="hidden lg:inline">Employee Master</span>
      </Link>
      {isAdmin && (
      <Link to="/activities" className={LINK} activeProps={{ className: ACTIVE }} title="User Activity">
        <Activity className="size-5 shrink-0" aria-hidden />
        <span className="hidden lg:inline">User Activity</span>
      </Link>
      )}
      {isAdmin && (
        <Link to="/users" className={LINK} activeProps={{ className: ACTIVE }} title="User Master">
          <ShieldCheck className="size-5 shrink-0" aria-hidden />
          <span className="hidden lg:inline">User Master</span>
        </Link>
      )}
    </nav>
  )
}
