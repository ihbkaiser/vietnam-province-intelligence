"use client";

import { useMemo, useState } from "react";
import type { Quiz, QuizQuestion, Submission, User } from "@/lib/types";
import { Pill } from "../shared/Ui";

function scorePct(score: number) {
  return Math.round(score * 100);
}

function formatScore(score: number) {
  return (score / 1).toFixed(2).replace(/\.00$/, "");
}

/** Seed/AI prompts may already carry a "Câu N." prefix; the modal renders its own
 *  "Câu {i+1}" label, so strip the prefix to avoid showing "Câu 1: Câu 1. ...". */
function stripQuestionPrefix(prompt: string): string {
  return prompt.replace(/^Câu\s+\d+\.\s*/iu, "").trim();
}

type QuestionStat = {
  question: QuizQuestion;
  correctCount: number;
  total: number;
  correctRate: number;
  optionCounts: Record<string, number>;
  skipCount: number;
  pValue: number;
  discrimination: number;
};

function computeQuestionStats(
  quiz: Quiz,
  submissions: Submission[]
): QuestionStat[] {
  // Sort submissions by score descending to identify upper/lower 27% groups
  const sorted = [...submissions].sort((a, b) => b.score - a.score);
  const groupSize = Math.max(1, Math.round(sorted.length * 0.27));
  const upper = sorted.slice(0, groupSize);
  const lower = sorted.slice(-groupSize);

  return quiz.questions.map((question) => {
    const submitted = submissions.filter((s) => s.answers[question.id] !== undefined);
    const total = submitted.length;
    const correctCount = submitted.filter((s) => {
      const answerId = s.answers[question.id];
      return question.options.find((o) => o.id === answerId)?.isCorrect;
    }).length;
    const optionCounts: Record<string, number> = {};
    question.options.forEach((o) => {
      optionCounts[o.id] = submitted.filter((s) => s.answers[question.id] === o.id).length;
    });
    // Discrimination index: p_upper - p_lower
    const upperCorrect = upper.filter((s) => {
      const answerId = s.answers[question.id];
      return answerId && question.options.find((o) => o.id === answerId)?.isCorrect;
    }).length;
    const lowerCorrect = lower.filter((s) => {
      const answerId = s.answers[question.id];
      return answerId && question.options.find((o) => o.id === answerId)?.isCorrect;
    }).length;
    const pUpper = upper.length ? upperCorrect / upper.length : 0;
    const pLower = lower.length ? lowerCorrect / lower.length : 0;
    const discrimination = parseFloat((pUpper - pLower).toFixed(4));

    return {
      question,
      correctCount,
      total,
      correctRate: total === 0 ? 0 : correctCount / total,
      optionCounts,
      skipCount: submissions.length - total,
      pValue: total === 0 ? 0 : correctCount / total,
      discrimination
    };
  });
}

function pValueLabel(p: number) {
  if (p >= 0.7) return { text: "Dễ", tone: "easy" as const };
  if (p >= 0.3) return { text: "Trung bình", tone: "medium" as const };
  return { text: "Khó", tone: "hard" as const };
}

function discriminationLabel(d: number) {
  if (d > 0.3) return { text: "Tốt", tone: "good" as const };
  if (d > 0.1) return { text: "Tạm ổn", tone: "ok" as const };
  return { text: "Yếu", tone: "weak" as const };
}

