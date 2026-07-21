import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CreateQuizQuestionInput,
  PublicQuizQuestion,
  QuizDifficulty,
  QuizQuestion,
  QuizSubmissionResult
} from '../types/quiz';
import {
  createQuizQuestion,
  deleteQuizQuestion,
  fetchQuestionBank,
  generateQuiz,
  submitQuiz
} from '../utils/api';

type PageTab = 'play' | 'bank';

const DIFFICULTY_LABELS: Record<QuizDifficulty, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó'
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function DifficultyBadge({ difficulty }: { difficulty: QuizDifficulty }) {
  const styles = {
    easy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    hard: 'bg-rose-50 text-rose-700 border-rose-200'
  }[difficulty];
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${styles}`}>{DIFFICULTY_LABELS[difficulty]}</span>;
}

function QuestionForm({
  categories,
  onCreated
}: {
  categories: string[];
  onCreated: (question: QuizQuestion) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0);
  const [category, setCategory] = useState('Địa lý');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('easy');
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const updateOption = (index: number, value: string) => {
    setOptions((current) => current.map((option, optionIndex) => optionIndex === index ? value : option));
  };

  const removeOption = (index: number) => {
    setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index));
    setCorrectOptionIndex((current) => {
      if (current === index) return 0;
      return current > index ? current - 1 : current;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const question = await createQuizQuestion({
        prompt,
        options,
        correctOptionIndex,
        category,
        difficulty,
        explanation
      });
      onCreated(question);
      setPrompt('');
      setOptions(['', '', '', '']);
      setCorrectOptionIndex(0);
      setExplanation('');
      setSuccess('Đã thêm câu hỏi vào ngân hàng.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể thêm câu hỏi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mist text-tide">
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tide">Câu hỏi mới</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-ink">Thêm vào ngân hàng</h2>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-ink">Nội dung câu hỏi</span>
          <textarea
            required
            minLength={5}
            maxLength={500}
            rows={3}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="app-input mt-1.5 w-full resize-y rounded-lg px-3.5 py-3 text-sm"
            placeholder="Ví dụ: Vịnh Hạ Long thuộc tỉnh nào?"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-semibold text-ink">Các lựa chọn</legend>
          <p className="mt-1 text-xs leading-5 text-ink/48">Chọn nút tròn bên trái để đánh dấu đáp án đúng.</p>
          <div className="mt-2.5 space-y-2.5">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-sand">
                  <input
                    type="radio"
                    name="correct-answer"
                    checked={correctOptionIndex === index}
                    onChange={() => setCorrectOptionIndex(index)}
                    className="h-4 w-4 accent-teal-700"
                    aria-label={`Đặt lựa chọn ${OPTION_LETTERS[index]} là đáp án đúng`}
                  />
                </label>
                <div className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink/35">{OPTION_LETTERS[index]}</span>
                  <input
                    required
                    maxLength={200}
                    value={option}
                    onChange={(event) => updateOption(index, event.target.value)}
                    className="app-input w-full rounded-lg py-2.5 pl-9 pr-3 text-sm"
                    placeholder={`Lựa chọn ${OPTION_LETTERS[index]}`}
                  />
                </div>
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    className="rounded-lg p-2.5 text-ink/35 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Xóa lựa chọn ${OPTION_LETTERS[index]}`}
                  >
                    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12m-10 0 1 13h6l1-13m-6 0V4h4v3" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 6 && (
            <button
              type="button"
              onClick={() => setOptions((current) => [...current, ''])}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-tide transition hover:bg-mist"
            >
              <span aria-hidden="true">＋</span> Thêm lựa chọn
            </button>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="text-sm font-semibold text-ink">Chủ đề</span>
            <input
              required
              minLength={2}
              maxLength={60}
              list="quiz-categories"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="app-input mt-1.5 w-full rounded-lg px-3.5 py-2.5 text-sm"
              placeholder="Địa lý"
            />
            <datalist id="quiz-categories">
              {categories.map((item) => <option key={item} value={item} />)}
            </datalist>
          </label>
          <label>
            <span className="text-sm font-semibold text-ink">Mức độ</span>
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as QuizDifficulty)}
              className="app-input mt-1.5 w-full rounded-lg px-3.5 py-2.5 text-sm"
            >
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-ink">Giải thích <span className="font-normal text-ink/40">(không bắt buộc)</span></span>
          <textarea
            maxLength={1000}
            rows={2}
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            className="app-input mt-1.5 w-full resize-y rounded-lg px-3.5 py-3 text-sm"
            placeholder="Thông tin được hiển thị sau khi người chơi nộp bài..."
          />
        </label>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {success && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-tide disabled:cursor-not-allowed disabled:opacity-55"
      >
        {loading ? 'Đang lưu...' : 'Lưu câu hỏi'}
      </button>
    </form>
  );
}

