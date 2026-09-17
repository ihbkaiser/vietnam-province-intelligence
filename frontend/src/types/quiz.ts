export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export interface QuizGeneratedBy {
  source?: string;
  teacherModel?: string;
  studentModel?: string;
  pipeline?: string;
}

export interface QuizSourceMetadata {
  lessonId?: string;
  lessonNumber?: number;
  lessonTitle?: string;
  subject?: string;
  subjectLabel?: string;
  pageNumber?: number;
  sourceChunkId?: string;
  evidence?: string;
  bloomLevel?: string;
  studentConfidence?: number;
  studentReason?: string;
  generatedBy?: QuizGeneratedBy;
}

export interface QuizQuestion extends QuizSourceMetadata {
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  category: string;
  difficulty: QuizDifficulty;
  explanation: string;
  createdAt: string;
}

export interface PublicQuizQuestion extends Omit<QuizSourceMetadata, 'evidence' | 'studentConfidence' | 'studentReason' | 'generatedBy'> {
  id: string;
  prompt: string;
  options: string[];
  category: string;
  difficulty: QuizDifficulty;
}

export interface CreateQuizQuestionInput {
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  category: string;
  difficulty: QuizDifficulty;
  explanation?: string;
}

export interface QuizResultItem {
  questionId: string;
  selectedOptionIndex: number | null;
  correctOptionIndex: number;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  evidence?: string;
  pageNumber?: number;
  lessonTitle?: string;
  sourceChunkId?: string;
}

export interface QuizSubmissionResult {
  score: number;
  total: number;
  percentage: number;
  results: QuizResultItem[];
}

export interface QuizLessonSummary {
  lessonId: string;
  lessonTitle: string;
  subject: string;
  subjectLabel: string;
  lessonNumber?: number;
  startPage?: number;
  questionCount: number;
}

export interface QuizStats {
  totalQuestions: number;
  bySubject: Record<string, number>;
  byDifficulty: Record<string, number>;
  byAnswer?: Record<string, number>;
  lessons: QuizLessonSummary[];
  generatedAt?: string;
  source?: string;
}

