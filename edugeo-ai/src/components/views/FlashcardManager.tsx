"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import type { Flashcard, FlashcardSet } from "@/lib/types";
import { MarkdownLite } from "../shared/MarkdownLite";

export function FlashcardManager({
  flashcardSets,
  classId,
  token,
  onRefresh,
  showToast,
  onViewDeck
}: {
  flashcardSets: FlashcardSet[];
  classId: string;
  token: string;
  onRefresh: () => void;
  showToast: (msg: string) => void;
  onViewDeck: (set: FlashcardSet) => void;
}) {
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCards, setEditCards] = useState<Flashcard[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState<string | null>(null);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const [operating, setOperating] = useState<string | null>(null);

  function startEdit(set: FlashcardSet) {
    setEditingSetId(set.id);
    setEditTitle(set.title);
    setEditCards(set.cards.map((c) => ({ ...c, imageRefs: c.imageRefs?.map((r) => ({ ...r })) || [] })));
    setPreviewCardId(null);
  }

  function cancelEdit() {
    setEditingSetId(null);
    setEditTitle("");
    setEditCards([]);
    setPreviewCardId(null);
  }

  async function saveEdit() {
    if (!editingSetId) return;
    setOperating("save");
    try {
      await api.updateFlashcard(token, editingSetId, { title: editTitle, cards: editCards });
      showToast("✅ Đã cập nhật bộ flashcard.");
      cancelEdit();
      onRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Lỗi cập nhật.");
    } finally {
      setOperating(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setOperating("delete");
    try {
      await api.deleteFlashcard(token, deleteTarget);
      showToast("✅ Đã xóa bộ flashcard.");
      setDeleteTarget(null);
      if (editingSetId === deleteTarget) cancelEdit();
      onRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Lỗi xóa.");
    } finally {
      setOperating(null);
    }
  }

  async function broadcast(setId: string) {
    setBroadcasting(setId);
    try {
      await api.broadcastFlashcard(token, setId, classId);
      showToast("✅ Đã giao flashcard cho lớp.");
      onRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Lỗi giao flashcard.");
    } finally {
      setBroadcasting(null);
    }
  }

  function addCard() {
    setEditCards((prev) => [...prev, { id: `card-${Date.now()}`, front: "", back: "", imageRefs: [] }]);
  }

  function removeCard(cardId: string) {
    setEditCards((prev) => prev.filter((c) => c.id !== cardId));
  }

  function updateCard(cardId: string, field: "front" | "back" | "hint", value: string) {
    setEditCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, [field]: value } : c)));
  }

  function updateImageUrl(cardId: string, imageIndex: number, value: string) {
    setEditCards((prev) => prev.map((c) => {
      if (c.id !== cardId) return c;
      const refs = [...(c.imageRefs || [])];
      refs[imageIndex] = { ...refs[imageIndex], url: value };
      return { ...c, imageRefs: refs };
    }));
  }

  function addImageField(cardId: string) {
    setEditCards((prev) => prev.map((c) => {
      if (c.id !== cardId) return c;
      return { ...c, imageRefs: [...(c.imageRefs || []), { url: "", caption: "" }] };
    }));
  }

  function removeImageField(cardId: string, imageIndex: number) {
    setEditCards((prev) => prev.map((c) => {
      if (c.id !== cardId) return c;
      const refs = (c.imageRefs || []).filter((_, i) => i !== imageIndex);
      return { ...c, imageRefs: refs.length ? refs : undefined };
    }));
  }

  const classSets = flashcardSets.filter((s) => s.classId === classId);

  return (
    <div className="activity-section">
      <h3>Flashcard của lớp</h3>
      {classSets.length === 0 && (
        <p style={{ color: "var(--muted)", fontSize: 12 }}>Chưa có flashcard nào được giao cho lớp này.</p>
      )}
      {classSets.map((set) => (
        <div key={set.id}>
          {editingSetId === set.id ? (
            <div className="flashcard-edit-form">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Tiêu đề bộ flashcard"
                style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 8, fontWeight: 700 }}
              />
              {editCards.map((card, ci) => (
                <div key={card.id} className="flashcard-edit-card-block">
                  <div className="flashcard-edit-row">
                    <div className="flashcard-edit-field">
                      <label>Mặt trước (thuật ngữ) — hỗ trợ **bold**, xuống dòng</label>
                      <textarea
                        value={card.front}
                        onChange={(e) => updateCard(card.id, "front", e.target.value)}
                        placeholder="Thuật ngữ / câu hỏi"
                        rows={3}
                      />
                    </div>
                    <div className="flashcard-edit-field">
                      <label>Mặt sau (định nghĩa) — hỗ trợ **bold**, xuống dòng</label>
                      <textarea
                        value={card.back}
                        onChange={(e) => updateCard(card.id, "back", e.target.value)}
                        placeholder="Định nghĩa / câu trả lời"
                        rows={3}
                      />
                    </div>
                    <button className="btn small" style={{ color: "var(--danger)", alignSelf: "flex-end" }} onClick={() => removeCard(card.id)}>✕</button>
                  </div>
                  <div className="flashcard-edit-meta">
                    <input
                      value={card.hint || ""}
                      onChange={(e) => updateCard(card.id, "hint", e.target.value)}
                      placeholder="Gợi ý (không bắt buộc)"
                    />
                    {(card.imageRefs || []).map((image, ii) => (
                      <div className="flashcard-image-row" key={ii}>
                        <input
                          value={image.url}
                          onChange={(e) => updateImageUrl(card.id, ii, e.target.value)}
                          placeholder="URL hình ảnh"
                        />
                        <input
                          value={image.caption || ""}
                          onChange={(e) => {
                            setEditCards((prev) => prev.map((c) => {
                              if (c.id !== card.id) return c;
                              const refs = [...(c.imageRefs || [])];
                              refs[ii] = { ...refs[ii], caption: e.target.value };
                              return { ...c, imageRefs: refs };
                            }));
                          }}
                          placeholder="Chú thích (không bắt buộc)"
                        />
                        <button className="btn small" style={{ color: "var(--danger)" }} onClick={() => removeImageField(card.id, ii)}>✕</button>
                      </div>
                    ))}
                    <button className="btn small" onClick={() => addImageField(card.id)}>＋ Thêm ảnh</button>
                    <button className="btn small" onClick={() => setPreviewCardId(previewCardId === card.id ? null : card.id)}>
                      {previewCardId === card.id ? "Ẩn preview" : "👁 Preview"}
                    </button>
                  </div>
                  {previewCardId === card.id && (
                    <div className="flashcard-preview">
                      <div className="flashcard-preview-side">
                        <strong>Mặt trước:</strong>
                        <MarkdownLite text={card.front || "(trống)"} />
                        {(card.imageRefs || []).filter((img) => img.url).map((img, ii) => (
                          <figure key={ii}>
                            <img src={img.url} alt={img.caption || ""} style={{ maxWidth: "100%", maxHeight: 120, borderRadius: 8 }} />
                            {img.caption && <figcaption>{img.caption}</figcaption>}
                          </figure>
                        ))}
                      </div>
                      <div className="flashcard-preview-side">
                        <strong>Mặt sau:</strong>
                        <MarkdownLite text={card.back || "(trống)"} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn small" onClick={addCard}>＋ Thêm thẻ</button>
                <button className="btn primary small" onClick={saveEdit} disabled={operating === "save"}>
                  {operating === "save" ? "⏳ Đang lưu..." : "💾 Lưu"}
                </button>
                <button className="btn small" onClick={cancelEdit}>Huỷ</button>
              </div>
            </div>
          ) : (
            <div className="activity-item">
              <div>
                <b>{set.title}</b>
                <span>{set.cards.length} thẻ · Tạo {new Date(set.createdAt).toLocaleDateString("vi-VN")}</span>
              </div>
              <div className="activity-actions">
                <button className="btn small" onClick={() => onViewDeck(set)}>📖 Xem</button>
                <button className="btn small" onClick={() => startEdit(set)}>✏️ Sửa</button>
                <button className="btn small" style={{ color: "var(--danger)" }} onClick={() => setDeleteTarget(set.id)}>🗑 Xoá</button>
                {/* Set already broadcast to a class — no need to re-broadcast. */}
                {!set.broadcasted && (
                  <button className="btn small" style={{ background: "var(--primary)", color: "white" }} onClick={() => broadcast(set.id)} disabled={broadcasting === set.id}>
                    {broadcasting === set.id ? "⏳..." : "📢 Giao lớp"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {deleteTarget && (
        <div className="modal-backdrop open" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, padding: 24, background: "white", borderRadius: 16 }}>
            <h3>Xoá bộ flashcard?</h3>
            <p style={{ color: "var(--muted)", margin: "10px 0" }}>Hành động này không thể hoàn tác.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setDeleteTarget(null)}>Huỷ</button>
              <button className="btn primary" style={{ background: "var(--danger)" }} onClick={confirmDelete} disabled={operating === "delete"}>
                {operating === "delete" ? "⏳..." : "Xoá"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}