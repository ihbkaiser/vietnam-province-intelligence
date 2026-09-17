"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import type { ClassRoom, FlashcardSet, LessonRecord, Quiz, QuizAssignment, Submission, TeachingDocument, User } from "@/lib/types";
import { Pill, SectionTitle, SubjectMark } from "../shared/Ui";
import { PptxSlideViewer } from "./PptxSlideViewer";
import { QuizStatisticsModal } from "./QuizStatisticsModal";
import { FlashcardManager } from "./FlashcardManager";
import { FlashcardDeckView } from "./FlashcardDeckView";

type AssignmentWithQuiz = QuizAssignment & { quiz?: Quiz; classRoom?: ClassRoom };

export function ClassesView({
  classes,
  documents,
  assignments,
  flashcardSets,
  lessons,
  selectedClassId,
  onSelectClass,
  onCreateClass,
  onAddStudent,
  onDeleteClass,
  onDeleteDocument,
  studentSuggestions,
  onStudentSearch,
  onUpload,
  onOpenWorkspace,
  onLearningAction,
  token,
  onRefresh,
  showToast
}: {
  classes: Array<ClassRoom & { students?: User[] }>;
  documents: TeachingDocument[];
  assignments: AssignmentWithQuiz[];
  flashcardSets: FlashcardSet[];
  lessons: LessonRecord[];
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  onCreateClass: () => void;
  onAddStudent: (classId: string, username: string) => void;
  onDeleteClass: (classId: string) => void;
  onDeleteDocument: (documentId: string) => void;
  studentSuggestions: User[];
  onStudentSearch?: (query: string) => void;
  onUpload: (file: File, classId?: string) => void;
  onOpenWorkspace: () => void;
  onLearningAction: (action: "flash", lessonId?: string) => void;
  token: string;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [tab, setTab] = useState<"students" | "slides" | "activity">("students");
  const fileInput = useRef<HTMLInputElement | null>(null);
  // Delete confirmation modals
  const [deleteClassTarget, setDeleteClassTarget] = useState<ClassRoom | null>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<TeachingDocument | null>(null);
  const selected = classes.find((classRoom) => classRoom.id === selectedClassId) || classes[0];
  const selectedStudentUsernames = new Set((selected?.students || []).map((student) => student.username.toLowerCase()));
  const addStudentSuggestions = studentSuggestions
    .filter((student) => !selectedStudentUsernames.has(student.username.toLowerCase()))
    .slice(0, 20);
  const classDocuments = useMemo(
    () => documents.filter((document) => document.classId === selected?.id || (!document.classId && selected)),
    [documents, selected]
  );

  // Quiz stats state
  const [statsQuiz, setStatsQuiz] = useState<Quiz | null>(null);
  const [statsAssignmentId, setStatsAssignmentId] = useState("");
  const [statsSubmissions, setStatsSubmissions] = useState<Submission[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  // Flashcard deck state
  const [deckSet, setDeckSet] = useState<FlashcardSet | null>(null);

  // Flashcard lesson-picker modal state
  const [flashLessonOpen, setFlashLessonOpen] = useState(false);
  const [flashLessonId, setFlashLessonId] = useState("");
  const availableLessons = useMemo(
    () => (selected?.grade && selected.grade !== 6 ? [] : lessons),
    [selected?.grade, lessons]
  );
  const selectedFlashLesson = useMemo(
    () => availableLessons.find((lesson) => lesson.lesson_id === flashLessonId),
    [availableLessons, flashLessonId]
  );

  function openFlashLessonPicker() {
    setFlashLessonId(availableLessons[0]?.lesson_id || "");
    setFlashLessonOpen(true);
  }

  function confirmFlashLesson() {
    setFlashLessonOpen(false);
    onLearningAction("flash", selectedFlashLesson?.lesson_id || undefined);
  }

  const classAssignments = useMemo(
    () => assignments.filter((a) => a.classId === selected?.id),
    [assignments, selected]
  );

  // Real-time "Quiz gần nhất": the most recent submission per student across every
  // quiz assigned to this class. Fetched on demand when the student tab is open and
  // polled lightly so scores appear shortly after students submit.
  const [latestSubmissions, setLatestSubmissions] = useState<Record<string, Submission>>({});
  const [quizStatusLoading, setQuizStatusLoading] = useState(false);

  useEffect(() => {
    if (!selected || tab !== "students") return;
    let cancelled = false;
    async function loadLatestSubmissions() {
      try {
        const latestByStudent: Record<string, Submission> = {};
        for (const assignment of assignments.filter((a) => a.classId === selected.id)) {
          const result = await api.submissions(token, assignment.id);
          if (cancelled) return;
          for (const submission of result.submissions) {
            const current = latestByStudent[submission.studentId];
            if (!current || new Date(submission.submittedAt) > new Date(current.submittedAt)) {
              latestByStudent[submission.studentId] = submission;
            }
          }
        }
        if (!cancelled) setLatestSubmissions(latestByStudent);
      } catch {
        // Keep whatever we already have on transient errors; the next poll retries.
      } finally {
        if (!cancelled) setQuizStatusLoading(false);
      }
    }
    setQuizStatusLoading(true);
    void loadLatestSubmissions();
    const timer = window.setInterval(loadLatestSubmissions, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selected?.id, tab, token, assignments]);

  async function openQuizStats(assignment: AssignmentWithQuiz) {
    if (!assignment.quiz) return;
    setStatsAssignmentId(assignment.id);
    setStatsQuiz(assignment.quiz);
    setStatsLoading(true);
    setStatsSubmissions([]);
    try {
      const result = await api.submissions(token, assignment.id);
      setStatsSubmissions(result.submissions);
    } catch {
      setStatsSubmissions([]);
    } finally {
      setStatsLoading(false);
    }
  }

  const presentationDocs = classDocuments.filter((d) => d.fileUrl && d.mimeType.includes("presentation"));

  return (
    <section className="view active">
      <div className="page-head">
        <div><h1>Lớp học</h1><p>Mở từng lớp để quản lý học sinh, slide và các nội dung AI tương ứng.</p></div>
        <div className="page-head-actions">
          {selected && (
            <button className="btn danger-outline" onClick={() => setDeleteClassTarget(selected)}>🗑 Xóa lớp</button>
          )}
          <button className="btn primary" onClick={onCreateClass}>＋ Tạo lớp mới</button>
        </div>
      </div>

      <div className="class-layout">
        <div className="card class-list">
          {classes.map((classRoom) => (
            <button key={classRoom.id} className={`class-item ${classRoom.id === selected?.id ? "active" : ""}`} onClick={() => onSelectClass(classRoom.id)}>
              <b>{classRoom.name}</b><span>{classRoom.studentIds.length} học sinh · Lớp {classRoom.grade}</span>
            </button>
          ))}
        </div>

        {selected && (
          <div className="card class-detail">
            <div className="class-banner">
              <div>
                <h2>{selected.name}</h2>
                <p>Giáo viên phụ trách · {selected.studentIds.length} học sinh · Lớp {selected.grade} · HK1 {selected.academicYear}</p>
                <div className="knowledge-tags">
                  {selected.knowledgeScopes.map((scope) => <span key={scope}>{scope}</span>)}
                </div>
              </div>
              <button className="btn" style={{ background: "white", color: "var(--primary)", border: 0 }} onClick={onOpenWorkspace}>Mở Slide & AI</button>
            </div>

            <div className="tabs">
              <button className={tab === "students" ? "active" : ""} onClick={() => setTab("students")}>Học sinh</button>
              <button className={tab === "slides" ? "active" : ""} onClick={() => setTab("slides")}>Slide/Tài liệu</button>
              <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Hoạt động</button>
            </div>

            {tab === "students" && (
              <>
                <table className="student-table">
                  <thead><tr><th>Học sinh</th><th>Username</th><th>Quiz gần nhất</th><th>Trạng thái</th></tr></thead>
                  <tbody>
                    {(selected.students || []).map((student) => {
                      const latest = latestSubmissions[student.id];
                      return (
                        <tr key={student.id}>
                          <td>{student.displayName}</td>
                          <td>@{student.username}</td>
                          <td>
                            {quizStatusLoading && !latest ? "Đang tải…" : latest ? `${latest.score} / 10` : "—"}
                          </td>
                          <td>
                            {latest ? (
                              <Pill tone="success">Đã làm</Pill>
                            ) : (
                              <Pill tone={quizStatusLoading ? "warn" : undefined}>{quizStatusLoading ? "…" : "Chưa làm"}</Pill>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="upload" style={{ marginTop: 14, padding: 14 }}>
                  <div className="upload-left">
                    <SubjectMark subject={selected.subject} />
                    <div><h3>Thêm học sinh bằng username</h3><small>Ví dụ: @mkhang10a1</small></div>
                  </div>
                  <input
                    list="student-usernames-class-detail"
                    value={username}
                    onChange={(event) => {
                      const value = event.target.value;
                      setUsername(value);
                      onStudentSearch?.(value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onAddStudent(selected.id, username);
                        setUsername("");
                      }
                    }}
                    placeholder="@username"
                    style={{ maxWidth: 260, border: "1px solid var(--line)", borderRadius: 11, padding: 10 }}
                  />
                  <datalist id="student-usernames-class-detail">
                    {addStudentSuggestions.map((student) => (
                      <option key={student.id} value={student.username}>{student.displayName} · @{student.username}</option>
                    ))}
                  </datalist>
                  <button className="btn" onClick={() => { onAddStudent(selected.id, username); setUsername(""); }}>＋ Thêm</button>
                </div>
              </>
            )}

            {tab === "slides" && (
              <div>
                <SectionTitle title="Slide của lớp" right={<Pill>{classDocuments.length} file</Pill>} />
                <div className="upload" style={{ marginTop: 14 }}>
                  <div className="upload-left">
                    <div className="upload-icon">⇧</div>
                    <div><h3>Add slide vào {selected.name}</h3><small>PDF/PPTX · trước mắt dùng để mở và quản lý theo lớp</small></div>
                  </div>
                  <button className="btn primary" onClick={() => fileInput.current?.click()}>＋ Thêm slide</button>
                  <input ref={fileInput} type="file" hidden accept=".pdf,.ppt,.pptx" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onUpload(file, selected.id);
                    event.currentTarget.value = "";
                  }} />
                </div>

                {presentationDocs.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <PptxSlideViewer fileUrl={presentationDocs[0].fileUrl!} filename={presentationDocs[0].filename} />
                  </div>
                )}

                <div className="doc-list">
                  {classDocuments.map((document) => (
                    <div className="doc-row" key={document.id}>
                      <div><b>{document.filename}</b><span>{Math.round(document.sizeBytes / 1024)} KB · {document.knowledgeTags.join(", ")}</span></div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Pill tone={document.status === "indexed" ? "success" : "warn"}>{document.mimeType.includes("pdf") ? "PDF" : "Slide"}</Pill>
                        {document.fileUrl && <a className="btn small" href={document.fileUrl} target="_blank">Mở</a>}
                        <button className="btn small danger-outline doc-delete" title="Xóa slide/tài liệu" onClick={() => setDeleteDocTarget(document)}>🗑</button>
                      </div>
                    </div>
                  ))}
                  {!classDocuments.length && <div className="ai-note">Chưa có slide nào trong lớp này.</div>}
                </div>
              </div>
            )}

            {tab === "activity" && (
              <div>
                <div className="activity-section">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <h3 style={{ fontSize: 14, margin: 0 }}>Quiz đã giao</h3>
                    <Pill tone={classAssignments.length ? "success" : "warn"}>{classAssignments.length} bài</Pill>
                  </div>
                  {classAssignments.length === 0 && (
                    <p style={{ color: "var(--muted)", fontSize: 12 }}>Chưa có quiz nào được giao cho lớp này.</p>
                  )}
                  {classAssignments.map((assignment) => (
                    <div className="activity-item" key={assignment.id}>
                      <div>
                        <b>{assignment.quiz?.title || "Quiz"}</b>
                        <span>
                          {assignment.quiz?.subject === "geography" ? "Địa lý" : assignment.quiz?.subject === "history" ? "Lịch sử" : "Tổng hợp"}
                          {assignment.dueAt ? ` · Hạn ${new Date(assignment.dueAt).toLocaleDateString("vi-VN")}` : ""}
                          {" · "}
                          <Pill tone={assignment.status === "open" ? "success" : "warn"}>{assignment.status === "open" ? "Đang mở" : "Đã đóng"}</Pill>
                        </span>
                      </div>
                      <div className="activity-actions">
                        <button className="btn small" onClick={() => openQuizStats(assignment)} disabled={statsLoading}>
                          {statsLoading && statsAssignmentId === assignment.id ? "..." : "📊 Thống kê"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="activity-section">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <h3 style={{ fontSize: 14, margin: 0 }}>Flashcard của lớp</h3>
                    <button className="btn small primary" onClick={openFlashLessonPicker}>＋ Tạo Flashcard</button>
                  </div>
                  <FlashcardManager
                    flashcardSets={flashcardSets}
                    classId={selected.id}
                    token={token}
                    onRefresh={onRefresh}
                    showToast={showToast}
                    onViewDeck={setDeckSet}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <QuizStatisticsModal
        open={!!statsQuiz}
        onClose={() => setStatsQuiz(null)}
        quiz={statsQuiz}
        submissions={statsSubmissions}
        students={selected?.students || []}
      />

      {deckSet && (
        <FlashcardDeckView
          flashcardSet={deckSet}
          onClose={() => setDeckSet(null)}
        />
      )}

      {flashLessonOpen && (
        <div className="modal-backdrop open" onClick={() => setFlashLessonOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>Tạo Flashcard từ bài học</h3>
            <p>Chọn bài SGK để AI tạo flashcard đúng nội dung bài đó.</p>
            <div className="field">
              <label>Bài SGK</label>
              <select value={flashLessonId} onChange={(event) => setFlashLessonId(event.target.value)}>
                {availableLessons.map((lesson) => (
                  <option key={lesson.lesson_id} value={lesson.lesson_id}>
                    {lesson.subject_label} · {lesson.lesson_title}
                  </option>
                ))}
                {!availableLessons.length && <option value="">Chưa có dữ liệu SGK cho lớp này</option>}
              </select>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 12 }}>
              Flashcard sẽ có tên đúng tên bài: <b>“{selectedFlashLesson?.lesson_title || "..."}”</b>
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setFlashLessonOpen(false)}>Hủy</button>
              <button className="btn primary" onClick={confirmFlashLesson} disabled={!selectedFlashLesson}>
                Tạo Flashcard
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteClassTarget && (
        <div className="modal-backdrop open" onClick={() => setDeleteClassTarget(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3>Xóa lớp “{deleteClassTarget.name}”?</h3>
            <p>
              Lớp có {deleteClassTarget.studentIds.length} học sinh · Lớp {deleteClassTarget.grade}.
              Toàn bộ slide/tài liệu, quiz đã giao và hoạt động của lớp này sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDeleteClassTarget(null)}>Hủy</button>
              <button className="btn danger-outline" onClick={() => { onDeleteClass(deleteClassTarget.id); setDeleteClassTarget(null); }}>Xóa lớp</button>
            </div>
          </div>
        </div>
      )}

      {deleteDocTarget && (
        <div className="modal-backdrop open" onClick={() => setDeleteDocTarget(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3>Xóa slide/tài liệu “{deleteDocTarget.filename}”?</h3>
            <p>
              File này sẽ bị xóa vĩnh viễn khỏi lớp và không thể hoàn tác.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDeleteDocTarget(null)}>Hủy</button>
              <button className="btn danger-outline" onClick={() => { onDeleteDocument(deleteDocTarget.id); setDeleteDocTarget(null); }}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}