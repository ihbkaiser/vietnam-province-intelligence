"use client";

import type { ClassRoom, NotificationItem, QuizAssignment, User } from "@/lib/types";
import { AIToolButton, Pill, SectionTitle } from "../shared/Ui";

export function StudentDashboardView({
  user,
  classes,
  assignments,
  notifications = [],
  myScores = {},
  onStudentQuiz,
  onLearningAction
}: {
  user: User;
  classes: ClassRoom[];
  assignments: Array<QuizAssignment & { quiz?: { title: string; questions: unknown[] }; teacherName?: string }>;
  notifications?: NotificationItem[];
  myScores?: Record<string, number>;
  onStudentQuiz: (assignment?: QuizAssignment) => void;
  onLearningAction: (action: "rag" | "flash" | "summary") => void;
}) {
  const assigned = assignments[0];
  const hasSubmitted = assigned ? assigned.id in myScores : false;
  // A quiz notification is still "new" only while it stays unread. Once the student
  // submits (server marks it read), the "Bạn có một Quiz mới" banner disappears for good.
  const hasNewQuizNotif = notifications.some(
    (item) => item.type === "quiz_assigned" && !item.readAt
  );
  const showNewQuizBanner = !!assigned && !hasSubmitted && hasNewQuizNotif;

  return (
    <section className="view active">
      <div className="page-head">
        <div><h1>Chào {user.displayName} 👋</h1><p>Quiz, tài liệu và công cụ AI hỗ trợ học tập của bạn.</p></div>
        <Pill tone="success">{classes[0]?.name || "Lịch sử 10A1"}</Pill>
      </div>
      <div className="student-hero">
        {showNewQuizBanner && (
          <div className="card welcome">
            <h2>Bạn có một Quiz mới</h2>
            <p>Giáo viên giao bài theo đúng lớp và phạm vi kiến thức đang học.</p>
            <div className="notification">
              <div><b>{assigned?.teacherName || "Giáo viên"} đã thêm Quiz &ldquo;{assigned?.quiz?.title || "Văn minh cổ đại phương Đông"}&rdquo;</b><p>{assigned?.quiz?.questions?.length || 10} câu • hạn 22:00 hôm nay</p></div>
              <button className="btn primary" onClick={() => onStudentQuiz(assigned)}>Vào làm ngay →</button>
            </div>
          </div>
        )}
        {assigned && hasSubmitted && (
          <div className="card welcome" style={{ background: "var(--success-soft)" }}>
            <h2>✅ Đã nộp bài</h2>
            <p>Bài quiz &ldquo;{assigned.quiz?.title}&rdquo; đã được nộp thành công.</p>
          </div>
        )}
        <div className="card panel">
          <SectionTitle title="AI học tập" right={<Pill>Theo bài học</Pill>} />
          <div className="ai-tools student-tools">
            <AIToolButton icon="✦" title="Hỏi AI" caption="Tra cứu theo tài liệu lớp" onClick={() => onLearningAction("rag")} />
            <AIToolButton icon="≡" title="Tóm tắt" caption="Nhìn lại bài học" onClick={() => onLearningAction("summary")} />
          </div>
        </div>
      </div>
      <div className="card quiz-assigned">
        <SectionTitle title="Quiz gần đây" right={<a href="#" onClick={(event) => { event.preventDefault(); onStudentQuiz(undefined); }}>Xem tất cả</a>} />
        {assignments.map((assignment) => {
          const score = myScores[assignment.id];
          const done = score !== undefined;
          return (
            <div className="quiz-card" key={assignment.id}>
              <div><b>{assignment.quiz?.title}</b><span>{assignment.teacherName || "Giáo viên"} • {assignment.quiz?.questions?.length || 10} câu • {done ? `đã nộp • ${score} / 10` : "chưa làm"}</span></div>
              {done ? (
                <Pill tone="success">{score} / 10</Pill>
              ) : (
                <button className="btn primary small" onClick={() => onStudentQuiz(assignment)}>Làm Quiz</button>
              )}
            </div>
          );
        })}
        {assignments.length === 0 && (
          <div className="ai-note">Chưa có Quiz nào được giao cho lớp của bạn.</div>
        )}
      </div>
    </section>
  );
}
