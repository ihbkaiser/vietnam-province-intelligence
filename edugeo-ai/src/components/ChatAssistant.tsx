"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatMessage, LessonRecord, NotebookSource, Role } from "@/lib/types";
import { api } from "@/lib/apiClient";
import { markdownInline, MarkdownLite } from "./shared/MarkdownLite";

function sourceTitle(source: NotebookSource, index: number) {
  const meta = source.metadata || {};
  const marker = `S${index + 1}`;
  const lesson = meta.lesson_title || meta.section || "Nguồn SGK";
  const page = meta.page ? `trang ${meta.page}` : "trang liên quan";
  return `${marker} · ${lesson} · ${page}`;
}

function sourceSnippet(source: NotebookSource) {
  const text = source.snippet || source.text || "";
  return text.length > 260 ? `${text.slice(0, 257).trim()}...` : text;
}

const assetVersion = Date.now().toString(36);

function assetUrl(url?: string | null) {
  if (!url) return "";
  return `${url}${url.includes("?") ? "&" : "?"}v=${assetVersion}`;
}

function SourceList({ sources }: { sources?: NotebookSource[] }) {
  const displaySources = (sources || []).slice(0, 3);
  if (!displaySources.length) return null;
  return (
    <div className="chat-sources">
      <b>Dẫn chứng</b>
      {displaySources.map((source, index) => (
        <div className="chat-source" key={`${source.metadata?.chunk_id || "source"}-${index}`}>
          <span>{sourceTitle(source, index)}</span>
          <p>{sourceSnippet(source)}</p>
          {!!source.images?.length && (
            <div className="chat-source-images">
              {source.images.filter((image) => image.url).slice(0, 2).map((image) => {
                const imageSrc = assetUrl(image.url);
                return (
                  <a href={imageSrc || "#"} target="_blank" rel="noreferrer" key={image.url || image.path || image.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageSrc}
                      alt={image.caption || image.label || "Ảnh SGK"}
                      onError={(event) => {
                        const img = event.currentTarget;
                        if (img.dataset.retried || !image.url) return;
                        img.dataset.retried = "1";
                        img.src = `${assetUrl(image.url)}&retry=${Date.now()}`;
                      }}
                    />
                    <small>{image.caption || image.label || `Trang ${image.page_number || source.metadata?.page || ""}`}</small>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`msg ${message.role}`}>
      <MarkdownLite text={message.role === "ai" ? message.content.replace(/\s*\[S\d+\]/g, "").replace(/[ \t]+([,.!?;:])/g, "$1").trim() : message.content} />
      {message.role === "ai" && (message.provider || message.model) && (
        <div className="chat-model-badge">
          {message.provider || "notebooklm"}
          {message.model ? ` · ${message.model}` : ""}
        </div>
      )}
    </div>
  );
}

export function ChatAssistant({
  token,
  role,
  classId,
  classGrade,
  lessons
}: {
  token: string;
  role: Role;
  classId?: string;
  classGrade?: number;
  lessons: LessonRecord[];
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [selectedGrade, setSelectedGrade] = useState<number>(classGrade || 6);
  const [loading, setLoading] = useState(false);

  const availableGrades = [6, 7, 8, 9];

  const lessonOptions = useMemo(
    () => lessons.filter((lesson) => lesson.lesson_id && (lesson.class_level || 6) === selectedGrade),
    [selectedGrade, lessons]
  );
  useEffect(() => {
    if (!lessonOptions.some((lesson) => lesson.lesson_id === lessonId)) setLessonId("");
  }, [lessonId, lessonOptions]);
  const [messages, setMessages] = useState<ChatMessage[]>([]); /*
    {
      id: "hello",
      role: "ai",
      content:
        "Chào bạn. Mình trả lời bằng pipeline RAG đã lập chỉ mục từ SGK. Bạn có thể chọn một bài cụ thể, hoặc để hệ thống tự truy xuất nguồn phù hợp."
    }
  */

  async function send() {
    const query = input.trim();
    if (!query || loading) return;
    setInput("");
    setLoading(true);
    setMessages((items) => [...items, { id: `user-${Date.now()}`, role: "user", content: query }]);
    try {
      const response = await api.chat(token, { query, classId, lessonId: lessonId || undefined, classLevel: selectedGrade });
      setMessages((items) => [...items, response.message]);
    } catch (error) {
      setMessages((items) => [
        ...items,
        {
          id: `ai-${Date.now()}`,
          role: "ai",
          content: error instanceof Error ? error.message : "Mình chưa trả lời được câu này. Bạn thử chọn bài cụ thể hơn nhé."
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="fab" aria-label="Mở trợ lý RAG" onClick={() => setOpen((value) => !value)}>✦</button>
      <div className={`chat ${open ? "open" : ""}`}>
        <div className="chat-head">
          <div>
            <b>EduGeo RAG Assistant</b>
            <span>{role === "teacher" ? "Nguồn: SGK + lớp đang chọn" : "Nguồn: SGK của lớp"}</span>
          </div>
          <button className="chat-close" aria-label="Đóng trợ lý RAG" onClick={() => setOpen(false)}>×</button>
        </div>
        <div className="chat-filter">
          <div className="chat-filter-row">
            {availableGrades.length > 1 && (
              <div className="chat-filter-group">
                <label>Lớp</label>
                <select value={selectedGrade} onChange={(event) => { setSelectedGrade(Number(event.target.value)); setLessonId(""); }}>
                  {availableGrades.map((grade) => (
                    <option key={grade} value={grade}>Lớp {grade}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="chat-filter-group">
              <label>Bài SGK</label>
              <select value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
                <option value="">{lessonOptions.length === 0 ? `Chưa có dữ liệu SGK Lớp ${selectedGrade}` : "Tự tìm nguồn phù hợp"}</option>
                {lessonOptions.map((lesson) => (
                  <option key={lesson.lesson_id} value={lesson.lesson_id}>
                    {lesson.subject_label} · {lesson.lesson_title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="chat-body">
          {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
          {loading && (
            <div className="msg ai">
              <p>Đang truy xuất nguồn bằng NotebookLM RAG và gọi DeepSeek V4 Flash...</p>
            </div>
          )}
        </div>
        <div className="chat-input">
          <input
            value={input}
            placeholder="Hỏi về nội dung bài học..."
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void send(); }}
          />
          <button disabled={loading} onClick={() => void send()}>Gửi</button>
        </div>
      </div>
    </>
  );
}
