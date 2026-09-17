from __future__ import annotations

import ast
import json
from copy import deepcopy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "notebooks" / "phase1_kaggle_pdf_extract_kit_layout.ipynb"
OUT = ROOT / "notebooks" / "phase1_kaggle_pdf_extract_kit_deepseek.ipynb"


def md(source: str) -> dict[str, object]:
    return {"cell_type": "markdown", "metadata": {}, "source": source.splitlines(keepends=True)}


def code(source: str) -> dict[str, object]:
    ast.parse(source)
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": source.splitlines(keepends=True),
    }


DEEPSEEK_WORKER_CELL = r'''WORKER_PATH = OUTPUT_DIR / 'deepseek_ocr_worker.py'
worker_py = r"""
import json
import os
import shutil
import sys
import traceback
from pathlib import Path

os.environ.setdefault('USE_TF', '0')
os.environ.setdefault('TRANSFORMERS_NO_TF', '1')
os.environ.setdefault('USE_FLAX', '0')
os.environ.setdefault('TRANSFORMERS_NO_FLAX', '1')
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')
os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')

import torch
from transformers import AutoModel, AutoTokenizer

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

if not torch.cuda.is_available():
    # DeepSeek-OCR remote code hard-calls `.cuda()` inside infer().
    # CPU mode is unofficial; this monkey patch makes a local benchmark/run possible.
    torch.Tensor.cuda = lambda self, *args, **kwargs: self
    torch.nn.Module.cuda = lambda self, *args, **kwargs: self

manifest_path = Path(sys.argv[1])
out_dir = Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)

model_name = os.environ.get('DEEPSEEK_MODEL', 'deepseek-ai/DeepSeek-OCR')
prompt = os.environ.get('DEEPSEEK_PROMPT', '<image>\n<|grounding|>Convert the document to markdown.')
attn_impl = os.environ.get('DEEPSEEK_ATTN_IMPL', 'eager')
base_size = int(os.environ.get('DEEPSEEK_BASE_SIZE', '1024'))
image_size = int(os.environ.get('DEEPSEEK_IMAGE_SIZE', '640'))
crop_mode = os.environ.get('DEEPSEEK_CROP_MODE', '1') == '1'
test_compress = os.environ.get('DEEPSEEK_TEST_COMPRESS', '1') == '1'
save_results = os.environ.get('DEEPSEEK_SAVE_RESULTS', '1') == '1'
cpu_bfloat16 = os.environ.get('DEEPSEEK_CPU_BFLOAT16', '1') == '1'
force = os.environ.get('FORCE_DEEPSEEK', '0') == '1'

print('worker cuda visible =', os.environ.get('CUDA_VISIBLE_DEVICES'))
print('torch =', torch.__version__, 'cuda =', torch.cuda.is_available())
if torch.cuda.is_available():
    print('device =', torch.cuda.get_device_name(0))
    free, total = torch.cuda.mem_get_info(0)
    print(f'gpu memory before load: free={free/1024**3:.2f}GB total={total/1024**3:.2f}GB')

records = [json.loads(line) for line in manifest_path.read_text(encoding='utf-8').splitlines() if line.strip()]

tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
load_kwargs = {
    'trust_remote_code': True,
    'use_safetensors': True,
    '_attn_implementation': attn_impl,
    'low_cpu_mem_usage': True,
}
try:
    model = AutoModel.from_pretrained(model_name, **load_kwargs)
except TypeError:
    load_kwargs.pop('low_cpu_mem_usage', None)
    model = AutoModel.from_pretrained(model_name, **load_kwargs)
except Exception as exc:
    if 'attn' not in str(exc).lower() and 'attention' not in str(exc).lower():
        raise
    load_kwargs.pop('_attn_implementation', None)
    model = AutoModel.from_pretrained(model_name, **load_kwargs)

dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float16
if torch.cuda.is_available():
    model = model.eval().cuda().to(dtype)
    free, total = torch.cuda.mem_get_info(0)
    print(f'gpu memory after load: free={free/1024**3:.2f}GB total={total/1024**3:.2f}GB dtype={dtype}')
else:
    model = model.eval()
    if cpu_bfloat16:
        model = model.to(torch.bfloat16)


TEXT_FILE_SUFFIXES = {'.md', '.mmd', '.markdown', '.txt'}


def is_meaningful_text(value):
    text = str(value or '').strip()
    return bool(text) and text.lower() not in {'none', 'null', 'nan'}


def read_saved_markdown(raw_dir):
    candidates = [
        path for path in raw_dir.rglob('*')
        if path.is_file() and path.suffix.lower() in TEXT_FILE_SUFFIXES
    ]
    candidates.sort(key=lambda path: (path.stat().st_mtime, path.stat().st_size), reverse=True)
    for path in candidates:
        try:
            text = path.read_text(encoding='utf-8', errors='ignore').strip()
        except Exception:
            continue
        if is_meaningful_text(text):
            return text, path
    return '', None


def result_to_markdown(result, raw_dir):
    if isinstance(result, str) and is_meaningful_text(result):
        return result, 'return:string'
    if isinstance(result, dict):
        text = result.get('text') or result.get('markdown') or result.get('content')
        if is_meaningful_text(text):
            return str(text), 'return:dict'
        fallback = json.dumps(result, ensure_ascii=False)
        if is_meaningful_text(fallback) and fallback != '{}':
            return fallback, 'return:dict-json'

    saved_text, saved_path = read_saved_markdown(raw_dir)
    if saved_text:
        return saved_text, f'saved:{saved_path.name}'
    if result is not None and is_meaningful_text(result):
        return str(result), 'return:other'
    return '', 'empty'


for record in records:
    page_no = int(record['page_number'])
    image_file = str(record['path'])
    record_type = str(record.get('record_type') or 'page')
    record_id = str(record.get('record_id') or f'page_{page_no:03d}')
    result_name = str(record.get('result_name') or f'{record_id}.json')
    result_path = out_dir / result_name
    if result_path.exists() and not force:
        print('skip existing record', record_id)
        continue
    raw_dir = out_dir / f'raw_{record_id}'
    if raw_dir.exists() and force:
        shutil.rmtree(raw_dir, ignore_errors=True)
    raw_dir.mkdir(parents=True, exist_ok=True)
    try:
        infer_kwargs = dict(
            prompt=prompt,
            image_file=image_file,
            output_path=str(raw_dir),
            base_size=base_size,
            image_size=image_size,
            crop_mode=crop_mode,
            test_compress=test_compress,
        )
        try:
            # Page OCR may need save_results=True to write Markdown files. For tiny block crops,
            # save_results=True can hit DeepSeek's grounding postprocess with zero image tokens.
            result = model.infer(tokenizer, save_results=save_results, **infer_kwargs)
        except TypeError:
            result = model.infer(tokenizer, **infer_kwargs)
        markdown, markdown_source = result_to_markdown(result, raw_dir)
        payload = {
            'record_id': record_id,
            'record_type': record_type,
            'page_number': page_no,
            'page_image_path': image_file,
            'markdown': markdown,
            'markdown_source': markdown_source,
            'raw_output_dir': str(raw_dir),
            'engine': 'deepseek-ocr',
        }
        for key in ['block_id', 'bbox', 'category_type', 'layout_type', 'order', 'det_index']:
            if key in record:
                payload[key] = record.get(key)
        if not is_meaningful_text(markdown):
            payload['error'] = 'DeepSeek returned no markdown text. Check raw_output_dir.'
    except torch.cuda.OutOfMemoryError as exc:
        payload = {
            'record_id': record_id,
            'record_type': record_type,
            'page_number': page_no,
            'page_image_path': image_file,
            'markdown': '',
            'engine': 'deepseek-ocr',
            'error': 'CUDA OutOfMemoryError: ' + str(exc),
            'traceback': traceback.format_exc(),
        }
        result_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
        print('OOM on page', page_no)
        raise
    except Exception as exc:
        payload = {
            'record_id': record_id,
            'record_type': record_type,
            'page_number': page_no,
            'page_image_path': image_file,
            'markdown': '',
            'engine': 'deepseek-ocr',
            'error': str(exc),
            'traceback': traceback.format_exc(),
        }
    result_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print('done', record_type, record_id, 'chars=', len(payload.get('markdown') or ''), 'error=', payload.get('error'))
    sys.stdout.flush()
"""
WORKER_PATH.write_text(worker_py, encoding='utf-8')
print(WORKER_PATH)
'''


