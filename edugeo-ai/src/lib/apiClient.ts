import type {
  AuthSession,
  ChatMessage,
  ClassRoom,
  Flashcard,
  FlashcardSet,
  NotificationItem,
  Quiz,
  QuizAssignment,
  QuizQuestion,
  LessonRecord,
  Subject,
  Submission,
  SummaryResult,
  TeacherAccountInput,
  TeachingDocument,
  User
} from "./types";

async function apiFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {})
    }
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `API ${response.status}`);
  return payload;
}

export const api = {
  login(input: { username: string; password: string }) {
    return apiFetch<AuthSession>("", "/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  register(input: { username: string; displayName: string; password: string; email?: string }) {
    return apiFetch<AuthSession>("", "/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  logout(token: string) {
    return apiFetch<{ ok: true }>(token, "/api/auth/logout", { method: "POST" });
  },
  changePassword(token: string, input: { currentPassword: string; nextPassword: string }) {
    return apiFetch<{ ok: true }>(token, "/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  me(token: string) {
    return apiFetch<{ user: User; notifications: NotificationItem[] }>(token, "/api/me");
  },
  markNotificationRead(token: string, id: string) {
    return apiFetch<{ ok: true; notification: NotificationItem }>(token, `/api/notifications/${id}/read`, {
      method: "PATCH"
    });
  },
  teachers(token: string) {
    return apiFetch<{ teachers: User[] }>(token, "/api/admin/teachers");
  },
  createTeacher(token: string, input: TeacherAccountInput) {
    return apiFetch<{ teacher: User }>(token, "/api/admin/teachers", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  deleteTeacher(token: string, teacherId: string) {
    return apiFetch<{ ok: true }>(token, `/api/admin/teachers/${teacherId}`, { method: "DELETE" });
  },
  searchStudents(token: string, query = "") {
    return apiFetch<{ users: User[] }>(token, `/api/users/search?q=${encodeURIComponent(query)}`);
  },
  classes(token: string) {
    return apiFetch<{ classes: Array<ClassRoom & { students?: User[] }> }>(token, "/api/classes");
  },
  createClass(
    token: string,
    input: { name: string; subject: Subject; grade: number; knowledgeScopes: string[]; studentUsernames: string[] }
  ) {
    return apiFetch<{ classRoom: ClassRoom }>(token, "/api/classes", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  addMember(token: string, classId: string, username: string) {
    return apiFetch<{ classRoom: ClassRoom; user: User }>(token, `/api/classes/${classId}/members`, {
      method: "POST",
      body: JSON.stringify({ username })
    });
  },
  deleteClass(token: string, classId: string) {
    return apiFetch<{ ok: true }>(token, `/api/classes/${classId}`, { method: "DELETE" });
  },
  deleteDocument(token: string, documentId: string) {
    return apiFetch<{ ok: true }>(token, `/api/documents/${documentId}`, { method: "DELETE" });
  },
  updateDocumentTags(token: string, documentId: string, knowledgeTags: string[]) {
    return apiFetch<{ document: TeachingDocument }>(token, `/api/documents/${documentId}`, {
      method: "PATCH",
      body: JSON.stringify({ knowledgeTags })
    });
  },
  documents(token: string) {
    return apiFetch<{ documents: TeachingDocument[] }>(token, "/api/documents");
  },
  lessons(token: string) {
    return apiFetch<{ lessons: LessonRecord[] }>(token, "/api/notebook/lessons");
  },
  uploadDocument(token: string, input: { classId?: string; file: File; knowledgeTags: string[] }) {
    const form = new FormData();
    form.set("file", input.file);
    if (input.classId) form.set("classId", input.classId);
    form.set("knowledgeTags", JSON.stringify(input.knowledgeTags));
    return fetch("/api/documents", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      body: form
    }).then(async (response) => {
      const payload = (await response.json().catch(() => ({}))) as { document?: TeachingDocument; error?: string };
      if (!response.ok || !payload.document) throw new Error(payload.error || `API ${response.status}`);
      return payload as { document: TeachingDocument };
    });
  },
  chat(token: string, input: { query: string; classId?: string; lessonId?: string; subject?: string; classLevel?: number }) {
    return apiFetch<{ message: ChatMessage }>(token, "/api/rag/chat", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  quizzes(token: string) {
    return apiFetch<{ quizzes: Quiz[] }>(token, "/api/quizzes");
  },
  createQuiz(
    token: string,
    input: { title: string; subject: Subject; classId?: string; documentId?: string; knowledgeScope?: string; lessonId?: string; count?: number; durationMinutes?: number; skipAI?: boolean }
  ) {
    return apiFetch<{ quiz: Quiz }>(token, "/api/quizzes", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  updateQuiz(token: string, quizId: string, questions: QuizQuestion[], status: Quiz["status"] = "reviewing") {
    return apiFetch<{ quiz: Quiz }>(token, `/api/quizzes/${quizId}`, {
      method: "PATCH",
      body: JSON.stringify({ questions, status })
    });
  },
  publishQuiz(token: string, quizId: string, input: { classId: string; dueAt?: string; durationMinutes?: number }) {
    return apiFetch<{ quiz: Quiz; assignment: QuizAssignment }>(token, `/api/quizzes/${quizId}/publish`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  assignments(token: string) {
    return apiFetch<{ assignments: Array<QuizAssignment & { quiz?: Quiz; classRoom?: ClassRoom }> }>(token, "/api/assignments");
  },
  submissions(token: string, assignmentId: string) {
    return apiFetch<{ submissions: Submission[] }>(token, `/api/submissions?assignmentId=${encodeURIComponent(assignmentId)}`);
  },
  mySubmissions(token: string) {
    return apiFetch<{ submissions: Submission[] }>(token, "/api/submissions/mine");
  },
  submitQuiz(token: string, input: { assignmentId: string; answers: Record<string, string> }) {
    return apiFetch<{ submission: { score: number } }>(token, "/api/submissions", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  flashcards(token: string, input: { classId?: string; title?: string; query: string; lessonId?: string; subject?: string; count?: number }) {
    return apiFetch<{ flashcardSet: FlashcardSet }>(token, "/api/flashcards", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  listFlashcards(token: string, classId?: string) {
    const query = classId ? `?classId=${encodeURIComponent(classId)}` : "";
    return apiFetch<{ flashcardSets: FlashcardSet[] }>(token, `/api/flashcards${query}`);
  },
  updateFlashcard(token: string, setId: string, input: { title?: string; cards?: Flashcard[] }) {
    return apiFetch<{ flashcardSet: FlashcardSet }>(token, `/api/flashcards/${setId}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },
  deleteFlashcard(token: string, setId: string) {
    return apiFetch<{ ok: true }>(token, `/api/flashcards/${setId}`, { method: "DELETE" });
  },
  broadcastFlashcard(token: string, setId: string, classId: string) {
    return apiFetch<{ flashcardSet: FlashcardSet }>(token, `/api/flashcards/${setId}/broadcast`, {
      method: "POST",
      body: JSON.stringify({ classId })
    });
  },
  summary(token: string, input: { classId?: string; query: string; lessonId?: string; subject?: string }) {
    return apiFetch<{ summary: { result: SummaryResult } }>(token, "/api/summaries", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }
};
