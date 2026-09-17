"use client";

import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    pptx2html?: (data: ArrayBuffer, resultElement: Element | string, thumbElement?: Element | string) => Promise<number>;
  }
}

export function PptxSlideViewer({
  fileUrl,
  filename
}: {
  fileUrl: string;
  filename: string;
}) {
  const [index, setIndex] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<HTMLElement[]>([]);

  // Scale each rendered slide (real pixel size) down to fit the stage box,
  // preserving aspect ratio so text/shapes aren't stretched.
  const fitSlides = useCallback(() => {
    const stage = stageRef.current;
    const sections = sectionsRef.current;
    if (!stage || sections.length === 0) return;
    // Cancel the library's own wrapper scale (it re-applies on window resize,
    // which would double-scale against our per-section transforms).
    const wrapper = stage.querySelector<HTMLElement>(".pptx-wrapper");
    if (wrapper) {
      wrapper.style.transform = "none";
      wrapper.style.position = "relative";
      wrapper.style.width = "100%";
      wrapper.style.height = "100%";
    }
    const sw = stage.clientWidth || 320;
    const sh = stage.clientHeight || 320;
    sections.forEach((section) => {
      const nw = section.offsetWidth || sw;
      const nh = section.offsetHeight || sh;
      const scale = Math.min(sw / nw, sh / nh);
      section.style.position = "absolute";
      section.style.top = "50%";
      section.style.left = "50%";
      section.style.margin = "0";
      section.style.transform = `translate(-50%, -50%) scale(${scale})`;
      section.style.transformOrigin = "center center";
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setIndex(0);
    setSlideCount(0);
    sectionsRef.current = [];

    // pptx2html.full.js bundles JSZip v3 but uses removed v2 sync methods;
    // load the compatibility shim right after so render() can read images.
    const scripts = ["/vendor/pptx2html.full.js", "/vendor/pptx2html-shim.js"];
    const loaded: HTMLScriptElement[] = [];
    const loadNext = () => {
      if (cancelled) return;
      const src = scripts.shift();
      if (!src) {
        startRender();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => {
        loaded.push(s);
        loadNext();
      };
      s.onerror = () => {
        if (cancelled) return;
        setError(`Không thể tải thư viện hiển thị slide (${src})`);
        setLoading(false);
      };
      document.head.appendChild(s);
    };
    const startRender = () => {
      if (cancelled) return;
      fetch(fileUrl)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((buffer) => {
          if (cancelled || !stageRef.current) return;
          const renderer = window.pptx2html;
          if (!renderer) throw new Error("Thiếu thư viện hiển thị slide");
          const stage = stageRef.current;
          // Reset stage (React re-render would otherwise wipe our nodes)
          stage.innerHTML = "";
          return renderer(buffer, stage).then(() => {
            if (cancelled) return;
            const wrapper = stage.querySelector<HTMLElement>(".pptx-wrapper");
            const sections = Array.from(stage.querySelectorAll("section")) as HTMLElement[];
            if (sections.length === 0) throw new Error("File không có slide nào");
            // Kill the library's stacked-layout transform; we do our own slide layout.
            if (wrapper) {
              wrapper.style.transform = "none";
              wrapper.style.position = "relative";
              wrapper.style.width = "100%";
              wrapper.style.height = "100%";
            }
            sections.forEach((section) => {
              // Sections were appended stacked in normal flow; hide all but the
              // first via visibility (not display, so offsetWidth stays valid).
              section.style.visibility = "hidden";
            });
            sectionsRef.current = sections;
            setSlideCount(sections.length);
            setLoading(false);
            // Fit after the stage has real dimensions.
            requestAnimationFrame(fitSlides);
          });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Không thể hiển thị slide PPTX");
          setLoading(false);
        });
    };
    loadNext();

    return () => {
      cancelled = true;
      loaded.forEach((s) => {
        s.parentNode?.removeChild(s);
      });
    };
  }, [fileUrl, fitSlides]);

  // Re-fit when the stage box resizes (e.g. fullscreen toggles).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => fitSlides());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [fitSlides]);

  // Toggle visible slide by index (imperative — sections live outside React tree).
  useEffect(() => {
    const sections = sectionsRef.current;
    if (sections.length === 0) return;
    sections.forEach((section, i) => {
      section.style.visibility = i === index ? "visible" : "hidden";
    });
  }, [index, slideCount]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(slideCount - 1, i + 1)), [slideCount]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
      if (event.key === "Escape" && fullscreen) {
        document.exitFullscreen().catch(() => undefined);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goPrev, goNext, fullscreen]);

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setFullscreen(true)).catch(() => undefined);
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => undefined);
    }
  }

  useEffect(() => {
    function onFsChange() {
      setFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  return (
    <div ref={containerRef} className={`pptx-viewer ${fullscreen ? "fullscreen" : ""}`}>
      <div className="pptx-slide-area">
        <div className="pptx-slide-stage" ref={stageRef} />
        {loading && (
          <div className="pptx-status">
            <p style={{ color: "var(--muted)" }}>Đang tải slide...</p>
          </div>
        )}
        {error && (
          <div className="pptx-status">
            <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>
            <a className="btn primary" href={fileUrl} target="_blank" rel="noopener noreferrer">Tải file PPTX</a>
          </div>
        )}
        {!loading && !error && slideCount === 0 && (
          <div className="pptx-status">
            <p style={{ color: "var(--muted)" }}>Không tìm thấy slide nào trong file.</p>
            <a className="btn primary" href={fileUrl} target="_blank" rel="noopener noreferrer">Tải file PPTX</a>
          </div>
        )}
      </div>
      <div className="pptx-toolbar">
        <div className="pptx-counter">{filename} · Slide {index + 1} / {slideCount || "–"}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="pptx-nav-btn" disabled={loading || !!error || slideCount === 0 || index === 0} onClick={goPrev}>← Trước</button>
          <button className="pptx-nav-btn" disabled={loading || !!error || slideCount === 0 || index === slideCount - 1} onClick={goNext}>Sau →</button>
          <button className="pptx-fullscreen-btn" disabled={loading || !!error || slideCount === 0} onClick={toggleFullscreen}>
            {fullscreen ? "⛶ Thu nhỏ" : "⛶ Toàn màn hình"}
          </button>
          <a className="pptx-nav-btn" href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>⬇ Tải</a>
        </div>
      </div>
    </div>
  );
}
