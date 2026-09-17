from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from .schemas import FlashcardSet, QuizSet, RagAnswer, Summary


ExportFormat = Literal["text", "md", "json"]


def _citations_md(items) -> str:
    if not items:
        return ""
    lines = ["", "## Nguồn"]
    for citation in items:
        lesson = f" - {citation.lesson_title}" if citation.lesson_title else ""
        lines.append(f"- {citation.source_marker}: trang {citation.page}, `{citation.chunk_id}`{lesson}")
    return "\n".join(lines)


def _to_markdown(model: BaseModel) -> str:
    if isinstance(model, RagAnswer):
        return f"# Trả lời\n\n{model.answer}\n{_citations_md(model.citations)}\n"
    if isinstance(model, Summary):
        points = "\n".join(f"- {point}" for point in model.key_points)
        return f"# Tóm tắt\n\n{model.summary}\n\n## Ý chính\n{points}\n{_citations_md(model.citations)}\n"
    if isinstance(model, QuizSet):
        lines = ["# Quiz", ""]
        for index, item in enumerate(model.items, start=1):
            lines.append(f"## Câu {index}")
            lines.append(item.question)
            for option_index, option in enumerate(item.options):
                lines.append(f"- {chr(65 + option_index)}. {option}")
            lines.append(f"- Đáp án: {chr(65 + item.correct_index)}")
            lines.append(f"- Giải thích: {item.explanation}")
            lines.append("")
        lines.append(_citations_md(model.citations))
        return "\n".join(lines).strip() + "\n"
    if isinstance(model, FlashcardSet):
        lines = ["# Flashcards", ""]
        for index, card in enumerate(model.cards, start=1):
            lines.append(f"## Thẻ {index}")
            lines.append(f"- Mặt trước: {card.front}")
            lines.append(f"- Mặt sau: {card.back}")
            if card.hint:
                lines.append(f"- Gợi ý: {card.hint}")
            lines.append("")
        lines.append(_citations_md(model.citations))
        return "\n".join(lines).strip() + "\n"
    return model.model_dump_json(indent=2)


def export_model(model: BaseModel, *, fmt: ExportFormat = "md", output: Path | None = None) -> str | Path:
    if fmt == "json":
        text = model.model_dump_json(indent=2) + "\n"
    elif fmt in {"text", "md"}:
        text = _to_markdown(model)
    else:
        raise ValueError(f"Unknown export format: {fmt}")
    if output is None:
        return text
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf-8")
    return output
