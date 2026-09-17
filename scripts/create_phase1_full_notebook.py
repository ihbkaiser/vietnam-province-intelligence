from __future__ import annotations

import ast
import json
from copy import deepcopy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "notebooks" / "phase1_kaggle_pdf_extract_kit_deepseek.ipynb"
OUT = ROOT / "notebooks" / "phase1_kaggle_phase1_full.ipynb"


def code(source: str) -> dict[str, object]:
    ast.parse(source)
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": source.splitlines(keepends=True),
    }


def md(source: str) -> dict[str, object]:
    return {"cell_type": "markdown", "metadata": {}, "source": source.splitlines(keepends=True)}


SPELLCHECK_CELL = r'''# Optional Phase 1 post-OCR correction bằng LLM local, không gọi API.
# Giữ lại book_raw_ocr.md để audit, rồi ghi bản đã sửa vào book_corrected.md và book.md.
import shutil

PAGE_HEADING_RE = re.compile(r'(?m)^## PDF Page\s+(\d+)\s*$')
IMAGE_TOKEN_RE = re.compile(r'^!\[.*?\]\(.*?\)\s*$')
IMAGE_LINK_RE = re.compile(r'!\[(.*?)\]\((.*?)\)')


def split_page_sections(markdown):
    matches = list(PAGE_HEADING_RE.finditer(markdown))
    if not matches:
        return markdown, []
    preamble = markdown[:matches[0].start()].rstrip() + '\n\n'
    sections = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        sections.append({'section_index': index, 'page_number': int(match.group(1)), 'text': markdown[match.start():end].strip()})
    return preamble, sections


def protect_markdown_lines(text):
    placeholders = {}
    protected_lines = []
    for line in str(text).splitlines():
        if IMAGE_TOKEN_RE.match(line.strip()):
            token = f'@@IMAGE_LINK_{len(placeholders):04d}@@'
            placeholders[token] = line
            protected_lines.append(token)
        else:
            protected_lines.append(line)
    return '\n'.join(protected_lines), placeholders


def restore_markdown_lines(text, placeholders):
    for token, original in placeholders.items():
        text = str(text).replace(token, original)
    return str(text)


def page_visual_records(page_no):
    return sorted(
        [
            record for record in image_records
            if int(record.get('page_number') or record.get('page') or 0) == int(page_no) and record.get('path')
        ],
        key=lambda record: (record.get('bbox') or [0, 0, 0, 0])[1],
    )


def safe_image_markdown(record):
    if 'image_markdown' in globals():
        return image_markdown(record)
    alt = str(record.get('caption') or record.get('label') or record.get('id') or 'image').replace('\n', ' ')
    return f'![{alt}]({record.get("path", "")})'


def sanitize_and_complete_section(text, page_no):
    valid_paths = {str(record.get('path')) for record in image_records if record.get('path')}
    output_lines = []
    existing_paths = set()
    saw_break = False
    page_visuals = page_visual_records(page_no)

    def next_missing_visual():
        for record in page_visuals:
            rel_path = str(record.get('path') or '')
            if rel_path and rel_path not in existing_paths:
                return record
        return None

    def emit_missing_visual():
        record = next_missing_visual()
        if not record:
            return False
        rel_path = str(record.get('path') or '')
        output_lines.append(safe_image_markdown(record))
        existing_paths.add(rel_path)
        return True

    def replace_inline_image(match):
        rel_path = match.group(2)
        if rel_path in valid_paths:
            existing_paths.add(rel_path)
            return match.group(0)
        return ''

    for raw_line in str(text).splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped:
            output_lines.append(line)
            continue
        if stripped == '</break>':
            saw_break = True
            continue
        image_match = IMAGE_LINK_RE.fullmatch(stripped)
        if image_match:
            rel_path = image_match.group(2)
            if rel_path in valid_paths and rel_path not in existing_paths:
                output_lines.append(stripped)
                existing_paths.add(rel_path)
            elif rel_path not in valid_paths:
                emit_missing_visual()
            continue
        if 'IMAGE_LINK_' in stripped:
            emit_missing_visual()
            continue
        cleaned_line = IMAGE_LINK_RE.sub(replace_inline_image, line).rstrip()
        if 'IMAGE_LINK_' in cleaned_line:
            emit_missing_visual()
            continue
        if cleaned_line.strip():
            output_lines.append(cleaned_line)

    for record in page_visuals:
        rel_path = str(record.get('path') or '')
        if rel_path and rel_path not in existing_paths:
            output_lines.append(safe_image_markdown(record))
            existing_paths.add(rel_path)
    if saw_break or not any(line.strip() == '</break>' for line in output_lines):
        output_lines.append('</break>')
    return '\n'.join(output_lines).strip()


SPELLCHECK_WORKER_PATH = OUTPUT_DIR / 'spellcheck_worker.py'
spellcheck_worker_py = r"""
import json
import os
import re
import sys
import traceback
from pathlib import Path

os.environ.setdefault('USE_TF', '0')
os.environ.setdefault('TRANSFORMERS_NO_TF', '1')
os.environ.setdefault('USE_FLAX', '0')
os.environ.setdefault('TRANSFORMERS_NO_FLAX', '1')
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')
os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')

PLACEHOLDER_RE = re.compile(r'@@IMAGE_LINK_\d{4}@@')


def strip_code_fence(text):
    text = str(text or '').strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:markdown|md|text)?\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s*```$', '', text)
    return text.strip()


def split_long_text(text, max_chars):
    text = str(text or '')
    if len(text) <= max_chars:
        return [text]
    parts = []
    current = []
    current_len = 0
    for paragraph in re.split(r'(\n\s*\n)', text):
        if current_len + len(paragraph) > max_chars and current:
            parts.append(''.join(current).strip())
            current = []
            current_len = 0
        current.append(paragraph)
        current_len += len(paragraph)
    if current:
        parts.append(''.join(current).strip())
    return [part for part in parts if part]


def load_model(model_name):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float16
    kwargs = {'trust_remote_code': True, 'torch_dtype': dtype, 'device_map': 'auto'}
    try:
        model = AutoModelForCausalLM.from_pretrained(model_name, attn_implementation='sdpa', **kwargs)
    except TypeError:
        model = AutoModelForCausalLM.from_pretrained(model_name, **kwargs)
    model.eval()
    return tokenizer, model


def generate_text(tokenizer, model, protected_markdown, max_new_tokens):
    import torch

    messages = [
        {
            'role': 'system',
            'content': (
                'Bạn là bộ hậu xử lý OCR tiếng Việt cho sách giáo khoa. '
                'Chỉ sửa lỗi OCR, chính tả, dấu tiếng Việt, ký tự rác và lỗi tách từ. '
                'Không thêm kiến thức mới, không diễn giải, không tóm tắt, không đổi số liệu hoặc tên riêng nếu không chắc.'
            ),
        },
        {
            'role': 'user',
            'content': (
                'Sửa đoạn Markdown OCR dưới đây.\n'
                'Yêu cầu bắt buộc:\n'
                '- Giữ nguyên heading Markdown, số thứ tự câu hỏi, `</break>` và placeholder dạng @@IMAGE_LINK_0000@@.\n'
                '- Không xóa hoặc thêm ảnh, không đổi đường dẫn ảnh.\n'
                '- Output duy nhất là Markdown đã sửa, không giải thích.\n\n'
                f'```markdown\n{protected_markdown}\n```'
            ),
        },
    ]
    inputs = tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors='pt',
    ).to(model.device)
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            do_sample=False,
            max_new_tokens=max_new_tokens,
            pad_token_id=tokenizer.eos_token_id,
        )
    generated = outputs[0][inputs['input_ids'].shape[-1]:]
    return strip_code_fence(tokenizer.decode(generated, skip_special_tokens=True))


def correct_text(tokenizer, model, text, max_section_chars, max_new_tokens):
    corrected_parts = []
    for part in split_long_text(text, max_section_chars):
        corrected_parts.append(generate_text(tokenizer, model, part, max_new_tokens))
    return '\n\n'.join(corrected_parts).strip()


manifest_path = Path(sys.argv[1])
out_dir = Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)
model_name = os.environ.get('SPELLCHECK_MODEL', 'Qwen/Qwen2.5-3B-Instruct')
max_section_chars = int(os.environ.get('SPELLCHECK_MAX_SECTION_CHARS', '4200'))
max_new_tokens = int(os.environ.get('SPELLCHECK_MAX_NEW_TOKENS', '4096'))
force = os.environ.get('FORCE_SPELLCHECK', '0') == '1'

print('spellcheck cuda visible =', os.environ.get('CUDA_VISIBLE_DEVICES'))
print('spellcheck model =', model_name)
records = [json.loads(line) for line in manifest_path.read_text(encoding='utf-8').splitlines() if line.strip()]
tokenizer, model = load_model(model_name)

for record in records:
    section_index = int(record['section_index'])
    page_number = int(record['page_number'])
    out_path = out_dir / f'section_{section_index:04d}.json'
    if out_path.exists() and not force:
        print('skip existing spellcheck section', section_index)
        continue
    protected_text = str(record['protected_text'])
    expected_placeholders = PLACEHOLDER_RE.findall(protected_text)
    try:
        corrected = correct_text(tokenizer, model, protected_text, max_section_chars, max_new_tokens)
        missing = [token for token in expected_placeholders if token not in corrected]
        if missing or f'## PDF Page {page_number}' not in corrected:
            payload = {
                'section_index': section_index,
                'page_number': page_number,
                'corrected_protected_text': protected_text,
                'error': 'LLM output failed structure guard; kept raw section.',
                'missing_placeholders': missing,
            }
        else:
            payload = {
                'section_index': section_index,
                'page_number': page_number,
                'corrected_protected_text': corrected,
            }
    except Exception as exc:
        payload = {
            'section_index': section_index,
            'page_number': page_number,
            'corrected_protected_text': protected_text,
            'error': str(exc),
            'traceback': traceback.format_exc(),
        }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print('spellcheck page', page_number, 'error=', payload.get('error'))
    sys.stdout.flush()
"""
SPELLCHECK_WORKER_PATH.write_text(spellcheck_worker_py, encoding='utf-8')


def selected_spellcheck_gpu_ids():
    if SPELLCHECK_GPU_IDS_TO_USE == 'auto':
        ids = [str(gpu_id) for gpu_id in GPU_IDS]
    else:
        ids = [value.strip() for value in SPELLCHECK_GPU_IDS_TO_USE.split(',') if value.strip()]
    return ids[:max(1, SPELLCHECK_MAX_PARALLEL_GPUS)]


def run_spellcheck_workers(records):
    out_dir = OUTPUT_DIR / '_spellcheck_pages'
    out_dir.mkdir(parents=True, exist_ok=True)
    gpu_ids = selected_spellcheck_gpu_ids()
    if not gpu_ids and not ALLOW_CPU_DEEPSEEK:
        raise RuntimeError('No GPU selected for spellcheck LLM.')

    worker_count = len(gpu_ids) if gpu_ids else 1
    shards = [[] for _ in range(worker_count)]
    for idx, record in enumerate(records):
        shards[idx % worker_count].append(record)

    processes = []
    for shard_idx, shard in enumerate(shards):
        if not shard:
            continue
        manifest = MANIFEST_DIR / f'spellcheck_shard_{shard_idx}.jsonl'
        write_jsonl(manifest, shard)
        env = os.environ.copy()
        env['USE_TF'] = '0'
        env['TRANSFORMERS_NO_TF'] = '1'
        env['USE_FLAX'] = '0'
        env['TRANSFORMERS_NO_FLAX'] = '1'
        env['TF_CPP_MIN_LOG_LEVEL'] = '3'
        env['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'
        env['SPELLCHECK_MODEL'] = SPELLCHECK_MODEL
        env['SPELLCHECK_MAX_SECTION_CHARS'] = str(SPELLCHECK_MAX_SECTION_CHARS)
        env['SPELLCHECK_MAX_NEW_TOKENS'] = str(SPELLCHECK_MAX_NEW_TOKENS)
        env['FORCE_SPELLCHECK'] = '1' if FORCE_SPELLCHECK else '0'
        gpu_label = 'cpu'
        if gpu_ids:
            gpu_label = gpu_ids[shard_idx]
            env['CUDA_VISIBLE_DEVICES'] = gpu_label
        cmd = [sys.executable, str(SPELLCHECK_WORKER_PATH), str(manifest), str(out_dir)]
        print('launch spellcheck shard', shard_idx, 'gpu=', gpu_label, 'sections=', len(shard))
        processes.append(subprocess.Popen(cmd, env=env))

    ok = True
    for process in processes:
        code = process.wait()
        ok = ok and (code == 0)
        print('spellcheck worker exit =', code)
    return ok, out_dir


def section_blocks(section_text, page_no, image_records_by_path):
    blocks = []
    order = 0
    for raw_line in str(section_text).splitlines():
        line = raw_line.strip()
        if not line or line == '</break>':
            continue
        image_match = IMAGE_LINK_RE.fullmatch(line)
        if image_match:
            rel_path = image_match.group(2)
            source_record = image_records_by_path.get(rel_path)
            if not source_record:
                continue
            record = dict(source_record)
            record['order'] = order
            record['page'] = page_no
            record['page_number'] = page_no
            blocks.append(record)
        else:
            blocks.append({'type': 'text', 'order': order, 'text': raw_line.rstrip(), 'page': page_no, 'page_number': page_no, 'source': 'spellcheck' if RUN_LLM_SPELLCHECK else 'deepseek-ocr'})
        order += 1
    return blocks


def rebuild_outputs_from_book(markdown_path, spellcheck_meta):
    text = markdown_path.read_text(encoding='utf-8')
    _, sections = split_page_sections(text)
    image_records_by_path = {str(record.get('path')): record for record in image_records if record.get('path')}
    layout_pages_by_no = {int(page.get('page_number')): page for page in page_records}
    rebuilt_pages = []
    rebuilt_blocks = []
    rebuilt_rag = []

    for section in sections:
        page_no = int(section['page_number'])
        layout_page = layout_pages_by_no.get(page_no, {})
        blocks = section_blocks(section['text'], page_no, image_records_by_path)
        page_text = markdown_text_only(section['text'])
        image_refs = [
            {key: block.get(key) for key in ['id', 'path', 'caption_crop_path', 'label', 'caption', 'type']}
            for block in blocks
            if block.get('type') in {'image', 'table'}
        ]
        page_record = {
            'source_pdf': str(INPUT_PDF),
            'page_number': page_no,
            'page_image_path': layout_page.get('page_image_path'),
            'width': layout_page.get('width'),
            'height': layout_page.get('height'),
            'text': page_text,
            'markdown': section['text'],
            'layout_dets': layout_page.get('layout_dets') or [],
            'text_blocks': blocks,
            'images': image_refs,
            'engine': {'layout': 'pdf_extract_kit_doclayout_yolo', 'ocr': 'deepseek-ocr', 'post_ocr': 'qwen_spellcheck' if spellcheck_meta.get('applied') else 'none'},
        }
        rebuilt_pages.append(page_record)
        (METADATA_DIR / 'pages' / f'page_{page_no:03d}.json').write_text(json.dumps(page_record, ensure_ascii=False, indent=2), encoding='utf-8')
        for block in blocks:
            block_record = dict(block)
            block_record['page_number'] = page_no
            rebuilt_blocks.append(block_record)
        for idx, chunk in enumerate(chunk_text(page_text), start=1):
            rebuilt_rag.append({
                'chunk_id': f'page_{page_no:03d}_{idx:02d}',
                'source_pdf': str(INPUT_PDF),
                'page_number': page_no,
                'text': chunk,
                'images': image_refs,
                'engine': 'pdf_extract_kit_doclayout_yolo+deepseek_ocr+qwen_spellcheck' if spellcheck_meta.get('applied') else 'pdf_extract_kit_doclayout_yolo+deepseek_ocr',
            })

    (METADATA_DIR / 'blocks.jsonl').write_text('\n'.join(json.dumps(x, ensure_ascii=False) for x in rebuilt_blocks) + ('\n' if rebuilt_blocks else ''), encoding='utf-8')
    (OUTPUT_DIR / 'rag_chunks.jsonl').write_text('\n'.join(json.dumps(x, ensure_ascii=False) for x in rebuilt_rag) + ('\n' if rebuilt_rag else ''), encoding='utf-8')
    summary_path = METADATA_DIR / 'book.json'
    summary = json.loads(summary_path.read_text(encoding='utf-8')) if summary_path.exists() else {}
    summary['spellcheck'] = spellcheck_meta
    summary.setdefault('stats', {})
    summary['stats']['blocks'] = len(rebuilt_blocks)
    summary['stats']['rag_chunks'] = len(rebuilt_rag)
    summary['stats']['pages_after_rebuild'] = len(rebuilt_pages)
    summary.setdefault('outputs', {})
    summary['outputs']['raw_markdown'] = 'book_raw_ocr.md'
    summary['outputs']['corrected_markdown'] = 'book_corrected.md'
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    return rebuilt_pages, rebuilt_blocks, rebuilt_rag


spellcheck_meta = {'enabled': RUN_LLM_SPELLCHECK, 'applied': False, 'model': SPELLCHECK_MODEL if RUN_LLM_SPELLCHECK else None, 'errors': []}
if RUN_LLM_SPELLCHECK:
    book_md_path = OUTPUT_DIR / 'book.md'
    raw_md_path = OUTPUT_DIR / 'book_raw_ocr.md'
    corrected_md_path = OUTPUT_DIR / 'book_corrected.md'
    shutil.copy2(book_md_path, raw_md_path)
    preamble, sections = split_page_sections(raw_md_path.read_text(encoding='utf-8'))
    protected_records = []
    placeholders_by_section = {}
    for section in sections:
        protected, placeholders = protect_markdown_lines(section['text'])
        placeholders_by_section[int(section['section_index'])] = placeholders
        protected_records.append({**section, 'protected_text': protected})

    ok, spellcheck_out_dir = run_spellcheck_workers(protected_records)
    if not ok and SPELLCHECK_STRICT:
        raise RuntimeError('Spellcheck worker failed.')
    if not ok:
        spellcheck_meta['errors'].append({'stage': 'worker', 'error': 'worker exited non-zero; kept raw OCR markdown'})
    else:
        corrected_sections = []
        for record in protected_records:
            section_index = int(record['section_index'])
            page_number = int(record['page_number'])
            result_path = spellcheck_out_dir / f'section_{section_index:04d}.json'
            if result_path.exists():
                payload = json.loads(result_path.read_text(encoding='utf-8'))
                protected_text = str(payload.get('corrected_protected_text') or record['protected_text'])
                if payload.get('error'):
                    spellcheck_meta['errors'].append({'page_number': page_number, 'error': payload.get('error')})
            else:
                protected_text = str(record['protected_text'])
                spellcheck_meta['errors'].append({'page_number': page_number, 'error': 'missing spellcheck output'})
            restored = restore_markdown_lines(protected_text, placeholders_by_section.get(section_index, {}))
            if f'## PDF Page {page_number}' not in restored:
                restored = record['text']
                spellcheck_meta['errors'].append({'page_number': page_number, 'error': 'missing page heading after restore; kept raw section'})
            restored = sanitize_and_complete_section(restored, page_number)
            corrected_sections.append(restored.strip())

        corrected_markdown = (preamble + '\n\n'.join(corrected_sections)).strip() + '\n'
        corrected_md_path.write_text(corrected_markdown, encoding='utf-8')
        if SPELLCHECK_OVERWRITE_BOOK_MD:
            book_md_path.write_text(corrected_markdown, encoding='utf-8')
            spellcheck_meta['applied'] = True
    spellcheck_meta['error_count'] = len(spellcheck_meta['errors'])
else:
    print('RUN_LLM_SPELLCHECK=False, skip post-OCR correction.')

if spellcheck_meta.get('applied'):
    page_records, block_records, rag_records = rebuild_outputs_from_book(OUTPUT_DIR / 'book.md', spellcheck_meta)
    print('rebuilt pages =', len(page_records), 'rag chunks =', len(rag_records))
else:
    summary_path = METADATA_DIR / 'book.json'
    if summary_path.exists():
        summary = json.loads(summary_path.read_text(encoding='utf-8'))
        summary['spellcheck'] = spellcheck_meta
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print('spellcheck applied =', spellcheck_meta.get('applied'), 'errors =', spellcheck_meta.get('error_count', 0))
'''


