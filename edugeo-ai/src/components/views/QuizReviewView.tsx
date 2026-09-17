"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isDisplayableImageUrl, normalizeAssetUrl } from "@/lib/assets";
import type { ClassRoom, LessonRecord, Quiz, QuizQuestion, Subject, TeachingDocument } from "@/lib/types";
import { Pill, SectionTitle } from "../shared/Ui";

type PendingDelete = { index: number; label: string } | null;
type WizardStep = 1 | 2 | 3;

function stripQuestionPrefix(prompt: string): string {
  return prompt.replace(/^Câu\s+\d+\.\s*/iu, "").trim();
}

function questionLabel(index: number): string {
  return `Câu ${index + 1}`;
}

function withQuestionPrefix(prompt: string, index: number): string {
  return `${questionLabel(index)}. ${stripQuestionPrefix(prompt) || "Nhập câu hỏi mới tại đây"}`;
}

function renumberQuestions(questions: QuizQuestion[]): QuizQuestion[] {
  return questions.map((question, index) => ({
    ...question,
    prompt: withQuestionPrefix(question.prompt, index),
    options: question.options.map((option, optionIndex) => ({
      ...option,
      label: String.fromCharCode(65 + optionIndex)
    }))
  }));
}

function updateQuestion(questions: QuizQuestion[], index: number, patch: Partial<QuizQuestion>): QuizQuestion[] {
  return questions.map((question, current) => current === index ? { ...question, ...patch } : question);
}

function subjectFromLesson(lesson?: LessonRecord): Subject {
  if (lesson?.subject === "history") return "history";
  if (lesson?.subject === "geography") return "geography";
  return "mixed";
}

