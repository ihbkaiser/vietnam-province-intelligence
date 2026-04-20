import { NavLink, Outlet } from 'react-router-dom';

function navClassName({ isActive }: { isActive: boolean }) {
  return [
    'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition',
    isActive ? 'bg-ink text-white shadow-soft' : 'text-ink/68 hover:bg-slate-100 hover:text-ink'
  ].join(' ');
}

function MapIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v15M15 6v15" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h11l-3-3M17 17H6l3 3" />
    </svg>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-soft backdrop-blur sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink text-white shadow-soft">
                <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.4 10.2h5.2M12 7.6v5.2" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tide">VIETGEOAI</p>
                <h1 className="mt-1 font-display text-xl font-semibold text-ink sm:text-2xl">
                  Nền tảng bản đồ số tích hợp trí tuệ nhân tạo
                </h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-ink/62">
                  Xem bản đồ hành chính, tra cứu địa chỉ mới và hỏi AI về dữ liệu tỉnh thành.
                </p>
              </div>
            </div>
            <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-sand p-1">
              <NavLink to="/" end className={navClassName}>
                <MapIcon />
                Bản đồ thông minh
              </NavLink>
              <NavLink to="/resolver" className={navClassName}>
                <SwapIcon />
                Chuyển đổi địa chỉ
              </NavLink>
            </nav>
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
