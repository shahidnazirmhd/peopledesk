import { useNavigate } from '@tanstack/react-router'
import { LogOut, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Badge, Button } from '@/components/common/ui'
import { ConnectionStatus } from '@/components/layout/ConnectionStatus'
import { useAuth } from '@/hooks/useAuth'
import { roleLabel } from '@/utils/format'

export function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const doLogout = async () => {
    setBusy(true)
    await logout()
    setBusy(false)
    setConfirming(false)
    await navigate({ to: '/login', replace: true })
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-teal-700 text-white">
          <UsersRound className="size-4.5" aria-hidden />
        </span>
        <span className="text-base font-semibold tracking-tight text-slate-900">PeopleDesk</span>
      </div>

      <div className="flex items-center gap-3">
        <ConnectionStatus />
        {user && (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-3" data-testid="current-user">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium text-slate-900">{user.display_name}</p>
              <p className="text-xs text-slate-500">@{user.username}</p>
            </div>
            <Badge tone={user.role === 'admin' ? 'violet' : 'slate'}>{roleLabel(user.role)}</Badge>
          </div>
        )}
        <Button variant="secondary" onClick={() => setConfirming(true)} aria-label="Log out">
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Sign out?"
        confirmLabel="Log out"
        loading={busy}
        onConfirm={doLogout}
        onCancel={() => setConfirming(false)}
      >
        You will need to sign in again to continue working.
      </ConfirmDialog>
    </header>
  )
}
