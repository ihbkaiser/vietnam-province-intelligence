import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import type { CreateQuizQuestionInput, QuizDifficulty, QuizQuestion, QuizStats } from '../types/quiz.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultQuestionBankPath = path.resolve(currentDirectory, '../data/questionBank.json');
const defaultStudyQuestionBankPath = path.resolve(currentDirectory, '../data/studyQuestionBank.json');
const defaultStudyQuestionBankMetaPath = path.resolve(currentDirectory, '../data/studyQuestionBank.meta.json');
const questionBankPath = process.env.QUESTION_BANK_PATH
  ? path.resolve(process.env.QUESTION_BANK_PATH)
  : fs.existsSync(defaultStudyQuestionBankPath)
    ? defaultStudyQuestionBankPath
    : defaultQuestionBankPath;
const questionBankMetaPath = process.env.QUESTION_BANK_META_PATH
  ? path.resolve(process.env.QUESTION_BANK_META_PATH)
  : defaultStudyQuestionBankMetaPath;

const difficulties: QuizDifficulty[] = ['easy', 'medium', 'hard'];

function readQuestionBank(): QuizQuestion[] {
  try {
    const content = fs.readFileSync(questionBankPath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? (parsed as QuizQuestion[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function writeQuestionBank(questions: QuizQuestion[]) {
  fs.mkdirSync(path.dirname(questionBankPath), { recursive: true });
  fs.writeFileSync(questionBankPath, `${JSON.stringify(questions, null, 2)}\n`, 'utf8');
}

function readQuestionBankMetadata(): Partial<QuizStats> {
  try {
    const content = fs.readFileSync(questionBankMetaPath, 'utf8');
    return JSON.parse(content) as Partial<QuizStats>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function validateQuestionInput(body: unknown):
  | { valid: true; value: CreateQuizQuestionInput }
  | { valid: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, message: 'Dữ liệu câu hỏi không hợp lệ.' };
  }

  const input = body as Record<string, unknown>;
  const prompt = cleanText(input.prompt);
  const category = cleanText(input.category);
  const explanation = cleanText(input.explanation);
  const options = Array.isArray(input.options) ? input.options.map(cleanText) : [];
  const correctOptionIndex = typeof input.correctOptionIndex === 'number' ? input.correctOptionIndex : Number.NaN;
  const difficulty = input.difficulty;

  if (prompt.length < 5 || prompt.length > 500) {
    return { valid: false, message: 'Nội dung câu hỏi phải có từ 5 đến 500 ký tự.' };
  }
  if (options.length < 2 || options.length > 6 || options.some((option) => !option || option.length > 200)) {
    return { valid: false, message: 'Câu hỏi cần từ 2 đến 6 lựa chọn hợp lệ.' };
  }
  const normalizedOptions = options.map((option) => option.toLocaleLowerCase('vi'));
  if (new Set(normalizedOptions).size !== options.length) {
    return { valid: false, message: 'Các lựa chọn trả lời không được trùng nhau.' };
  }
  if (!Number.isInteger(correctOptionIndex) || Number(correctOptionIndex) < 0 || Number(correctOptionIndex) >= options.length) {
    return { valid: false, message: 'Vui lòng chọn một đáp án đúng.' };
  }
  if (category.length < 2 || category.length > 60) {
    return { valid: false, message: 'Chủ đề phải có từ 2 đến 60 ký tự.' };
  }
  if (!difficulties.includes(difficulty as QuizDifficulty)) {
    return { valid: false, message: 'Mức độ câu hỏi không hợp lệ.' };
  }
  if (explanation.length > 1000) {
    return { valid: false, message: 'Giải thích không được dài quá 1.000 ký tự.' };
  }

  return {
    valid: true,
    value: {
      prompt,
      options,
      correctOptionIndex: Number(correctOptionIndex),
      category,
      difficulty: difficulty as QuizDifficulty,
      explanation
    }
  };
}

export function listQuestions() {
  return readQuestionBank().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listLessons() {
  const questions = readQuestionBank();
  const lessonById = new Map<string, {
    lessonId: string;
    lessonTitle: string;
    subject: string;
    subjectLabel: string;
    lessonNumber?: number;
    questionCount: number;
  }>();

  for (const question of questions) {
    if (!question.lessonId || !question.lessonTitle) continue;
    const current = lessonById.get(question.lessonId) ?? {
      lessonId: question.lessonId,
      lessonTitle: question.lessonTitle,
      subject: question.subject ?? question.category,
      subjectLabel: question.subjectLabel ?? question.category,
      lessonNumber: question.lessonNumber,
      questionCount: 0
    };
    current.questionCount += 1;
    lessonById.set(question.lessonId, current);
  }

  return [...lessonById.values()].sort((a, b) => {
    const subjectCompare = a.subject.localeCompare(b.subject, 'vi');
    if (subjectCompare !== 0) return subjectCompare;
    return (a.lessonNumber ?? 999) - (b.lessonNumber ?? 999);
  });
}

export function getQuestionBankStats(): QuizStats {
  const questions = readQuestionBank();
  const metadata = readQuestionBankMetadata();
  const bySubject: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  const byAnswer: Record<string, number> = {};

  for (const question of questions) {
    const subject = question.subjectLabel ?? question.category;
    bySubject[subject] = (bySubject[subject] ?? 0) + 1;
    byDifficulty[question.difficulty] = (byDifficulty[question.difficulty] ?? 0) + 1;
    const answerKey = String.fromCharCode(65 + question.correctOptionIndex);
    byAnswer[answerKey] = (byAnswer[answerKey] ?? 0) + 1;
  }

  return {
    totalQuestions: questions.length,
    bySubject,
    byDifficulty,
    byAnswer,
    lessons: metadata.lessons?.length ? metadata.lessons : listLessons(),
    generatedAt: metadata.generatedAt,
    source: metadata.source
  };
}

export function createQuestion(input: CreateQuizQuestionInput) {
  const questions = readQuestionBank();
  const question: QuizQuestion = {
    ...input,
    explanation: input.explanation ?? '',
    id: randomUUID(),
    createdAt: new Date().toISOString()
  };
  questions.push(question);
  writeQuestionBank(questions);
  return question;
}

export function deleteQuestion(id: string) {
  const questions = readQuestionBank();
  const nextQuestions = questions.filter((question) => question.id !== id);
  if (nextQuestions.length === questions.length) return false;
  writeQuestionBank(nextQuestions);
  return true;
}
