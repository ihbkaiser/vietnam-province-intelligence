"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import type {
  AuthSession,
  ClassRoom,
  FlashcardSet,
  LessonRecord,
  NotificationItem,
  Quiz,
  QuizAssignment,
  QuizQuestion,
  Role,
  SummaryResult,
  TeacherAccountInput,
  TeachingDocument,
  User,
  ViewId
} from "@/lib/types";
import { AppShell } from "./AppShell";
import { AuthView } from "./AuthView";
import { ChatAssistant } from "./ChatAssistant";
import { Landing } from "./Landing";
import { ChangePasswordModal, ClassModal } from "./shared/Modals";
import { LoadingOverlay } from "./shared/LoadingOverlay";
import { Toast } from "./shared/Toast";
import { AdminView } from "./views/AdminView";
import { ClassesView } from "./views/ClassesView";
import { DashboardView } from "./views/DashboardView";
import { QuizReviewView } from "./views/QuizReviewView";
import { StudentDashboardView } from "./views/StudentDashboardView";
import { StudentFlashcardsView } from "./views/StudentFlashcardsView";
import { StudentQuizView } from "./views/StudentQuizView";
import { FlashcardDeckView } from "./views/FlashcardDeckView";
import { VietGeoView } from "./views/VietGeoView";
import { WorkspaceView } from "./views/WorkspaceView";

type ClassWithStudents = ClassRoom & { students?: User[] };
type AssignmentWithQuiz = QuizAssignment & { quiz?: Quiz; classRoom?: ClassRoom };

const SESSION_KEY = "edugeo.session";

function activeRoleView(role: Role): ViewId {
  if (role === "admin") return "admin";
  return role === "teacher" ? "dashboard" : "studentDashboard";
}

