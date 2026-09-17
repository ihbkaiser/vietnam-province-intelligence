import { HttpError } from "./auth";

export async function proxyRequest(request: Request, baseUrl: string, parts: string[]): Promise<Response> {
  const sourceUrl = new URL(request.url);
  const targetPath = parts.map((part) => encodeURIComponent(part)).join("/");
  const targetUrl = `${baseUrl.replace(/\/$/, "")}/${targetPath}${sourceUrl.search}`;
  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();
  let response: globalThis.Response;
  try {
    response = await fetch(targetUrl, {
      method,
      headers: {
        "content-type": request.headers.get("content-type") || "application/json"
      },
      body,
      cache: "no-store"
    });
  } catch {
    throw new HttpError(503, `Chưa kết nối được backend tại ${baseUrl}. Hãy bật service tương ứng rồi thử lại.`);
  }

  const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": contentType }
  });
}
