import { useState, useEffect, useRef, useCallback } from "react";
import { getSession, streamQuery, getSessionFiles } from "../api/client";
import MessageBubble from "./MessageBubble";
import FileTree from "./FileTree";

const FALLBACK_SUGGESTIONS = [
  "What does this codebase do?",
  "How is authentication handled?",
  "Explain the database models",
];

function EmptyState({ onSelect, suggestions }) {
  const questions = suggestions?.length === 3 ? suggestions : FALLBACK_SUGGESTIONS;
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-5 shadow-xl shadow-indigo-200/50 dark:shadow-indigo-950/50">
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2 tracking-tight">Ask anything about your codebase</h2>
      <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs leading-relaxed">
        Upload a repo ZIP, then ask questions. RepoMind finds the exact functions and classes that answer you.
      </p>
      <div className="mt-7 flex flex-col gap-2 w-full max-w-sm">
        {questions.map((q) => (
          <button key={q} onClick={() => onSelect(q)}
            className="flex items-center gap-3 text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 text-sm text-slate-600 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-700 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all shadow-sm"
          >
            <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </span>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChatWindow({ sessionId, showTree, onToggleTree, onMessagesChange, onSessionCreated, onStaleSession }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [treeFiles, setTreeFiles] = useState([]);
  const [error, setError] = useState(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const nearBottomRef = useRef(true);

  useEffect(() => { onMessagesChange?.(messages); }, [messages]);

  useEffect(() => {
    if (!sessionId) { setMessages([]); setError(null); setSuggestedQuestions([]); return; }
    setError(null);
    getSession(sessionId)
      .then(({ data }) => {
        setMessages(data.messages || []);
        setSuggestedQuestions(data.suggested_questions || []);
      })
      .catch((err) => {
        if (err.response?.status === 404) {
          // Stale session stored in localStorage — clear it and return to upload
          onStaleSession?.();
        } else {
          setError("Could not load chat history. The database may be unavailable.");
        }
      });
  }, [sessionId]);

  // Auto-scroll only when user is near the bottom
  useEffect(() => {
    if (nearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (showTree && sessionId) {
      getSessionFiles(sessionId).then(({ data }) => setTreeFiles(data.files || [])).catch(() => {});
    }
  }, [showTree, sessionId]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  }, []);

  const updateLastMessage = (updater) =>
    setMessages((prev) => {
      const msgs = [...prev];
      msgs[msgs.length - 1] = updater(msgs[msgs.length - 1]);
      return msgs;
    });

  const submit = async (override) => {
    const q = (typeof override === "string" ? override : input).trim();
    if (!q || loading || !sessionId) return;

    nearBottomRef.current = true;
    setMessages((prev) => [...prev, { role: "user", content: q, citations: [] }]);
    setInput("");
    setLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    // Streaming placeholder — MessageBubble shows dots when content is empty
    setMessages((prev) => [...prev, { role: "assistant", content: "", citations: [], streaming: true }]);

    try {
      await streamQuery(
        q, sessionId,
        (token) => updateLastMessage((m) => ({ ...m, content: m.content + token })),
        (data) => {
          updateLastMessage((m) => ({ ...m, citations: data.citations, chunks_used: data.chunks_used, streaming: false }));
          if (!sessionId) onSessionCreated?.(data.session_id);
        },
        (err) => updateLastMessage((m) => ({ ...m, content: err || "Something went wrong.", streaming: false })),
      );
    } catch (err) {
      updateLastMessage((m) => ({ ...m, content: err.message || "Something went wrong.", streaming: false }));
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); }
  };
  const onInput = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
    setInput(e.target.value);
  };

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/50">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
            <p className="text-xs text-red-600 dark:text-red-400 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        )}
        {/* Scrollable messages */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
          {messages.length === 0 && !loading ? (
            <EmptyState onSelect={submit} suggestions={suggestedQuestions} />
          ) : (
            <div className="max-w-4xl mx-auto px-4 py-6 md:px-8">
              {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 pb-5 pt-3 md:px-8 bg-slate-50 dark:bg-slate-950">
          <div className="max-w-4xl mx-auto">
            <div className={`flex items-end gap-3 bg-white dark:bg-slate-900 border rounded-2xl px-4 py-3 shadow-md transition-all
              ${!sessionId ? "opacity-60" : "border-slate-200 dark:border-slate-700 focus-within:border-indigo-400 dark:focus-within:border-indigo-600 focus-within:shadow-indigo-100/50 dark:focus-within:shadow-indigo-950/50 focus-within:shadow-lg"}`}>
              <textarea ref={textareaRef} rows={1} value={input} onChange={onInput} onKeyDown={onKeyDown}
                disabled={!sessionId}
                placeholder={sessionId ? "Ask about the codebase…" : "Upload a ZIP above to start"}
                className="flex-1 resize-none text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 bg-transparent focus:outline-none leading-relaxed disabled:cursor-not-allowed"
                style={{ minHeight: "24px", maxHeight: "160px" }}
              />
              <button onClick={() => submit(input)} disabled={loading || !input.trim() || !sessionId}
                className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:cursor-not-allowed flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
                </svg>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-2 text-center">Enter to send · Shift+Enter for newline</p>
          </div>
        </div>
      </div>

      {showTree && sessionId && <FileTree files={treeFiles} onClose={onToggleTree} />}
    </div>
  );
}
