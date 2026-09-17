from __future__ import annotations

import json
from typing import Any

import requests

from .schemas import SearchResult


def build_context(results: list[SearchResult], max_chars: int) -> str:
    parts: list[str] = []
    used = 0
    for result in results:
        doc = result.document
        image_paths = ", ".join(str(image.get("path")) for image in doc.images if image.get("path"))
        block = f"[Trang {doc.page_number} | {doc.chunk_id}]\n{doc.text}"
        if image_paths:
            block += f"\nẢnh liên quan: {image_paths}"
        if used + len(block) > max_chars:
            break
        parts.append(block)
        used += len(block)
    return "\n\n---\n\n".join(parts)


def build_prompt(question: str, results: list[SearchResult], max_context_chars: int = 7000) -> str:
    context = build_context(results, max_context_chars)
    return f"""Bạn là trợ lý RAG cho sách giáo khoa Lịch sử và Địa lí lớp 6.

Chỉ trả lời dựa trên phần TÀI LIỆU được cung cấp. Nếu tài liệu không đủ thông tin, hãy nói rõ là không có đủ thông tin trong dữ liệu.
Khi trả lời, trích dẫn trang theo dạng (trang X). Không bịa thêm kiến thức ngoài tài liệu.

TÀI LIỆU:
{context}

CÂU HỎI:
{question}

TRẢ LỜI:"""


def extractive_answer(question: str, results: list[SearchResult]) -> dict[str, Any]:
    citations = [{"page_number": r.document.page_number, "chunk_id": r.document.chunk_id, "score": r.score} for r in results]
    context = build_context(results, max_chars=5000)
    return {
        "provider": "extractive",
        "answer": (
            "Chưa gọi LLM sinh câu trả lời. Đây là các đoạn liên quan nhất để đưa vào prompt hoặc đọc trực tiếp:\n\n"
            + context
        ),
        "citations": citations,
    }


class OllamaGenerator:
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen3:4b") -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model

    def generate(self, question: str, results: list[SearchResult], max_context_chars: int = 7000) -> dict[str, Any]:
        prompt = build_prompt(question, results, max_context_chars)
        response = requests.post(
            f"{self.base_url}/api/generate",
            json={"model": self.model, "prompt": prompt, "stream": False},
            timeout=600,
        )
        response.raise_for_status()
        data = response.json()
        return {
            "provider": "ollama",
            "model": self.model,
            "answer": data.get("response", "").strip(),
            "citations": [{"page_number": r.document.page_number, "chunk_id": r.document.chunk_id, "score": r.score} for r in results],
        }
