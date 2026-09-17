from __future__ import annotations

from typing import Callable

from ..rag import answer
from ..retriever import HybridRetriever
from ..schemas import RagAnswer
from ..config import AppConfig


def run_ragas_evaluation(
    test_cases: list[dict[str, str]],
    *,
    retriever: HybridRetriever,
    config: AppConfig,
    answer_fn: Callable[[str], RagAnswer] | None = None,
):
    """Run Ragas if the optional dependency is installed.

    test_cases must contain {"question": "...", "ground_truth": "..."} rows.
    This mirrors the paper's evaluation section but is intentionally optional
    because the product can run without installing judge/evaluation packages.
    """
    try:
        from datasets import Dataset
        from ragas import evaluate
        from ragas.metrics import answer_relevancy, context_precision, context_recall, faithfulness
    except Exception as exc:
        raise RuntimeError("Install optional dependencies `ragas datasets` to run evaluation.") from exc

    produce_answer = answer_fn or (lambda q: answer(retriever, config, q, provider=config.generation.default_provider))
    data = {"user_input": [], "response": [], "retrieved_contexts": [], "reference": []}
    for case in test_cases:
        result = produce_answer(case["question"])
        data["user_input"].append(case["question"])
        data["response"].append(result.answer)
        data["retrieved_contexts"].append([chunk.text for chunk in result.chunks])
        data["reference"].append(case["ground_truth"])
    return evaluate(Dataset.from_dict(data), metrics=[faithfulness, answer_relevancy, context_precision, context_recall])
