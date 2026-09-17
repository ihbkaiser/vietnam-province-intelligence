"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClassRoom, LessonRecord, Role, SummaryResult, TeachingDocument } from "@/lib/types";
import { AIToolButton, Pill, SectionTitle } from "../shared/Ui";
import { MarkdownLite } from "../shared/MarkdownLite";
import { PptxSlideViewer } from "./PptxSlideViewer";

export function WorkspaceView({
  role,
  classes,
  documents,
  lessons,
  selectedClassId,
  onSelectClass,
  onUpload,
  onQuiz,
  onLearningAction,
  latestSummary,
  summaryLoading,
  onUpdateTags
}: {
  role: Role;
  classes: ClassRoom[];
  documents: TeachingDocument[];
  lessons: LessonRecord[];
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  onUpload: (file: File, classId?: string) => void;
  onQuiz: () => void;
  onLearningAction: (action: "rag" | "flash" | "summary", lessonId?: string) => void;
  latestSummary: SummaryResult | null;
  summaryLoading: boolean;
  onUpdateTags?: (documentId: string, knowledgeTags: string[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [lessonId, setLessonId] = useState("");
  const [selectedDocId, setSelectedDocId] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [editTagsFor, setEditTagsFor] = useState<string>("");
  const [tagDraft, setTagDraft] = useState("");

  function startTagEdit(document: TeachingDocument) {
    setEditTagsFor(document.id);
    setTagDraft(document.knowledgeTags.join(", "));
  }

  function saveTagEdit(document: TeachingDocument) {
    const tags = tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean);
    if (onUpdateTags) onUpdateTags(document.id, tags);
    setEditTagsFor("");
    setTagDraft("");
  }
  const selectedClass = classes.find((item) => item.id === selectedClassId) || classes[0];
  const classDocuments = useMemo(
    () => documents.filter((document) => document.classId === selectedClass?.id || (!document.classId && selectedClass)),
    [documents, selectedClass]
  );
  const availableLessons = useMemo(
    () => (selectedClass?.grade && selectedClass.grade !== 6 ? [] : lessons),
    [lessons, selectedClass?.grade]
  );
  useEffect(() => {
    if (!availableLessons.some((lesson) => lesson.lesson_id === lessonId)) setLessonId("");
  }, [availableLessons, lessonId]);
  // Keep the selected slide valid — reset when it no longer belongs to this class.
  useEffect(() => {
    if (selectedDocId && !classDocuments.some((document) => document.id === selectedDocId)) setSelectedDocId("");
  }, [classDocuments, selectedDocId]);
  const current = classDocuments.find((document) => document.id === selectedDocId) || null;
  const currentIsPdf = current?.mimeType.includes("pdf");

  return (
    <section className="view active">
      <div className="page-head">
        <div><h1>{role === "teacher" ? "Slide & AI Workspace" : "AI học tập"}</h1><p>Quản lý slide theo lớp và dùng RAG/Quiz/Flashcard/Summary từ nguồn SGK đã tích hợp.</p></div>
        {role === "teacher" && (
          <>
            <button className="btn primary" disabled={!selectedClass} onClick={() => fileInput.current?.click()}>⇧ Upload slide</button>
            <input ref={fileInput} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file, selectedClass?.id);
              event.currentTarget.value = "";
            }} />
          </>
        )}
      </div>

      <div className="workspace-controls card">
        <div className="field">
          <label>Lớp đang mở</label>
          <select value={selectedClass?.id || ""} onChange={(event) => onSelectClass(event.target.value)}>
            {classes.map((classRoom) => <option key={classRoom.id} value={classRoom.id}>{classRoom.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Bài SGK dùng cho AI</label>
          <select value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
            <option value="">Tự retrieve theo câu hỏi</option>
            {availableLessons.map((lesson) => (
              <option key={lesson.lesson_id} value={lesson.lesson_id}>
                {lesson.subject_label} · {lesson.lesson_title}
              </option>
            ))}
            {!availableLessons.length && <option value="">Chưa có dữ liệu SGK cho lớp này</option>}
          </select>
        </div>
      </div>

      <div className="grid content-grid">
        <div className="card panel">
          <SectionTitle title="Slide/Tài liệu của lớp" right={<Pill tone={classDocuments.length ? "success" : "warn"}>{classDocuments.length ? "Có file" : "Chưa có file"}</Pill>} />
          {current ? (
            <div className="slide-preview">
              {current.fileUrl && currentIsPdf ? (
                <iframe src={current.fileUrl} title={current.filename} />
              ) : current.fileUrl && current.mimeType.includes("presentation") ? (
                <PptxSlideViewer fileUrl={current.fileUrl} filename={current.filename} />
              ) : (
                <div>
                  <div style={{ fontSize: 46 }}>▣</div>
                  <h3>{current.filename}</h3>
                  <p>PPTX hiện mở bằng tab/tải file. PDF sẽ preview trực tiếp tại đây.</p>
                  {current.fileUrl && <a className="btn primary" href={current.fileUrl} target="_blank">Mở slide</a>}
                </div>
              )}
            </div>
          ) : (
            <p className="slide-preview-hint">Chọn một slide bên dưới để xem trước tại đây.</p>
          )}

          <div className="doc-list">
            {classDocuments.map((document) => (
              <div
                className={`doc-row ${document.id === selectedDocId ? "selected" : ""}`}
                key={document.id}
                role="button"
                tabIndex={0}
                title="Xem trước slide"
                onClick={() => setSelectedDocId(document.id)}
                onKeyDown={(event) => { if (event.key === "Enter") setSelectedDocId(document.id); }}
              >
                <div>
                  <b>{document.filename}</b>
                  {editTagsFor === document.id ? (
                    <span className="doc-tags-editor" onClick={(event) => event.stopPropagation()}>
                      <input
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.target.value)}
                        placeholder="Thẻ phân tách bởi dấu phẩy"
                        onKeyDown={(event) => { if (event.key === "Enter") saveTagEdit(document); }}
                      />
                      <button className="btn small primary" onClick={() => saveTagEdit(document)}>Lưu</button>
                      <button className="btn small" onClick={() => setEditTagsFor("")}>Hủy</button>
                    </span>
                  ) : (
                    <span>{Math.round(document.sizeBytes / 1024)} KB · {document.knowledgeTags.join(", ")}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Pill tone="warn">Chưa RAG slide</Pill>
                  {document.fileUrl && <a className="btn small" href={document.fileUrl} target="_blank">Mở</a>}
                  {role === "teacher" && editTagsFor !== document.id && (
                    <button className="btn small" onClick={(event) => { event.stopPropagation(); startTagEdit(document); }}>Sửa thẻ</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card panel">
          <SectionTitle title="Công cụ AI" right={<Pill>Theo SGK</Pill>} />
          {summaryOpen ? (
            <div className="ai-summary">
              <button className="btn small" onClick={() => setSummaryOpen(false)}>← Quay lại</button>
              {summaryLoading && !latestSummary ? (
                <div className="ai-summary-loading">
                  <div className="spinner" />
                  <p>AI đang tóm tắt bài...</p>
                </div>
              ) : latestSummary ? (
                <div className="ai-summary-result">
                  <h3>Tóm tắt nội dung bài {latestSummary.title} <span className="ai-summary-tag">(Bài đang được chọn)</span></h3>
                  <MarkdownLite text={latestSummary.markdown} />
                  {!!latestSummary.imageRefs?.length && (
                    <div className="ai-summary-images">
                      {latestSummary.imageRefs.map((image, index) => (
                        <a key={`${image.url || image.caption}-${index}`} href={image.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={image.url} alt={image.caption || "Ảnh SGK"} />
                          {image.caption && <small>{image.caption}</small>}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="ai-summary-error">
                  <p>Không tạo được bản tóm tắt. Vui lòng thử lại.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="ai-tools" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <AIToolButton icon="✦" title="RAG Chat" caption="Hỏi theo bài hoặc tự retrieve" onClick={() => onLearningAction("rag", lessonId || undefined)} />
              {role === "teacher" && <AIToolButton icon="✓" title="Tạo Quiz" caption="Chọn bài và số câu ở màn Quiz" onClick={onQuiz} />}
              {role === "teacher" && <AIToolButton icon="◧" title="Tạo Flashcard" caption="Thuật ngữ mặt trước, định nghĩa mặt sau" onClick={() => onLearningAction("flash", lessonId || undefined)} />}
              <AIToolButton icon="≡" title="Tóm tắt bài" caption="Markdown + ảnh minh họa nếu có" onClick={() => { setSummaryOpen(true); onLearningAction("summary", lessonId || undefined); }} />
            </div>
          )}
          {!summaryOpen && (
            <div className="ai-note">
              RAG SGK, Quiz, Flashcard và Summary hiện chạy trực tiếp trong EduGeo. Slide upload được quản lý theo lớp; bước RAG slide sẽ nối vào pipeline sau.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
