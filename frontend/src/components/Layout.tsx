import { NavLink, Outlet } from 'react-router-dom';

function navClassName({ isActive }: { isActive: boolean }) {
  return [
    'rounded-full px-4 py-2 text-sm transition',
    isActive ? 'bg-ink text-white' : 'bg-white/70 text-ink hover:bg-white'
  ].join(' ');
}

export function Layout() {
  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-[2rem] border border-white/70 bg-white/60 px-6 py-5 shadow-panel backdrop-blur">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-[0.24em] text-tide">Vietnam Province Intelligence</p>
              <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
                Bản đồ hành chính và phân giải địa chỉ chuẩn hóa
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70 sm:text-base">
                Chọn một điểm trên bản đồ để lấy tọa độ, địa chỉ cũ, địa chỉ mới và đơn vị hành chính hiện tại.
              </p>
            </div>
            <nav className="flex flex-wrap gap-3">
              <NavLink to="/" end className={navClassName}>
                Bản đồ
              </NavLink>
              <NavLink to="/resolver" className={navClassName}>
                Nhập tọa độ
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
