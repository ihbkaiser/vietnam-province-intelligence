"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClassRoom, Quiz, Subject, User } from "@/lib/types";

const CLASS_LEVELS = [6, 7, 8, 9];

export function ClassModal({
  open,
  onClose,
  onCreate,
  studentSuggestions = [],
  onStudentSearch
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; subject: Subject; grade: number; knowledgeScopes: string[]; studentUsernames: string[] }) => void;
  studentSuggestions?: User[];
  onStudentSearch?: (query: string) => void;
}) {
  const [name, setName] = useState("Lịch sử và Địa lí 6A1");
  const [grade, setGrade] = useState(6);
  const [studentInput, setStudentInput] = useState("");
  const [studentUsernames, setStudentUsernames] = useState<string[]>([]);
  const datalistId = "student-usernames-create-class";

  const suggestions = useMemo(() => {
    const selected = new Set(studentUsernames.map((item) => item.toLowerCase()));
    return studentSuggestions.filter((student) => !selected.has(student.username.toLowerCase())).slice(0, 20);
  }, [studentSuggestions, studentUsernames]);

  function addStudent() {
    const username = studentInput.trim().replace(/^@/, "");
    if (!username || studentUsernames.some((item) => item.toLowerCase() === username.toLowerCase())) return;
    setStudentUsernames((items) => [...items, username]);
    setStudentInput("");
  }

  return (
    <div className={`modal-backdrop ${open ? "open" : ""}`}>
      <div className="modal">
        <h3>Tạo lớp mới</h3>
        <p>Chọn lớp SGK để AI chỉ dùng đúng phạm vi kiến thức của lớp đó. Hiện dữ liệu đã sẵn sàng cho Lớp 6.</p>
        <div className="field">
          <label>Tên lớp</label>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Lịch sử và Địa lí 6A1" />
        </div>
        <div className="field">
          <label>Lớp</label>
          <select value={grade} onChange={(event) => setGrade(Number(event.target.value))}>
            {CLASS_LEVELS.map((level) => (
              <option key={level} value={level}>Lớp {level}{level === 6 ? " · đã có dữ liệu" : " · chờ dữ liệu"}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Thêm học sinh bằng username</label>
          <div className="student-picker">
            <input
              list={datalistId}
              value={studentInput}
              onChange={(event) => {
                const value = event.target.value;
                setStudentInput(value);
                onStudentSearch?.(value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addStudent();
                }
              }}
              placeholder="Gõ username học sinh, ví dụ: mkhang10a1"
            />
            <button className="btn" type="button" onClick={addStudent}>Thêm</button>
          </div>
          <datalist id={datalistId}>
            {suggestions.map((student) => (
              <option key={student.id} value={student.username}>{student.displayName} · @{student.username}</option>
            ))}
          </datalist>
          <div className="student-chips">
            {studentUsernames.map((username) => (
              <button
                type="button"
                key={username}
                onClick={() => setStudentUsernames((items) => items.filter((item) => item !== username))}
                title="Bấm để bỏ khỏi danh sách"
              >
                @{username} x
              </button>
            ))}
          </div>
          <small className="field-hint">Học sinh cần đăng ký tài khoản trước. Gõ đến đâu trình duyệt sẽ gợi ý username đến đó.</small>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Hủy</button>
          <button
            className="btn primary"
            onClick={() =>
              onCreate({
                name,
                subject: "mixed",
                grade,
                knowledgeScopes: [`Toàn bộ SGK Lớp ${grade}`],
                studentUsernames
              })
            }
          >
            Tạo lớp
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChangePasswordModal({
  open,
  onClose,
  onConfirm
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: { currentPassword: string; nextPassword: string }) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  return (
    <div className={`modal-backdrop ${open ? "open" : ""}`}>
      <div className="modal">
        <h3>Đổi mật khẩu</h3>
        <p>Nhập mật khẩu hiện tại và mật khẩu mới. Với Admin195, mật khẩu mặc định ban đầu là 19052005.</p>
        <div className="field">
          <label>Mật khẩu hiện tại</label>
          <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </div>
        <div className="field">
          <label>Mật khẩu mới</label>
          <input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Hủy</button>
          <button
            className="btn primary"
            onClick={() => {
              onConfirm({ currentPassword, nextPassword });
              setCurrentPassword("");
              setNextPassword("");
            }}
          >
            Lưu mật khẩu mới
          </button>
        </div>
      </div>
    </div>
  );
}
