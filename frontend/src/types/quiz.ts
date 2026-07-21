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
}

export interface PublicQuizQuestion {
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
}

export interface QuizSubmissionResult {
  score: number;
  total: number;
  percentage: number;
  results: QuizResultItem[];
}

