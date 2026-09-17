import { createInitialSnapshot } from "@/lib/seed";
import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  AppSnapshot,
  ClassRoom,
  Flashcard,
  FlashcardAssignment,
  FlashcardSet,
  NotificationItem,
  Quiz,
  QuizAssignment,
  QuizQuestion,
  Role,
  Submission,
  SummaryResult,
  TeacherAccountInput,
  TeachingDocument,
  User
} from "@/lib/types";

interface MemoryState extends AppSnapshot {
  credentials: Array<{ userId: string; passwordHash: string; updatedAt: string }>;
  sessions: Array<{ token: string; userId: string; createdAt: string; expiresAt: string; revokedAt?: string }>;
  flashcards: Array<{ id: string; ownerId: string; classId?: string; broadcasted?: boolean; title: string; cards: Flashcard[]; createdAt: string }>;
  flashcardAssignments: Array<{
    id: string;
    flashcardSetId: string;
    classId: string;
    status: "open" | "closed";
    createdAt: string;
  }>;
  summaries: Array<{ id: string; ownerId: string; classId?: string; result: SummaryResult; createdAt: string }>;
  submissions: Array<{
    id: string;
    assignmentId: string;
    studentId: string;
    answers: Record<string, string>;
    score: number;
    submittedAt: string;
  }>;
}

const globalForStore = globalThis as typeof globalThis & { __edugeoStore?: MemoryState };

const DB_FILE = path.join(process.cwd(), "storage", "db.json");