function QuestionBank({
  questions,
  categories,
  loading,
  error,
  onCreated,
  onDeleted
}: {
  questions: QuizQuestion[];
  categories: string[];
  loading: boolean;
  error: string | null;
  onCreated: (question: QuizQuestion) => void;
  onDeleted: (questionId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filteredQuestions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    return questions.filter((question) => {
      const matchesQuery = !normalizedQuery || question.prompt.toLocaleLowerCase('vi').includes(normalizedQuery);
      return matchesQuery && (!categoryFilter || question.category === categoryFilter);
    });
  }, [categoryFilter, query, questions]);

  const handleDelete = async (question: QuizQuestion) => {
    if (!window.confirm(`Xóa câu hỏi “${question.prompt}”?`)) return;
    setDeletingId(question.id);
    setDeleteError(null);
    try {
      await deleteQuizQuestion(question.id);
      onDeleted(question.id);
    } catch (requestError) {
      setDeleteError(requestError instanceof Error ? requestError.message : 'Không thể xóa câu hỏi.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
      <QuestionForm categories={categories} onCreated={onCreated} />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tide">Kho nội dung</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-ink">Ngân hàng câu hỏi</h2>
            <p className="mt-1 text-sm text-ink/50">{questions.length} câu hỏi có thể dùng để tạo lượt chơi.</p>
          </div>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="app-input min-w-0 flex-1 rounded-lg px-3 py-2 text-sm sm:w-44"
              placeholder="Tìm câu hỏi..."
              aria-label="Tìm trong ngân hàng câu hỏi"
            />
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="app-input min-w-0 rounded-lg px-3 py-2 text-sm"
              aria-label="Lọc theo chủ đề"
            >
              <option value="">Mọi chủ đề</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
        </div>

        {(error || deleteError) && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error ?? deleteError}</p>}
        {loading ? (
          <div className="mt-5 rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-ink/45">Đang tải ngân hàng câu hỏi...</div>
        ) : filteredQuestions.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-ink/45">Không tìm thấy câu hỏi phù hợp.</div>
        ) : (
          <div className="mt-5 max-h-[760px] space-y-3 overflow-y-auto pr-1">
            {filteredQuestions.map((question, questionIndex) => (
              <article key={question.id} className="rounded-lg border border-slate-200 bg-sand/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-ink/35">#{questions.indexOf(question) + 1 || questionIndex + 1}</span>
                      <span className="rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-tide">{question.category}</span>
                      <DifficultyBadge difficulty={question.difficulty} />
                    </div>
                    <h3 className="text-sm font-semibold leading-6 text-ink">{question.prompt}</h3>
                  </div>
                  <button
                    type="button"
                    disabled={deletingId === question.id}
                    onClick={() => void handleDelete(question)}
                    className="shrink-0 rounded-lg p-2 text-ink/35 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                    aria-label="Xóa câu hỏi"
                  >
                    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12m-10 0 1 13h6l1-13m-6 0V4h4v3" />
                    </svg>
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {question.options.map((option, index) => (
                    <div
                      key={index}
                      className={`rounded-md border px-3 py-2 text-xs ${index === question.correctOptionIndex ? 'border-emerald-200 bg-emerald-50 font-semibold text-emerald-800' : 'border-slate-200 bg-white text-ink/62'}`}
                    >
                      <span className="mr-2 font-bold">{OPTION_LETTERS[index]}.</span>{option}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuizPlayer({ categories, questionCount }: { categories: string[]; questionCount: number }) {
  const [count, setCount] = useState(Math.min(5, Math.max(questionCount, 1)));
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState<QuizDifficulty | ''>('');
  const [questions, setQuestions] = useState<PublicQuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizSubmissionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCount((current) => Math.min(current, Math.max(questionCount, 1)));
  }, [questionCount]);

  const startQuiz = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateQuiz({
        count,
        category: category || undefined,
        difficulty: difficulty || undefined
      });
      if (data.questions.length === 0) {
        setError('Chưa có câu hỏi phù hợp với bộ lọc này. Hãy chọn cấu hình khác hoặc thêm câu hỏi mới.');
        return;
      }
      setQuestions(data.questions);
      setCurrentIndex(0);
      setAnswers({});
      setResult(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tạo lượt chơi.');
    } finally {
      setLoading(false);
    }
  };

  const finishQuiz = async () => {
    setLoading(true);
    setError(null);
    try {
      const submission = await submitQuiz(questions.map((question) => ({
        questionId: question.id,
        selectedOptionIndex: answers[question.id] ?? null
      })));
      setResult(submission);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể chấm điểm lượt chơi.');
    } finally {
      setLoading(false);
    }
  };

  const resetQuiz = () => {
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setError(null);
    setCurrentIndex(0);
  };

  if (result) {
    const resultByQuestionId = new Map(result.results.map((item) => [item.questionId, item]));
    const resultTone = result.percentage >= 80 ? 'text-emerald-600' : result.percentage >= 50 ? 'text-amber-600' : 'text-coral';
    return (
      <div className="space-y-5">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
          <div className="grid gap-6 bg-ink p-6 text-white sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-8">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-8 border-white/15 bg-white/10">
              <span className="font-display text-2xl font-bold">{result.percentage}%</span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">Kết quả lượt chơi</p>
              <h2 className="mt-2 font-display text-3xl font-semibold">Bạn trả lời đúng {result.score}/{result.total} câu</h2>
              <p className="mt-2 text-sm text-white/65">Xem lại đáp án và phần giải thích ở bên dưới.</p>
            </div>
            <button type="button" onClick={() => void startQuiz()} className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-mist">
              Chơi lượt mới
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-ink">Xem lại đáp án</h2>
            <span className={`text-sm font-semibold ${resultTone}`}>{result.score} câu đúng</span>
          </div>
          <div className="mt-5 space-y-4">
            {questions.map((question, index) => {
              const item = resultByQuestionId.get(question.id);
              if (!item) return null;
              return (
                <article key={question.id} className={`rounded-lg border p-4 ${item.isCorrect ? 'border-emerald-200 bg-emerald-50/45' : 'border-rose-200 bg-rose-50/45'}`}>
                  <div className="flex items-start gap-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${item.isCorrect ? 'bg-emerald-600' : 'bg-rose-500'}`}>{item.isCorrect ? '✓' : '×'}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold leading-6 text-ink">{index + 1}. {question.prompt}</h3>
                      <p className="mt-2 text-sm text-ink/65">Đáp án đúng: <strong className="text-ink">{item.correctAnswer}</strong></p>
                      {!item.isCorrect && item.selectedOptionIndex !== null && (
                        <p className="mt-1 text-sm text-rose-700">Bạn chọn: {question.options[item.selectedOptionIndex]}</p>
                      )}
                      {item.explanation && <p className="mt-2 border-t border-current/10 pt-2 text-sm leading-6 text-ink/60">{item.explanation}</p>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <button type="button" onClick={resetQuiz} className="mt-5 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-tide/30 hover:bg-mist">
            Đổi cấu hình
          </button>
        </section>
      </div>
    );
  }

  if (questions.length > 0) {
    const currentQuestion = questions[currentIndex];
    const selectedAnswer = answers[currentQuestion.id];
    const isLastQuestion = currentIndex === questions.length - 1;
    return (
      <section className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-200 bg-sand px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold text-ink">Câu {currentIndex + 1} / {questions.length}</span>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-tide">{currentQuestion.category}</span>
              <DifficultyBadge difficulty={currentQuestion.difficulty} />
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-tide transition-all" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
          </div>
        </div>

        <div className="p-5 sm:p-7">
          <h2 className="font-display text-xl font-semibold leading-8 text-ink sm:text-2xl">{currentQuestion.prompt}</h2>
          <div className="mt-6 space-y-3">
            {currentQuestion.options.map((option, optionIndex) => {
              const selected = selectedAnswer === optionIndex;
              return (
                <button
                  key={optionIndex}
                  type="button"
                  onClick={() => setAnswers((current) => ({ ...current, [currentQuestion.id]: optionIndex }))}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3.5 text-left text-sm transition ${selected ? 'border-tide bg-mist text-ink shadow-sm' : 'border-slate-200 bg-white text-ink/72 hover:border-tide/35 hover:bg-sand'}`}
                  aria-pressed={selected}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${selected ? 'bg-tide text-white' : 'bg-sand text-ink/45'}`}>{OPTION_LETTERS[optionIndex]}</span>
                  <span className="font-medium">{option}</span>
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
              ← Câu trước
            </button>
            <button
              type="button"
              disabled={selectedAnswer === undefined || loading}
              onClick={() => isLastQuestion ? void finishQuiz() : setCurrentIndex((current) => current + 1)}
              className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-tide disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loading ? 'Đang chấm...' : isLastQuestion ? 'Nộp bài' : 'Câu tiếp →'}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <section className="relative overflow-hidden rounded-lg bg-ink p-6 text-white shadow-panel sm:p-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[40px] border-white/[0.035]" />
        <div className="relative max-w-2xl">
          <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Thử thách kiến thức</span>
          <h2 className="mt-5 font-display text-3xl font-semibold leading-tight sm:text-4xl">Bạn hiểu Việt Nam đến đâu?</h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-white/65">Mỗi lượt chơi lấy ngẫu nhiên câu hỏi từ ngân hàng. Hoàn thành tất cả để xem điểm, đáp án đúng và giải thích.</p>
          <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
              <p className="font-display text-2xl font-semibold">{questionCount}</p>
              <p className="mt-1 text-xs text-white/50">Câu hỏi</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
              <p className="font-display text-2xl font-semibold">{categories.length}</p>
              <p className="mt-1 text-xs text-white/50">Chủ đề</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
              <p className="font-display text-2xl font-semibold">3</p>
              <p className="mt-1 text-xs text-white/50">Mức độ</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tide">Thiết lập lượt chơi</p>
        <h2 className="mt-1 font-display text-xl font-semibold text-ink">Chọn thử thách của bạn</h2>
        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="flex items-center justify-between text-sm font-semibold text-ink"><span>Số câu hỏi</span><strong className="text-tide">{count}</strong></span>
            <input
              type="range"
              min={1}
              max={Math.min(20, Math.max(questionCount, 1))}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="mt-3 w-full accent-teal-700"
              disabled={questionCount === 0}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink">Chủ đề</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="app-input mt-1.5 w-full rounded-lg px-3.5 py-2.5 text-sm">
              <option value="">Tất cả chủ đề</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink">Mức độ</span>
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as QuizDifficulty | '')} className="app-input mt-1.5 w-full rounded-lg px-3.5 py-2.5 text-sm">
              <option value="">Tất cả mức độ</option>
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <button
          type="button"
          disabled={loading || questionCount === 0}
          onClick={() => void startQuiz()}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-coral px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Đang tạo câu hỏi...' : 'Bắt đầu đố vui'}
          {!loading && <span aria-hidden="true">→</span>}
        </button>
      </section>
    </div>
  );
}

export function QuizPage() {
  const [tab, setTab] = useState<PageTab>('play');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchQuestionBank();
      setQuestions(data.questions);
      setCategories(data.categories);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tải ngân hàng câu hỏi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const handleCreated = (question: QuizQuestion) => {
    setQuestions((current) => [question, ...current]);
    setCategories((current) => current.includes(question.category)
      ? current
      : [...current, question.category].sort((a, b) => a.localeCompare(b, 'vi')));
  };

  const handleDeleted = (questionId: string) => {
    const nextQuestions = questions.filter((question) => question.id !== questionId);
    setQuestions(nextQuestions);
    setCategories([...new Set(nextQuestions.map((question) => question.category))].sort((a, b) => a.localeCompare(b, 'vi')));
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white/90 p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tide">VietGeo Challenge</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink">Hỏi đáp trắc nghiệm</h1>
          <p className="mt-1 text-sm text-ink/55">Tạo câu hỏi riêng hoặc bắt đầu một lượt đố vui về Việt Nam.</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-sand p-1" role="tablist" aria-label="Chế độ trắc nghiệm">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'play'}
            onClick={() => setTab('play')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition ${tab === 'play' ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink'}`}
          >
            Đố vui
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'bank'}
            onClick={() => setTab('bank')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition ${tab === 'bank' ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink'}`}
          >
            Ngân hàng câu hỏi
          </button>
        </div>
      </section>

      {tab === 'play' ? (
        <>
          {error && questions.length === 0 ? (
            <div className="rounded-lg border border-rose-200 bg-white p-5 text-sm text-rose-700 shadow-soft">
              {error} <button type="button" onClick={() => void loadQuestions()} className="ml-2 font-semibold underline">Thử lại</button>
            </div>
          ) : (
            <QuizPlayer categories={categories} questionCount={questions.length} />
          )}
        </>
      ) : (
        <QuestionBank
          questions={questions}
          categories={categories}
          loading={loading}
          error={error}
          onCreated={handleCreated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