TEXT_BLOCK_PREP_CELL = r'''# Chuẩn layout-first: crop từng text/caption/table block từ bbox của DocLayout-YOLO.
TEXT_BLOCK_TYPES = set(TEXT_OCR_TYPES)
TEXT_BLOCK_MANIFEST = MANIFEST_DIR / 'deepseek_text_blocks.jsonl'


def bbox_iou(a, b):
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    inter = max(0.0, ix1 - ix0) * max(0.0, iy1 - iy0)
    if inter <= 0:
        return 0.0
    return inter / max(1.0, bbox_area(a) + bbox_area(b) - inter)


def bbox_containment(a, b):
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    inter = max(0.0, ix1 - ix0) * max(0.0, iy1 - iy0)
    return inter / max(1.0, min(bbox_area(a), bbox_area(b)))


def block_priority(block):
    priority = {
        'title': 6,
        'table_caption': 5,
        'figure_caption': 5,
        'plain text': 4,
        'table': 3,
        'table_footnote': 2,
        'formula_caption': 1,
    }
    return priority.get(block.get('category_type') or block.get('type'), 0)


def dedupe_layout_text_candidates(blocks):
    candidates = []
    for block in blocks:
        layout_type = block.get('category_type') or block.get('type')
        if layout_type not in TEXT_BLOCK_TYPES:
            continue
        bbox = block.get('bbox')
        if not bbox or bbox_area(bbox) <= 0:
            continue
        candidate = dict(block)
        keep = True
        for index, existing in list(enumerate(candidates)):
            overlap = max(bbox_iou(candidate['bbox'], existing['bbox']), bbox_containment(candidate['bbox'], existing['bbox']))
            if overlap < 0.82:
                continue
            cand_score = (block_priority(candidate), float(candidate.get('score') or 0))
            exist_score = (block_priority(existing), float(existing.get('score') or 0))
            if cand_score > exist_score:
                candidates[index] = candidate
            keep = False
            break
        if keep:
            candidates.append(candidate)
    return sorted(candidates, key=lambda b: ((b.get('bbox') or [0, 0, 0, 0])[1], (b.get('bbox') or [0, 0, 0, 0])[0]))


def matching_layout_block(page_blocks, candidate):
    cand_bbox = candidate.get('bbox') or []
    cand_type = candidate.get('category_type') or candidate.get('type')
    best = None
    best_score = -1
    for block in page_blocks:
        if (block.get('category_type') or block.get('type')) != cand_type:
            continue
        bbox = block.get('bbox') or []
        if not bbox:
            continue
        score = max(bbox_iou(cand_bbox, bbox), bbox_containment(cand_bbox, bbox))
        if score > best_score:
            best = block
            best_score = score
    return best if best_score >= 0.82 else None


def normalize_text_crop(crop):
    crop = crop.convert('RGB')
    width, height = crop.size
    if width <= 0 or height <= 0:
        return crop
    scale = max(TEXT_CROP_MIN_WIDTH / max(1, width), TEXT_CROP_MIN_HEIGHT / max(1, height), 1.0)
    scale = min(scale, TEXT_CROP_MAX_UPSCALE)
    if scale > 1.01:
        new_size = (max(1, int(round(width * scale))), max(1, int(round(height * scale))))
        crop = crop.resize(new_size, Image.Resampling.LANCZOS)
        width, height = crop.size
    canvas_w = max(width, TEXT_CROP_MIN_WIDTH)
    canvas_h = max(height, TEXT_CROP_MIN_HEIGHT)
    if canvas_w != width or canvas_h != height:
        canvas = Image.new('RGB', (canvas_w, canvas_h), 'white')
        canvas.paste(crop, ((canvas_w - width) // 2, (canvas_h - height) // 2))
        crop = canvas
    return crop


text_ocr_records = []
for page in page_records:
    page_no = int(page['page_number'])
    page_image_path = OUTPUT_DIR / page['page_image_path']
    image = Image.open(page_image_path).convert('RGB')
    width, height = image.size
    min_text_area = width * height * MIN_TEXT_CROP_AREA_RATIO
    page_blocks = page.get('text_blocks') or []
    text_candidates = [
        candidate for candidate in dedupe_layout_text_candidates(page_blocks)
        if bbox_area(candidate['bbox']) >= min_text_area
    ]
    for idx, candidate in enumerate(text_candidates, start=1):
        layout_type = candidate.get('category_type') or candidate.get('type')
        safe_type = re.sub(r'[^a-z0-9]+', '_', str(layout_type).lower()).strip('_') or 'text'
        block_id = f'page_{page_no:03d}_block_{idx:03d}_{safe_type}'
        x0, y0, x1, y1 = clamp_bbox(candidate['bbox'], width, height, pad=TEXT_CROP_PAD_PX)
        crop_path = TEXT_CROPS_DIR / f'{block_id}.jpg'
        crop = normalize_text_crop(image.crop((x0, y0, x1, y1)))
        crop.save(crop_path, quality=92)
        target_block = matching_layout_block(page_blocks, candidate) or candidate
        target_block.update({
            'ocr_id': block_id,
            'text_crop_path': crop_path.relative_to(OUTPUT_DIR).as_posix(),
            'layout_type': layout_type,
            'ocr_engine': 'deepseek-ocr-block',
        })
        text_ocr_records.append({
            'record_id': block_id,
            'record_type': 'layout_block',
            'block_id': block_id,
            'page_number': page_no,
            'path': str(crop_path.resolve()),
            'result_name': f'{block_id}.json',
            'bbox': target_block.get('bbox'),
            'category_type': layout_type,
            'layout_type': layout_type,
            'order': target_block.get('order'),
            'det_index': target_block.get('det_index'),
        })

TEXT_BLOCK_MANIFEST.write_text('\n'.join(json.dumps(record, ensure_ascii=False) for record in text_ocr_records) + ('\n' if text_ocr_records else ''), encoding='utf-8')
(METADATA_DIR / 'text_ocr_manifest.jsonl').write_text(TEXT_BLOCK_MANIFEST.read_text(encoding='utf-8'), encoding='utf-8')
(METADATA_DIR / 'layout_detections.json').write_text(json.dumps(page_records, ensure_ascii=False, indent=2), encoding='utf-8')
(METADATA_DIR / 'blocks.jsonl').write_text('\n'.join(json.dumps(x, ensure_ascii=False) for x in block_records) + ('\n' if block_records else ''), encoding='utf-8')
print('text/table blocks for OCR:', len(text_ocr_records))
print('manifest:', TEXT_BLOCK_MANIFEST)
'''


