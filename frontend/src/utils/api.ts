import type { ProvinceCollection, ProvinceDetail, ResolveAdminUnitResponse, ResolveAddressResponse } from '../types/admin';
import type {
  CreateQuizQuestionInput,
  PublicQuizQuestion,
  QuizDifficulty,
  QuizQuestion,
  QuizSubmissionResult
} from '../types/quiz';


async function handleJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchProvinces(): Promise<ProvinceCollection> {
  const response = await fetch('/api/provinces');
  return handleJson<ProvinceCollection>(response);
}

export async function fetchProvinceDetail(provinceCode: string): Promise<ProvinceDetail> {
  const response = await fetch(`/api/provinces/${provinceCode}`);
  return handleJson<ProvinceDetail>(response);
}

export async function resolveLatLon(lat: number, lon: number): Promise<ResolveAdminUnitResponse> {
  const response = await fetch('/api/resolve-admin-unit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ lat, lon })
  });

  return handleJson<ResolveAdminUnitResponse>(response);
}

export async function resolveAddress(
  params:
    | { address_text: string }
    | { legacy_province: string; legacy_district?: string; legacy_commune?: string }
): Promise<ResolveAddressResponse> {
  const response = await fetch('/api/resolve-address', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  return handleJson<ResolveAddressResponse>(response);
}

export async function fetchQuestionBank(): Promise<{
  questions: QuizQuestion[];
  count: number;
  categories: string[];
}> {
  const response = await fetch('/api/questions');
  return handleJson(response);
}

export async function createQuizQuestion(input: CreateQuizQuestionInput): Promise<QuizQuestion> {
  const response = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  return handleJson(response);
}

export async function deleteQuizQuestion(questionId: string): Promise<void> {
  const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}`, { method: 'DELETE' });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? 'Không thể xóa câu hỏi.');
  }
}

export async function generateQuiz(params: {
  count: number;
  category?: string;
  difficulty?: QuizDifficulty;
}): Promise<{ questions: PublicQuizQuestion[]; count: number }> {
  const query = new URLSearchParams({ count: String(params.count) });
  if (params.category) query.set('category', params.category);
  if (params.difficulty) query.set('difficulty', params.difficulty);
  const response = await fetch(`/api/quiz?${query.toString()}`);
  return handleJson(response);
}

export async function submitQuiz(
  answers: Array<{ questionId: string; selectedOptionIndex: number | null }>
): Promise<QuizSubmissionResult> {
  const response = await fetch('/api/quiz/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers })
  });
  return handleJson(response);
}