QUALITY_AUDIT_CELL = r'''# Phase 1 quality audit: không thay đổi dữ liệu, chỉ ghi report để kiểm tra nhanh.
def find_image_links(markdown):
    return IMAGE_LINK_RE.findall(markdown)


def page_text_lengths(markdown):
    _, sections = split_page_sections(markdown)
    lengths = []
    for section in sections:
        lengths.append({'page_number': int(section['page_number']), 'chars': len(markdown_text_only(section['text']))})
    return lengths


def duplicate_values(values):
    seen = set()
    dupes = set()
    for value in values:
        if value in seen:
            dupes.add(value)
        seen.add(value)
    return sorted(dupes)


book_md = OUTPUT_DIR / 'book.md'
markdown = book_md.read_text(encoding='utf-8') if book_md.exists() else ''
image_links = find_image_links(markdown)
broken_links = []
for _, rel_path in image_links:
    if not (OUTPUT_DIR / rel_path).exists():
        broken_links.append(rel_path)

image_ids = [str(record.get('id')) for record in image_records if record.get('id')]
lengths = page_text_lengths(markdown)
empty_pages = [item['page_number'] for item in lengths if item['chars'] == 0]
short_pages = [item for item in lengths if 0 < item['chars'] < MIN_PAGE_TEXT_CHARS]
none_like_pages = []
for section in split_page_sections(markdown)[1]:
    text_only = markdown_text_only(section['text']).strip().lower()
    if text_only in {'none', 'null', 'nan'}:
        none_like_pages.append(int(section['page_number']))
empty_page_ratio = len(empty_pages) / max(1, len(lengths))
short_page_ratio = len(short_pages) / max(1, len(lengths))
deepseek_errors = []
for path in sorted(DEEPSEEK_OUT_DIR.glob('page_*.json')):
    payload = json.loads(path.read_text(encoding='utf-8'))
    if payload.get('error'):
        deepseek_errors.append({'page_number': payload.get('page_number'), 'error': payload.get('error')})

rag_path = OUTPUT_DIR / 'rag_chunks.jsonl'
rag_count = len([line for line in rag_path.read_text(encoding='utf-8').splitlines() if line.strip()]) if rag_path.exists() else 0
block_ocr_expected = len(text_ocr_records) if 'text_ocr_records' in globals() else 0
block_ocr_outputs_count = len(block_ocr_outputs) if 'block_ocr_outputs' in globals() else 0
block_ocr_with_text = block_text_count if 'block_text_count' in globals() else 0
block_ocr_text_coverage = block_ocr_with_text / max(1, block_ocr_expected)
quality_report = {
    'generated_at': datetime.now(timezone.utc).isoformat(),
    'pages_expected': len(page_images),
    'pages_in_markdown': len(lengths),
    'image_records': len(image_records),
    'image_links_in_markdown': len(image_links),
    'broken_image_links': broken_links,
    'duplicate_image_ids': duplicate_values(image_ids),
    'empty_pages': empty_pages,
    'short_pages': short_pages,
    'none_like_pages': none_like_pages,
    'empty_page_ratio': empty_page_ratio,
    'short_page_ratio': short_page_ratio,
    'deepseek_errors': deepseek_errors,
    'block_ocr_expected': block_ocr_expected,
    'block_ocr_outputs': block_ocr_outputs_count,
    'block_ocr_with_text': block_ocr_with_text,
    'block_ocr_text_coverage': block_ocr_text_coverage,
    'rag_chunks': rag_count,
    'spellcheck': spellcheck_meta if 'spellcheck_meta' in globals() else {'enabled': False},
}
quality_report['passed'] = not (
    broken_links
    or quality_report['pages_in_markdown'] != quality_report['pages_expected']
    or deepseek_errors
    or quality_report['duplicate_image_ids']
    or none_like_pages
    or (QUALITY_FAIL_ON_EMPTY_TEXT and empty_page_ratio > MAX_EMPTY_PAGE_RATIO)
    or short_page_ratio > MAX_SHORT_PAGE_RATIO
    or (RUN_BLOCK_OCR and block_ocr_expected > 0 and block_ocr_text_coverage < MIN_BLOCK_OCR_TEXT_COVERAGE)
)

(METADATA_DIR / 'quality_report.json').write_text(json.dumps(quality_report, ensure_ascii=False, indent=2), encoding='utf-8')
quality_lines = [
    '# Phase 1 Quality Report',
    '',
    f"- passed: `{quality_report['passed']}`",
    f"- pages: `{quality_report['pages_in_markdown']}/{quality_report['pages_expected']}`",
    f"- image records: `{quality_report['image_records']}`",
    f"- image links in markdown: `{quality_report['image_links_in_markdown']}`",
    f"- broken image links: `{len(broken_links)}`",
    f"- empty pages: `{len(empty_pages)}`",
    f"- short pages: `{len(short_pages)}`",
    f"- none-like pages: `{len(none_like_pages)}`",
    f"- empty page ratio: `{empty_page_ratio:.1%}`",
    f"- short page ratio: `{short_page_ratio:.1%}`",
    f"- block OCR text coverage: `{block_ocr_text_coverage:.1%}`",
    f"- block OCR: `{block_ocr_with_text}/{block_ocr_expected}` with text, outputs `{block_ocr_outputs_count}`",
    f"- DeepSeek errors: `{len(deepseek_errors)}`",
    f"- RAG chunks: `{rag_count}`",
]
(METADATA_DIR / 'quality_report.md').write_text('\n'.join(quality_lines) + '\n', encoding='utf-8')
summary_path = METADATA_DIR / 'book.json'
if summary_path.exists():
    summary = json.loads(summary_path.read_text(encoding='utf-8'))
    summary['quality_report'] = quality_report
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(quality_report, ensure_ascii=False, indent=2))
if QUALITY_STRICT and not quality_report['passed']:
    raise RuntimeError('Quality audit failed. Xem metadata/quality_report.json.')
'''


