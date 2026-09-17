from __future__ import annotations

import argparse
import collections
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LESSONS: list[dict[str, Any]] = [
    {"id": "history_bai_01", "subject": "history", "subjectLabel": "Lịch sử", "number": 1, "title": "Lịch sử là gì?", "startPage": 6},
    {"id": "history_bai_02", "subject": "history", "subjectLabel": "Lịch sử", "number": 2, "title": "Thời gian trong lịch sử", "startPage": 11},
    {"id": "history_bai_03", "subject": "history", "subjectLabel": "Lịch sử", "number": 3, "title": "Nguồn gốc loài người", "startPage": 14},
    {"id": "history_bai_04", "subject": "history", "subjectLabel": "Lịch sử", "number": 4, "title": "Xã hội nguyên thủy", "startPage": 18},
    {"id": "history_bai_05", "subject": "history", "subjectLabel": "Lịch sử", "number": 5, "title": "Chuyển biến về kinh tế, xã hội cuối thời nguyên thủy", "startPage": 23},
    {"id": "history_bai_06", "subject": "history", "subjectLabel": "Lịch sử", "number": 6, "title": "Ai Cập và Lưỡng Hà cổ đại", "startPage": 27},
    {"id": "history_bai_07", "subject": "history", "subjectLabel": "Lịch sử", "number": 7, "title": "Ấn Độ cổ đại", "startPage": 32},
    {"id": "history_bai_08", "subject": "history", "subjectLabel": "Lịch sử", "number": 8, "title": "Trung Quốc từ thời cổ đại đến thế kỉ VII", "startPage": 37},
    {"id": "history_bai_09", "subject": "history", "subjectLabel": "Lịch sử", "number": 9, "title": "Hy Lạp và La Mã cổ đại", "startPage": 43},
    {"id": "history_bai_10", "subject": "history", "subjectLabel": "Lịch sử", "number": 10, "title": "Sự ra đời và phát triển của các vương quốc ở Đông Nam Á", "startPage": 50},
    {"id": "history_bai_11", "subject": "history", "subjectLabel": "Lịch sử", "number": 11, "title": "Giao lưu thương mại và văn hóa ở Đông Nam Á", "startPage": 54},
    {"id": "history_bai_12", "subject": "history", "subjectLabel": "Lịch sử", "number": 12, "title": "Nước Văn Lang", "startPage": 58},
    {"id": "history_bai_13", "subject": "history", "subjectLabel": "Lịch sử", "number": 13, "title": "Nước Âu Lạc", "startPage": 63},
    {"id": "history_bai_14", "subject": "history", "subjectLabel": "Lịch sử", "number": 14, "title": "Chính sách cai trị của các triều đại phong kiến phương Bắc", "startPage": 68},
    {"id": "history_bai_15", "subject": "history", "subjectLabel": "Lịch sử", "number": 15, "title": "Các cuộc khởi nghĩa tiêu biểu giành độc lập, tự chủ", "startPage": 74},
    {"id": "history_bai_16", "subject": "history", "subjectLabel": "Lịch sử", "number": 16, "title": "Cuộc đấu tranh giữ gìn và phát triển văn hóa dân tộc thời Bắc thuộc", "startPage": 83},
    {"id": "history_bai_17", "subject": "history", "subjectLabel": "Lịch sử", "number": 17, "title": "Bước ngoặt lịch sử đầu thế kỉ X", "startPage": 86},
    {"id": "history_bai_18", "subject": "history", "subjectLabel": "Lịch sử", "number": 18, "title": "Vương quốc Chăm-pa", "startPage": 92},
    {"id": "history_bai_19", "subject": "history", "subjectLabel": "Lịch sử", "number": 19, "title": "Vương quốc Phù Nam", "startPage": 96},
    {"id": "geography_intro", "subject": "geography", "subjectLabel": "Địa lí", "number": 0, "title": "Tại sao cần học Địa lí?", "startPage": 101},
    {"id": "geography_bai_01", "subject": "geography", "subjectLabel": "Địa lí", "number": 1, "title": "Hệ thống kinh vĩ tuyến. Tọa độ địa lí của một địa điểm trên bản đồ", "startPage": 104},
    {"id": "geography_bai_02", "subject": "geography", "subjectLabel": "Địa lí", "number": 2, "title": "Các yếu tố cơ bản của bản đồ", "startPage": 107},
    {"id": "geography_bai_03", "subject": "geography", "subjectLabel": "Địa lí", "number": 3, "title": "Lược đồ trí nhớ", "startPage": 114},
    {"id": "geography_bai_04", "subject": "geography", "subjectLabel": "Địa lí", "number": 4, "title": "Thực hành: Đọc bản đồ và tìm đường đi trên bản đồ", "startPage": 118},
    {"id": "geography_bai_05", "subject": "geography", "subjectLabel": "Địa lí", "number": 5, "title": "Trái Đất trong hệ Mặt Trời. Hình dạng và kích thước của Trái Đất", "startPage": 120},
    {"id": "geography_bai_06", "subject": "geography", "subjectLabel": "Địa lí", "number": 6, "title": "Chuyển động tự quay quanh trục của Trái Đất và các hệ quả địa lí", "startPage": 123},
    {"id": "geography_bai_07", "subject": "geography", "subjectLabel": "Địa lí", "number": 7, "title": "Chuyển động của Trái Đất quanh Mặt Trời và các hệ quả địa lí", "startPage": 128},
    {"id": "geography_bai_08", "subject": "geography", "subjectLabel": "Địa lí", "number": 8, "title": "Xác định phương hướng ngoài thực địa", "startPage": 133},
    {"id": "geography_bai_09", "subject": "geography", "subjectLabel": "Địa lí", "number": 9, "title": "Cấu tạo của Trái Đất. Các mảng kiến tạo. Núi lửa và động đất", "startPage": 137},
    {"id": "geography_bai_10", "subject": "geography", "subjectLabel": "Địa lí", "number": 10, "title": "Quá trình nội sinh và ngoại sinh. Hiện tượng tạo núi", "startPage": 142},
    {"id": "geography_bai_11", "subject": "geography", "subjectLabel": "Địa lí", "number": 11, "title": "Các dạng địa hình chính. Khoáng sản", "startPage": 144},
    {"id": "geography_bai_12", "subject": "geography", "subjectLabel": "Địa lí", "number": 12, "title": "Thực hành: Đọc lược đồ địa hình tỉ lệ lớn và lát cắt địa hình", "startPage": 149},
    {"id": "geography_bai_13", "subject": "geography", "subjectLabel": "Địa lí", "number": 13, "title": "Khí quyển của Trái Đất. Các khối khí. Khí áp và gió", "startPage": 151},
    {"id": "geography_bai_14", "subject": "geography", "subjectLabel": "Địa lí", "number": 14, "title": "Nhiệt độ và mưa. Thời tiết và khí hậu", "startPage": 156},
    {"id": "geography_bai_15", "subject": "geography", "subjectLabel": "Địa lí", "number": 15, "title": "Biến đổi khí hậu và ứng phó với biến đổi khí hậu", "startPage": 161},
    {"id": "geography_bai_16", "subject": "geography", "subjectLabel": "Địa lí", "number": 16, "title": "Thực hành: Đọc lược đồ khí hậu và biểu đồ nhiệt độ - lượng mưa", "startPage": 163},
    {"id": "geography_bai_17", "subject": "geography", "subjectLabel": "Địa lí", "number": 17, "title": "Các thành phần chủ yếu của thủy quyển. Tuần hoàn nước trên Trái Đất", "startPage": 165},
    {"id": "geography_bai_18", "subject": "geography", "subjectLabel": "Địa lí", "number": 18, "title": "Sông. Nước ngầm và băng hà", "startPage": 167},
    {"id": "geography_bai_19", "subject": "geography", "subjectLabel": "Địa lí", "number": 19, "title": "Biển và đại dương. Một số đặc điểm của môi trường biển", "startPage": 171},
    {"id": "geography_bai_20", "subject": "geography", "subjectLabel": "Địa lí", "number": 20, "title": "Thực hành: Xác định trên lược đồ các đại dương thế giới", "startPage": 175},
    {"id": "geography_bai_21", "subject": "geography", "subjectLabel": "Địa lí", "number": 21, "title": "Lớp đất trên Trái Đất", "startPage": 176},
    {"id": "geography_bai_22", "subject": "geography", "subjectLabel": "Địa lí", "number": 22, "title": "Sự đa dạng của thế giới sinh vật. Các đới thiên nhiên trên Trái Đất", "startPage": 180},
    {"id": "geography_bai_23", "subject": "geography", "subjectLabel": "Địa lí", "number": 23, "title": "Thực hành: Tìm hiểu lớp phủ thực vật ở địa phương", "startPage": 184},
    {"id": "geography_bai_24", "subject": "geography", "subjectLabel": "Địa lí", "number": 24, "title": "Dân số thế giới. Sự phân bố dân cư thế giới. Các thành phố lớn", "startPage": 185},
    {"id": "geography_bai_25", "subject": "geography", "subjectLabel": "Địa lí", "number": 25, "title": "Con người và thiên nhiên", "startPage": 190},
    {"id": "geography_bai_26", "subject": "geography", "subjectLabel": "Địa lí", "number": 26, "title": "Thực hành: Tìm hiểu tác động của con người lên môi trường tự nhiên", "startPage": 193},
]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def find_lesson(page_number: int) -> dict[str, Any] | None:
    if page_number >= 203:
        return None
    selected = None
    for lesson in sorted(LESSONS, key=lambda item: int(item["startPage"])):
        if page_number >= int(lesson["startPage"]):
            selected = lesson
        else:
            break
    return selected


