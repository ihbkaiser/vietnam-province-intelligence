from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

RAG_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAG_ROOT / "src"))

from rag_system.config import load_config
from rag_system.generator import OllamaGenerator, extractive_answer
from rag_system.retriever import HybridRetriever, repair_mojibake, result_to_dict


def _request_models():
    from pydantic import BaseModel

    class SearchRequest(BaseModel):
        question: str
        top_k: int | None = None
        page_min: int | None = None
        page_max: int | None = None

    class AskRequest(SearchRequest):
        provider: str = "extractive"

    return SearchRequest, AskRequest


SearchRequest, AskRequest = _request_models()


def create_app(config_path: Path):
    from fastapi import FastAPI
    from fastapi.responses import HTMLResponse

    config = load_config(config_path)
    retriever = HybridRetriever(config["index"]["output_dir"], config)

    app = FastAPI(title="Vietnam Textbook RAG", version="0.1.0")

    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        return """
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vietnam Textbook RAG</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1b1f24;
      background: #f7f5ef;
    }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main {
      width: min(1120px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 36px;
    }
    header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }
    h1 { margin: 0; font-size: clamp(24px, 3vw, 34px); line-height: 1.12; letter-spacing: 0; }
    .status { font-size: 14px; color: #58616f; }
    .workspace {
      display: grid;
      grid-template-columns: minmax(300px, 0.9fr) minmax(360px, 1.1fr);
      gap: 16px;
      align-items: start;
    }
    section {
      background: #ffffff;
      border: 1px solid #ded8c9;
      border-radius: 8px;
      padding: 16px;
    }
    label { display: block; font-weight: 650; font-size: 14px; margin-bottom: 8px; }
    textarea {
      width: 100%;
      min-height: 132px;
      resize: vertical;
      border: 1px solid #c8c2b4;
      border-radius: 6px;
      padding: 12px;
      font: inherit;
      line-height: 1.45;
    }
    .controls {
      display: grid;
      grid-template-columns: 1fr 92px;
      gap: 10px;
      margin-top: 12px;
    }
    select, input, button {
      height: 40px;
      border-radius: 6px;
      border: 1px solid #c8c2b4;
      padding: 0 10px;
      font: inherit;
      background: #fff;
    }
    button {
      width: 100%;
      margin-top: 12px;
      border-color: #1f6feb;
      background: #1f6feb;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    button:disabled { opacity: 0.65; cursor: wait; }
    .answer {
      white-space: pre-wrap;
      line-height: 1.55;
      min-height: 112px;
      border-bottom: 1px solid #ece7dc;
      padding-bottom: 14px;
      margin-bottom: 14px;
    }
    .source {
      border: 1px solid #e7e1d4;
      border-radius: 8px;
      padding: 12px;
      margin-top: 10px;
      background: #fcfbf7;
    }
    .source strong { display: block; margin-bottom: 6px; }
    .source p { margin: 0; color: #303946; line-height: 1.45; }
    .error { color: #b42318; font-weight: 650; }
    @media (max-width: 820px) {
      .workspace { grid-template-columns: 1fr; }
      header { display: block; }
      .status { margin-top: 6px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Vietnam Textbook RAG</h1>
      <div class="status" id="status">Đang sẵn sàng</div>
    </header>
    <div class="workspace">
      <section>
        <label for="question">Câu hỏi</label>
        <textarea id="question">Vì sao cần học lịch sử?</textarea>
        <div class="controls">
          <select id="provider" aria-label="Provider">
            <option value="ollama">Ollama sinh câu trả lời</option>
            <option value="extractive">Chỉ lấy đoạn liên quan</option>
          </select>
          <input id="topK" type="number" min="1" max="10" value="3" aria-label="Top K">
        </div>
        <button id="ask">Hỏi RAG</button>
      </section>
      <section>
        <div class="answer" id="answer">Kết quả sẽ hiện ở đây.</div>
        <div id="sources"></div>
      </section>
    </div>
  </main>
  <script>
    const questionEl = document.getElementById("question");
    const providerEl = document.getElementById("provider");
    const topKEl = document.getElementById("topK");
    const askEl = document.getElementById("ask");
    const answerEl = document.getElementById("answer");
    const sourcesEl = document.getElementById("sources");
    const statusEl = document.getElementById("status");

    function snippet(text, max = 420) {
      const clean = String(text || "").replace(/\\s+/g, " ").trim();
      return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + "...";
    }

    function renderSources(results) {
      sourcesEl.innerHTML = "";
      for (const item of results || []) {
        const node = document.createElement("div");
        node.className = "source";
        node.innerHTML = `<strong>Trang ${item.page_number} | ${item.chunk_id} | score ${Number(item.score).toFixed(4)}</strong><p></p>`;
        node.querySelector("p").textContent = snippet(item.text);
        sourcesEl.appendChild(node);
      }
    }

    askEl.addEventListener("click", async () => {
      const question = questionEl.value.trim();
      if (!question) return;
      askEl.disabled = true;
      statusEl.textContent = "Đang truy xuất và sinh câu trả lời...";
      answerEl.textContent = "Đang xử lý...";
      sourcesEl.innerHTML = "";
      try {
        const response = await fetch("/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            provider: providerEl.value,
            top_k: Number(topKEl.value || 3)
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(data));
        if (data.dense_warning) statusEl.textContent = data.dense_warning;
        else statusEl.textContent = "Hoàn tất";
        answerEl.textContent = data.answer?.answer || "";
        renderSources(data.results);
      } catch (error) {
        statusEl.textContent = "Có lỗi";
        answerEl.innerHTML = `<span class="error">${error.message}</span>`;
      } finally {
        askEl.disabled = false;
      }
    });
  </script>
</body>
</html>
"""

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"ok": True, "documents": len(retriever.docs)}

    @app.post("/search")
    def search(request: SearchRequest) -> dict[str, Any]:
        filters = {key: value for key, value in {"page_min": request.page_min, "page_max": request.page_max}.items() if value is not None}
        question = repair_mojibake(request.question)
        results = retriever.search(question, final_top_k=request.top_k, filters=filters)
        payload: dict[str, Any] = {"question": question, "results": [result_to_dict(result, config["data"]["extracted_dir"]) for result in results]}
        if retriever.dense_error:
            payload["dense_warning"] = f"Dense embedding unavailable; sparse fallback was used. {retriever.dense_error}"
        return payload

    @app.post("/ask")
    def ask(request: AskRequest) -> dict[str, Any]:
        filters = {key: value for key, value in {"page_min": request.page_min, "page_max": request.page_max}.items() if value is not None}
        question = repair_mojibake(request.question)
        results = retriever.search(question, final_top_k=request.top_k, filters=filters)
        if request.provider == "ollama":
            generator = OllamaGenerator(
                config.get("generation", {}).get("ollama_base_url", "http://localhost:11434"),
                config.get("generation", {}).get("ollama_model", "qwen3:4b"),
            )
            answer = generator.generate(question, results, int(config.get("generation", {}).get("max_context_chars", 7000)))
        else:
            answer = extractive_answer(question, results)
        payload: dict[str, Any] = {"question": question, "answer": answer, "results": [result_to_dict(result, config["data"]["extracted_dir"]) for result in results]}
        if retriever.dense_error:
            payload["dense_warning"] = f"Dense embedding unavailable; sparse fallback was used. {retriever.dense_error}"
        return payload

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the local textbook RAG API.")
    parser.add_argument("--config", type=Path, default=RAG_ROOT / "config.yaml")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8016)
    args = parser.parse_args()

    import uvicorn

    app = create_app(args.config)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
