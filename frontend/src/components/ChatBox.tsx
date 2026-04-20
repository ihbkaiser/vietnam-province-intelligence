import { FormEvent, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type ChatMessage = {
  role: 'user' | 'ai';
  text: string;
};

const QUICK_PROMPTS = [
  'Tóm tắt Quảng Ninh sau cải cách hành chính',
  'Quảng Ninh có bao nhiêu đơn vị cấp xã?',
  'Nêu các điểm mạnh kinh tế của Quảng Ninh'
];

export default function ChatBox() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

  const sendMessage = async (messageText = input) => {
    const trimmed = messageText.trim();
    if (!trimmed || isLoading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed })
      });

      if (!response.ok) {
        throw new Error('Không thể kết nối tới dịch vụ AI.');
      }

      const data = await response.json();
      setMessages([...nextMessages, { role: 'ai', text: data.reply ?? 'Chưa có phản hồi phù hợp.' }]);
    } catch (error) {
      console.error('Lỗi:', error);
      setMessages([
        ...nextMessages,
        { role: 'ai', text: 'Dạ, tôi chưa kết nối được tới dịch vụ AI. Bạn thử lại sau một lát nhé.' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white shadow-panel transition hover:bg-tide focus:outline-none focus:ring-4 focus:ring-tide/20"
          aria-label="Mở trợ lý VIETGEOAI"
        >
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12a7 7 0 0 1 14 0v1a7 7 0 0 1-7 7H8l-4 2 1.2-4.1A7 7 0 0 1 5 13v-1Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h.01M12 12h.01M15 12h.01" />
          </svg>
          <span className="hidden sm:inline">Hỏi AI</span>
        </button>
      )}

      {isOpen && (
        <section
          className="fixed bottom-4 right-4 z-50 flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel"
          style={{ width: 'min(420px, calc(100vw - 2rem))', height: 'min(640px, calc(100vh - 2rem))' }}
          aria-label="Trợ lý VIETGEOAI"
        >
          <div className="flex min-h-0 w-full flex-col">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-ink px-4 py-3 text-white">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12">
                  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 10h5M12 7.5v5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Trợ lý VIETGEOAI</p>
                  <p className="truncate text-xs text-white/65">Hỏi nhanh về dữ liệu tỉnh thành</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                aria-label="Đóng trợ lý AI"
              >
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-sand p-4">
              {messages.length === 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
                  <p className="text-sm font-semibold text-ink">Bạn có thể hỏi về địa giới, kinh tế, dân cư, du lịch hoặc văn hóa địa phương.</p>
                  <div className="mt-4 flex flex-col gap-2">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-ink/72 transition hover:border-tide/40 hover:bg-mist"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-col gap-3">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`max-w-[92%] rounded-lg px-3 py-2.5 text-sm leading-6 shadow-soft ${
                      message.role === 'user'
                        ? 'self-end bg-ink text-white'
                        : 'self-start border border-slate-200 bg-white text-ink'
                    }`}
                  >
                    {message.role === 'user' ? (
                      message.text
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({ node, ...props }) => (
                            <table className="my-2 w-full border-collapse border border-slate-300 text-left text-sm" {...props} />
                          ),
                          th: ({ node, ...props }) => (
                            <th className="border border-slate-300 bg-sand px-3 py-2 font-semibold" {...props} />
                          ),
                          td: ({ node, ...props }) => (
                            <td className="border border-slate-300 px-3 py-2" {...props} />
                          ),
                          p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                          ul: ({ node, ...props }) => <ul className="mb-2 list-disc pl-5" {...props} />,
                          ol: ({ node, ...props }) => <ol className="mb-2 list-decimal pl-5" {...props} />,
                          li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                          strong: ({ node, ...props }) => <strong className="font-semibold text-ink" {...props} />
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-ink/55 shadow-soft">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-tide" />
                    Đang tìm thông tin...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex shrink-0 gap-2 border-t border-slate-200 bg-white p-3">
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="app-input min-w-0 flex-1 rounded-lg px-3 py-2.5 text-sm"
                placeholder="Nhập câu hỏi về bản đồ, tỉnh thành..."
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tide text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Gửi câu hỏi"
              >
                <svg aria-hidden="true" className="h-5 w-5 rotate-90" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 0 0-1.788 0l-7 14a1 1 0 0 0 1.169 1.409l5-1.429A1 1 0 0 0 9 15.571V11a1 1 0 1 1 2 0v4.571a1 1 0 0 0 .725.962l5 1.428a1 1 0 0 0 1.17-1.408l-7-14Z" />
                </svg>
              </button>
            </form>
          </div>
        </section>
      )}
    </>
  );
}
