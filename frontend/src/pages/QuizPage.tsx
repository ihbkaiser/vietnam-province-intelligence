import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  PublicQuizQuestion,
  QuizDifficulty,
  QuizLessonSummary,
  QuizQuestion,
  QuizStats,
  QuizSubmissionResult
} from '../types/quiz';
import {
  fetchQuestionBank,
  generateQuiz,
  submitQuiz
} from '../utils/api';

type PageTab = 'practice' | 'bank';

const DIFFICULTY_LABELS: Record<QuizDifficulty, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó'
};

const DIFFICULTY_STYLES: Record<QuizDifficulty, string> = {
  easy: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  hard: 'border-rose-200 bg-rose-50 text-rose-700'
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function DifficultyBadge({ difficulty }: { difficulty: QuizDifficulty }) {
  return (
    <span className={classNames('rounded-full border px-2.5 py-1 text-xs font-semibold', DIFFICULTY_STYLES[difficulty])}>
      {DIFFICULTY_LABELS[difficulty]}
    </span>
  );
}

function formatLesson(lesson: Pick<QuizLessonSummary, 'lessonNumber' | 'lessonTitle'>) {
  return lesson.lessonNumber ? `Bài ${lesson.lessonNumber}. ${lesson.lessonTitle}` : lesson.lessonTitle;
}

function getQuestionSource(question: Pick<QuizQuestion | PublicQuizQuestion, 'subjectLabel' | 'lessonTitle' | 'lessonNumber' | 'pageNumber'>) {
  const parts = [
    question.subjectLabel,
    question.lessonTitle ? formatLesson({ lessonNumber: question.lessonNumber, lessonTitle: question.lessonTitle }) : undefined,
    question.pageNumber ? `tr. ${question.pageNumber}` : undefined
  ].filter(Boolean);
  return parts.join(' · ');
}

function getSubjects(questions: QuizQuestion[], stats: QuizStats | null) {
  const fromStats = Object.keys(stats?.bySubject ?? {});
  if (fromStats.length) return fromStats.sort((a, b) => a.localeCompare(b, 'vi'));
  return [...new Set(questions.map((question) => question.subjectLabel ?? question.category))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'vi'));
}

function matchesFilters(question: QuizQuestion, filters: {
  subject?: string;
  lessonId?: string;
  difficulty?: QuizDifficulty | '';
  query?: string;
}) {
  if (filters.subject && question.subjectLabel !== filters.subject && question.subject !== filters.subject) return false;
  if (filters.lessonId && question.lessonId !== filters.lessonId) return false;
  if (filters.difficulty && question.difficulty !== filters.difficulty) return false;
  if (filters.query) {
    const haystack = [
      question.prompt,
      question.lessonTitle,
      question.subjectLabel,
      question.evidence,
      question.explanation
    ].join(' ').toLocaleLowerCase('vi');
    return haystack.includes(filters.query.toLocaleLowerCase('vi'));
  }
  return true;
}

function StatStrip({ stats, lessonCount }: { stats: QuizStats | null; lessonCount: number }) {
  const bySubject = stats?.bySubject ?? {};
  const byDifficulty = stats?.byDifficulty ?? {};

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">Câu hỏi</p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink">{stats?.totalQuestions ?? 0}</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">Bài học</p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink">{lessonCount}</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">Môn học</p>
        <p className="mt-1 text-sm font-semibold leading-7 text-ink">
          {Object.entries(bySubject).map(([subject, count]) => `${subject}: ${count}`).join(' · ') || 'Chưa có dữ liệu'}
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">Độ khó</p>
        <p className="mt-1 text-sm font-semibold leading-7 text-ink">
          {(['easy', 'medium', 'hard'] as QuizDifficulty[])
            .map((difficulty) => `${DIFFICULTY_LABELS[difficulty]}: ${byDifficulty[difficulty] ?? 0}`)
            .join(' · ')}
        </p>
      </div>
    </div>
  );
}

