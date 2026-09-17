"use client";

import { Brand, Pill } from "./shared/Ui";

export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <section className="landing">
      <div className="spark s1" />
      <div className="spark s2" />
      <div className="spark s3" />
      <div className="spark s4" />
      <div className="spark s5" />
      <div className="spark s6" />
      <div className="landing-shell">
        <div className="landing-topbar">
          <Brand />
          <div className="mini-nav">
            <span className="tag">✨ RAG từ slide bài giảng</span>
            <span className="tag">🧠 Quiz / Flashcard / Tóm tắt</span>
            <span className="tag">👩‍🏫 Giáo viên & Học sinh</span>
          </div>
        </div>
        <div className="landing-grid">
          <div className="landing-copy">
            <div className="eyebrow"><span className="pulse" /> Web hỗ trợ giáo viên và học sinh học tập tốt hơn</div>
            <h1>
              Một không gian <span className="gradient-text">vừa thông minh, vừa xinh xắn</span> để dạy và học Lịch sử, Địa lý dễ hơn mỗi ngày.
            </h1>
            <p className="lead">
              Upload slide, hỏi AI theo nguồn tài liệu của bạn, tạo Quiz bằng AI, kiểm tra nội dung bằng Flashcard và bản tóm tắt,
              rồi giao bài cho đúng lớp chỉ với vài bước. Học sinh cũng có thể vào học, ôn tập và làm Quiz ngay trong cùng một hệ thống.
            </p>
            <div className="landing-cta">
              <button className="btn primary shiny" onClick={onStart}>Bắt đầu →</button>
              <div className="arrow-cta"><span>Mở không gian dạy học</span><span className="arrow">→</span></div>
            </div>
            <div className="stats-row">
              <div className="stat-chip"><b>RAG AI</b><span>Chat theo nguồn slide và tài liệu</span></div>
              <div className="stat-chip"><b>Quiz AI</b><span>Giáo viên duyệt trước khi giao lớp</span></div>
              <div className="stat-chip"><b>2 vai trò</b><span>Teacher & Student rõ ràng</span></div>
            </div>
            <div className="feature-band">
              <div className="item"><b>Upload Slide</b><span>Tạo nguồn dữ liệu từ PPTX/PDF để AI trả lời đúng ngữ cảnh.</span></div>
              <div className="item"><b>Rà soát bài giảng</b><span>Flashcard và Tóm tắt giúp giáo viên kiểm tra độ phủ kiến thức.</span></div>
              <div className="item"><b>Broadcast Quiz</b><span>Giao bài cho từng lớp với thông báo “Vào làm ngay”.</span></div>
              <div className="item"><b>VietGeoAI</b><span>Giữ riêng như module mở rộng để tích hợp ở giai đoạn tiếp theo.</span></div>
            </div>
          </div>
          <div className="landing-visual">
            <div className="float-card spark-box">
              <Pill tone="success">Bling bling ✨</Pill>
              <h5 style={{ marginTop: 10 }}>Giao diện vui vẻ</h5>
              <p>Nhẹ nhàng, hiện đại, dễ dùng cho cả giáo viên và học sinh.</p>
            </div>
            <div className="float-card hero">
              <div className="window-top"><span className="dot red" /><span className="dot yellow" /><span className="dot green" /></div>
              <div className="visual-panel">
                <div className="mini-surface">
                  <h4>Teacher Workspace</h4>
                  <div className="mock-graph" />
                  <div className="tiny-grid">
                    <div className="tiny-box"><b>Upload slide</b><span>PPTX, PDF → RAG ready</span></div>
                    <div className="tiny-box"><b>Quiz AI</b><span>Tạo, duyệt, broadcast</span></div>
                  </div>
                </div>
                <div className="mini-surface">
                  <h4>AI Assistant</h4>
                  <div className="bubble-list">
                    <div className="bubble ai">Slide này đã bao phủ đủ ý chính chưa?</div>
                    <div className="bubble user">Tạo 5 câu Quiz kiểm tra nhanh nhé.</div>
                    <div className="bubble ai">Đã tạo xong. Bạn có thể sửa trước khi giao cho lớp.</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="float-card quiz">
              <Pill tone="history">Lịch sử 10A1</Pill>
              <h5 style={{ marginTop: 10 }}>Quiz do AI tạo</h5>
              <p>Giáo viên kiểm tra lại câu hỏi, đáp án, phạm vi và thời gian làm bài trước khi broadcast.</p>
            </div>
            <div className="float-card notify">
              <Pill tone="geo">Học sinh</Pill>
              <h5 style={{ marginTop: 10 }}>Thông báo rõ ràng</h5>
              <p>“Giáo viên đã thêm Quiz mới” → nút <b>Vào làm ngay</b> giúp học sinh không bỏ lỡ bài được giao.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