DEEPSEEK_RUNNER_CELL = r'''def selected_gpu_ids():
    if GPU_IDS_TO_USE == 'auto':
        ids = GPU_IDS[:]
    else:
        ids = [int(value.strip()) for value in GPU_IDS_TO_USE.split(',') if value.strip()]
    ids = ids[:max(1, MAX_PARALLEL_GPUS)]
    return ids


def write_jsonl(path, records):
    path.write_text('\n'.join(json.dumps(record, ensure_ascii=False) for record in records) + ('\n' if records else ''), encoding='utf-8')


def run_deepseek_records(records, out_dir, manifest_prefix, prompt, base_size, image_size, crop_mode, test_compress, save_results, force, enabled=True):
    if not enabled:
        print(manifest_prefix, 'disabled, skip.')
        return False
    if not records:
        print(manifest_prefix, 'has no records, skip.')
        return False

    gpu_ids = selected_gpu_ids()
    if not gpu_ids and not ALLOW_CPU_DEEPSEEK:
        raise RuntimeError('No GPU selected for DeepSeek-OCR.')

    worker_count = len(gpu_ids) if gpu_ids else 1
    shards = [[] for _ in range(worker_count)]
    for idx, record in enumerate(records):
        shards[idx % worker_count].append(record)

    processes = []
    for shard_idx, shard in enumerate(shards):
        if not shard:
            continue
        manifest = MANIFEST_DIR / f'{manifest_prefix}_shard_{shard_idx}.jsonl'
        write_jsonl(manifest, shard)
        env = os.environ.copy()
        env['USE_TF'] = '0'
        env['TRANSFORMERS_NO_TF'] = '1'
        env['USE_FLAX'] = '0'
        env['TRANSFORMERS_NO_FLAX'] = '1'
        env['TF_CPP_MIN_LOG_LEVEL'] = '3'
        env['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'
        env['DEEPSEEK_MODEL'] = DEEPSEEK_MODEL
        env['DEEPSEEK_PROMPT'] = prompt
        env['DEEPSEEK_ATTN_IMPL'] = DEEPSEEK_ATTN_IMPL
        env['DEEPSEEK_BASE_SIZE'] = str(base_size)
        env['DEEPSEEK_IMAGE_SIZE'] = str(image_size)
        env['DEEPSEEK_CROP_MODE'] = '1' if crop_mode else '0'
        env['DEEPSEEK_TEST_COMPRESS'] = '1' if test_compress else '0'
        env['DEEPSEEK_SAVE_RESULTS'] = '1' if save_results else '0'
        env['DEEPSEEK_CPU_BFLOAT16'] = '1' if DEEPSEEK_CPU_BFLOAT16 else '0'
        env['FORCE_DEEPSEEK'] = '1' if force else '0'
        gpu_label = 'cpu'
        if gpu_ids:
            gpu_label = str(gpu_ids[shard_idx])
            env['CUDA_VISIBLE_DEVICES'] = gpu_label
        cmd = [sys.executable, str(WORKER_PATH), str(manifest), str(out_dir)]
        print('launch', manifest_prefix, 'shard', shard_idx, 'gpu=', gpu_label, 'records=', len(shard))
        processes.append(subprocess.Popen(cmd, env=env))

    ok = True
    for process in processes:
        code = process.wait()
        ok = ok and (code == 0)
        print(manifest_prefix, 'worker exit =', code)
    return ok


page_ocr_records = [
    {
        'record_id': f'page_{int(page["page_number"]):03d}',
        'record_type': 'page',
        'page_number': int(page['page_number']),
        'path': str(Path(page['path']).resolve()),
        'result_name': f'page_{int(page["page_number"]):03d}.json',
    }
    for page in page_images
]

deepseek_block_ok = run_deepseek_records(
    text_ocr_records,
    BLOCK_OCR_OUT_DIR,
    'deepseek_blocks',
    BLOCK_OCR_PROMPT,
    BLOCK_OCR_BASE_SIZE,
    BLOCK_OCR_IMAGE_SIZE,
    BLOCK_OCR_CROP_MODE,
    BLOCK_OCR_TEST_COMPRESS,
    BLOCK_OCR_SAVE_RESULTS,
    FORCE_DEEPSEEK or FORCE_BLOCK_OCR,
    enabled=RUN_DEEPSEEK_OCR and RUN_BLOCK_OCR,
)
deepseek_ok = run_deepseek_records(
    page_ocr_records,
    DEEPSEEK_OUT_DIR,
    'deepseek_pages',
    DEEPSEEK_PROMPT,
    DEEPSEEK_BASE_SIZE,
    DEEPSEEK_IMAGE_SIZE,
    DEEPSEEK_CROP_MODE,
    DEEPSEEK_TEST_COMPRESS,
    PAGE_OCR_SAVE_RESULTS,
    FORCE_DEEPSEEK or FORCE_PAGE_OCR,
    enabled=RUN_DEEPSEEK_OCR and RUN_PAGE_OCR,
)
print('deepseek_ok =', deepseek_ok)
print('deepseek_block_ok =', deepseek_block_ok)
if RUN_DEEPSEEK_OCR and RUN_BLOCK_OCR and not deepseek_block_ok:
    raise RuntimeError('DeepSeek block OCR failed. Xem traceback ở cell output hoặc JSON trong _deepseek_blocks.')
if RUN_DEEPSEEK_OCR and RUN_PAGE_OCR and not deepseek_ok:
    raise RuntimeError('DeepSeek page OCR failed. Xem traceback ở cell output hoặc page_XXX.json trong _deepseek_pages.')
'''


