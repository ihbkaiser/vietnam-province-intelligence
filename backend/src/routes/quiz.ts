import { Router } from 'express';
import { createQuestion, deleteQuestion, getQuestionBankStats, listLessons, listQuestions, validateQuestionInput } from '../services/questionBank.service.js';
import type { QuizDifficulty } from '../types/quiz.js';

export const quizRouter = Router();

quizRouter.get('/questions', (_request, response) => {
  const questions = listQuestions();
  const categories = [...new Set(questions.map((question) => question.category))].sort((a, b) => a.localeCompare(b, 'vi'));
  response.json({ questions, count: questions.length, categories, lessons: listLessons(), stats: getQuestionBankStats() });
});

quizRouter.get('/questions/stats', (_request, response) => {
  response.json(getQuestionBankStats());
});

quizRouter.post('/questions', (request, response) => {
  const validation = validateQuestionInput(request.body);
  if (!validation.valid) {
    response.status(400).json({ message: validation.message });
    return;
  }

  const question = createQuestion(validation.value);
  response.status(201).json(question);
});

quizRouter.delete('/questions/:questionId', (request, response) => {
  if (!deleteQuestion(request.params.questionId)) {
    response.status(404).json({ message: 'Không tìm thấy câu hỏi.' });
    return;
  }
  response.status(204).send();
});

quizRouter.get('/quiz', (request, response) => {
  const requestedCount = Number.parseInt(String(request.query.count ?? '5'), 10);
  const count = Number.isFinite(requestedCount) ? Math.min(Math.max(requestedCount, 1), 40) : 5;
  const category = typeof request.query.category === 'string' ? request.query.category.trim() : '';
  const subject = typeof request.query.subject === 'string' ? request.query.subject.trim() : '';
  const lessonId = typeof request.query.lessonId === 'string' ? request.query.lessonId.trim() : '';
  const difficulty = typeof request.query.difficulty === 'string' ? request.query.difficulty.trim() : '';
  const seed = typeof request.query.seed === 'string' && request.query.seed.trim()
    ? request.query.seed.trim()
    : Math.random().toString(36).slice(2, 8).toUpperCase();

  let questions = listQuestions();
  if (category) questions = questions.filter((question) => question.category === category);
  if (subject) questions = questions.filter((question) => question.subject === subject || question.subjectLabel === subject);
  if (lessonId) questions = questions.filter((question) => question.lessonId === lessonId);
  if (difficulty) questions = questions.filter((question) => question.difficulty === difficulty as QuizDifficulty);

  let randomState = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) || 1;
  const seededRandom = () => {
    randomState = (randomState * 1664525 + 1013904223) % 4294967296;
    return randomState / 4294967296;
  };

  for (let index = questions.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(seededRandom() * (index + 1));
    [questions[index], questions[randomIndex]] = [questions[randomIndex], questions[index]];
  }

  const selected = questions.slice(0, count).map((question) => ({
    id: question.id,
    prompt: question.prompt,
    options: question.options,
    category: question.category,
    difficulty: question.difficulty,
    lessonId: question.lessonId,
    lessonNumber: question.lessonNumber,
    lessonTitle: question.lessonTitle,
    subject: question.subject,
    subjectLabel: question.subjectLabel,
    pageNumber: question.pageNumber,
    sourceChunkId: question.sourceChunkId,
    bloomLevel: question.bloomLevel
  }));
  response.json({ questions: selected, count: selected.length, examCode: seed });
});

quizRouter.post('/quiz/submit', (request, response) => {
  const rawAnswers = (request.body as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(rawAnswers) || rawAnswers.length === 0 || rawAnswers.length > 40) {
    response.status(400).json({ message: 'Danh sách câu trả lời không hợp lệ.' });
    return;
  }

  const questionById = new Map(listQuestions().map((question) => [question.id, question]));
  const seenQuestionIds = new Set<string>();
  const results = [];

  for (const rawAnswer of rawAnswers) {
    if (!rawAnswer || typeof rawAnswer !== 'object') {
      response.status(400).json({ message: 'Câu trả lời không hợp lệ.' });
      return;
    }
    const answer = rawAnswer as { questionId?: unknown; selectedOptionIndex?: unknown };
    const questionId = typeof answer.questionId === 'string' ? answer.questionId : '';
    const selectedOptionIndex = answer.selectedOptionIndex === null
      ? null
      : typeof answer.selectedOptionIndex === 'number'
        ? answer.selectedOptionIndex
        : Number.NaN;
    const question = questionById.get(questionId);

    if (!question || seenQuestionIds.has(questionId)) {
      response.status(400).json({ message: 'Câu hỏi không tồn tại hoặc bị lặp lại.' });
      return;
    }
    if (selectedOptionIndex !== null && (!Number.isInteger(selectedOptionIndex) || Number(selectedOptionIndex) < 0 || Number(selectedOptionIndex) >= question.options.length)) {
      response.status(400).json({ message: 'Lựa chọn trả lời không hợp lệ.' });
      return;
    }

    seenQuestionIds.add(questionId);
    results.push({
      questionId,
      selectedOptionIndex: selectedOptionIndex === null ? null : Number(selectedOptionIndex),
      correctOptionIndex: question.correctOptionIndex,
      correctAnswer: question.options[question.correctOptionIndex],
      isCorrect: selectedOptionIndex === question.correctOptionIndex,
      explanation: question.explanation,
      evidence: question.evidence,
      pageNumber: question.pageNumber,
      lessonTitle: question.lessonTitle,
      sourceChunkId: question.sourceChunkId
    });
  }

  const score = results.filter((result) => result.isCorrect).length;
  response.json({ score, total: results.length, percentage: Math.round((score / results.length) * 100), results });
});