function PracticePanel({
  questions,
  lessons,
  stats
}: {
  questions: QuizQuestion[];
  lessons: QuizLessonSummary[];
  stats: QuizStats | null;
}) {
  const [subject, setSubject] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [difficulty, setDifficulty] = useState<QuizDifficulty | ''>('');
  const [count, setCount] = useState(10);
  const [examCode, setExamCode] = useState('');
  const [quizQuestions, setQuizQuestions] = useState<PublicQuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizSubmissionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjects = useMemo(() => getSubjects(questions, stats), [questions, stats]);
  const lessonOptions = useMemo(() => {
    return lessons.filter((lesson) => !subject || lesson.subjectLabel === subject || lesson.subject === subject);
  }, [lessons, subject]);
  const availableCount = useMemo(() => {
    return questions.filter((question) => matchesFilters(question, { subject, lessonId, difficulty })).length;
  }, [difficulty, lessonId, questions, subject]);
  const maxQuestionCount = Math.min(40, Math.max(availableCount, 1));

  useEffect(() => {
    if (lessonId && !lessonOptions.some((lesson) => lesson.lessonId === lessonId)) {
      setLessonId('');
    }
  }, [lessonId, lessonOptions]);

  useEffect(() => {
    setCount((current) => Math.min(Math.max(current, 1), maxQuestionCount));
  }, [maxQuestionCount]);

  const startQuiz = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateQuiz({
        count: Math.min(count, maxQuestionCount),
        subject: subject || undefined,
        lessonId: lessonId || undefined,
        difficulty: difficulty || undefined,
        seed: examCode.trim() || undefined
      });
      if (!data.questions.length) {
        setError('Không có câu hỏi phù hợp với bộ lọc hiện tại.');
        return;
      }
      setQuizQuestions(data.questions);
      setExamCode(data.examCode);
      setCurrentIndex(0);
      setAnswers({});
      setResult(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tạo đề ôn tập.');
    } finally {
      setLoading(false);
    }
  };

  const finishQuiz = async () => {
    setLoading(true);
    setError(null);
    try {
      const submission = await submitQuiz(quizQuestions.map((question) => ({
        questionId: question.id,
        selectedOptionIndex: answers[question.id] ?? null
      })));
      setResult(submission);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể chấm bài.');
    } finally {
      setLoading(false);
    }
  };

  const resetQuiz = () => {
    setQuizQuestions([]);
    setAnswers({});
    setResult(null);
    setError(null);
    setCurrentIndex(0);
  };

  if (result) {
    const resultByQuestionId = new Map(result.results.map((item) => [item.questionId, item]));
    const tone = result.percentage >= 80 ? 'text-emerald-600' : result.percentage >= 50 ? 'text-amber-600' : 'text-rose-600';

    return (
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tide">Mã đề {examCode}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Kết quả: {result.score}/{result.total} câu đúng</h2>
              <p className={classNames('mt-1 text-sm font-semibold', tone)}>{result.percentage}%</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void startQuiz()} className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-tide">
                Làm đề mới
              </button>
              <button type="button" onClick={resetQuiz} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-tide/30 hover:bg-mist">
                Đổi bộ lọc
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
          <h2 className="font-display text-xl font-semibold text-ink">Đáp án và dẫn chứng</h2>
          <div className="mt-5 divide-y divide-slate-100">
            {quizQuestions.map((question, index) => {
              const item = resultByQuestionId.get(question.id);
              if (!item) return null;
              const selectedLetter = item.selectedOptionIndex === null ? 'Bỏ trống' : OPTION_LETTERS[item.selectedOptionIndex];
              const correctLetter = OPTION_LETTERS[item.correctOptionIndex];

              return (
                <article key={question.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <span className={classNames(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                      item.isCorrect ? 'bg-emerald-600' : 'bg-rose-500'
                    )}>
                      {item.isCorrect ? '✓' : '×'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-ink/45">Câu {index + 1}</span>
                        <DifficultyBadge difficulty={question.difficulty} />
                        {question.bloomLevel && <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-ink/55">{question.bloomLevel}</span>}
                      </div>
                      <h3 className="mt-2 text-sm font-semibold leading-6 text-ink">{question.prompt}</h3>
                      <p className="mt-2 text-sm text-ink/65">
                        Bạn chọn: <strong>{selectedLetter}</strong> · Đáp án đúng: <strong>{correctLetter}. {item.correctAnswer}</strong>
                      </p>
                      {item.explanation && <p className="mt-2 text-sm leading-6 text-ink/68">{item.explanation}</p>}
                      {(item.evidence || item.pageNumber || item.lessonTitle) && (
                        <p className="mt-2 rounded-lg border border-slate-200 bg-sand px-3 py-2 text-xs leading-5 text-ink/58">
                          {item.lessonTitle && <span className="font-semibold text-ink">{item.lessonTitle}. </span>}
                          {item.evidence}
                          {item.pageNumber && <span className="font-semibold text-ink"> Trang {item.pageNumber}</span>}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  if (quizQuestions.length > 0) {
    const currentQuestion = quizQuestions[currentIndex];
    const selectedAnswer = answers[currentQuestion.id];
    const isLastQuestion = currentIndex === quizQuestions.length - 1;

    return (
      <section className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tide">Mã đề {examCode}</p>
              <p className="mt-1 text-sm font-semibold text-ink">Câu {currentIndex + 1} / {quizQuestions.length}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {currentQuestion.lessonTitle && <span className="rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-tide">{formatLesson({ lessonNumber: currentQuestion.lessonNumber, lessonTitle: currentQuestion.lessonTitle })}</span>}
              <DifficultyBadge difficulty={currentQuestion.difficulty} />
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-tide transition-all" style={{ width: `${((currentIndex + 1) / quizQuestions.length) * 100}%` }} />
          </div>
        </div>

        <div className="p-5 sm:p-7">
          {getQuestionSource(currentQuestion) && <p className="text-xs font-semibold text-ink/45">{getQuestionSource(currentQuestion)}</p>}
          <h2 className="mt-2 font-display text-xl font-semibold leading-8 text-ink sm:text-2xl">{currentQuestion.prompt}</h2>
          <div className="mt-6 grid gap-3">
            {currentQuestion.options.map((option, optionIndex) => {
              const selected = selectedAnswer === optionIndex;
              return (
                <button
                  key={optionIndex}
                  type="button"
                  onClick={() => setAnswers((current) => ({ ...current, [currentQuestion.id]: optionIndex }))}
                  className={classNames(
                    'grid w-full grid-cols-[2rem_1fr] items-center gap-3 rounded-lg border p-3.5 text-left text-sm transition',
                    selected
                      ? 'border-tide bg-mist text-ink shadow-sm'
                      : 'border-slate-200 bg-white text-ink/72 hover:border-tide/35 hover:bg-sand'
                  )}
                  aria-pressed={selected}
                >
                  <span className={classNames(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold',
                    selected ? 'bg-tide text-white' : 'bg-sand text-ink/45'
                  )}>
                    {OPTION_LETTERS[optionIndex]}
                  </span>
                  <span className="font-medium leading-6">{option}</span>
                </button>
              );
            })}
          </div>

          {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <div className="mt-7 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((current) => current - 1)}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-sand disabled:invisible"
            >
              Câu trước
            </button>
            <button
              type="button"
              disabled={selectedAnswer === undefined || loading}
              onClick={() => isLastQuestion ? void finishQuiz() : setCurrentIndex((current) => current + 1)}
              className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-tide disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loading ? 'Đang chấm...' : isLastQuestion ? 'Nộp bài' : 'Câu tiếp'}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tide">Lớp 6 · Lịch sử và Địa lí</p>
          <h2 className="mt-2 font-display text-3xl font-semibold leading-tight text-ink">Tạo đề ôn tập từ ngân hàng câu hỏi SGK</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink/62">
            Bộ hiện tại có {stats?.totalQuestions ?? questions.length} câu hỏi đã sinh và lọc tự động từ dữ liệu trích xuất.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-ink">Môn học</span>
              <select value={subject} onChange={(event) => setSubject(event.target.value)} className="app-input mt-1.5 w-full rounded-lg px-3.5 py-2.5 text-sm">
                <option value="">Tất cả</option>
                {subjects.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-semibold text-ink">Bài học</span>
              <select value={lessonId} onChange={(event) => setLessonId(event.target.value)} className="app-input mt-1.5 w-full rounded-lg px-3.5 py-2.5 text-sm">
                <option value="">Tất cả bài học</option>
                {lessonOptions.map((lesson) => (
                  <option key={lesson.lessonId} value={lesson.lessonId}>
                    {formatLesson(lesson)} ({lesson.questionCount})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-ink">Độ khó</span>
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as QuizDifficulty | '')} className="app-input mt-1.5 w-full rounded-lg px-3.5 py-2.5 text-sm">
                <option value="">Tất cả</option>
                {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="flex items-center justify-between text-sm font-semibold text-ink">
                <span>Số câu</span>
                <strong className="text-tide">{count}</strong>
              </span>
              <input
                type="range"
                min={1}
                max={maxQuestionCount}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="mt-4 w-full accent-teal-700"
                disabled={!availableCount}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink">Mã đề</span>
              <input
                value={examCode}
                onChange={(event) => setExamCode(event.target.value.toUpperCase())}
                className="app-input mt-1.5 w-full rounded-lg px-3.5 py-2.5 text-sm"
                placeholder="Tự sinh nếu bỏ trống"
                maxLength={24}
              />
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={loading || !availableCount}
              onClick={() => void startQuiz()}
              className="inline-flex items-center justify-center rounded-lg bg-coral px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Đang tạo đề...' : 'Bắt đầu làm bài'}
            </button>
            <span className="text-sm text-ink/55">{availableCount} câu phù hợp bộ lọc</span>
          </div>
          {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>

        <div className="rounded-lg border border-slate-200 bg-sand p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Phân bố nhanh</p>
          <div className="mt-4 space-y-3">
            {subjects.map((item) => {
              const value = stats?.bySubject[item] ?? questions.filter((question) => question.subjectLabel === item).length;
              const total = stats?.totalQuestions || questions.length || 1;
              return (
                <div key={item}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-ink">{item}</span>
                    <span className="text-ink/55">{value}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-tide" style={{ width: `${Math.max(4, (value / total) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function QuestionBank({
  questions,
  lessons,
  stats,
  loading,
  error
}: {
  questions: QuizQuestion[];
  lessons: QuizLessonSummary[];
  stats: QuizStats | null;
  loading: boolean;
  error: string | null;
}) {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [difficulty, setDifficulty] = useState<QuizDifficulty | ''>('');

  const subjects = useMemo(() => getSubjects(questions, stats), [questions, stats]);
  const lessonOptions = useMemo(() => lessons.filter((lesson) => !subject || lesson.subjectLabel === subject || lesson.subject === subject), [lessons, subject]);
  const filteredQuestions = useMemo(() => {
    const normalizedQuery = query.trim();
    return questions.filter((question) => matchesFilters(question, {
      subject,
      lessonId,
      difficulty,
      query: normalizedQuery || undefined
    }));
  }, [difficulty, lessonId, query, questions, subject]);

  useEffect(() => {
    if (lessonId && !lessonOptions.some((lesson) => lesson.lessonId === lessonId)) {
      setLessonId('');
    }
  }, [lessonId, lessonOptions]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tide">Kho câu hỏi</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-ink">{filteredQuestions.length}/{questions.length} câu</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[220px_170px_260px_150px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="app-input rounded-lg px-3.5 py-2.5 text-sm"
            placeholder="Tìm câu hỏi, dẫn chứng..."
            aria-label="Tìm câu hỏi"
          />
          <select value={subject} onChange={(event) => setSubject(event.target.value)} className="app-input rounded-lg px-3.5 py-2.5 text-sm" aria-label="Lọc môn học">
            <option value="">Tất cả môn</option>
            {subjects.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={lessonId} onChange={(event) => setLessonId(event.target.value)} className="app-input rounded-lg px-3.5 py-2.5 text-sm" aria-label="Lọc bài học">
            <option value="">Tất cả bài học</option>
            {lessonOptions.map((lesson) => <option key={lesson.lessonId} value={lesson.lessonId}>{formatLesson(lesson)}</option>)}
          </select>
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as QuizDifficulty | '')} className="app-input rounded-lg px-3.5 py-2.5 text-sm" aria-label="Lọc độ khó">
            <option value="">Tất cả độ khó</option>
            {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {loading ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-ink/45">Đang tải ngân hàng câu hỏi...</div>
      ) : filteredQuestions.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-ink/45">Không tìm thấy câu hỏi phù hợp.</div>
      ) : (
        <div className="mt-5 max-h-[760px] divide-y divide-slate-100 overflow-y-auto pr-1">
          {filteredQuestions.map((question, index) => (
            <article key={question.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-ink/35">#{index + 1}</span>
                <span className="rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-tide">{question.subjectLabel ?? question.category}</span>
                <DifficultyBadge difficulty={question.difficulty} />
                {question.bloomLevel && <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-ink/55">{question.bloomLevel}</span>}
              </div>
              <h3 className="mt-2 text-sm font-semibold leading-6 text-ink">{question.prompt}</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {question.options.map((option, optionIndex) => (
                  <div
                    key={optionIndex}
                    className={classNames(
                      'rounded-lg border px-3 py-2 text-xs leading-5',
                      optionIndex === question.correctOptionIndex
                        ? 'border-emerald-200 bg-emerald-50 font-semibold text-emerald-800'
                        : 'border-slate-200 bg-sand text-ink/65'
                    )}
                  >
                    <span className="mr-2 font-bold">{OPTION_LETTERS[optionIndex]}.</span>{option}
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-2 text-xs leading-5 text-ink/58 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <p className="rounded-lg border border-slate-200 bg-white px-3 py-2">{getQuestionSource(question) || 'Chưa có nguồn bài học'}</p>
                <p className="rounded-lg border border-slate-200 bg-white px-3 py-2">{question.evidence || question.explanation || 'Chưa có dẫn chứng'}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function QuizPage() {
  const [tab, setTab] = useState<PageTab>('practice');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [lessons, setLessons] = useState<QuizLessonSummary[]>([]);
  const [stats, setStats] = useState<QuizStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchQuestionBank();
      setQuestions(data.questions);
      setCategories(data.categories);
      setLessons(data.lessons);
      setStats(data.stats);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tải ngân hàng câu hỏi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white/90 p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tide">Học liệu AI</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink">Ôn tập Lịch sử và Địa lí lớp 6</h1>
          <p className="mt-1 text-sm text-ink/55">Ngân hàng câu hỏi sinh từ SGK Cánh Diều, có bài học, trang nguồn và dẫn chứng.</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-sand p-1" role="tablist" aria-label="Chế độ ôn tập">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'practice'}
            onClick={() => setTab('practice')}
            className={classNames('flex-1 rounded-md px-4 py-2 text-sm font-semibold transition', tab === 'practice' ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink')}
          >
            Làm bài
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'bank'}
            onClick={() => setTab('bank')}
            className={classNames('flex-1 rounded-md px-4 py-2 text-sm font-semibold transition', tab === 'bank' ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink')}
          >
            Kho câu hỏi
          </button>
        </div>
      </section>

      <StatStrip stats={stats} lessonCount={lessons.length || categories.length} />

      {tab === 'practice' ? (
        <>
          {error && !questions.length ? (
            <div className="rounded-lg border border-rose-200 bg-white p-5 text-sm text-rose-700 shadow-soft">
              {error} <button type="button" onClick={() => void loadQuestions()} className="ml-2 font-semibold underline">Thử lại</button>
            </div>
          ) : (
            <PracticePanel questions={questions} lessons={lessons} stats={stats} />
          )}
        </>
      ) : (
        <QuestionBank
          questions={questions}
          lessons={lessons}
          stats={stats}
          loading={loading}
          error={error}
        />
      )}
    </div>
  );
}