export function EduGeoApp() {
  const [appMode, setAppMode] = useState<"landing" | "auth" | "app">("landing");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [view, setView] = useState<ViewId>("dashboard");
  const [classes, setClasses] = useState<ClassWithStudents[]>([]);
  const [documents, setDocuments] = useState<TeachingDocument[]>([]);
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithQuiz[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [studentSuggestions, setStudentSuggestions] = useState<User[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState("quiz-climate-review");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loadingOverlay, setLoadingOverlay] = useState<string | null>(null);
  const [latestSummary, setLatestSummary] = useState<SummaryResult | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [flashcardSets, setFlashcardSets] = useState<FlashcardSet[]>([]);
  const [viewingDeckSet, setViewingDeckSet] = useState<FlashcardSet | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  // Server-backed submission state: assignmentId -> score (out of 10). Restored from
  // GET /api/submissions/mine on every refresh so results survive an F5 reload.
  const [myScores, setMyScores] = useState<Record<string, number>>({});
  const saveQuizLocallyRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; token: string; quizId: string } | null>(null);

  const user = session?.user || null;
  const role = user?.role || "student";
  const token = session?.token || "";
  const selectedQuiz = useMemo(
    () => quizzes.find((quiz) => quiz.id === selectedQuizId) || quizzes.find((quiz) => quiz.status !== "published") || quizzes[0] || null,
    [quizzes, selectedQuizId]
  );

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  function saveSession(nextSession: AuthSession) {
    setSession(nextSession);
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setView(activeRoleView(nextSession.user.role));
    setAppMode("app");
  }

  async function refresh(currentToken = token, currentUser = user) {
    if (!currentToken || !currentUser) return;
    try {
      const [me, classResult, documentResult, quizResult, assignmentResult, lessonResult, flashcardResult, submissionResult] = await Promise.all([
        api.me(currentToken),
        api.classes(currentToken),
        api.documents(currentToken),
        api.quizzes(currentToken),
        api.assignments(currentToken),
        api.lessons(currentToken),
        api.listFlashcards(currentToken),
        api.mySubmissions(currentToken)
      ]);
      const nextSession = { token: currentToken, user: me.user };
      setSession(nextSession);
      localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setNotifications(me.notifications);
      setClasses(classResult.classes);
      setDocuments(documentResult.documents);
      setQuizzes(quizResult.quizzes);
      setAssignments(assignmentResult.assignments);
      setLessons(lessonResult.lessons);
      setFlashcardSets(flashcardResult.flashcardSets);
      setMyScores(
        Object.fromEntries((submissionResult.submissions || []).map((submission) => [submission.assignmentId, submission.score]))
      );
      if (!selectedClassId && classResult.classes[0]) setSelectedClassId(classResult.classes[0].id);
      if (me.user.role === "teacher" || me.user.role === "admin") {
        const studentResult = await api.searchStudents(currentToken);
        setStudentSuggestions(studentResult.users);
      }
      if (me.user.role === "admin") {
        const teacherResult = await api.teachers(currentToken);
        setTeachers(teacherResult.teachers);
      }
      if (quizResult.quizzes[0]) setSelectedQuizId((current) => current || quizResult.quizzes[0].id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không tải được dữ liệu.");
      if (error instanceof Error && error.message.toLowerCase().includes("phiên đăng nhập")) {
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
        setAppMode("auth");
      }
    }
  }

  useEffect(() => {
    document.body.classList.toggle("landing-mode", appMode === "landing");
    document.body.classList.toggle("app-mode", appMode !== "landing");
  }, [appMode]);

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as AuthSession;
      setSession(saved);
      setView(activeRoleView(saved.user.role));
      setAppMode("app");
      void refresh(saved.token, saved.user);
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (session) void refresh(session.token, session.user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  async function logout() {
    if (token) await api.logout(token).catch(() => undefined);
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setAppMode("auth");
    setClasses([]);
    setDocuments([]);
    setQuizzes([]);
    setAssignments([]);
    setNotifications([]);
    setTeachers([]);
    setStudentSuggestions([]);
    showToast("Đã đăng xuất.");
  }

  async function changePassword(input: { currentPassword: string; nextPassword: string }) {
    try {
      await api.changePassword(token, input);
      setPasswordModalOpen(false);
      showToast("Đã đổi mật khẩu.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không đổi được mật khẩu.");
    }
  }

  async function createTeacher(input: TeacherAccountInput) {
    try {
      const result = await api.createTeacher(token, input);
      setTeachers((items) => [result.teacher, ...items]);
      showToast(`Đã cấp tài khoản giáo viên @${result.teacher.username}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không tạo được giáo viên.");
    }
  }

  async function deleteTeacher(teacherId: string) {
    try {
      await api.deleteTeacher(token, teacherId);
      setTeachers((items) => items.filter((teacher) => teacher.id !== teacherId));
      showToast("Đã xóa tài khoản giáo viên.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không xóa được giáo viên.");
    }
  }

  async function createClass(input: Parameters<typeof api.createClass>[1]) {
    try {
      const result = await api.createClass(token, input);
      setClasses((items) => [result.classRoom, ...items]);
      setSelectedClassId(result.classRoom.id);
      setClassModalOpen(false);
      showToast(`Đã tạo lớp ${result.classRoom.name}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Tạo lớp thất bại.");
    }
  }

  async function addStudent(classId: string, username: string) {
    if (!username.trim()) return;
    try {
      await api.addMember(token, classId, username);
      await refresh(token, user);
      showToast(`Đã thêm ${username} vào lớp.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thêm được học sinh.");
    }
  }

  async function deleteClass(classId: string) {
    try {
      await api.deleteClass(token, classId);
      const remaining = classes.filter((item) => item.id !== classId);
      setClasses(remaining);
      if (selectedClassId === classId) setSelectedClassId(remaining[0]?.id || "");
      setDocuments((items) => items.filter((item) => item.classId !== classId));
      showToast("Đã xóa lớp.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không xóa được lớp.");
    }
  }

  async function deleteDocument(documentId: string) {
    try {
      await api.deleteDocument(token, documentId);
      setDocuments((items) => items.filter((item) => item.id !== documentId));
      showToast("Đã xóa slide/tài liệu.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không xóa được slide/tài liệu.");
    }
  }

  async function updateDocumentTags(documentId: string, knowledgeTags: string[]) {
    try {
      const result = await api.updateDocumentTags(token, documentId, knowledgeTags);
      setDocuments((items) => items.map((d) => d.id === documentId ? result.document : d));
      showToast("Đã cập nhật thẻ kiến thức.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không cập nhật được thẻ.");
    }
  }

  async function searchStudentSuggestions(query: string) {
    if (role !== "teacher" && role !== "admin") return;
    try {
      const result = await api.searchStudents(token, query);
      setStudentSuggestions(result.users);
    } catch {
      // Suggestions are auxiliary; keep the class form usable if the lookup fails.
    }
  }

  async function uploadDocument(file: File, classId = selectedClassId || classes[0]?.id) {
    try {
      const result = await api.uploadDocument(token, {
        classId,
        file,
        knowledgeTags: ["Slide lớp học", "Chưa index RAG"]
      });
      setDocuments((items) => [result.document, ...items]);
      showToast("Đã thêm slide vào lớp. RAG cho slide sẽ nối ở bước sau.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Upload thất bại.");
    }
  }

  async function generateQuiz(input: Parameters<typeof api.createQuiz>[1]) {
    try {
      setLoadingOverlay(input.skipAI ? "⏳ Đang tạo Quiz trống..." : "⏳ AI đang tạo Quiz, vui lòng chờ...");
      const result = await api.createQuiz(token, input);
      setQuizzes((items) => [result.quiz, ...items]);
      setSelectedQuizId(result.quiz.id);
      setView("quiz");
      showToast(input.skipAI ? "✅ Quiz trống đã tạo. Hãy thêm câu hỏi thủ công." : "✅ Quiz nháp đã sẵn sàng để review/edit.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không tạo được Quiz.");
    } finally {
      setLoadingOverlay(null);
    }
  }

  function saveQuizLocally(questions: QuizQuestion[], status: Quiz["status"] = "reviewing") {
    if (!selectedQuiz) return;
    const updated: Quiz = { ...selectedQuiz, questions, status, updatedAt: new Date().toISOString() };
    setQuizzes((items) => items.map((quiz) => quiz.id === updated.id ? updated : quiz));
    // Persist to server so quiz survives a restart / refresh.
    // Debounce 600ms so rapid edits (typing, reordering) batch into one PATCH.
    if (!saveQuizLocallyRef.current) saveQuizLocallyRef.current = { timer: null, token: "", quizId: "" };
    const ctx = saveQuizLocallyRef.current;
    ctx.token = token;
    ctx.quizId = selectedQuiz.id;
    if (ctx.timer) clearTimeout(ctx.timer);
    ctx.timer = setTimeout(async () => {
      ctx.timer = null;
      // Only fire if token and quizId are still valid (no logout / re-render).
      if (!ctx.token || !ctx.quizId) return;
      await api.updateQuiz(ctx.token, ctx.quizId, questions, status).catch(() => undefined);
    }, 600);
  }

  async function publishQuiz(classId: string, dueAt: string, durationMinutes?: number) {
    if (!selectedQuiz) return;
    try {
      setLoadingOverlay("⏳ Đang giao Quiz cho lớp...");
      const localQuiz = quizzes.find((quiz) => quiz.id === selectedQuiz.id) || selectedQuiz;
      await api.updateQuiz(token, localQuiz.id, localQuiz.questions, "approved");
      await api.publishQuiz(token, localQuiz.id, { classId, dueAt: new Date(dueAt).toISOString(), durationMinutes });
      await refresh(token, user);
      showToast("✅ Quiz đã được giao cho lớp.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Giao Quiz thất bại.");
    } finally {
      setLoadingOverlay(null);
    }
  }

  async function learningAction(action: "rag" | "flash" | "summary", lessonId?: string) {
    if (action === "rag") {
      showToast("Mở nút trợ lý AI ở góc dưới để hỏi theo nguồn RAG.");
      return;
    }
    try {
      // Use the actual lesson name (when a lesson is picked) instead of a generic default title.
      const lesson = lessonId ? lessons.find((item) => item.lesson_id === lessonId) : undefined;
      const baseTitle = lesson?.lesson_title || "Flashcard bài học";
      setLoadingOverlay(action === "flash" ? "⏳ AI đang tạo Flashcard..." : "⏳ AI đang tóm tắt bài học...");
      if (action === "flash") {
        const result = await api.flashcards(token, {
          classId: selectedClassId || classes[0]?.id,
          title: baseTitle,
          query: lesson?.lesson_title || baseTitle,
          lessonId
        });
        setViewingDeckSet(result.flashcardSet);
        // Reload flashcard sets so the new set appears in the class activity tab.
        const flashcardResult = await api.listFlashcards(token);
        setFlashcardSets(flashcardResult.flashcardSets);
        showToast(`✅ Đã tạo ${result.flashcardSet.cards.length} flashcard từ bài "${baseTitle}".`);
      } else {
        setSummaryLoading(true);
        setLatestSummary(null);
        const result = await api.summary(token, {
          classId: selectedClassId || classes[0]?.id,
          query: "tóm tắt bài học đang chọn",
          lessonId
        });
        setLatestSummary(result.summary.result);
        showToast("✅ Bản tóm tắt bài học đã sẵn sàng để rà soát.");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không tạo được nội dung AI.");
    } finally {
      setLoadingOverlay(null);
      setSummaryLoading(false);
    }
  }

  function markNotificationRead(id: string) {
    setNotifications((items) =>
      items.map((item) => (item.id === id ? { ...item, readAt: item.readAt || new Date().toISOString() } : item))
    );
    api.markNotificationRead(token, id).catch(() => undefined);
  }

  async function submitStudentQuiz(assignmentId: string, answers: Record<string, string>): Promise<number | null> {
    setLoadingOverlay("Đang nộp bài...");
    try {
      const result = await api.submitQuiz(token, { assignmentId, answers });
      // Mark the quiz_assigned notification as read so "Bạn có một Quiz mới" disappears.
      const quizNotif = notifications.find(
        (item) => item.userId === user?.id && item.type === "quiz_assigned"
      );
      if (quizNotif && !quizNotif.readAt) markNotificationRead(quizNotif.id);
      setMyScores((scores) => ({ ...scores, [assignmentId]: result.submission.score }));
      showToast(`Đã nộp bài. Kết quả: ${result.submission.score} / 10`);
      return result.submission.score;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không nộp được bài.");
      return null;
    } finally {
      setLoadingOverlay(null);
    }
  }

  if (appMode === "landing") {
    return (
      <>
        <Landing onStart={() => setAppMode("auth")} />
        <Toast message={toast} />
      </>
    );
  }

  if (!session || !user) {
    return (
      <>
        <AuthView onAuthed={saveSession} onBack={() => setAppMode("landing")} />
        <Toast message={toast} />
      </>
    );
  }

  return (
    <>
      <AppShell
        user={user}
        role={role}
        view={view}
        unreadCount={notifications.filter((item) => !item.readAt).length}
        notifications={notifications}
        onViewChange={setView}
        onLanding={() => setAppMode("landing")}
        onMarkRead={markNotificationRead}
        onChangePassword={() => setPasswordModalOpen(true)}
        onLogout={() => void logout()}
      >
        {role === "admin" && view === "admin" && (
          <AdminView teachers={teachers} onCreateTeacher={createTeacher} onDeleteTeacher={deleteTeacher} />
        )}
        {role === "teacher" && view === "dashboard" && (
          <DashboardView
            user={user}
            classes={classes}
            documents={documents}
            onCreateClass={() => setClassModalOpen(true)}
            onGoClasses={() => setView("classes")}
            onGoWorkspace={() => setView("workspace")}
            onGoQuiz={() => setView("quiz")}
            onGoVietGeo={() => setView("vietgeo")}
            onLearningAction={learningAction}
          />
        )}
        {view === "classes" && role === "teacher" && (
          <ClassesView
            classes={classes}
            documents={documents}
            assignments={assignments}
            flashcardSets={flashcardSets}
            lessons={lessons}
            selectedClassId={selectedClassId}
            onSelectClass={setSelectedClassId}
            onCreateClass={() => setClassModalOpen(true)}
            onAddStudent={addStudent}
            onDeleteClass={deleteClass}
            onDeleteDocument={deleteDocument}
            studentSuggestions={studentSuggestions}
            onStudentSearch={searchStudentSuggestions}
            onUpload={uploadDocument}
            onOpenWorkspace={() => setView("workspace")}
            onLearningAction={(action, lessonId) => void learningAction(action, lessonId)}
            token={token}
            onRefresh={() => void refresh(token, user)}
            showToast={showToast}
          />
        )}
        {view === "workspace" && role !== "admin" && (
          <WorkspaceView
            role={role}
            classes={classes}
            documents={documents}
            lessons={lessons}
            selectedClassId={selectedClassId}
            onSelectClass={setSelectedClassId}
            onUpload={uploadDocument}
            onQuiz={() => setView("quiz")}
            onLearningAction={learningAction}
            latestSummary={latestSummary}
            summaryLoading={summaryLoading}
            onUpdateTags={updateDocumentTags}
          />
        )}
        {role === "teacher" && view === "quiz" && (
          <QuizReviewView
            quiz={selectedQuiz}
            classes={classes}
            documents={documents}
            lessons={lessons}
            onGenerate={generateQuiz}
            onSave={saveQuizLocally}
            onPublish={(classId, dueAt, durationMinutes) => void publishQuiz(classId, dueAt, durationMinutes)}
          />
        )}
        {role === "student" && view === "studentDashboard" && (
          <StudentDashboardView user={user} classes={classes} assignments={assignments} notifications={notifications} myScores={myScores} onStudentQuiz={(assignment) => { setSelectedAssignmentId(assignment?.id ?? null); setView("studentQuiz"); }} onLearningAction={learningAction} />
        )}
        {role === "student" && view === "studentQuiz" && (
          <StudentQuizView
            assignment={assignments.find((a) => a.id === selectedAssignmentId) || undefined}
            assignments={assignments}
            myScores={myScores}
            initialScore={selectedAssignmentId ? myScores[selectedAssignmentId] ?? null : null}
            onSelectAssignment={(assignmentId) => setSelectedAssignmentId(assignmentId || null)}
            onSubmit={submitStudentQuiz}
            onBackHome={() => setView("studentDashboard")}
          />
        )}
        {role === "student" && view === "studentFlashcards" && (
          <StudentFlashcardsView
            classes={classes}
            assignments={assignments}
            flashcardSets={flashcardSets}
            onStartQuiz={(assignment) => {
              setSelectedAssignmentId(assignment.id);
              setView("studentQuiz");
            }}
            onViewDeck={(set) => setViewingDeckSet(set)}
          />
        )}
        {viewingDeckSet && (
          <FlashcardDeckView
            flashcardSet={viewingDeckSet}
            onClose={() => setViewingDeckSet(null)}
          />
        )}
        {view === "vietgeo" && <VietGeoView />}
        {(latestSummary && role === "teacher" && view === "workspace") && (
          <div className="learning-output">
            {latestSummary && (
              <>
                <h4>{latestSummary.title}</h4>
                <ul>{latestSummary.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul>
              </>
            )}
          </div>
        )}
      </AppShell>
      {role !== "admin" && (
        <ChatAssistant
          token={token}
          role={role}
          classId={selectedClassId || classes[0]?.id}
          classGrade={(classes.find((item) => item.id === selectedClassId) || classes[0])?.grade}
          lessons={lessons}
        />
      )}
      <ClassModal
        open={classModalOpen}
        onClose={() => setClassModalOpen(false)}
        onCreate={createClass}
        studentSuggestions={studentSuggestions}
        onStudentSearch={searchStudentSuggestions}
      />
      <ChangePasswordModal open={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} onConfirm={changePassword} />
      {loadingOverlay && <LoadingOverlay message={loadingOverlay} />}
      <Toast message={toast} />
    </>
  );
}
