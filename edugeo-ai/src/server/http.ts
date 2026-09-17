export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}
