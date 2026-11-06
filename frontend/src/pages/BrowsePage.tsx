import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { healthRequested } from '../features/system/systemSlice'

// Placeholder for the Browse page (hero billboard + content rows) built in Phase 2.
// For now it proves the store → saga → API → SQL Server chain works.
export default function BrowsePage() {
  const dispatch = useAppDispatch()
  const { status, health, error } = useAppSelector((s) => s.system)

  useEffect(() => {
    dispatch(healthRequested())
  }, [dispatch])

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-4 py-5 md:px-12">
        <span className="text-3xl font-black tracking-tight text-brand">NETFLIX CLONE</span>
        <Link to="/admin" className="text-sm text-muted hover:text-white">
          Admin
        </Link>
      </header>

      <main className="px-4 md:px-12">
        <h1 className="mt-16 max-w-xl text-4xl font-bold md:text-5xl">Giai đoạn 0: khung dự án đã chạy</h1>
        <p className="mt-4 max-w-xl text-muted">
          Trang Browse thật (hero + các row) sẽ thay thế màn hình này ở Giai đoạn 2.
        </p>

        <section className="mt-10 max-w-md rounded-md bg-surface-raised p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Kết nối hệ thống</h2>
            <button
              type="button"
              onClick={() => dispatch(healthRequested())}
              className="rounded bg-brand px-3 py-1 text-sm font-semibold hover:bg-brand-hover"
            >
              Kiểm tra lại
            </button>
          </div>
          <StatusRow label="API (.NET)" ok={status === 'succeeded'} pending={status === 'loading'} detail={error ?? undefined} />
          <StatusRow
            label="SQL Server"
            ok={health?.database === 'ok'}
            pending={status === 'loading'}
            detail={health?.database === 'ok' ? `${health.databaseName} · ${health.edition}` : health?.error}
          />
        </section>
      </main>
    </div>
  )
}

function StatusRow({ label, ok, pending, detail }: { label: string; ok: boolean; pending: boolean; detail?: string }) {
  const dot = pending ? 'bg-yellow-400' : ok ? 'bg-green-500' : 'bg-brand'
  return (
    <div className="py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className={`size-2.5 rounded-full ${dot}`} />
        <span>{label}</span>
        <span className="ml-auto text-muted">{pending ? 'đang kiểm tra…' : ok ? 'OK' : 'lỗi'}</span>
      </div>
      {detail && <p className="mt-1 pl-4.5 text-xs break-words text-muted">{detail}</p>}
    </div>
  )
}