export function QuizReviewView({
  quiz,
  classes,
  documents,
  lessons,
  onGenerate,
  onSave,
  onPublish
}: {
  quiz: Quiz | null;
  classes: ClassRoom[];
  documents: TeachingDocument[];
  lessons: LessonRecord[];
  onGenerate: (input: { title: string; subject: Subject; classId?: string; documentId?: string; knowledgeScope?: string; lessonId?: string; count: number; durationMinutes?: number; skipAI?: boolean }) => void;
  onSave: (questions: QuizQuestion[], status?: Quiz["status"]) => void;
  onPublish: (classId: string, dueAt: string, durationMinutes?: number) => void;
}) {
  const active = quiz;
  const questions = active?.questions || [];
  const [step, setStep] = useState<WizardStep>(1);
  const [classId, setClassId] = useState(active?.classId || classes[0]?.id || "");
  const [lessonId, setLessonId] = useState(active?.lessonId || lessons.find((lesson) => lesson.subject === "geography")?.lesson_id || lessons[0]?.lesson_id || "");
  const [count, setCount] = useState(10);
  const [topic, setTopic] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(active?.durationMinutes || 15);
  const [dueAt, setDueAt] = useState("");
  const [menuQuestionId, setMenuQuestionId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PendingDelete>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadQuestionIndexRef = useRef<number | null>(null);

  const classRoom = classes.find((item) => item.id === classId) || classes[0];
  const availableLessons = useMemo(
    () => (classRoom?.grade && classRoom.grade !== 6 ? [] : lessons),
    [classRoom?.grade, lessons]
  );
  const selectedLesson = useMemo(
    () => availableLessons.find((lesson) => lesson.lesson_id === lessonId),
    [availableLessons, lessonId]
  );

  useEffect(() => {
    if (!availableLessons.some((lesson) => lesson.lesson_id === lessonId)) {
      setLessonId(availableLessons[0]?.lesson_id || "");
    }
  }, [availableLessons, lessonId]);

  useEffect(() => {
    setClassId(active?.classId || classes[0]?.id || "");
    if (active?.durationMinutes) setDurationMinutes(active.durationMinutes);
  }, [active?.classId, active?.durationMinutes, classes]);

  // Reset "Hạn hoàn thành" to now + 1 hour whenever step 3 opens.
  useEffect(() => {
    if (step !== 3) return;
    const now = new Date();
    now.setMinutes(now.getMinutes() + 60);
    const pad = (value: number) => String(value).padStart(2, "0");
    setDueAt(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`);
  }, [step]);

  function saveQuestions(nextQuestions: QuizQuestion[], status: Quiz["status"] = "reviewing") {
    onSave(renumberQuestions(nextQuestions), status);
  }

  function generate(skipAI: boolean) {
    const title = topic.trim() || selectedLesson?.lesson_title || "Quiz ôn tập";
    onGenerate({
      title,
      subject: subjectFromLesson(selectedLesson),
      classId: classRoom?.id,
      documentId: documents.find((document) => document.classId === classRoom?.id)?.id || documents[0]?.id,
      knowledgeScope: topic.trim() || selectedLesson?.lesson_title || title,
      lessonId: selectedLesson?.lesson_id,
      count,
      durationMinutes,
      skipAI
    });
    // Either button advances to step 2 (Duyệt & sửa). For the AI flow the loading
    // overlay covers the screen until the draft is ready; for manual creation the
    // blank quiz appears here ready for editing.
    setStep(2);
  }

  function addManualQuestion() {
    const now = Date.now();
    const id = `q-local-${now}`;
    const nextQuestion: QuizQuestion = {
      id,
      prompt: `${questionLabel(questions.length)}. Nhập câu hỏi mới tại đây`,
      imageRefs: [],
      options: [1, 2, 3, 4].map((number, index) => ({
        id: `opt-local-${now}-${number}`,
        label: String.fromCharCode(65 + index),
        text: `Lựa chọn ${number}`,
        isCorrect: index === 0
      }))
    };
    saveQuestions([...questions, nextQuestion]);
    setEditingQuestionId(id);
    setMenuQuestionId(null);
  }

  function removeQuestion(index: number) {
    saveQuestions(questions.filter((_question, current) => current !== index));
    setDeleteTarget(null);
    setMenuQuestionId(null);
    setEditingQuestionId(null);
  }

  function removeImage(questionIndex: number, imageIndex: number) {
    const question = questions[questionIndex];
    const nextImages = (question.imageRefs || []).filter((_image, current) => current !== imageIndex);
    saveQuestions(updateQuestion(questions, questionIndex, { imageRefs: nextImages }));
  }

  function openImagePicker(questionIndex: number) {
    uploadQuestionIndexRef.current = questionIndex;
    fileInputRef.current?.click();
  }

  function addUploadedImage(file: File) {
    const questionIndex = uploadQuestionIndexRef.current;
    if (questionIndex === null) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      if (!url) return;
      const question = questions[questionIndex];
      if (!question) return;
      const nextImages = [
        ...(question.imageRefs || []),
        {
          url,
          caption: file.name.replace(/\.[^.]+$/, "") || "Ảnh minh họa"
        }
      ];
      saveQuestions(updateQuestion(questions, questionIndex, { imageRefs: nextImages }));
    };
    reader.readAsDataURL(file);
  }

  function handlePublish() {
    onPublish(classId, dueAt, durationMinutes);
  }

  return (
    <section className="view active">
      <div className="page-head">
        <div>
          <h1>Tạo Quiz</h1>
          <p>Chọn bài, tạo nháp bằng AI (hoặc tự tạo), duyệt & sửa rồi giao cho lớp.</p>
        </div>
        {active && (
          <button className="btn" onClick={() => saveQuestions(questions, "reviewing")}>Lưu nháp</button>
        )}
      </div>

      <div className="quiz-builder">
        <div className="card quiz-main">
          <div className="quiz-step">
            <div className={`step ${step === 1 ? "active" : ""}`}><i>1</i>Tạo bằng AI</div>
            <div className="step-line" />
            <div className={`step ${step === 2 ? "active" : ""}`}><i>2</i>Duyệt & sửa</div>
            <div className="step-line" />
            <div className={`step ${step === 3 ? "active" : ""}`}><i>3</i>Giao cho lớp</div>
          </div>

          {step === 1 && (
            <>
              <SectionTitle title="Cấu hình tạo Quiz" right={<Pill>{questions.length || count} câu</Pill>} />
              <div className="quiz-config-grid">
                <div className="field">
                  <label>Lớp nhận Quiz</label>
                  <select value={classId} onChange={(event) => setClassId(event.target.value)}>
                    {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Bài theo SGK</label>
                  <select value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
                    {availableLessons.map((lesson) => <option key={lesson.lesson_id} value={lesson.lesson_id}>{lesson.subject_label} · {lesson.lesson_title}</option>)}
                    {!availableLessons.length && <option value="">Chưa có dữ liệu SGK cho lớp này</option>}
                  </select>
                </div>
                <div className="field">
                  <label>Chủ đề</label>
                  <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Để trống nếu muốn lấy toàn bộ bài" />
                </div>
                <div className="field">
                  <label>Số lượng câu hỏi</label>
                  <input type="number" min={1} max={50} value={count} onChange={(event) => setCount(Number(event.target.value) || 1)} />
                </div>
                <div className="field span-2">
                  <label>Tài liệu slide của lớp</label>
                  <select defaultValue={active?.documentId || documents.find((document) => document.classId === classRoom?.id)?.id || documents[0]?.id || ""}>
                    {documents.map((document) => <option key={document.id} value={document.id}>{document.filename}</option>)}
                    {!documents.length && <option value="">Chưa có slide</option>}
                  </select>
                </div>
              </div>
              <div className="quiz-step-actions">
                <button className="btn primary" onClick={() => generate(false)} disabled={!classRoom}>
                  ✦ Tạo Quiz với AI
                </button>
                <button className="btn" onClick={() => generate(true)} disabled={!classRoom}>
                  ✍️ Tự tạo Quiz
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {questions.length === 0 && (
                <div className="ai-note">Chưa có câu hỏi nào. Bấm “＋ Thêm câu hỏi thủ công” để tự tạo, hoặc quay lại bước 1 để tạo bằng AI.</div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) addUploadedImage(file);
                  event.target.value = "";
                }}
              />

              {questions.map((question, questionIndex) => {
                const isEditing = editingQuestionId === question.id;
                const seenImages = new Set<string>();
                const images = (question.imageRefs || [])
                  .map((image, imageIndex) => {
                    const src = normalizeAssetUrl(image.url);
                    return { image: { ...image, url: src }, imageIndex, src };
                  })
                  .filter((item) => {
                    if (!isDisplayableImageUrl(item.src) || brokenImages.has(item.src) || seenImages.has(item.src)) return false;
                    seenImages.add(item.src);
                    return true;
                  });
                return (
                  <div className={`question ${isEditing ? "editing" : ""}`} key={question.id}>
                    <div className="q-top">
                      <textarea
                        rows={2}
                        readOnly={!isEditing}
                        value={question.prompt}
                        onChange={(event) => saveQuestions(updateQuestion(questions, questionIndex, { prompt: event.target.value }))}
                      />
                      <div className="q-actions">
                        {isEditing ? (
                          <button className="btn small primary" onClick={() => setEditingQuestionId(null)}>Xong</button>
                        ) : (
                          <button
                            className="btn small"
                            aria-label={`${questionLabel(questionIndex)} menu`}
                            onClick={() => setMenuQuestionId((current) => current === question.id ? null : question.id)}
                          >
                            ⋯
                          </button>
                        )}
                        {!isEditing && menuQuestionId === question.id && (
                          <div className="question-menu">
                            <button onClick={() => { setEditingQuestionId(question.id); setMenuQuestionId(null); }}>Sửa</button>
                            <button className="danger" onClick={() => setDeleteTarget({ index: questionIndex, label: questionLabel(questionIndex) })}>Xóa</button>
                          </div>
                        )}
                      </div>
                    </div>

                    {images.length ? (
                      <div className="quiz-images">
                        {images.map(({ image, imageIndex, src }) => (
                          <figure key={`${src}-${imageIndex}`}>
                            {isEditing && (
                              <button className="image-remove" type="button" onClick={() => removeImage(questionIndex, imageIndex)}>
                                ×
                              </button>
                            )}
                            <img
                              src={src}
                              alt={image.caption || "Ảnh minh họa"}
                              onError={() => setBrokenImages((current) => new Set(current).add(src))}
                            />
                            <figcaption>{image.caption || "Ảnh minh họa"}</figcaption>
                          </figure>
                        ))}
                      </div>
                    ) : null}

                    {isEditing && (
                      <button className="btn small quiz-add-image" type="button" onClick={() => openImagePicker(questionIndex)}>
                        + Thêm ảnh
                      </button>
                    )}

                    {question.options.map((option, optionIndex) => (
                      <div className={`answer ${option.isCorrect ? "correct" : ""}`} key={option.id}>
                        <input
                          type="radio"
                          name={question.id}
                          checked={option.isCorrect}
                          disabled={!isEditing}
                          onChange={() => {
                            const updated = question.options.map((item, current) => ({ ...item, isCorrect: current === optionIndex }));
                            saveQuestions(updateQuestion(questions, questionIndex, { options: updated }));
                          }}
                        />
                        {isEditing ? (
                          <input
                            type="text"
                            value={option.text}
                            onChange={(event) => {
                              const updated = question.options.map((item, current) => current === optionIndex ? { ...item, text: event.target.value } : item);
                              saveQuestions(updateQuestion(questions, questionIndex, { options: updated }));
                            }}
                          />
                        ) : (
                          <span className="answer-text"><b>{option.label}.</b> {option.text}</span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <button className="btn" onClick={addManualQuestion}>
                  ＋ Thêm câu hỏi thủ công
                </button>
                <button className="btn primary broadcast-primary" disabled={!questions.length} onClick={() => setStep(3)}>
                  Hoàn thành →
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <SectionTitle title="Giao Quiz cho lớp" right={<Pill>{questions.length} câu</Pill>} />
              <div className="quiz-config-grid">
                <div className="field">
                  <label>Quiz</label>
                  <input value={active?.title || "Quiz đang tạo"} disabled />
                </div>
                <div className="field">
                  <label>Lớp nhận Quiz</label>
                  <select value={classId} onChange={(event) => setClassId(event.target.value)}>
                    {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Thời gian làm bài</label>
                  <input type="number" min={1} max={180} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value) || 15)} />
                  <small className="field-hint">Đơn vị phút</small>
                </div>
                <div className="field">
                  <label>Hạn hoàn thành</label>
                  <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                </div>
              </div>
              <div className="ai-note">Học sinh trong lớp sẽ nhận thông báo và nút vào làm bài. Đảm bảo câu hỏi và đáp án đã được duyệt trước khi giao.</div>
              <div className="quiz-publish-row">
                <button className="btn" onClick={() => setStep(2)}>← Quay lại</button>
                <button className="btn primary broadcast-primary" onClick={handlePublish}>
                  📣 Giao cho lớp
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={`modal-backdrop ${deleteTarget ? "open" : ""}`} onClick={() => setDeleteTarget(null)}>
        <div className="modal confirm-modal" onClick={(event) => event.stopPropagation()}>
          <h3>Xác nhận xóa câu hỏi {deleteTarget?.label}?</h3>
          <p>Câu hỏi này sẽ bị xóa khỏi bản nháp Quiz hiện tại.</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setDeleteTarget(null)}>Hủy</button>
            <button className="btn danger-outline" onClick={() => deleteTarget && removeQuestion(deleteTarget.index)}>Xóa</button>
          </div>
        </div>
      </div>
    </section>
  );
}
