import type { ReactNode } from "react";
import type { Subject } from "@/lib/types";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" style={compact ? { padding: "4px 8px 22px" } : undefined}>
      <div className="brand-mark">E</div>
      <div>
        <strong>EduGeo AI</strong>
        <span>{compact ? "History & Geography" : "Nền tảng hỗ trợ dạy & học thông minh"}</span>
      </div>
    </div>
  );
}

export function Pill({
  children,
  tone
}: {
  children: ReactNode;
  tone?: "success" | "warn" | "danger" | "history" | "geo" | "info";
}) {
  return <span className={`pill ${tone || ""}`}>{children}</span>;
}

export function SubjectMark({ subject }: { subject: Subject }) {
  const isGeo = subject === "geography";
  return <div className={`subject-mark ${isGeo ? "geo" : "history"}`}>{isGeo ? "ĐL" : "LS"}</div>;
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {right}
    </div>
  );
}

export function AIToolButton({
  icon,
  title,
  caption,
  onClick
}: {
  icon: string;
  title: string;
  caption: string;
  onClick?: () => void;
}) {
  return (
    <button className="tool" onClick={onClick}>
      <span className="tool-ico">{icon}</span>
      <b>{title}</b>
      <span>{caption}</span>
    </button>
  );
}
