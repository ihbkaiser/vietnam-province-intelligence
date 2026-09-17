export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  category: string;
  difficulty: QuizDifficulty;
  explanation: string;
  createdAt: string;
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
  generatedBy?: {
    source?: string;
    teacherModel?: string;
    studentModel?: string;
    pipeline?: string;
  };
}

export interface PublicQuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  category: string;
  difficulty: QuizDifficulty;
  lessonId?: string;
  lessonNumber?: number;
  lessonTitle?: string;
  subject?: string;
  subjectLabel?: string;
  pageNumber?: number;
  sourceChunkId?: string;
  bloomLevel?: string;
}

export interface CreateQuizQuestionInput {
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  category: string;
  difficulty: QuizDifficulty;
  explanation?: string;
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