COMBINED_OUTPUT_CELL = r'''import unicodedata

MARKDOWN_IMAGE_LINK_LINE_RE = re.compile(r'^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$')
TEXT_BLOCK_OUTPUT_TYPES = set(TEXT_OCR_TYPES)
VISUAL_OUTPUT_TYPES = {'image', 'table'}


def clean_ocr_block_markdown(value):
    text = str(value or '').strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:markdown|md|text)?\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s*```$', '', text)
    output_lines = []
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped == '</break>':
            continue
        if re.search(r'(?i)\b(do not|do add|preserve|extract only|return only|convert the|change the|add text|add any text)\b', stripped) and not re.search(r'[À-ỹĐđ]', stripped):
            continue
        if MARKDOWN_IMAGE_LINK_LINE_RE.match(stripped):
            continue
        stripped_no_heading = re.sub(r'^#{1,6}\s*', '', stripped)
        if re.fullmatch(r'PDF Page\s+\d+', stripped_no_heading, flags=re.IGNORECASE):
            continue
        if stripped_no_heading.lower() in {'none', 'null', 'nan'}:
            continue
        output_lines.append(line)
    return '\n'.join(output_lines).strip()


def markdown_text_only(text):
    cleaned = clean_ocr_block_markdown(text)
    lines = []
    for line in cleaned.splitlines():
        stripped = line.strip()
        if not stripped or MARKDOWN_IMAGE_LINK_LINE_RE.match(stripped):
            continue
        stripped = re.sub(r'^#{1,6}\s*', '', stripped)
        lines.append(stripped)
    cleaned = clean_text(' '.join(lines))
    return '' if cleaned.strip().lower() in {'none', 'null', 'nan'} else cleaned


def page_ocr_segments(markdown):
    text = clean_ocr_block_markdown(markdown)
    segments = []
    current = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            if current:
                segments.append('\n'.join(current).strip())
                current = []
            continue
        current.append(raw_line.rstrip())
    if current:
        segments.append('\n'.join(current).strip())
    if not segments and text.strip():
        segments = [text.strip()]
    return [segment for segment in segments if markdown_text_only(segment)]


def chunk_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    text = clean_text(text)
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        if end < len(text):
            punct = max(text.rfind('.', start, end), text.rfind('?', start, end), text.rfind('!', start, end))
            if punct > start + chunk_size * 0.55:
                end = punct + 1
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return [chunk for chunk in chunks if chunk]


def load_deepseek_pages():
    pages = {}
    for path in sorted(DEEPSEEK_OUT_DIR.glob('page_*.json')):
        payload = json.loads(path.read_text(encoding='utf-8'))
        pages[int(payload['page_number'])] = payload
    return pages


def load_block_ocr_outputs():
    outputs = {}
    for path in sorted(BLOCK_OCR_OUT_DIR.glob('*.json')):
        payload = json.loads(path.read_text(encoding='utf-8'))
        record_id = payload.get('record_id') or payload.get('block_id') or path.stem
        outputs[str(record_id)] = payload
    return outputs


def pdf_text_for_image_bbox(page_no, image_bbox, rendered_width, rendered_height):
    if not USE_PDF_TEXT_LAYER_FOR_BLOCKS:
        return ''
    try:
        page = pdf_doc[int(page_no) - 1]
        rect = page.rect
        sx = rect.width / max(1, rendered_width)
        sy = rect.height / max(1, rendered_height)
        x0, y0, x1, y1 = [float(value) for value in image_bbox]
        clip = fitz.Rect(x0 * sx, y0 * sy, x1 * sx, y1 * sy)
        return clean_ocr_block_markdown(page.get_text('text', clip=clip) or '')
    except Exception:
        return ''


def fold_text(value):
    text = unicodedata.normalize('NFD', str(value or ''))
    text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn')
    return re.sub(r'\s+', ' ', text).lower().strip()


def visual_label_stem(number):
    return re.sub(r'[^0-9]+', '_', number).strip('_')


def find_visual_labels(markdown):
    labels = []
    seen = set()
    pattern = re.compile(r'\b(Hình|Hinh|Bảng|Bang)\s+(\d+(?:[\._-]\d+)+)', re.IGNORECASE)
    for line in str(markdown or '').splitlines():
        for match in pattern.finditer(line):
            kind_raw = fold_text(match.group(1))
            label_type = 'table' if kind_raw.startswith('bang') else 'image'
            stem = visual_label_stem(match.group(2))
            key = (label_type, stem)
            if key in seen:
                continue
            seen.add(key)
            labels.append({
                'type': label_type,
                'label': f'{match.group(1)} {match.group(2)}',
                'stem': stem,
                'line': line.strip(),
                'match_norm': fold_text(match.group(0)),
            })
    return labels


def unique_stem(stem, used):
    candidate = stem
    index = 2
    while candidate in used:
        candidate = f'{stem}_{index}'
        index += 1
    used.add(candidate)
    return candidate


def rename_rel_path(rel_path, new_rel_path):
    if not rel_path:
        return ''
    old_path = OUTPUT_DIR / rel_path
    new_path = OUTPUT_DIR / new_rel_path
    if old_path.exists() and old_path != new_path:
        new_path.parent.mkdir(parents=True, exist_ok=True)
        if not new_path.exists():
            old_path.rename(new_path)
            return new_path.relative_to(OUTPUT_DIR).as_posix()
    return rel_path


def assign_visual_labels(image_records, deepseek_pages):
    used = set()
    for record in image_records:
        if record.get('id'):
            used.add(str(record['id']))

    for page_no, payload in deepseek_pages.items():
        markdown = str(payload.get('markdown') or '')
        labels = find_visual_labels(markdown)
        page_visuals = sorted(
            [record for record in image_records if int(record.get('page_number') or record.get('page') or 0) == int(page_no)],
            key=lambda record: (record.get('bbox') or [0, 0, 0, 0])[1],
        )
        for visual_type in ['image', 'table']:
            visuals = [record for record in page_visuals if record.get('type') == visual_type]
            visual_labels = [label for label in labels if label['type'] == visual_type]
            for record, label in zip(visuals, visual_labels):
                old_id = str(record.get('id') or '')
                used.discard(old_id)
                stem = label['stem'] if visual_type == 'image' else f"bang_{label['stem']}"
                stem = unique_stem(stem, used)
                record['id'] = stem
                record['label'] = label['label']
                record['caption'] = label['line']
                suffix = Path(str(record.get('path') or '')).suffix or '.jpg'
                record['path'] = rename_rel_path(str(record.get('path') or ''), f'images/{stem}{suffix}')
                if record.get('caption_crop_path'):
                    caption_suffix = Path(str(record.get('caption_crop_path'))).suffix or '.jpg'
                    record['caption_crop_path'] = rename_rel_path(str(record.get('caption_crop_path')), f'caption_crops/{stem}_caption{caption_suffix}')


def image_markdown(record):
    alt = str(record.get('caption') or record.get('label') or record.get('id') or 'image').replace('\n', ' ')
    return f'![{alt}]({record.get("path", "")})'


def bbox_values(block):
    bbox = block.get('bbox') or [0, 0, 0, 0]
    return [float(value) for value in bbox]


def reading_order_blocks(blocks, page_width, page_height):
    candidates = [block for block in blocks if block.get('bbox')]
    candidates = sorted(candidates, key=lambda block: (bbox_values(block)[1], bbox_values(block)[0]))
    bands = []
    for block in candidates:
        x0, y0, x1, y1 = bbox_values(block)
        height = max(1.0, y1 - y0)
        placed = False
        for band in bands:
            overlap = min(y1, band['y1']) - max(y0, band['y0'])
            tolerance = max(18.0, min(height, band['height']) * 0.45)
            if overlap >= -tolerance:
                band['blocks'].append(block)
                band['y0'] = min(band['y0'], y0)
                band['y1'] = max(band['y1'], y1)
                band['height'] = max(1.0, band['y1'] - band['y0'])
                placed = True
                break
        if not placed:
            bands.append({'y0': y0, 'y1': y1, 'height': height, 'blocks': [block]})
    ordered = []
    for band in sorted(bands, key=lambda item: item['y0']):
        ordered.extend(sorted(band['blocks'], key=lambda block: (bbox_values(block)[0], bbox_values(block)[1])))
    return ordered


def attach_block_ocr_text(page_records, block_ocr_outputs):
    block_errors = []
    block_text_count = 0
    for page in page_records:
        page_no = int(page.get('page_number') or 0)
        rendered_width = page.get('width') or 1
        rendered_height = page.get('height') or 1
        for block in page.get('text_blocks') or []:
            ocr_id = block.get('ocr_id')
            if not ocr_id:
                continue
            text_layer_text = pdf_text_for_image_bbox(page_no, block.get('bbox') or [0, 0, 0, 0], rendered_width, rendered_height)
            if text_layer_text:
                block['text'] = text_layer_text
                block['ocr_chars'] = len(markdown_text_only(text_layer_text))
                block['ocr_source'] = 'pdf_text_layer_clip'
                block_text_count += 1
                continue
            payload = block_ocr_outputs.get(str(ocr_id))
            if not payload:
                if RUN_BLOCK_OCR:
                    block['ocr_error'] = 'missing block OCR output'
                    block_errors.append({'block_id': ocr_id, 'page_number': page.get('page_number'), 'error': block['ocr_error']})
                continue
            text = clean_ocr_block_markdown(payload.get('markdown') or '')
            block['text'] = text
            block['ocr_markdown'] = payload.get('markdown') or ''
            block['ocr_chars'] = len(markdown_text_only(text))
            block['ocr_source'] = payload.get('markdown_source')
            if payload.get('error'):
                block['ocr_error'] = payload.get('error')
                block_errors.append({'block_id': ocr_id, 'page_number': page.get('page_number'), 'error': payload.get('error')})
            if len(markdown_text_only(text)) >= MIN_BLOCK_TEXT_CHARS:
                block_text_count += 1
    return block_text_count, block_errors


def assign_page_ocr_to_empty_layout_blocks(page_records, deepseek_pages):
    if not USE_PAGE_OCR_TO_LAYOUT_BLOCKS:
        return 0
    assigned = 0
    for page in page_records:
        page_no = int(page.get('page_number') or 0)
        segments = page_ocr_segments((deepseek_pages.get(page_no) or {}).get('markdown') or '')
        if not segments:
            continue
        text_blocks = []
        for block in reading_order_blocks(page.get('text_blocks') or [], page.get('width') or 1, page.get('height') or 1):
            layout_type = block.get('layout_type') or block.get('category_type') or block.get('type')
            if layout_type in TEXT_BLOCK_OUTPUT_TYPES:
                text_blocks.append(block)
        segment_index = 0
        for block in text_blocks:
            existing = markdown_text_only(block.get('text') or '')
            if existing:
                continue
            if segment_index >= len(segments):
                break
            block['text'] = segments[segment_index]
            block['ocr_chars'] = len(markdown_text_only(segments[segment_index]))
            block['ocr_source'] = 'deepseek-ocr-page-assigned'
            assigned += 1
            segment_index += 1
        if segment_index < len(segments):
            leftovers = [segment for segment in segments[segment_index:] if markdown_text_only(segment)]
            if leftovers:
                page.setdefault('page_ocr_leftover_text', '\n\n'.join(leftovers))
    return assigned


def page_label_sources(page_no, deepseek_pages):
    texts = []
    for page in page_records:
        if int(page.get('page_number')) != int(page_no):
            continue
        ordered = reading_order_blocks(page.get('text_blocks') or [], page.get('width') or 1, page.get('height') or 1)
        for block in ordered:
            layout_type = block.get('layout_type') or block.get('category_type') or block.get('type')
            if layout_type in {'figure_caption', 'table_caption'} and block.get('text'):
                texts.append(str(block.get('text')))
    payload = deepseek_pages.get(int(page_no), {})
    if payload.get('markdown'):
        texts.append(str(payload.get('markdown')))
    return '\n'.join(texts)


def assign_visual_labels_from_layout_text(image_records, deepseek_pages):
    pages = sorted({int(record.get('page_number') or record.get('page') or 0) for record in image_records if record.get('page_number') or record.get('page')})
    label_pages = {
        page_no: {'markdown': page_label_sources(page_no, deepseek_pages)}
        for page_no in pages
    }
    assign_visual_labels(image_records, label_pages)


def block_to_output_items(block):
    block_type = block.get('type')
    layout_type = block.get('layout_type') or block.get('category_type') or block_type
    if block_type in VISUAL_OUTPUT_TYPES and block.get('path'):
        items = [dict(block)]
        table_text = clean_ocr_block_markdown(block.get('text') or '') if layout_type == 'table' else ''
        if table_text:
            items.append({
                'type': 'text',
                'layout_type': 'table_ocr_text',
                'text': table_text,
                'bbox': block.get('bbox'),
                'source': 'deepseek-ocr-block',
            })
        return items
    if layout_type in TEXT_BLOCK_OUTPUT_TYPES:
        text = clean_ocr_block_markdown(block.get('text') or '')
        if not text:
            return []
        return [{
            'type': 'text',
            'layout_type': layout_type,
            'text': text,
            'bbox': block.get('bbox'),
            'score': block.get('score'),
            'ocr_id': block.get('ocr_id'),
            'text_crop_path': block.get('text_crop_path'),
            'source': 'deepseek-ocr-block',
        }]
    return []


def page_output_blocks(layout_page, deepseek_payload):
    raw_blocks = []
    for block in layout_page.get('text_blocks') or []:
        raw_blocks.extend(block_to_output_items(block))
    ordered_blocks = reading_order_blocks(raw_blocks, layout_page.get('width') or 1, layout_page.get('height') or 1)
    leftover_text = clean_ocr_block_markdown(layout_page.get('page_ocr_leftover_text') or '')
    if leftover_text:
        ordered_blocks.append({
            'type': 'text',
            'layout_type': 'page_ocr_leftover',
            'text': leftover_text,
            'bbox': [0, layout_page.get('height') or 0, layout_page.get('width') or 0, layout_page.get('height') or 0],
            'source': 'deepseek-ocr-page-leftover',
        })
    has_text = any(block.get('type') == 'text' and markdown_text_only(block.get('text') or '') for block in ordered_blocks)
    if (not ordered_blocks or not has_text) and deepseek_payload.get('markdown'):
        fallback_text = clean_ocr_block_markdown(deepseek_payload.get('markdown'))
        if fallback_text:
            fallback_block = {
                'type': 'text',
                'layout_type': 'page_fallback',
                'text': fallback_text,
                'bbox': [0, 0, layout_page.get('width') or 0, layout_page.get('height') or 0],
                'source': 'deepseek-ocr-page-fallback',
            }
            if ordered_blocks:
                ordered_blocks = [fallback_block] + ordered_blocks
            else:
                ordered_blocks = [fallback_block]
    return ordered_blocks


def markdown_for_output_block(block):
    if block.get('type') in VISUAL_OUTPUT_TYPES and block.get('path'):
        return image_markdown(block)
    text = clean_ocr_block_markdown(block.get('text') or '')
    if not text:
        return ''
    layout_type = block.get('layout_type')
    if layout_type == 'title' and not text.lstrip().startswith('#'):
        return '### ' + text.replace('\n', ' ')
    return text


layout_page_records = list(page_records)
layout_pages_by_no = {int(page['page_number']): page for page in layout_page_records}
deepseek_pages = load_deepseek_pages() if RUN_DEEPSEEK_OCR else {}
block_ocr_outputs = load_block_ocr_outputs() if RUN_DEEPSEEK_OCR and RUN_BLOCK_OCR else {}
block_text_count, block_ocr_errors = attach_block_ocr_text(page_records, block_ocr_outputs)
page_ocr_assigned_blocks = assign_page_ocr_to_empty_layout_blocks(page_records, deepseek_pages)
block_text_count = sum(
    1
    for page in page_records
    for block in page.get('text_blocks') or []
    if block.get('ocr_id') and len(markdown_text_only(block.get('text') or '')) >= MIN_BLOCK_TEXT_CHARS
)
assign_visual_labels_from_layout_text(image_records, deepseek_pages)

book_lines = [
    f'# {INPUT_PDF.stem}',
    '',
    f'> Source PDF: `{INPUT_PDF}`',
    f'> Generated at: `{datetime.now(timezone.utc).isoformat()}`',
    '> Layout engine: `PDF-Extract-Kit DocLayout-YOLO`',
    f'> OCR engine: `{"DeepSeek-OCR block-level layout-first" if block_ocr_outputs else "DeepSeek-OCR page fallback" if deepseek_pages else "PDF text layer / none"}`',
    '',
]
page_records = []
block_records = []
rag_records = []
errors = list(block_ocr_errors)

for page in page_images:
    page_no = int(page['page_number'])
    layout_page = layout_pages_by_no.get(page_no, {})
    payload = deepseek_pages.get(page_no, {})
    if payload.get('error'):
        errors.append({'page_number': page_no, 'error': payload.get('error')})

    page_blocks = page_output_blocks(layout_page, payload)
    page_lines = [markdown_for_output_block(block) for block in page_blocks]
    page_lines = [line for line in page_lines if str(line).strip()]
    if not page_lines:
        page_lines = [f'[OCR missing for PDF page {page_no}]']
    book_lines += [f'## PDF Page {page_no}', '', *page_lines, '', '</break>', '']

    text = markdown_text_only('\n\n'.join(page_lines))
    image_refs = [
        {key: block.get(key) for key in ['id', 'path', 'caption_crop_path', 'label', 'caption', 'type']}
        for block in page_blocks
        if block.get('type') in {'image', 'table'}
    ]
    page_record = {
        'source_pdf': str(INPUT_PDF),
        'page_number': page_no,
        'page_image_path': layout_page.get('page_image_path') or str(page.get('path')),
        'width': layout_page.get('width'),
        'height': layout_page.get('height'),
        'text': text,
        'markdown': '\n\n'.join(page_lines),
        'layout_dets': layout_page.get('layout_dets') or [],
        'text_blocks': page_blocks,
        'images': image_refs,
        'engine': {'layout': 'pdf_extract_kit_doclayout_yolo', 'ocr': 'deepseek-ocr-block' if block_ocr_outputs else 'deepseek-ocr-page-fallback' if payload else 'pdf_text_layer_or_none'},
        'ocr_error': payload.get('error'),
    }
    page_records.append(page_record)
    for block in page_blocks:
        block_record = dict(block)
        block_record['page_number'] = page_no
        block_record['order'] = len([b for b in block_records if int(b.get('page_number') or -1) == page_no])
        block_records.append(block_record)
    (METADATA_DIR / 'pages').mkdir(parents=True, exist_ok=True)
    (METADATA_DIR / 'pages' / f'page_{page_no:03d}.json').write_text(json.dumps(page_record, ensure_ascii=False, indent=2), encoding='utf-8')

    for idx, chunk in enumerate(chunk_text(text), start=1):
        rag_records.append({
            'chunk_id': f'page_{page_no:03d}_{idx:02d}',
            'source_pdf': str(INPUT_PDF),
            'page_number': page_no,
            'text': chunk,
            'images': image_refs,
            'engine': 'pdf_extract_kit_doclayout_yolo+deepseek_ocr',
        })
    if not text and image_refs:
        rag_records.append({
            'chunk_id': f'page_{page_no:03d}_layout_01',
            'source_pdf': str(INPUT_PDF),
            'page_number': page_no,
            'text': '',
            'images': image_refs,
            'engine': 'pdf_extract_kit_doclayout_yolo+deepseek_ocr',
        })

(OUTPUT_DIR / 'book.md').write_text('\n'.join(book_lines).strip() + '\n', encoding='utf-8')
(OUTPUT_DIR / 'rag_chunks.jsonl').write_text('\n'.join(json.dumps(x, ensure_ascii=False) for x in rag_records) + ('\n' if rag_records else ''), encoding='utf-8')
(METADATA_DIR / 'images.json').write_text(json.dumps(image_records, ensure_ascii=False, indent=2), encoding='utf-8')
(METADATA_DIR / 'blocks.jsonl').write_text('\n'.join(json.dumps(x, ensure_ascii=False) for x in block_records) + ('\n' if block_records else ''), encoding='utf-8')

summary = {
    'source_pdf': str(INPUT_PDF),
    'generated_at': datetime.now(timezone.utc).isoformat(),
    'page_range': {'start': START_PAGE, 'end': END_PAGE},
    'pages_processed': len(page_records),
    'engine': {'layout': 'pdf_extract_kit_doclayout_yolo', 'ocr': 'deepseek-ocr-block' if block_ocr_outputs else 'deepseek-ocr-page-fallback' if deepseek_pages else 'pdf_text_layer_or_none'},
    'layout_model': {'weight': str(weight_path), 'img_size': IMG_SIZE, 'conf_thres': CONF_THRES, 'iou_thres': IOU_THRES, 'device': LAYOUT_DEVICE},
    'deepseek': {
        'enabled': RUN_DEEPSEEK_OCR,
        'page_ok': bool(globals().get('deepseek_ok', False)),
        'block_ok': bool(globals().get('deepseek_block_ok', False)),
        'model': DEEPSEEK_MODEL,
        'page_prompt': DEEPSEEK_PROMPT,
        'block_prompt': BLOCK_OCR_PROMPT,
        'page_base_size': DEEPSEEK_BASE_SIZE,
        'block_base_size': BLOCK_OCR_BASE_SIZE,
        'image_size': DEEPSEEK_IMAGE_SIZE,
        'max_parallel_gpus': MAX_PARALLEL_GPUS,
    },
    'stats': {
        'blocks': len(block_records),
        'images': len([r for r in image_records if r.get('type') == 'image']),
        'tables': len([r for r in image_records if r.get('type') == 'table']),
        'rag_chunks': len(rag_records),
        'ocr_pages': len(deepseek_pages),
        'ocr_blocks_expected': len(text_ocr_records),
        'ocr_blocks': len(block_ocr_outputs),
        'ocr_blocks_with_text': block_text_count,
        'page_ocr_assigned_blocks': page_ocr_assigned_blocks,
        'ocr_block_errors': len(block_ocr_errors),
        'ocr_errors': len(errors),
    },
    'errors': errors[:20],
    'outputs': {'markdown': 'book.md', 'rag_chunks': 'rag_chunks.jsonl', 'page_metadata_dir': 'metadata/pages', 'block_metadata': 'metadata/blocks.jsonl', 'image_metadata': 'metadata/images.json', 'layout_metadata': 'metadata/layout_detections.json', 'text_ocr_manifest': 'metadata/text_ocr_manifest.jsonl'},
}
(METADATA_DIR / 'book.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
'''


