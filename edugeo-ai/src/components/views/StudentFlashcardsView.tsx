"use client";

import { useState } from "react";
import type { ClassRoom, FlashcardSet, QuizAssignment } from "@/lib/types";
import { Pill } from "../shared/Ui";

export interface StudentFlashcardAssignment extends QuizAssignment {
  quiz?: { id: string; title: string; questions: unknown[]; durationMinutes?: number };
}

export function StudentFlashcardsView({
  classes,
  assignments,
  flashcardSets,
  onStartQuiz,
  onViewDeck
}: {
  classes: ClassRoom[];
  assignments: StudentFlashcardAssignment[];
  flashcardSets: FlashcardSet[];
  onStartQuiz: (assignment: StudentFlashcardAssignment) => void;
  onViewDeck: (set: FlashcardSet) => void;
}) {
  const [openClassId, setOpenClassId] = useState<string | null>(null);

  function toggleClass(classId: string) {
    setOpenClassId((current) => (current === classId ? null : classId));
  }

  return (
    <section className="view active">
      <div className="page-head">
        <div>
          <h1>Flashcard của tôi</h1>
          <p>Chọn lớp để xem Quiz và Flashcard giáo viên đã giao.</p>
        </div>
        <Pill tone="info">{classes.length} lớp đang theo học</Pill>
      </div>

      {classes.length === 0 && (
        <div className="card panel">
          <p style={{ color: "var(--muted)" }}>Bạn chưa tham gia lớp học nào. Hãy nhờ giáo viên thêm bạn vào lớp.</p>
        </div>
      )}

      {classes.map((classRoom) => {
        const classAssignments = assignments.filter((assignment) => assignment.classId === classRoom.id);
        const classFlashcards = flashcardSets.filter((set) => set.classId === classRoom.id);
        const open = openClassId === classRoom.id;
        return (
          <div className="card panel" key={classRoom.id} style={{ marginBottom: 14 }}>
            <button
              className="class-row-button"
              onClick={() => toggleClass(classRoom.id)}
              aria-expanded={open}
            >
              <div className="class-row-info">
                <b>{classRoom.name}</b>
                <span>
                  {classAssignments.length} quiz · {classFlashcards.length} bộ flashcard
                </span>
              </div>
              <span className="class-row-caret">{open ? "▲" : "▼"}</span>
            </button>

            {open && (
              <div className="class-row-body">
                <div className="activity-section">
                  <h3 style={{ fontSize: 14, margin: "12px 0 8px" }}>Quiz được giao</h3>
                  {classAssignments.length === 0 && (
                    <p style={{ color: "var(--muted)", fontSize: 12 }}>Chưa có Quiz nào được giao cho lớp này.</p>
                  )}
                  {classAssignments.map((assignment) => (
                    <div className="quiz-card" key={assignment.id}>
                      <div>
                        <b>{assignment.quiz?.title || "Bài quiz"}</b>
                        <span>
                          {assignment.quiz?.questions?.length || 0} câu
                          {assignment.dueAt
                            ? ` · hạn ${new Date(assignment.dueAt).toLocaleDateString("vi-VN")} ${new Date(assignment.dueAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                        </span>
                      </div>
                      <button className="btn primary small" onClick={() => onStartQuiz(assignment)}>
                        Làm Quiz
                      </button>
                    </div>
                  ))}
                </div>

                <div className="activity-section">
                  <h3 style={{ fontSize: 14, margin: "12px 0 8px" }}>Flashcard của lớp</h3>
                  {classFlashcards.length === 0 && (
                    <p style={{ color: "var(--muted)", fontSize: 12 }}>Chưa có flashcard nào cho lớp này.</p>
                  )}
                  {classFlashcards.map((set) => (
                    <div className="activity-item" key={set.id}>
                      <div>
                        <b>{set.title}</b>
                        <span>{set.cards.length} thẻ</span>
                      </div>
                      <div className="activity-actions">
                        <button className="btn small" onClick={() => onViewDeck(set)}>📖 Xem</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