export function QuizStatisticsModal({
  open,
  onClose,
  quiz,
  submissions,
  students
}: {
  open: boolean;
  onClose: () => void;
  quiz: Quiz | null;
  submissions: Submission[];
  students: User[];
}) {
  const [activeTab, setActiveTab] = useState<"score" | "questions" | "charts" | "difficulty">("score");
  const [sortBy, setSortBy] = useState<"score" | "alpha">("score");

  const stats = useMemo(() => {
    if (!quiz) return [];
    return computeQuestionStats(quiz, submissions);
  }, [quiz, submissions]);

  const studentRows = useMemo(() => {
    const submittedIds = new Set(submissions.map((s) => s.studentId));
    const rows = students.map((student) => {
      const submission = submissions.find((s) => s.studentId === student.id);
      return {
        student,
        score: submission ? submission.score : null,
        submitted: submittedIds.has(student.id)
      };
    });
    if (sortBy === "score") {
      rows.sort((a, b) => {
        if (a.score === null && b.score === null) return a.student.displayName.localeCompare(b.student.displayName, "vi");
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return b.score - a.score;
      });
    } else {
      rows.sort((a, b) => a.student.displayName.localeCompare(b.student.displayName, "vi"));
    }
    return rows;
  }, [students, submissions, sortBy]);

  const scores = submissions.map((s) => s.score);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)]) : 0;
  const min = sorted.length ? sorted[0] : 0;
  const max = sorted.length ? sorted[sorted.length - 1] : 0;

  const histogram = useMemo(() => {
    const buckets = Array.from({ length: 11 }, (_, i) => ({ range: `${i}–${i === 10 ? 10 : i + 0.9}`, count: 0 }));
    scores.forEach((s) => {
      const b = Math.min(10, Math.floor(s * 10));
      buckets[b].count++;
    });
    return buckets;
  }, [submissions]);

  const passCount = scores.filter((s) => s >= 5).length;
  const failCount = scores.length - passCount;

  if (!open || !quiz) return null;

  const hasSubmissions = submissions.length > 0;
  const maxCount = Math.max(1, ...histogram.map((b) => b.count));

  return (
    <div className="modal-backdrop open" onClick={onClose}>
      <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>📊 Thống kê: {quiz.title}</h2>
            <p style={{ color: "var(--muted)", fontSize: 12, margin: "6px 0 0" }}>
              {submissions.length} / {students.length} học sinh đã nộp bài
            </p>
          </div>
          <button className="btn small" onClick={onClose}>✕</button>
        </div>

        <div className="stats-tabs">
          <button className={activeTab === "score" ? "active" : ""} onClick={() => setActiveTab("score")}>Bảng điểm</button>
          <button className={activeTab === "questions" ? "active" : ""} onClick={() => setActiveTab("questions")}>Phân tích câu hỏi</button>
          <button className={activeTab === "charts" ? "active" : ""} onClick={() => setActiveTab("charts")}>Biểu đồ</button>
          <button className={activeTab === "difficulty" ? "active" : ""} onClick={() => setActiveTab("difficulty")}>Độ khó & phân biệt</button>
        </div>

        {activeTab === "score" && (
          <div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Sắp xếp theo:</span>
              <button className={`btn small ${sortBy === "score" ? "primary" : ""}`} onClick={() => setSortBy("score")}>Điểm ↓</button>
              <button className={`btn small ${sortBy === "alpha" ? "primary" : ""}`} onClick={() => setSortBy("alpha")}>Bảng chữ cái</button>
            </div>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Học sinh</th>
                  <th>Username</th>
                  <th>Điểm</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {studentRows.map((row, i) => (
                  <tr key={row.student.id}>
                    <td>{i + 1}</td>
                    <td>{row.student.displayName}</td>
                    <td>@{row.student.username}</td>
                    <td>
                      {row.score !== null ? (
                        <b style={{ color: row.score >= 5 ? "var(--success)" : "var(--danger)" }}>
                          {formatScore(row.score)} / 10
                        </b>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                    <td>
                      {row.submitted ? (
                        <Pill tone="success">Đã làm</Pill>
                      ) : (
                        <Pill tone="warn">Chưa làm</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!hasSubmissions && (
              <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>Chưa có học sinh nào nộp bài.</p>
            )}
          </div>
        )}

        {activeTab === "questions" && (
          <div>
            {stats.map((stat, i) => {
              const rateLabel = pValueLabel(stat.pValue);
              return (
                <div className="stats-question" key={stat.question.id}>
                  <h4>Câu {i + 1}: {stripQuestionPrefix(stat.question.prompt)}</h4>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div className="stats-bar">
                        <i
                          style={{
                            width: `${stat.correctRate * 100}%`,
                            background: stat.correctRate >= 0.5 ? "var(--success)" : "var(--danger)"
                          }}
                        />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, minWidth: 90, textAlign: "right" }}>
                      {stat.correctCount}/{stat.total} đúng ({Math.round(stat.correctRate * 100)}%)
                    </span>
                    <span className={`difficulty-badge ${rateLabel.tone}`}>{rateLabel.text}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {stat.question.options.map((option) => {
                      const count = stat.optionCounts[option.id] || 0;
                      const isCorrect = option.isCorrect;
                      const pct = stat.total === 0 ? 0 : (count / stat.total) * 100;
                      return (
                        <div key={option.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                          <span style={{ width: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {option.label}. {option.text}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div className="stats-bar">
                              <i
                                style={{
                                  width: `${pct}%`,
                                  background: isCorrect ? "var(--success)" : "var(--surface-2)"
                                }}
                              />
                            </div>
                          </div>
                          <span style={{ minWidth: 90, textAlign: "right", color: isCorrect ? "var(--success)" : "var(--muted)" }}>
                            {count} lần chọn ({Math.round(pct)}%)
                            {isCorrect ? " ✓" : ""}
                          </span>
                        </div>
                      );
                    })}
                    {stat.skipCount > 0 && (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>Bỏ trống: {stat.skipCount} học sinh</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "charts" && (
          <div>
            <div className="stats-grid">
              <div className="stats-card"><b>{formatScore(avg)}</b><span>Điểm trung bình</span></div>
              <div className="stats-card"><b>{formatScore(median)}</b><span>Trung vị</span></div>
              <div className="stats-card"><b>{formatScore(min)}</b><span>Điểm thấp nhất</span></div>
              <div className="stats-card"><b>{formatScore(max)}</b><span>Điểm cao nhất</span></div>
            </div>

            <div className="stats-chart">
              <h4 style={{ margin: "0 0 12px", fontSize: 13 }}>Phân bố điểm</h4>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140 }}>
                {histogram.map((bucket, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>{bucket.count > 0 ? bucket.count : ""}</span>
                    <div
                      style={{
                        width: "100%",
                        height: `${(bucket.count / maxCount) * 100}%`,
                        minHeight: bucket.count > 0 ? 4 : 2,
                        background: bucket.count > 0 ? "var(--primary)" : "var(--surface-2)",
                        borderRadius: "4px 4px 0 0"
                      }}
                    />
                    <span style={{ fontSize: 9, color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {i === 0 ? "0" : i === 10 ? "10" : `${i}-${i + 0.9}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="stats-chart">
              <h4 style={{ margin: "0 0 12px", fontSize: 13 }}>Đạt / Chưa đạt (≥5 điểm)</h4>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ width: 160, height: 160, position: "relative" }}>
                  <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%" }}>
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--surface-2)" strokeWidth="4" />
                    <circle
                      cx="18" cy="18" r="15.915" fill="none"
                      stroke="var(--success)" strokeWidth="4"
                      strokeDasharray={`${passCount} ${scores.length}`}
                      strokeDashoffset="0"
                      strokeLinecap="round"
                      transform="rotate(-90 18 18)"
                    />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <b>{Math.round((passCount / Math.max(1, scores.length)) * 100)}%</b>
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>đạt</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--success)" }} />
                    Đạt: <b>{passCount}</b> học sinh
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--surface-2)" }} />
                    Chưa đạt: <b>{failCount}</b> học sinh
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "difficulty" && (
          <div>
            <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 0 }}>
              Độ khó (p-value) = tỉ lệ học sinh trả lời đúng. Độ phân biệt = hiệu tỉ lệ đúng giữa nhóm điểm cao và nhóm điểm thấp (27% đầu/cuối).
            </p>
            {stats.map((stat, i) => {
              const pLabel = pValueLabel(stat.pValue);
              const dLabel = discriminationLabel(stat.discrimination);
              const discBadge = stat.discrimination > 0.3 ? "easy" : stat.discrimination > 0.1 ? "medium" : "hard";
              return (
                <div className="stats-question" key={stat.question.id}>
                  <h4>Câu {i + 1}: {stripQuestionPrefix(stat.question.prompt)}</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                    <div>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>Độ khó (p = {stat.pValue.toFixed(2)})</span>
                      <div style={{ marginTop: 4 }}>
                        <span className={`difficulty-badge ${pLabel.tone}`}>{pLabel.text}</span>
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>Độ phân biệt (d = {stat.discrimination.toFixed(2)})</span>
                      <div style={{ marginTop: 4 }}>
                        <span className={`difficulty-badge ${discBadge}`}>{dLabel.text}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {!hasSubmissions && (
              <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>Cần có bài nộp để tính toán các chỉ số này.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}