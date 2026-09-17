from __future__ import annotations

import math
from typing import Iterable

import numpy as np


def l2_normalize(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return matrix / norms


class HFTextEmbedder:
    def __init__(
        self,
        model_name: str,
        device: str = "cpu",
        max_length: int = 512,
        local_files_only: bool = False,
    ) -> None:
        import torch
        from transformers import AutoModel, AutoTokenizer

        self.model_name = model_name
        self.max_length = max_length
        self.local_files_only = local_files_only
        self.device = "cuda" if device == "auto" and torch.cuda.is_available() else device
        if self.device == "auto":
            self.device = "cpu"
        self.tokenizer = AutoTokenizer.from_pretrained(model_name, local_files_only=local_files_only)
        self.model = AutoModel.from_pretrained(model_name, local_files_only=local_files_only).to(self.device).eval()

    def _prefix(self, texts: Iterable[str], is_query: bool) -> list[str]:
        prefix = "query: " if is_query else "passage: "
        if "e5" in self.model_name.lower():
            return [prefix + text for text in texts]
        return list(texts)

    def encode(self, texts: list[str], *, is_query: bool = False, batch_size: int = 16) -> np.ndarray:
        import torch

        vectors: list[np.ndarray] = []
        for start in range(0, len(texts), batch_size):
            batch = self._prefix(texts[start : start + batch_size], is_query)
            encoded = self.tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=self.max_length,
                return_tensors="pt",
            ).to(self.device)
            with torch.no_grad():
                output = self.model(**encoded)
            token_embeddings = output.last_hidden_state
            mask = encoded["attention_mask"].unsqueeze(-1).expand(token_embeddings.size()).float()
            summed = torch.sum(token_embeddings * mask, dim=1)
            counts = torch.clamp(mask.sum(dim=1), min=1e-9)
            batch_vectors = (summed / counts).detach().cpu().numpy().astype("float32")
            vectors.append(batch_vectors)
        return l2_normalize(np.vstack(vectors))


def recommend_svd_components(n_docs: int, n_features: int, requested: int = 384) -> int:
    return max(2, min(requested, n_docs - 1, n_features - 1))
