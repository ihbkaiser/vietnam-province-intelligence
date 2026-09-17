"use client";

import { useState } from "react";
import type { TeacherAccountInput, User } from "@/lib/types";
import { Pill, SectionTitle } from "../shared/Ui";

export function AdminView({
  teachers,
  onCreateTeacher,
  onDeleteTeacher
}: {
  teachers: User[];
  onCreateTeacher: (input: TeacherAccountInput) => void;
  onDeleteTeacher: (teacherId: string) => void;
}) {
  const [form, setForm] = useState<TeacherAccountInput>({ displayName: "", username: "", password: "" });
  return (
    <section className="view active">
      <div className="page-head admin-head">
        <div>
          <h1>Quản trị tài khoản nhà trường</h1>
          <p>Admin cấp tài khoản giáo viên. Học sinh tự đăng ký bằng username riêng.</p>
        </div>
        <Pill tone="warn">Admin195</Pill>
      </div>
      <div className="grid admin-grid">
        <div className="card panel">
          <SectionTitle title="Thêm giáo viên" right={<Pill>School-issued</Pill>} />
          <div className="field">
            <label>Tên giáo viên</label>
            <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Cô Nguyễn Thị Lan" />
          </div>
          <div className="field">
            <label>Username</label>
            <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="nguyenthilan" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Tối thiểu 6 ký tự" />
          </div>
          <button
            className="btn primary"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => {
              onCreateTeacher(form);
              setForm({ displayName: "", username: "", password: "" });
            }}
          >
            ＋ Cấp tài khoản giáo viên
          </button>
          <div className="ai-note">
            Tài khoản giáo viên không tự đăng ký để tránh học sinh tạo nhầm quyền. Sau này có thể nối LDAP/SSO của trường.
          </div>
        </div>
        <div className="card panel">
          <SectionTitle title="Danh sách giáo viên" right={<span className="pill">{teachers.length} tài khoản</span>} />
          <div className="teacher-list">
            {teachers.map((teacher) => (
              <div className="teacher-row" key={teacher.id}>
                <div className="avatar small">{teacher.displayName.split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join("")}</div>
                <div>
                  <b>{teacher.displayName}</b>
                  <span>@{teacher.username}{teacher.email ? ` · ${teacher.email}` : ""}</span>
                </div>
                <button className="btn small danger-outline" onClick={() => onDeleteTeacher(teacher.id)}>Xóa</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