LEAN_ZIP_CELL = r'''# Tạo package gọn để tải về: không zip model, repo clone, page render và worker outputs nặng.
def should_include_in_package(path):
    rel = path.relative_to(OUTPUT_DIR)
    parts = rel.parts
    if not parts:
        return False
    top = parts[0]
    if top in {'_PDF-Extract-Kit', '_models_pdf_extract_kit', '_manifests'}:
        return False
    if top == 'pages' and not INCLUDE_RENDERED_PAGES_IN_ZIP:
        return False
    if top == 'text_crops' and not INCLUDE_RAW_WORKER_OUTPUTS_IN_ZIP:
        return False
    if top in {'_deepseek_pages', '_spellcheck_pages'} and not INCLUDE_RAW_WORKER_OUTPUTS_IN_ZIP:
        return False
    if top == '_deepseek_blocks' and not INCLUDE_RAW_WORKER_OUTPUTS_IN_ZIP:
        return False
    if len(parts) >= 2 and parts[0] == '_previews' and parts[1] == 'layout_boxes' and not INCLUDE_LAYOUT_BOXES_IN_ZIP:
        return False
    if path.suffix in {'.pt', '.pth', '.onnx', '.safetensors'}:
        return False
    if '__pycache__' in parts:
        return False
    return True


zip_path = OUTPUT_DIR.with_suffix('.zip')
if ZIP_OUTPUT:
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(OUTPUT_DIR.rglob('*')):
            if path.is_file() and should_include_in_package(path):
                archive.write(path, path.relative_to(OUTPUT_DIR.parent))
    print('lean zip:', zip_path, zip_path.stat().st_size)

try:
    from IPython.display import display, Image as IPImage
    contact = PREVIEW_DIR / 'images_contact.jpg'
    layout_files = sorted(LAYOUT_VIS_DIR.glob('*_layout.jpg'))
    if contact.exists():
        display(IPImage(filename=str(contact)))
    if layout_files:
        display(IPImage(filename=str(layout_files[0])))
except Exception as exc:
    print(exc)

if DELETE_INTERMEDIATE_DIRS_AFTER_ZIP:
    for rel in ['pages', 'text_crops', '_manifests', '_deepseek_pages', '_deepseek_blocks', '_spellcheck_pages']:
        target = OUTPUT_DIR / rel
        if target.exists():
            shutil.rmtree(target, ignore_errors=True)
            print('deleted intermediate:', target)
    layout_dir = PREVIEW_DIR / 'layout_boxes'
    if layout_dir.exists() and not INCLUDE_LAYOUT_BOXES_IN_ZIP:
        shutil.rmtree(layout_dir, ignore_errors=True)
        print('deleted intermediate:', layout_dir)

if DELETE_SHARED_CACHE_AFTER_RUN and CACHE_DIR.exists():
    shutil.rmtree(CACHE_DIR, ignore_errors=True)
    print('deleted shared cache:', CACHE_DIR)

print('\nImportant files:')
for rel in [
    'book.md',
    'book_raw_ocr.md',
    'book_corrected.md',
    'book.docx',
    'rag_chunks.jsonl',
    'metadata/book.json',
    'metadata/images.json',
    'metadata/layout_detections.json',
    'metadata/quality_report.json',
    '_previews/images_contact.jpg',
]:
    path = OUTPUT_DIR / rel
    print(rel, 'OK' if path.exists() else 'MISSING', path.stat().st_size if path.exists() else '')

print('\nFinal output directory:')
print(OUTPUT_DIR)
print('Download zip:')
print(zip_path)
'''


