from __future__ import annotations

import re

from .config import AppConfig
from .llm import Provider, invoke_llm
from .prompting import render_prompt
from .retriever import HybridRetriever, OptionalReranker
from .schemas import Citation, MetadataFilter, RagAnswer, RetrievedChunk
from .text_utils import compact_text, sentence_split


def format_citations(chunks: list[RetrievedChunk]) -> list[Citation]:
    return [
        Citation(
            source_index=index,
            source_marker=f"S{index}",
            filename=chunk.metadata.filename,
            page=chunk.metadata.page,
            section=chunk.metadata.section,
            chunk_id=chunk.metadata.chunk_id,
            lesson_title=chunk.metadata.lesson_title,
        )
        for index, chunk in enumerate(chunks, start=1)
    ]


def build_context(chunks: list[RetrievedChunk], max_chars: int) -> str:
    parts: list[str] = []
    used = 0
    for index, chunk in enumerate(chunks, start=1):
        image_lines = []
        for image in chunk.images[:5]:
            if image.path:
                image_lines.append(f"- {image.label or image.id or 'image'}: {image.path} {image.caption or ''}".strip())
        block = (
            f"[S{index}] Trang {chunk.metadata.page}"
            f" | {chunk.metadata.chunk_id}"
            f" | {chunk.metadata.lesson_title or 'Không rõ bài'}\n"
            f"{chunk.text}"
        )
        if image_lines:
            block += "\nẢnh liên quan:\n" + "\n".join(image_lines)
        if used + len(block) > max_chars:
            break
        parts.append(block)
        used += len(block)
    return "\n\n---\n\n".join(parts)


def retrieve(
    retriever: HybridRetriever,
    config: AppConfig,
    query: str,
    *,
    k: int | None = None,
    filters: MetadataFilter | dict | None = None,
) -> list[RetrievedChunk]:
    initial = retriever.search(query, final_top_k=config.retrieval.initial_top_k, initial_top_k=config.retrieval.initial_top_k, filters=filters)
    reranker = OptionalReranker(config.retrieval.reranker_model, enabled=config.retrieval.use_reranker)
    return reranker.rerank(query, initial, k or config.retrieval.final_top_k)


def extractive_answer(question: str, chunks: list[RetrievedChunk]) -> str:
    query_tokens = {token.lower() for token in re.findall(r"\w+", question, flags=re.UNICODE) if len(token) >= 4}
    candidates: list[tuple[int, str]] = []
    for chunk in chunks:
        for sentence in sentence_split(chunk.text):
            tokens = {token.lower() for token in re.findall(r"\w+", sentence, flags=re.UNICODE)}
            candidates.append((len(tokens & query_tokens), sentence))
    sorted_candidates = sorted(candidates, key=lambda item: item[0], reverse=True)
    positive = [sentence for score, sentence in sorted_candidates if score > 0 and sentence]
    ranked = positive or [sentence for _score, sentence in sorted_candidates if sentence]
    if ranked:
        answer = " ".join(ranked[:4])
    else:
        answer = " ".join(compact_text(chunk.text, 500) for chunk in chunks[:2])
    pages = ", ".join(str(chunk.metadata.page) for chunk in chunks[:3])
    return f"{answer}\n\nNguồn: trang {pages}."


def answer(
    retriever: HybridRetriever,
    config: AppConfig,
    question: str,
    *,
    k: int | None = None,
    filters: MetadataFilter | dict | None = None,
    provider: Provider | None = None,
) -> RagAnswer:
    chunks = retrieve(retriever, config, question, k=k, filters=filters)
    if not chunks:
        return RagAnswer(question=question, answer="Không tìm thấy ngữ cảnh phù hợp trong tài liệu.", provider=provider or config.generation.default_provider)

    selected_provider = provider or config.generation.default_provider
    model = None
    if selected_provider == "extractive":
        text = extractive_answer(question, chunks)
    else:
        prompt = render_prompt(
            "answer.jinja2",
            question=question,
            context=build_context(chunks, config.generation.max_context_chars),
        )
        text, model = invoke_llm(prompt, config.generation, provider=selected_provider)
        if not text:
            text = extractive_answer(question, chunks)

    return RagAnswer(
        question=question,
        answer=text.strip(),
        citations=format_citations(chunks),
        chunks=chunks,
        provider=selected_provider,
        model=model,
    )
