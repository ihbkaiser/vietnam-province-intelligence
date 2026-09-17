"use client";

import { useMemo } from "react";
import type { ClassRoom, TeachingDocument, User } from "@/lib/types";
import { Pill, SectionTitle } from "../shared/Ui";
import { DashboardHero } from "../dashboard/DashboardHero";
import { VietnamSilhouetteMap } from "../dashboard/VietnamSilhouetteMap";

export function DashboardView({
  user,
  classes,
  documents,
  onCreateClass,
  onGoClasses,
  onGoWorkspace,
  onGoQuiz,
  onGoVietGeo,
  onLearningAction
}: {
  user: User;
  classes: ClassRoom[];
  documents: TeachingDocument[];
  onCreateClass: () => void;
  onGoClasses: () => void;
  onGoWorkspace: () => void;
  onGoQuiz: () => void;
  onGoVietGeo: () => void;
  onLearningAction: (action: "rag" | "flash" | "summary", lessonId?: string) => void;
}) {
  const students = classes.reduce((sum, item) => sum + item.studentIds.length, 0);
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return { label: "sáng", theme: "morning" as const, icon: "☀" };
    if (hour >= 12 && hour < 18) return { label: "chiều", theme: "afternoon" as const, icon: "●" };
    return { label: "tối", theme: "evening" as const, icon: "✦" };
  }, []);

  return (
    <section className={`view active dash-scene ${greeting.theme}`}>
      <DashboardHero
        theme={greeting.theme}
        greeting={`Chào buổi ${greeting.label}, ${user.displayName} 👋`}
        subtitle="Mọi thứ cho tiết dạy Lịch sử & Địa lý hôm nay đang ở đây."
        flag={<img src="/flag-vn.svg" alt="Cờ Việt Nam" className="dash-flag" />}
      >
        <div className="dash-hero-cta">
          <button className="btn primary" onClick={onCreateClass}>＋ Tạo lớp mới</button>
          <button className="btn" onClick={onGoClasses}>▦ Lớp học · {classes.length} lớp · {students} học sinh</button>
        </div>
      </DashboardHero>

      <div className="dash-quick-actions">
        <button className="qa-btn" onClick={onGoClasses}>
          <span className="qa-icon">▦</span>
          <span className="qa-label">Lớp học</span>
        </button>
        <button className="qa-btn" onClick={onGoWorkspace}>
          <span className="qa-icon">📄</span>
          <span className="qa-label">Slide &amp; AI</span>
        </button>
        <button className="qa-btn" onClick={onGoQuiz}>
          <span className="qa-icon">📝</span>
          <span className="qa-label">Tạo Quiz</span>
        </button>
        <button className="qa-btn" onClick={() => onLearningAction("flash")}>
          <span className="qa-icon">🔖</span>
          <span className="qa-label">Flashcard</span>
        </button>
        <button className="qa-btn" onClick={onGoVietGeo}>
          <span className="qa-icon">🗺</span>
          <span className="qa-label">VietGeoAI</span>
        </button>
      </div>

      <div className="grid dash-grid">
        <div className="card panel">
          <SectionTitle
            title="Bản đồ Việt Nam"
            right={<Pill tone="geo">34 tỉnh/thành 2025</Pill>}
          />
          <p className="panel-hint">Di chuột lên từng tỉnh để xem tên. Quần đảo Hoàng Sa và Trường Sa thuộc chủ quyền Việt Nam.</p>
          <VietnamSilhouetteMap />
        </div>

        <div className="card panel dash-people">
          <SectionTitle title="Việt Nam – Đất nước & Con người" right={<Pill>Di sản</Pill>} />
          <figure className="uncle-ho-frame">
            <img src="/uncle-ho.jpg" alt="Chân dung Chủ tịch Hồ Chí Minh (ảnh lịch sử 1946, Wikimedia Commons)" loading="lazy" />
            <figcaption>Chủ tịch Hồ Chí Minh</figcaption>
          </figure>
          <blockquote className="uncle-ho-quote">
            “Nước Việt Nam là một, dân tộc Việt Nam là một...”
          </blockquote>
        </div>
      </div>
    </section>
  );
}