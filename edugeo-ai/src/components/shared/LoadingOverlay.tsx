"use client";

export function LoadingOverlay({ message = "Đang xử lý..." }: { message?: string }) {
  return (
    <div className="modal-backdrop open" style={{ zIndex: 100 }}>
      <div className="loading-overlay">
        <div className="spinner" />
        <span>{message}</span>
      </div>
    </div>
  );
}