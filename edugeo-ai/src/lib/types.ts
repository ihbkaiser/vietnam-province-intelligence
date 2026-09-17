export type Role = "admin" | "teacher" | "student";
export type Subject = "history" | "geography" | "mixed";
export type ViewId =
  | "dashboard"
  | "classes"
  | "workspace"
  | "quiz"
  | "admin"
  | "studentDashboard"
  | "studentQuiz"
  | "studentFlashcards"
  | "vietgeo";

export type QuizStatus = "draft" | "reviewing" | "approved" | "published" | "archived";
export type DocumentStatus = "uploaded" | "processing" | "indexed" | "failed";

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  email?: string;
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface TeacherAccountInput {
  displayName: string;
  username: string;
  password: string;
  email?: string;
}

export interface ClassRoom {
  id: string;
  name: string;
  subject: Subject;
  subjectLabel: string;
  grade: number;
  academicYear: string;
  teacherId: string;
  knowledgeScopes: string[];
  studentIds: string[];
  progress: number;
}

export interface StudentProfile extends User {
  latestScore?: string;
  quizStatus?: "Đã làm" | "Chưa làm";
}

export interface TeachingDocument {
  id: string;
  classId?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  chunkCount: number;
  knowledgeTags: string[];
  uploadedById: string;
  createdAt: string;
  fileUrl?: string;
  storagePath?: string;
}

export interface LessonRecord {
  lesson_id: string;
  lesson_title: string;
  subject: string;
  subject_label: string;
  lesson_number: number | null;
  start_page?: number;
  end_page?: number;
  chunk_count: number;
  class_level?: number;
}

export interface QuizOption {
  id: string;
  label: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  explanation?: string;
  sourceMarkers?: string[];
  imageRefs?: Array<{ url: string; caption: string }>;
}

export interface Quiz {
  id: string;
  title: string;
  subject: Subject;
  classId?: string;
  documentId?: string;
  knowledgeScope?: string;
  lessonId?: string;
  status: QuizStatus;
  authorId: string;
  questions: QuizQuestion[];
  durationMinutes: number;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuizAssignment {
  id: string;
  quizId: string;
  classId: string;
  status: "open" | "closed";
  dueAt?: string;
  createdAt: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  answers: Record<string, string>;
  score: number;
  submittedAt: string;
}

export interface FlashcardSet {
  id: string;
  ownerId: string;
  classId?: string;
  title: string;
  cards: Flashcard[];
  createdAt: string;
  /** True once the set has been broadcast (giao) to a class. classId alone is not
   *  enough — sets are also created with a classId. Use this flag to decide whether
   *  the "Giao lớp" action is still available. */
  broadcasted?: boolean;
}

export interface FlashcardAssignment {
  id: string;
  flashcardSetId: string;
  classId: string;
  status: "open" | "closed";
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: "quiz_assigned" | "quiz_submitted" | "document_indexed" | "ai_job_done" | "flashcard_assigned";
  title: string;
  body: string;
  actionView?: ViewId;
  readAt?: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "ai" | "user";
  content: string;
  provider?: string;
  model?: string | null;
  citations?: Array<{
    source_index: number;
    source_marker: string;
    filename: string;
    page: number;
    section?: string | null;
    chunk_id?: string | null;
    lesson_title?: string | null;
  }>;
  sources?: NotebookSource[];
}

export interface NotebookSourceImage {
  id?: string | null;
  path?: string | null;
  label?: string | null;
  caption?: string | null;
  page_number?: number | null;
  page?: number | null;
  url?: string | null;
  width?: number | null;
  height?: number | null;
  derivedCaption?: string | null;
}

export interface NotebookSource {
  text?: string;
  snippet?: string;
  score?: number;
  metadata?: {
    filename?: string;
    page?: number;
    chunk_id?: string;
    section?: string | null;
    class_level?: number;
    subject?: string;
    subject_label?: string;
    lesson_id?: string | null;
    lesson_title?: string | null;
    lesson_number?: number | null;
  };
  images?: NotebookSourceImage[];
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  hint?: string;
  imageRefs?: Array<{ url: string; caption: string }>;
}

export interface SummaryResult {
  id: string;
  title: string;
  markdown: string;
  keyPoints: string[];
  imageRefs?: Array<{ url: string; caption: string }>;
}

export interface AppSnapshot {
  users: User[];
  classes: ClassRoom[];
  documents: TeachingDocument[];
  quizzes: Quiz[];
  assignments: QuizAssignment[];
  notifications: NotificationItem[];
}