def patch_config_cell(source: str) -> str:
    source = source.replace(
        "OUTPUT_DIR = Path('/kaggle/working/class_6_pdf_extract_kit_deepseek') if Path('/kaggle/working').exists() else Path('extracted/class_6_pdf_extract_kit_deepseek')",
        "BASE_OUTPUT_DIR = Path('/kaggle/working/class_6_phase1_full') if Path('/kaggle/working').exists() else Path('extracted/class_6_phase1_full')\n"
        "CACHE_DIR = Path('/kaggle/working/_phase1_shared_cache') if Path('/kaggle/working').exists() else Path('extracted/_phase1_shared_cache')\n"
        "OUTPUT_DIR = BASE_OUTPUT_DIR",
    )
    source = source.replace(
        "RENDER_SCALE = 2.0\n",
        "RENDER_SCALE = 2.0\n\n"
        "END_PAGE_LABEL = 'end' if END_PAGE is None else f'{END_PAGE:03d}'\n"
        "PART_NAME = f'pages_{START_PAGE:03d}_{END_PAGE_LABEL}'\n"
        "OUTPUT_DIR = BASE_OUTPUT_DIR / PART_NAME\n"
        "KIT_DIR = CACHE_DIR / 'PDF-Extract-Kit'\n"
        "MODEL_DIR = CACHE_DIR / 'models_pdf_extract_kit'\n"
        "PAGES_DIR = OUTPUT_DIR / 'pages'\n"
        "IMAGES_DIR = OUTPUT_DIR / 'images'\n"
        "CAPTIONS_DIR = OUTPUT_DIR / 'caption_crops'\n"
        "TEXT_CROPS_DIR = OUTPUT_DIR / 'text_crops'\n"
        "METADATA_DIR = OUTPUT_DIR / 'metadata'\n"
        "PREVIEW_DIR = OUTPUT_DIR / '_previews'\n"
        "LAYOUT_VIS_DIR = PREVIEW_DIR / 'layout_boxes'\n"
        "DEEPSEEK_OUT_DIR = OUTPUT_DIR / '_deepseek_pages'\n"
        "BLOCK_OCR_OUT_DIR = OUTPUT_DIR / '_deepseek_blocks'\n"
        "MANIFEST_DIR = OUTPUT_DIR / '_manifests'\n",
    )
    source = source.replace(
        "MIN_BLOCK_TEXT_CHARS = 2\n\nZIP_OUTPUT = True",
        "MIN_BLOCK_TEXT_CHARS = 2\n"
        "MIN_BLOCK_OCR_TEXT_COVERAGE = 0.55\n\n"
        "RUN_LLM_SPELLCHECK = False  # Layout-first mặc định tắt để không làm xáo trộn thứ tự bbox.\n"
        "SPELLCHECK_MODEL = 'Qwen/Qwen2.5-3B-Instruct'\n"
        "SPELLCHECK_MAX_SECTION_CHARS = 4200\n"
        "SPELLCHECK_MAX_NEW_TOKENS = 4096\n"
        "SPELLCHECK_GPU_IDS_TO_USE = 'auto'\n"
        "SPELLCHECK_MAX_PARALLEL_GPUS = 1  # Khi ổn có thể đổi 2 trên T4 x2.\n"
        "SPELLCHECK_OVERWRITE_BOOK_MD = True\n"
        "SPELLCHECK_STRICT = False\n"
        "FORCE_SPELLCHECK = False\n\n"
        "MIN_PAGE_TEXT_CHARS = 80\n"
        "MAX_SHORT_PAGE_RATIO = 0.35\n"
        "MAX_EMPTY_PAGE_RATIO = 0.15\n"
        "QUALITY_FAIL_ON_EMPTY_TEXT = True\n"
        "QUALITY_STRICT = True\n\n"
        "INCLUDE_RENDERED_PAGES_IN_ZIP = False\n"
        "INCLUDE_LAYOUT_BOXES_IN_ZIP = False\n"
        "INCLUDE_RAW_WORKER_OUTPUTS_IN_ZIP = False\n"
        "DELETE_INTERMEDIATE_DIRS_AFTER_ZIP = True\n"
        "DELETE_SHARED_CACHE_AFTER_RUN = False\n\n"
        "ZIP_OUTPUT = True",
    )
    source = source.replace(
        "for directory in [OUTPUT_DIR, MODEL_DIR, PAGES_DIR, IMAGES_DIR, CAPTIONS_DIR, TEXT_CROPS_DIR, METADATA_DIR, PREVIEW_DIR, LAYOUT_VIS_DIR, DEEPSEEK_OUT_DIR, BLOCK_OCR_OUT_DIR, MANIFEST_DIR]:",
        "for directory in [BASE_OUTPUT_DIR, CACHE_DIR, OUTPUT_DIR, MODEL_DIR, PAGES_DIR, IMAGES_DIR, CAPTIONS_DIR, TEXT_CROPS_DIR, METADATA_DIR, PREVIEW_DIR, LAYOUT_VIS_DIR, DEEPSEEK_OUT_DIR, BLOCK_OCR_OUT_DIR, MANIFEST_DIR]:",
    )
    return source


