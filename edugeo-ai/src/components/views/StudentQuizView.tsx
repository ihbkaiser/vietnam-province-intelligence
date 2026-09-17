"use client";

import { useState } from "react";
import { isDisplayableImageUrl, normalizeAssetUrl } from "@/lib/assets";
import type { Quiz, QuizAssignment, QuizQuestion } from "@/lib/types";
import { Pill, SectionTitle } from "../shared/Ui";

function ScoreDonut({ score }: { score: number }) {
  const r = 15.915;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 10) * circumference;
  const color = score >= 5 ? "var(--success)" : "var(--danger)";
  return (
    <svg width="120" height="120" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
      <circle
        cx="18" cy="18" r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="18" textAnchor="middle" dominantBaseline="central" fontSize="6" fontWeight="800" fill="currentColor">
        {score.toFixed(1)}
      </text>
      <text x="18" y="24" textAnchor="middle" dominantBaseline="central" fontSize="2.5" fill="var(--muted)">
        / 10
      </text>
    </svg>
  );
}

type AssignmentWithQuiz = QuizAssignment & { quiz?: Quiz };

export function StudentQuizView({
  assignment,
  assignments = [],
  myScores = {},
  initialScore,
  onSelectAssignment,
  onSubmit,
  onBackHome
}: {
  assignment?: AssignmentWithQuiz;
  assignments?: AssignmentWithQuiz[];
  myScores?: Record<string, number>;
  initialScore?: number | null;
  onSelectAssignment: (assignmentId: string) => void;
  onSubmit: (assignmentId: string, answers: Record<string, string>) => Promise<number | null>;
  onBackHome: () => void;
}) {
  const quiz = assignment?.quiz;
  const questions = quiz?.questions || [];
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultScore, setResultScore] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // If this assignment was already submitted (either just now, or restored from the
  // server after an F5 reload via initialScore), show the result screen instead of
  // letting the student take the quiz again.
  const score = resultScore ?? initialScore ?? null;

  // No assignment selected (e.g. student clicked a generic notification, or tapped
  // "Xem tất cả"): show a picker over the student's quizzes instead of silently
  // opening the first one.
  if (!assignment) {
    return (
      <section className="view active">
        <div className="page-head">
          <div><h1>Quiz của tôi</h1><p>Chọn một bài Quiz để làm hoặc xem lại kết quả.</p></div>
        </div>
        <div className="card quiz-assigned">
          <SectionTitle title="Quiz đã được giao" right={<Pill>{assignments.length} bài</Pill>} />
          {assignments.length === 0 && (
            <div className="ai-note">Chưa có Quiz nào được giao cho lớp của bạn.</div>
          )}
          {assignments.map((item) => {
            const itemScore = myScores[item.id];
            const done = itemScore !== undefined;
            return (
              <div className="quiz-card" key={item.id}>
                <div>
                  <b>{item.quiz?.title || "Quiz"}</b>
                  <span>{item.quiz?.questions?.length || 0} câu • {done ? `đã nộp • ${itemScore} / 10` : "chưa làm"}</span>
                </div>
                <button
                  className="btn primary small"
                  onClick={() => onSelectAssignment(item.id)}
                >
                  {done ? "Xem kết quả" : "Làm Quiz"}
                </button>
              </div>
            );
          })}
          <div style={{ marginTop: 16 }}>
            <button className="btn" onClick={onBackHome}>← Quay lại trang chủ</button>
          </div>
        </div>
      </section>
    );
  }

  // Show result screen after submission (also restored after F5 via initialScore).
  if (score !== null) {
    return (
      <section className="view active">
        <div className="quiz-result">
          <div className="quiz-result-card">
            <h1>🎉 Bạn đã nộp bài!</h1>
            <p style={{ color: "var(--muted)", marginBottom: 20 }}>
              {quiz?.title || "Bài kiểm tra"}
            </p>
            <ScoreDonut score={score} />
            <div style={{ marginTop: 8, fontSize: 14, color: "var(--muted)" }}>
              {score >= 5 ? "Chúc mừng! Bạn đã đạt yêu cầu." : "Cần cố gắng hơn nhé!"}
            </div>
            <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn" onClick={() => onSelectAssignment("")}>
                📋 Xem danh sách Quiz
              </button>
              <button className="btn primary" onClick={onBackHome}>
                ← Quay lại trang chủ
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Confirm dialog before submit
  if (showConfirm) {
    return (
      <section className="view active">
        <div className="quiz-result">
          <div className="quiz-result-card" style={{ maxWidth: 400 }}>
            <h2>📝 Nộp bài?</h2>
            <p style={{ color: "var(--muted)", margin: "12px 0" }}>
              Bạn đã trả lời {Object.keys(answers).length} / {questions.length} câu hỏi.<br />
              Sau khi nộp, bạn sẽ không thể thay đổi đáp án.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20 }}>
              <button className="btn" onClick={() => setShowConfirm(false)} disabled={submitting}>
                ❌ Không, xem lại
              </button>
              <button className="btn primary" onClick={async () => {
                setSubmitting(true);
                setSubmitError(null);
                try {
                  if (!assignment) return;
                  const newScore = await onSubmit(assignment.id, answers);
                  if (newScore !== null) setResultScore(newScore);
                } catch (e) {
                  setSubmitError(e instanceof Error ? e.message : "Lỗi nộp bài");
                  setSubmitting(false);
                }
              }} disabled={submitting}>
                {submitting ? "⏳ Đang nộp..." : "✅ Có, nộp bài"}
              </button>
            </div>
            {submitError && (
              <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 12, textAlign: "center" }}>
                {submitError}
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  const current: QuizQuestion | undefined = questions[index];
  const images = (current?.imageRefs || [])
    .map((image, imageIndex) => ({ ...image, imageIndex, url: normalizeAssetUrl(image.url) }))
    .filter((image) => isDisplayableImageUrl(image.url) && !brokenImages.has(image.url));

  return (
    <section className="view active">
      <div className="page-head">
        <div><h1>{quiz?.title || "Bài kiểm tra"}</h1><p>{assignment.quiz?.questions?.length || 0} câu • {quiz?.durationMinutes || 12} phút</p></div>
        <Pill tone="warn">Đã trả lời: {Object.keys(answers).length}/{questions.length}</Pill>
      </div>
      <div className="card quiz-main" style={{ maxWidth: 850, margin: "auto" }}>
        <SectionTitle title={`Câu ${index + 1} / ${questions.length || 1}`} right={<Pill>{questions.length > 0 ? "1 điểm" : ""}</Pill>} />
        <h3 style={{ fontSize: 16, lineHeight: 1.55 }}>{current?.prompt || "..."}</h3>
        {images.length ? (
          <div className="quiz-images">
            {images.map((image) => (
              <figure key={`${image.url}-${image.imageIndex}`}>
                <img
                  src={image.url}
                  alt={image.caption || "Ảnh minh họa"}
                  onError={() => setBrokenImages((currentSet) => new Set(currentSet).add(image.url))}
                />
                <figcaption>{image.caption || "Ảnh minh họa"}</figcaption>
              </figure>
            ))}
          </div>
        ) : null}
        {(current?.options || []).map((option) => (
          <label className="answer" key={option.id}>
            <input
              type="radio"
              name={current?.id}
              checked={answers[current?.id || ""] === option.id}
              onChange={() => current && setAnswers((value) => ({ ...value, [current.id]: option.id }))}
            />
            <span>{option.label}. {option.text}</span>
          </label>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, gap: 12 }}>
          <button className="btn" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>← Câu trước</button>
          {index < questions.length - 1 ? (
            <button className="btn primary" onClick={() => setIndex((value) => Math.min(questions.length - 1, value + 1))}>Câu tiếp theo →</button>
          ) : (
            <button className="btn primary" onClick={() => setShowConfirm(true)}>Nộp bài</button>
          )}
        </div>
      </div>
    </section>
  );
}
