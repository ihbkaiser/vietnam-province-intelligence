"use client";

import { useState, type ReactNode } from "react";
import type { NotificationItem, Role, User, ViewId } from "@/lib/types";
import { Brand } from "./shared/Ui";

const teacherNav: Array<{ id: ViewId; icon: string; label: string }> = [
  { id: "dashboard", icon: "⌂", label: "Tổng quan" },
  { id: "classes", icon: "▦", label: "Lớp học" },
  { id: "workspace", icon: "◫", label: "Slide & AI" },
  { id: "quiz", icon: "✓", label: "Quiz" },
  { id: "vietgeo", icon: "◎", label: "VietGeoAI" }
];

const studentNav: Array<{ id: ViewId; icon: string; label: string }> = [
  { id: "studentDashboard", icon: "⌂", label: "Trang chủ" },
  { id: "studentQuiz", icon: "✓", label: "Quiz được giao" },
  { id: "studentFlashcards", icon: "◧", label: "Flashcard" },
  { id: "workspace", icon: "✦", label: "AI học tập" },
  { id: "vietgeo", icon: "◎", label: "VietGeoAI" }
];

const adminNav: Array<{ id: ViewId; icon: string; label: string }> = [
  { id: "admin", icon: "⚙", label: "Quản trị" },
  { id: "vietgeo", icon: "◎", label: "VietGeoAI" }
];

const titles: Record<ViewId, string> = {
  dashboard: "Tổng quan",
  classes: "Lớp học",
  workspace: "Slide & AI",
  quiz: "Quiz",
  admin: "Quản trị",
  studentDashboard: "Trang chủ học sinh",
  studentQuiz: "Quiz được giao",
  studentFlashcards: "Flashcard",
  vietgeo: "VietGeoAI"
};

export function AppShell({
  user,
  role,
  view,
  unreadCount,
  notifications,
  onViewChange,
  onLanding,
  onMarkRead,
  onChangePassword,
  onLogout,
  children
}: {
  user: User;
  role: Role;
  view: ViewId;
  unreadCount: number;
  notifications: NotificationItem[];
  onViewChange: (view: ViewId) => void;
  onLanding: () => void;
  onMarkRead: (id: string) => void;
  onChangePassword: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const nav = role === "admin" ? adminNav : role === "teacher" ? teacherNav : studentNav;
  const roleLabel = role === "admin" ? "Quản trị viên" : role === "teacher" ? "Giáo viên" : "Học sinh";
  const initials = user.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || user.username.slice(0, 2).toUpperCase();

  function timeAgo(value?: string): string {
    if (!value) return "";
    const diffMs = Date.now() - new Date(value).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "vừa xong";
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    return `${days} ngày trước`;
  }

  function openNotification(item: NotificationItem) {
    setNotifOpen(false);
    onMarkRead(item.id);
    if (item.actionView) onViewChange(item.actionView);
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <Brand compact />
        <div className="nav-label">Không gian dạy học</div>
        <nav className="nav">
          {nav.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onViewChange(item.id)}>
              <span className="ico">{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-card">
            <b>AI theo nguồn của bạn</b>
            <p>RAG chỉ trả lời dựa trên slide, tài liệu và phạm vi kiến thức đã chọn.</p>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="crumb">EduGeo AI <span>›</span> <b>{titles[view]}</b></div>
          <div className="top-actions">
            <button className="btn small" onClick={onLanding}>↶ Intro</button>
            <div className="role-chip">{roleLabel}</div>
            <div className="notif-bell">
              <button className="btn small" onClick={() => { setNotifOpen((value) => !value); setAccountOpen(false); }} aria-label="Thông báo">
                🔔{unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
              </button>
              {notifOpen && (
                <>
                  <div className="notif-backdrop" onClick={() => setNotifOpen(false)} />
                  <div className="notif-dropdown">
                    {notifications.length === 0 && <div className="notif-empty">Chưa có thông báo nào.</div>}
                    {notifications.map((item) => (
                      <button
                        key={item.id}
                        className={`notif-item ${!item.readAt ? "unread" : ""}`}
                        onClick={() => openNotification(item)}
                      >
                        <div className="notif-dot" />
                        <div className="notif-body">
                          <b>{item.title}</b>
                          <p>{item.body}</p>
                          <span className="notif-time">{timeAgo(item.createdAt)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="account">
              <button className="avatar" onClick={() => setAccountOpen((value) => !value)} aria-label="Mở tài khoản">{initials}</button>
              {accountOpen && (
                <div className="account-menu">
                  <div className="account-id">
                    <b>{user.displayName}</b>
                    <span>@{user.username} · {roleLabel}</span>
                  </div>
                  <button onClick={() => { setAccountOpen(false); onChangePassword(); }}>Đổi mật khẩu</button>
                  <button className="danger" onClick={() => { setAccountOpen(false); onLogout(); }}>Đăng xuất</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="page">{children}</div>
      </main>
      <nav className="mobile-nav">
        {nav.map((item) => (
          <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onViewChange(item.id)}>
            <b>{item.icon}</b>{item.label.split(" ")[0]}
          </button>
        ))}
      </nav>
    </div>
  );
}