def option_index(answer: str) -> int:
    key = (answer or "").strip().upper()
    if key not in {"A", "B", "C", "D"}:
        return -1
    return ord(key) - ord("A")


def clean_text(text: str, max_length: int | None = None) -> str:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text if max_length is None or len(text) <= max_length else text[: max_length - 1].rstrip() + "…"


def convert(input_path: Path, output_path: Path, metadata_path: Path) -> dict[str, Any]:
    rows = read_jsonl(input_path)
    generated_at = datetime.now(timezone.utc).isoformat()
    questions: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for row in rows:
        page_number = int(row.get("page_number") or 0)
        lesson = find_lesson(page_number)
        if not lesson:
            skipped.append({"id": row.get("id"), "page_number": page_number, "reason": "outside_lesson_pages"})
            continue

        options_map = row.get("options") or {}
        options = [clean_text(options_map.get(key), 240) for key in ["A", "B", "C", "D"]]
        correct_index = option_index(str(row.get("answer") or ""))
        if correct_index < 0 or not all(options):
            skipped.append({"id": row.get("id"), "page_number": page_number, "reason": "invalid_options_or_answer"})
            continue

        validation = row.get("validation") or {}
        explanation = clean_text(row.get("explanation"), 900)
        evidence = clean_text(row.get("evidence"), 900)
        if evidence:
            explanation = clean_text(f"{explanation}\n\nDẫn chứng SGK: {evidence}", 1200)

        questions.append(
            {
                "id": f"class6-{row.get('id')}",
                "prompt": clean_text(row.get("question"), 520),
                "options": options,
                "correctOptionIndex": correct_index,
                "category": str(lesson["subjectLabel"]),
                "difficulty": str(row.get("difficulty") or "medium"),
                "explanation": explanation,
                "createdAt": generated_at,
                "lessonId": lesson["id"],
                "lessonNumber": lesson["number"],
                "lessonTitle": f"Bài {lesson['number']}. {lesson['title']}" if lesson["number"] else str(lesson["title"]),
                "subject": lesson["subject"],
                "subjectLabel": lesson["subjectLabel"],
                "pageNumber": page_number,
                "sourceChunkId": row.get("source_chunk_id"),
                "evidence": evidence,
                "bloomLevel": row.get("bloom_level"),
                "studentConfidence": validation.get("student_confidence"),
                "studentReason": clean_text(validation.get("student_reason"), 700),
                "generatedBy": {
                    "source": "QuestionGeneration class_6_qg_output_20260810_051649",
                    "teacherModel": "qwen2.5:7b-instruct",
                    "studentModel": "qwen2.5:7b-instruct",
                    "pipeline": "teacher_student_consistency_filtering",
                },
            }
        )

    questions.sort(key=lambda item: (item["pageNumber"], item["lessonId"], item["id"]))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    by_subject = collections.Counter(item["category"] for item in questions)
    by_lesson = collections.Counter(item["lessonId"] for item in questions)
    by_difficulty = collections.Counter(item["difficulty"] for item in questions)
    by_answer = collections.Counter("ABCD"[item["correctOptionIndex"]] for item in questions)

    lesson_summaries = []
    for lesson in LESSONS:
        count = by_lesson.get(str(lesson["id"]), 0)
        if count:
            lesson_summaries.append(
                {
                    "lessonId": lesson["id"],
                    "subject": lesson["subject"],
                    "subjectLabel": lesson["subjectLabel"],
                    "lessonNumber": lesson["number"],
                    "lessonTitle": f"Bài {lesson['number']}. {lesson['title']}" if lesson["number"] else lesson["title"],
                    "startPage": lesson["startPage"],
                    "questionCount": count,
                }
            )

    metadata = {
        "generatedAt": generated_at,
        "source": str(input_path),
        "output": str(output_path),
        "totalAcceptedFromQG": len(rows),
        "importedQuestions": len(questions),
        "skippedQuestions": len(skipped),
        "skipped": skipped[:80],
        "bySubject": dict(by_subject),
        "byDifficulty": dict(by_difficulty),
        "byAnswer": dict(by_answer),
        "lessons": lesson_summaries,
    }
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Import generated class 6 MCQs into the backend study question bank.")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("QuestionGeneration/class_6_qg_output_20260810_051649/QuestionGeneration/data/class_6/validated_questions.jsonl"),
    )
    parser.add_argument("--output", type=Path, default=Path("backend/src/data/studyQuestionBank.json"))
    parser.add_argument("--metadata", type=Path, default=Path("backend/src/data/studyQuestionBank.meta.json"))
    args = parser.parse_args()

    metadata = convert(args.input, args.output, args.metadata)
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