def patch_install_cell(source: str) -> str:
    source = source.replace(
        "if RUN_DEEPSEEK_OCR:\n    # DeepSeek-OCR deps. Không cài torch/torchvision để tránh kéo lệch CUDA stack của Kaggle.",
        "if RUN_DEEPSEEK_OCR or RUN_LLM_SPELLCHECK:\n    # DeepSeek-OCR/Qwen deps. Không cài torch/torchvision để tránh kéo lệch CUDA stack của Kaggle.",
    )
    return source


def make_notebook() -> dict[str, object]:
    nb = json.loads(BASE.read_text(encoding="utf-8"))
    cells = deepcopy(nb["cells"])
    cells[0] = md(
        """# Phase 1 Kaggle Full - PDF-Extract-Kit + DeepSeek-OCR + Qwen Correction

Pipeline đầy đủ cho Phase 1: render PDF, detect layout bằng PDF-Extract-Kit/DocLayout-YOLO, crop ảnh/bảng/caption, OCR tiếng Việt bằng DeepSeek-OCR, hậu xử lý lỗi OCR bằng Qwen local, rebuild `book.md`, `book.docx`, `rag_chunks.jsonl`, metadata và quality report."""
    )
    cells[1] = code(patch_config_cell("".join(cells[1]["source"])))
    cells[2] = code(patch_install_cell("".join(cells[2]["source"])))
    combined_idx = next(
        idx for idx, cell in enumerate(cells)
        if cell.get("cell_type") == "code" and "layout_page_records = list(page_records)" in "".join(cell.get("source", []))
    )
    cells.insert(combined_idx + 1, code(SPELLCHECK_CELL))
    cells.insert(combined_idx + 2, code(QUALITY_AUDIT_CELL))
    cells[-1] = code(LEAN_ZIP_CELL)
    nb["cells"] = cells
    return nb


def main() -> None:
    if not BASE.exists():
        raise FileNotFoundError(f"Run create_pdf_extract_kit_deepseek_notebook.py first: {BASE}")
    nb = make_notebook()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