// Debounced write so bursts of mutations (e.g. creating a quiz with many
// notifications) flush once at the end rather than hitting disk per mutation.
let pendingWrite: NodeJS.Timeout | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function schedulePersist(db: MemoryState): void {
  if (pendingWrite) clearTimeout(pendingWrite);
  pendingWrite = setTimeout(() => {
    pendingWrite = null;
    writeQueue = writeQueue
      .then(() => mkdir(path.dirname(DB_FILE), { recursive: true }))
      .then(() => writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8"))
      .catch((err) => console.error("[edugeo] failed to persist store:", err));
  }, 150);
}

/** Reads storage/db.json if present; returns undefined when absent or corrupt. */
function readPersistedState(): MemoryState | undefined {
  try {
    const raw = readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<MemoryState>;
    if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.documents)) return undefined;
    return parsed as MemoryState;
  } catch {
    return undefined;
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function passwordHash(password: string, salt = randomBytes(16).toString("hex")): string {
  const hash = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${salt}$${hash}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [, roundsRaw, salt, expected] = encoded.split("$");
  if (!roundsRaw || !salt || !expected) return false;
  const actual = pbkdf2Sync(password, salt, Number(roundsRaw), 32, "sha256");
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(expectedBuffer, actual);
}

function state(): MemoryState {
  if (!globalForStore.__edugeoStore) {
    const snapshot = createInitialSnapshot();
    const persisted = readPersistedState();
    const db: MemoryState = {
      ...snapshot,
      credentials: [
        { userId: "admin-195", passwordHash: passwordHash("19052005"), updatedAt: new Date().toISOString() },
        { userId: "teacher-lan", passwordHash: passwordHash("colan123"), updatedAt: new Date().toISOString() },
        { userId: "student-khang", passwordHash: passwordHash("123456"), updatedAt: new Date().toISOString() },
        { userId: "student-han", passwordHash: passwordHash("123456"), updatedAt: new Date().toISOString() },
        { userId: "student-anh", passwordHash: passwordHash("123456"), updatedAt: new Date().toISOString() }
      ],
      sessions: [],
      flashcards: [],
      flashcardAssignments: [],
      summaries: [],
      submissions: []
    };
    if (persisted) {
      // A saved db.json wins for the mutable collections; seed data provides the
      // baseline for anything the file doesn't carry (e.g. the credentials above
      // are always re-seeded so logins work on a fresh deployment).
      Object.assign(db, {
        users: persisted.users,
        classes: persisted.classes,
        documents: persisted.documents,
        quizzes: persisted.quizzes,
        assignments: persisted.assignments,
        notifications: persisted.notifications,
        flashcards: persisted.flashcards ?? [],
        flashcardAssignments: persisted.flashcardAssignments ?? [],
        summaries: persisted.summaries ?? [],
        submissions: persisted.submissions ?? [],
        sessions: persisted.sessions ?? []
      });
    }
    globalForStore.__edugeoStore = db;
  }
  // The singleton persists on globalThis across dev hot-reloads. If it was first
  // created by an older module version, fields added later are missing from the
  // runtime object — backfill them here so every array is always defined no
  // matter which version initialized the store.
  const loaded = globalForStore.__edugeoStore;
  loaded.sessions = loaded.sessions ?? [];
  loaded.flashcards = loaded.flashcards ?? [];
  loaded.flashcardAssignments = loaded.flashcardAssignments ?? [];
  loaded.summaries = loaded.summaries ?? [];
  loaded.submissions = loaded.submissions ?? [];
  return loaded;
}

export const store = {
  snapshot(): AppSnapshot {
    const db = state();
    return {
      users: db.users,
      classes: db.classes,
      documents: db.documents,
      quizzes: db.quizzes,
      assignments: db.assignments,
      notifications: db.notifications
    };
  },
  userBySession(token: string): User | undefined {
    const session = state().sessions.find((item) => item.token === token && !item.revokedAt && new Date(item.expiresAt) > new Date());
    return session ? this.userById(session.userId) : undefined;
  },
  userById(id: string): User | undefined {
    return state().users.find((user) => user.id === id);
  },
  userByUsername(username: string): User | undefined {
    const normalized = username.replace(/^@/, "").toLowerCase();
    return state().users.find((user) => user.username.toLowerCase() === normalized);
  },
  createUser(input: { username: string; displayName?: string; role: Role; email?: string }): User {
    const cleanUsername = input.username.replace(/^@/, "");
    const user: User = {
      id: newId(input.role),
      username: cleanUsername,
      displayName: input.displayName || cleanUsername,
      role: input.role,
      email: input.email
    };
    const db = state();
    db.users.push(user);
    schedulePersist(db);
    return user;
  },
  setPassword(userId: string, password: string): void {
    const db = state();
    const record = db.credentials.find((item) => item.userId === userId);
    const nextHash = passwordHash(password);
    if (record) {
      record.passwordHash = nextHash;
      record.updatedAt = new Date().toISOString();
    } else {
      db.credentials.push({ userId, passwordHash: nextHash, updatedAt: new Date().toISOString() });
    }
    schedulePersist(db);
  },
  createSession(userId: string): { token: string; user: User } {
    const user = this.userById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    const token = randomUUID();
    const db = state();
    db.sessions.push({
      token,
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString()
    });
    schedulePersist(db);
    return { token, user };
  },
  authenticate(username: string, password: string): { token: string; user: User } | null {
    const user = this.userByUsername(username);
    if (!user) return null;
    const credential = state().credentials.find((item) => item.userId === user.id);
    if (!credential || !verifyPassword(password, credential.passwordHash)) return null;
    return this.createSession(user.id);
  },
  revokeSession(token: string): void {
    const db = state();
    const session = db.sessions.find((item) => item.token === token);
    if (session) session.revokedAt = new Date().toISOString();
    schedulePersist(db);
  },
  registerStudent(input: { username: string; displayName: string; password: string; email?: string }): { token: string; user: User } {
    let user = this.userByUsername(input.username);
    if (user && user.role !== "student") throw new Error("USERNAME_EXISTS");
    if (user) {
      const existingUserId = user.id;
      if (state().credentials.some((credential) => credential.userId === existingUserId)) throw new Error("USERNAME_EXISTS");
    }
    if (!user) {
      user = this.createUser({ username: input.username, displayName: input.displayName, role: "student", email: input.email });
    } else {
      user.displayName = input.displayName || user.displayName;
      user.email = input.email || user.email;
      schedulePersist(state());
    }
    this.setPassword(user.id, input.password);
    return this.createSession(user.id);
  },
  createTeacher(input: TeacherAccountInput): User {
    if (this.userByUsername(input.username)) throw new Error("USERNAME_EXISTS");
    const user = this.createUser({ username: input.username, displayName: input.displayName, role: "teacher", email: input.email });
    this.setPassword(user.id, input.password);
    return user;
  },
  deleteTeacher(teacherId: string): void {
    const db = state();
    const user = this.userById(teacherId);
    if (!user || user.role !== "teacher") throw new Error("TEACHER_NOT_FOUND");
    const classIds = db.classes.filter((classRoom) => classRoom.teacherId === teacherId).map((classRoom) => classRoom.id);
    const quizIds = db.quizzes.filter((quiz) => quiz.authorId === teacherId || (quiz.classId && classIds.includes(quiz.classId))).map((quiz) => quiz.id);
    db.assignments = db.assignments.filter((assignment) => !classIds.includes(assignment.classId) && !quizIds.includes(assignment.quizId));
    db.quizzes = db.quizzes.filter((quiz) => quiz.authorId !== teacherId && !quizIds.includes(quiz.id));
    db.documents = db.documents.filter((document) => document.uploadedById !== teacherId && (!document.classId || !classIds.includes(document.classId)));
    db.classes = db.classes.filter((classRoom) => classRoom.teacherId !== teacherId);
    db.notifications = db.notifications.filter((notification) => notification.userId !== teacherId);
    db.credentials = db.credentials.filter((credential) => credential.userId !== teacherId);
    db.sessions = db.sessions.filter((session) => session.userId !== teacherId);
    db.users = db.users.filter((item) => item.id !== teacherId);
    schedulePersist(db);
  },
  listTeachers(): User[] {
    return state().users.filter((user) => user.role === "teacher");
  },
  searchUsers(input: { role?: Role; query?: string }): User[] {
    const query = (input.query || "").replace(/^@/, "").trim().toLowerCase();
    return state().users
      .filter((user) => !input.role || user.role === input.role)
      .filter((user) => {
        if (!query) return true;
        return user.username.toLowerCase().includes(query) || user.displayName.toLowerCase().includes(query);
      });
  },
  changePassword(user: User, currentPassword: string, nextPassword: string): void {
    const credential = state().credentials.find((item) => item.userId === user.id);
    if (!credential || !verifyPassword(currentPassword, credential.passwordHash)) throw new Error("CURRENT_PASSWORD_INVALID");
    this.setPassword(user.id, nextPassword);
  },
  classesForUser(user: User): ClassRoom[] {
    const db = state();
    if (user.role === "admin") return db.classes;
    if (user.role === "teacher") {
      return db.classes.filter((classRoom) => classRoom.teacherId === user.id);
    }
    return db.classes.filter((classRoom) => classRoom.studentIds.includes(user.id));
  },
  classById(classId: string): ClassRoom | undefined {
    return state().classes.find((classRoom) => classRoom.id === classId);
  },
  documentById(documentId: string): TeachingDocument | undefined {
    return state().documents.find((document) => document.id === documentId);
  },
  createClass(input: Omit<ClassRoom, "id" | "studentIds" | "progress"> & { studentUsernames?: string[] }): ClassRoom {
    const classRoom: ClassRoom = {
      id: newId("class"),
      studentIds: [],
      progress: 0,
      ...input
    };
    for (const username of input.studentUsernames || []) {
      let user = this.userByUsername(username);
      if (!user || user.role !== "student") throw new Error("STUDENT_NOT_FOUND");
      classRoom.studentIds.push(user.id);
    }
    const db = state();
    db.classes.unshift(classRoom);
    schedulePersist(db);
    return classRoom;
  },
  addMemberByUsername(classId: string, username: string): { classRoom: ClassRoom; user: User } {
    const classRoom = this.classById(classId);
    if (!classRoom) throw new Error("CLASS_NOT_FOUND");
    let user = this.userByUsername(username);
    if (!user || user.role !== "student") throw new Error("STUDENT_NOT_FOUND");
    if (!classRoom.studentIds.includes(user.id)) classRoom.studentIds.push(user.id);
    schedulePersist(state());
    return { classRoom, user };
  },
  documentsForUser(user: User): TeachingDocument[] {
    if (user.role === "admin") return state().documents;
    const classIds = this.classesForUser(user).map((classRoom) => classRoom.id);
    return state().documents.filter((document) => !document.classId || classIds.includes(document.classId));
  },
  createDocument(input: Omit<TeachingDocument, "id" | "createdAt" | "status" | "chunkCount">): TeachingDocument {
    const document: TeachingDocument = {
      id: newId("doc"),
      status: "indexed",
      chunkCount: Math.max(24, Math.round(input.sizeBytes / 48_000)),
      createdAt: new Date().toISOString(),
      ...input
    };
    const db = state();
    db.documents.unshift(document);
    schedulePersist(db);
    return document;
  },
  updateDocumentKnowledgeTags(documentId: string, knowledgeTags: string[]): TeachingDocument {
    const db = state();
    const document = db.documents.find((d) => d.id === documentId);
    if (!document) throw new Error("DOCUMENT_NOT_FOUND");
    document.knowledgeTags = knowledgeTags;
    schedulePersist(db);
    return document;
  },
  deleteDocument(documentId: string): void {
    const db = state();
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) throw new Error("DOCUMENT_NOT_FOUND");
    db.documents = db.documents.filter((d) => d.id !== documentId);
    schedulePersist(db);
  },
  deleteClass(classId: string): void {
    const db = state();
    const classRoom = db.classes.find((c) => c.id === classId);
    if (!classRoom) throw new Error("CLASS_NOT_FOUND");
    // Remove related documents, assignments, and quizzes for this class.
    db.documents = db.documents.filter((d) => d.classId !== classId);
    const quizIds = db.quizzes.filter((q) => q.classId === classId).map((q) => q.id);
    db.assignments = db.assignments.filter((a) => a.classId !== classId && !quizIds.includes(a.quizId));
    db.quizzes = db.quizzes.filter((q) => q.classId !== classId);
    db.classes = db.classes.filter((c) => c.id !== classId);
    schedulePersist(db);
  },
  latestIndexedDocument(classId?: string): TeachingDocument | undefined {
    return state().documents.find((document) => document.status === "indexed" && (!classId || document.classId === classId));
  },
  quizzesForUser(user: User): Quiz[] {
    const db = state();
    if (user.role === "admin") return db.quizzes;
    if (user.role === "teacher") return db.quizzes.filter((quiz) => quiz.authorId === user.id);
    const classIds = this.classesForUser(user).map((classRoom) => classRoom.id);
    const assignedQuizIds = db.assignments.filter((assignment) => classIds.includes(assignment.classId)).map((assignment) => assignment.quizId);
    return db.quizzes.filter((quiz) => assignedQuizIds.includes(quiz.id) && quiz.status === "published");
  },
  quizById(quizId: string): Quiz | undefined {
    return state().quizzes.find((quiz) => quiz.id === quizId);
  },
  upsertQuiz(quiz: Quiz): Quiz {
    const db = state();
    const index = db.quizzes.findIndex((item) => item.id === quiz.id);
    if (index >= 0) db.quizzes[index] = quiz;
    else db.quizzes.unshift(quiz);
    schedulePersist(db);
    return quiz;
  },
  createQuiz(input: Omit<Quiz, "id" | "createdAt" | "updatedAt">): Quiz {
    const now = new Date().toISOString();
    const quiz: Quiz = { id: newId("quiz"), createdAt: now, updatedAt: now, ...input };
    const db = state();
    db.quizzes.unshift(quiz);
    schedulePersist(db);
    return quiz;
  },
  updateQuizQuestions(quizId: string, questions: QuizQuestion[], status?: Quiz["status"]): Quiz {
    const quiz = this.quizById(quizId);
    if (!quiz) throw new Error("QUIZ_NOT_FOUND");
    quiz.questions = questions;
    if (status) quiz.status = status;
    quiz.updatedAt = new Date().toISOString();
    schedulePersist(state());
    return quiz;
  },
  publishQuiz(quizId: string, classId: string, dueAt?: string): { quiz: Quiz; assignment: QuizAssignment } {
    const quiz = this.quizById(quizId);
    if (!quiz) throw new Error("QUIZ_NOT_FOUND");
    quiz.status = "published";
    quiz.classId = classId;
    quiz.dueAt = dueAt;
    quiz.updatedAt = new Date().toISOString();
    const assignment: QuizAssignment = {
      id: newId("assignment"),
      quizId,
      classId,
      status: "open",
      dueAt,
      createdAt: new Date().toISOString()
    };
    const db = state();
    db.assignments.unshift(assignment);
    const classRoom = this.classById(classId);
    for (const userId of classRoom?.studentIds || []) {
      this.createNotification({
        userId,
        type: "quiz_assigned",
        title: "Giáo viên đã thêm Quiz mới",
        body: `${quiz.title} - ${quiz.questions.length} câu`,
        actionView: "studentQuiz"
      });
    }
    schedulePersist(db);
    return { quiz, assignment };
  },
  assignmentsForUser(user: User): QuizAssignment[] {
    if (user.role === "admin") return state().assignments;
    const classIds = this.classesForUser(user).map((classRoom) => classRoom.id);
    return state().assignments.filter((assignment) => classIds.includes(assignment.classId));
  },
  submitQuiz(input: { assignmentId: string; studentId: string; answers: Record<string, string> }) {
    const db = state();
    const assignment = db.assignments.find((item) => item.id === input.assignmentId);
    if (!assignment) throw new Error("ASSIGNMENT_NOT_FOUND");
    const quiz = this.quizById(assignment.quizId);
    if (!quiz) throw new Error("QUIZ_NOT_FOUND");
    const correct = quiz.questions.filter((question) => {
      const selected = input.answers[question.id];
      return question.options.find((option) => option.id === selected)?.isCorrect;
    }).length;
    const score = quiz.questions.length ? Math.round((correct / quiz.questions.length) * 100) / 10 : 0;
    const submission = {
      id: newId("submission"),
      assignmentId: input.assignmentId,
      studentId: input.studentId,
      answers: input.answers,
      score,
      submittedAt: new Date().toISOString()
    };
    db.submissions.push(submission);
    // Mark the quiz_assigned notification as read so the student no longer sees
    // "Bạn có một Quiz mới" for a quiz they already submitted.
    const pendingNotif = db.notifications.find(
      (item) => item.userId === input.studentId && item.type === "quiz_assigned" && !item.readAt
    );
    if (pendingNotif) pendingNotif.readAt = new Date().toISOString();
    schedulePersist(db);
    return submission;
  },
  submissionsForAssignment(assignmentId: string): Submission[] {
    return state().submissions.filter((submission) => submission.assignmentId === assignmentId);
  },
  submissionsForUser(userId: string): Submission[] {
    return state().submissions.filter((submission) => submission.studentId === userId);
  },
  notificationsForUser(userId: string): NotificationItem[] {
    return state().notifications.filter((notification) => notification.userId === userId);
  },
  markNotificationRead(userId: string, notificationId: string): NotificationItem | undefined {
    const db = state();
    const notification = db.notifications.find(
      (item) => item.id === notificationId && item.userId === userId
    );
    if (!notification) return undefined;
    if (!notification.readAt) notification.readAt = new Date().toISOString();
    schedulePersist(db);
    return notification;
  },
  createNotification(input: Omit<NotificationItem, "id" | "createdAt">): NotificationItem {
    const notification: NotificationItem = {
      id: newId("notif"),
      createdAt: new Date().toISOString(),
      ...input
    };
    const db = state();
    db.notifications.unshift(notification);
    schedulePersist(db);
    return notification;
  },
  saveFlashcards(input: { ownerId: string; classId?: string; title: string; cards: Flashcard[] }) {
    const record = { id: newId("flashcards"), createdAt: new Date().toISOString(), broadcasted: false, ...input };
    const db = state();
    db.flashcards.unshift(record);
    schedulePersist(db);
    return record;
  },
  flashcardSetsForClass(classId: string): FlashcardSet[] {
    return state().flashcards.filter((set) => set.classId === classId);
  },
  flashcardAssignmentsForSet(setId: string): FlashcardAssignment[] {
    return state().flashcardAssignments.filter((assignment) => assignment.flashcardSetId === setId);
  },
  flashcardSetsForUser(user: User): FlashcardSet[] {
    const db = state();
    if (user.role === "admin") return db.flashcards;
    if (user.role === "teacher") return db.flashcards.filter((set) => set.ownerId === user.id);
    const classIds = this.classesForUser(user).map((classRoom) => classRoom.id);
    const assignedSetIds = db.flashcardAssignments
      .filter((assignment) => classIds.includes(assignment.classId))
      .map((assignment) => assignment.flashcardSetId);
    // A student sees sets broadcast to their classes plus any set they created
    // themselves (the Workspace "Tạo Flashcard" tool saves student-owned sets).
    return db.flashcards.filter((set) => assignedSetIds.includes(set.id) || set.ownerId === user.id);
  },
  updateFlashcardSet(setId: string, patch: { title?: string; cards?: Flashcard[] }): FlashcardSet {
    const db = state();
    const set = db.flashcards.find((item) => item.id === setId);
    if (!set) throw new Error("FLASHCARD_SET_NOT_FOUND");
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.cards !== undefined) set.cards = patch.cards;
    schedulePersist(db);
    return set;
  },
  deleteFlashcardSet(setId: string): void {
    const db = state();
    db.flashcards = db.flashcards.filter((set) => set.id !== setId);
    db.flashcardAssignments = db.flashcardAssignments.filter(
      (assignment) => assignment.flashcardSetId !== setId
    );
    schedulePersist(db);
  },
  broadcastFlashcards(setId: string, classId: string): FlashcardSet {
    const db = state();
    const set = db.flashcards.find((item) => item.id === setId);
    if (!set) throw new Error("FLASHCARD_SET_NOT_FOUND");
    set.classId = classId;
    set.broadcasted = true;
    const assignment: FlashcardAssignment = {
      id: newId("flashcard-assignment"),
      flashcardSetId: setId,
      classId,
      status: "open",
      createdAt: new Date().toISOString()
    };
    db.flashcardAssignments.unshift(assignment);
    const classRoom = this.classById(classId);
    for (const userId of classRoom?.studentIds || []) {
      this.createNotification({
        userId,
        type: "flashcard_assigned",
        title: "Flashcard mới từ Giáo viên",
        body: `${set.title} - ${set.cards.length} thẻ`,
        actionView: "studentDashboard"
      });
    }
    schedulePersist(db);
    return set;
  },
  saveSummary(input: { ownerId: string; classId?: string; result: SummaryResult }) {
    const record = { id: newId("summary"), createdAt: new Date().toISOString(), ...input };
    const db = state();
    db.summaries.unshift(record);
    schedulePersist(db);
    return record;
  }
};

export { newId };