def patch_config(source: str) -> str:
    source = source.replace(
        "os.environ.setdefault('PYTHONIOENCODING', 'utf-8')",
        "os.environ.setdefault('PYTHONIOENCODING', 'utf-8')\nos.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')",
    )
    source = source.replace("class_6_pdf_extract_kit_layout", "class_6_pdf_extract_kit_deepseek")
    source = source.replace(
        "LAYOUT_VIS_DIR = PREVIEW_DIR / 'layout_boxes'",
        "LAYOUT_VIS_DIR = PREVIEW_DIR / 'layout_boxes'\n"
        "TEXT_CROPS_DIR = OUTPUT_DIR / 'text_crops'\n"
        "DEEPSEEK_OUT_DIR = OUTPUT_DIR / '_deepseek_pages'\n"
        "BLOCK_OCR_OUT_DIR = OUTPUT_DIR / '_deepseek_blocks'\n"
        "MANIFEST_DIR = OUTPUT_DIR / '_manifests'",
    )
    source = source.replace(
        "ZIP_OUTPUT = True\nCHUNK_SIZE = 1800",
        "RUN_DEEPSEEK_OCR = True\n"
        "DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-OCR'\n"
        "DEEPSEEK_PROMPT = '<image>\\n<|grounding|>Convert the textbook page to clean Vietnamese markdown. Preserve headings, numbered tasks, captions, and table text. Do not invent missing text.'\n"
        "DEEPSEEK_ATTN_IMPL = 'eager'\n"
        "DEEPSEEK_BASE_SIZE = 1024\n"
        "DEEPSEEK_IMAGE_SIZE = 640\n"
        "DEEPSEEK_CROP_MODE = True\n"
        "DEEPSEEK_TEST_COMPRESS = True\n"
        "PAGE_OCR_SAVE_RESULTS = True\n"
        "DEEPSEEK_CPU_BFLOAT16 = True\n"
        "GPU_IDS_TO_USE = 'auto'       # 'auto', '0', '0,1'\n"
        "MAX_PARALLEL_GPUS = 1         # Test 6-10 nên để 1. Khi ổn có thể đổi 2 trên T4 x2.\n"
        "ALLOW_CPU_DEEPSEEK = False\n"
        "FORCE_DEEPSEEK = False\n\n"
        "FORCE_BLOCK_OCR = False       # Bật True khi cần ghi đè _deepseek_blocks lỗi trong cùng session.\n"
        "FORCE_PAGE_OCR = False        # Bật True khi cần ghi đè _deepseek_pages.\n\n"
        "RUN_BLOCK_OCR = False         # DeepSeek-OCR không ổn định trên crop nhỏ: dễ division by zero. Chỉ bật để thử nghiệm.\n"
        "RUN_PAGE_OCR = True           # Nguồn OCR chính/fallback, sau đó phân bổ text vào layout blocks.\n"
        "USE_PDF_TEXT_LAYER_FOR_BLOCKS = True\n"
        "USE_PAGE_OCR_TO_LAYOUT_BLOCKS = True\n"
        "TEXT_OCR_TYPES = {'title', 'plain text', 'figure_caption', 'table_caption', 'table_footnote', 'formula_caption', 'table'}\n"
        "BLOCK_OCR_PROMPT = '<image>\\nExtract only the visible Vietnamese text from this layout block. Preserve line breaks, headings, bullets, table rows, numbers, and captions. Do not describe images and do not invent missing text.'\n"
        "BLOCK_OCR_BASE_SIZE = 768\n"
        "BLOCK_OCR_IMAGE_SIZE = 640\n"
        "BLOCK_OCR_CROP_MODE = False\n"
        "BLOCK_OCR_TEST_COMPRESS = True\n"
        "BLOCK_OCR_SAVE_RESULTS = False  # Tránh lỗi division by zero ở postprocess grounding của crop nhỏ.\n"
        "TEXT_CROP_PAD_PX = 10\n"
        "TEXT_CROP_MIN_WIDTH = 512\n"
        "TEXT_CROP_MIN_HEIGHT = 192\n"
        "TEXT_CROP_MAX_UPSCALE = 3.0\n"
        "MIN_TEXT_CROP_AREA_RATIO = 0.00003\n"
        "MIN_BLOCK_TEXT_CHARS = 2\n\n"
        "ZIP_OUTPUT = True\n"
        "CHUNK_SIZE = 1800",
    )
    source = source.replace(
        "for directory in [OUTPUT_DIR, MODEL_DIR, PAGES_DIR, IMAGES_DIR, CAPTIONS_DIR, METADATA_DIR, PREVIEW_DIR, LAYOUT_VIS_DIR]:",
        "for directory in [OUTPUT_DIR, MODEL_DIR, PAGES_DIR, IMAGES_DIR, CAPTIONS_DIR, TEXT_CROPS_DIR, METADATA_DIR, PREVIEW_DIR, LAYOUT_VIS_DIR, DEEPSEEK_OUT_DIR, BLOCK_OCR_OUT_DIR, MANIFEST_DIR]:",
    )
    return source


