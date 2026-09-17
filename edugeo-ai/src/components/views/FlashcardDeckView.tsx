"use client";

import { useCallback, useEffect, useState } from "react";
import { isDisplayableImageUrl, normalizeAssetUrl } from "@/lib/assets";
import type { Flashcard, FlashcardSet } from "@/lib/types";
import { MarkdownLite } from "../shared/MarkdownLite";

export function FlashcardDeckView({
  flashcardSet,
  onClose
}: {
  flashcardSet: FlashcardSet;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const cards = flashcardSet.cards;
  const current: Flashcard | undefined = cards[index];
  const cardImages = (current?.imageRefs || [])
    .map((image) => ({ ...image, url: normalizeAssetUrl(image.url) }))
    .filter((image) => isDisplayableImageUrl(image.url) && !brokenImages.has(image.url));

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
    setFlipped(false);
  }, []);
  const goNext = useCallback(() => {
    setIndex((i) => Math.min(cards.length - 1, i + 1));
    setFlipped(false);
  }, [cards.length]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight" || event.key === " ") goNext();
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goPrev, goNext, onClose]);

  if (!cards.length) {
    return (
      <div className="modal-backdrop open" onClick={onClose}>
        <div className="flashcard-deck-modal" onClick={(e) => e.stopPropagation()}>
          <p>Không có thẻ nào trong bộ này.</p>
          <button className="btn primary" onClick={onClose}>Đóng</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop open" onClick={onClose}>
      <div className="flashcard-deck-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flashcard-deck-head">
          <h2>{flashcardSet.title}</h2>
          <span>{index + 1} / {cards.length}</span>
        </div>

        <div className="flashcard-deck-card" onClick={() => setFlipped((f) => !f)}>
          <div className={`card-inner ${flipped ? "flipped" : ""}`}>
            <div className="card-front">
              <div className="flashcard-content">
                <MarkdownLite text={current?.front || ""} />
              </div>
              {cardImages.length > 0 && (
                <div className="flashcard-images">
                  {cardImages.map((image) => (
                    <figure key={`${image.url}-${image.caption}`}>
                      <img
                        src={image.url}
                        alt={image.caption || "Ảnh minh họa"}
                        onError={() => setBrokenImages((currentSet) => new Set(currentSet).add(image.url))}
                      />
                      <figcaption>{image.caption}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
            <div className="card-back">
              <div className="flashcard-content">
                <MarkdownLite text={current?.back || ""} />
              </div>
              {current?.hint && <small className="flashcard-hint">💡 {current.hint}</small>}
            </div>
          </div>
        </div>

        <div className="flashcard-nav">
          <button className="btn small" disabled={index === 0} onClick={goPrev}>← Trước</button>
          <span className="flashcard-progress">{flipped ? "Đang xem đáp án" : "Nhấn vào thẻ để lật"}</span>
          <button className="btn small" disabled={index === cards.length - 1} onClick={goNext}>Sau →</button>
        </div>

        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button className="btn" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}