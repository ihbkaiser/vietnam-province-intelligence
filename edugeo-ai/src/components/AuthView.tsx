"use client";

import { useState } from "react";
import type { AuthSession } from "@/lib/types";
import { api } from "@/lib/apiClient";
import { Brand } from "./shared/Ui";

export function AuthView({ onAuthed, onBack }: { onAuthed: (session: AuthSession) => void; onBack: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("Admin195");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("19052005");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const session = mode === "login"
        ? await api.login({ username, password })
        : await api.register({ username, displayName, password });
      onAuthed(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đăng nhập được.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-card">
        <Brand />
        <div className="auth-copy">
          <span className="eyebrow"><span className="pulse" /> EduGeo AI secure workspace</span>
          <h1>{mode === "login" ? "Đăng nhập vào không gian dạy học" : "Đăng ký tài khoản học sinh"}</h1>
          <p>
            Tài khoản học sinh có thể tự đăng ký. Tài khoản giáo viên được nhà trường cấp qua tài khoản Admin195.
          </p>
        </div>
        <div className="auth-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Đăng nhập</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setUsername(""); setPassword(""); }}>Đăng ký học sinh</button>
        </div>
        {mode === "register" && (
          <div className="field">
            <label>Họ tên học sinh</label>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nguyễn Minh Khang" />
          </div>
        )}
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Admin195 hoặc username học sinh" />
        </div>
        <div className="field">
          <label>Mật khẩu</label>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} />
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary auth-submit" disabled={loading} onClick={() => void submit()}>
          {loading ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Tạo tài khoản học sinh"}
        </button>
        <div className="demo-accounts">
          <b>Tài khoản demo</b>
          <span>Admin: Admin195 / 19052005</span>
          <span>Giáo viên: colan / colan123</span>
          <span>Học sinh: mkhang10a1 / 123456</span>
        </div>
        <button className="btn ghost auth-back" onClick={onBack}>← Quay lại intro</button>
      </div>
    </section>
  );
}
