"use client";

export function markdownInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </span>
  );
}

/** Render a short markdown block (headings, bullets, bold) without extra deps. */
export function MarkdownLite({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  function flushBullets() {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {bullets.map((item, index) => <li key={`${item}-${index}`}>{markdownInline(item)}</li>)}
      </ul>
    );
    bullets = [];
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushBullets();
      return;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flushBullets();
    if (line.startsWith("### ")) {
      blocks.push(<h4 key={`h4-${index}`}>{markdownInline(line.slice(4))}</h4>);
    } else if (line.startsWith("## ")) {
      blocks.push(<h3 key={`h3-${index}`}>{markdownInline(line.slice(3))}</h3>);
    } else {
      blocks.push(<p key={`p-${index}`}>{markdownInline(line)}</p>);
    }
  });
  flushBullets();
  return <div className="markdown-lite">{blocks}</div>;
}
