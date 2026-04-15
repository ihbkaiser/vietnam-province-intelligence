import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatBox() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // === LOGIC KÉO THẢ NÚT CHAT ===
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false); // Phân biệt Click và Drag
  const dragStart = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setHasMoved(false);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    // Nếu di chuyển chuột > 5px thì mới tính là Drag (chống click nhầm)
    if (Math.abs(e.clientX - dragStart.current.x - position.x) > 5 || 
        Math.abs(e.clientY - dragStart.current.y - position.y) > 5) {
      setHasMoved(true);
    }
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleToggleChat = () => {
    if (!hasMoved) {
      setIsOpen(!isOpen);
    }
  };
  // ===============================

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const newMessages = [...messages, { role: 'user', text: input }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
      });
      
      const data = await response.json();
      
      if (data.reply) {
        setMessages([...newMessages, { role: 'ai', text: data.reply }]);
      }
    } catch (error) {
      console.error("Lỗi:", error);
      setMessages([...newMessages, { role: 'ai', text: "Lỗi mất kết nối rồi!" }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* 1. NÚT BONG BÓNG CHAT (Kéo thả được) */}
      {!isOpen && (
        <button 
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={handleToggleChat}
          style={{ 
            transform: `translate(${position.x}px, ${position.y}px)`,
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none' // Chống cuộn trang khi kéo trên điện thoại
          }}
          className="fixed bottom-4 right-4 z-50 bg-blue-600 text-white p-4 rounded-full shadow-2xl hover:bg-blue-700 flex items-center justify-center gap-2 group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="font-bold hidden group-hover:block transition-all duration-300">
            Chat with AI
          </span>
        </button>
      )}

      {/* 2. KHUNG CHAT (Mở ra tại góc phải dưới) */}
      {isOpen && (
        <div 
          className="fixed bottom-4 right-4 z-50 bg-white border border-gray-300 rounded-xl shadow-2xl flex flex-col overflow-hidden resize"
          style={{ width: '400px', height: '600px', minWidth: '300px', minHeight: '400px', maxWidth: '90vw', maxHeight: '90vh' }}
        >
          {/* Header */}
          <div className="bg-blue-600 text-white p-3 font-bold flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
              </svg>
              Trợ lý Bản đồ AI
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-red-300 transition-colors p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Vùng tin nhắn (Đã tích hợp Markdown) */}
          <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-3 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 text-sm mt-4">
                Hãy hỏi tôi về thông tin sáp nhập tỉnh thành!
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={`p-2.5 rounded-lg max-w-[90%] text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white self-end rounded-br-none shadow-sm' : 'bg-white border border-gray-200 text-gray-800 self-start rounded-bl-none shadow-sm overflow-x-auto'}`}>
                {msg.role === 'user' ? (
                  msg.text
                ) : (
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({node, ...props}) => <table className="w-full text-left border-collapse border border-gray-300 my-2 text-sm" {...props} />,
                      th: ({node, ...props}) => <th className="border border-gray-300 bg-gray-100 px-3 py-2 font-bold" {...props} />,
                      td: ({node, ...props}) => <td className="border border-gray-300 px-3 py-2" {...props} />,
                      p: ({node, ...props}) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-2" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-2" {...props} />,
                      li: ({node, ...props}) => <li className="mb-1" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-bold text-gray-900" {...props} />,
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="bg-white border border-gray-200 text-gray-500 text-sm self-start p-2.5 rounded-lg rounded-bl-none shadow-sm animate-pulse">
                AI đang tìm dữ liệu...
              </div>
            )}
          </div>

          {/* Vùng nhập liệu */}
          <div className="p-3 border-t bg-white flex gap-2 shrink-0">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              className="flex-1 border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              placeholder="Nhập câu hỏi tại đây..."
            />
            <button 
              onClick={sendMessage}
              disabled={isLoading}
              className={`bg-blue-600 text-white px-4 rounded-lg flex items-center justify-center transition-colors ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 rotate-90" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}