def patch_install(source: str) -> str:
    source = source.replace(
        "    'omegaconf', 'pyyaml', 'python-docx', 'tqdm'\n])",
        "    'omegaconf', 'pyyaml', 'python-docx', 'tqdm'\n])\n\n"
        "if RUN_DEEPSEEK_OCR:\n"
        "    # DeepSeek-OCR deps. Không cài torch/torchvision để tránh kéo lệch CUDA stack của Kaggle.\n"
        "    run_cmd([\n"
        "        sys.executable, '-m', 'pip', 'install', '-q', '--no-cache-dir',\n"
        "        'transformers==4.46.3', 'tokenizers==0.20.3', 'img2pdf',\n"
        "        'einops', 'easydict', 'addict', 'accelerate', 'safetensors'\n"
        "    ])",
    )
    source = source.replace(
        "run_cmd(['nvidia-smi'], check=False)",
        "run_cmd(['nvidia-smi'], check=False)\n"
        "if RUN_DEEPSEEK_OCR and not GPU_IDS and not ALLOW_CPU_DEEPSEEK:\n"
        "    raise RuntimeError('No CUDA GPU found. Bật GPU trong Kaggle Notebook Settings trước khi chạy DeepSeek-OCR.')",
    )
    return source


def make_combined_notebook() -> dict[str, object]:
    base_nb = json.loads(BASE.read_text(encoding="utf-8"))
    cells = deepcopy(base_nb["cells"])
    cells[0] = md(
        """# Phase 1 Kaggle - PDF-Extract-Kit + DeepSeek-OCR

Notebook này chạy pipeline Phase 1 gọn: PDF-Extract-Kit/DocLayout-YOLO detect layout và crop ảnh/bảng/caption; DeepSeek-OCR đọc text tiếng Việt theo page; cuối cùng merge thành `book.md`, `book.docx`, `rag_chunks.jsonl` và metadata theo page/block/image."""
    )
    cells[1] = code(patch_config("".join(cells[1]["source"])))
    cells[2] = code(patch_install("".join(cells[2]["source"])))
    cells[7] = code(COMBINED_OUTPUT_CELL)
    cells.insert(7, code(TEXT_BLOCK_PREP_CELL))
    cells.insert(8, code(DEEPSEEK_WORKER_CELL))
    cells.insert(9, code(DEEPSEEK_RUNNER_CELL))
    base_nb["cells"] = cells
    return base_nb


def main() -> None:
    if not BASE.exists():
        raise FileNotFoundError(f"Run create_pdf_extract_kit_layout_notebook.py first: {BASE}")
    nb = make_combined_notebook()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
