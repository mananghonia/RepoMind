import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import CitationBadge from "./CitationBadge";
import CitationModal from "./CitationModal";

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
    >
      {copied ? (
        <><svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>Copied</>
      ) : (
        <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>Copy</>
      )}
    </button>
  );
}

function CodeBlock({ inline, className, children, isDark }) {
  const match = /language-(\w+)/.exec(className || "");
  const code = String(children).replace(/\n$/, "");
  if (!inline && match) {
    return (
      <div className="my-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <span className="text-[10px] font-mono font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{match[1]}</span>
          <CopyButton text={code} />
        </div>
        <SyntaxHighlighter
          style={isDark ? oneDark : oneLight}
          language={match[1]}
          PreTag="div"
          customStyle={{ margin: 0, borderRadius: 0, fontSize: "0.78rem", background: isDark ? "#0d1117" : "#f8fafc" }}
        >{code}</SyntaxHighlighter>
      </div>
    );
  }
  return <code className="bg-slate-100 dark:bg-slate-800 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-md text-[0.79em] font-mono border border-slate-200 dark:border-slate-700">{children}</code>;
}

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const isDark = useIsDark();
  const [openCitation, setOpenCitation] = useState(null);
  const isStreaming = message.streaming && !isUser;
  const isThinking = isStreaming && !message.content;

  const mdComponents = { code: (props) => <CodeBlock {...props} isDark={isDark} /> };

  return (
    <>
      <div className={`flex gap-3 mb-5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm mt-6
          ${isUser ? "bg-indigo-600 text-white" : "bg-gradient-to-br from-violet-500 to-indigo-600 text-white"}`}>
          {isUser ? "Y" : "R"}
        </div>

        <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"} ${isUser ? "max-w-[65%]" : "flex-1 min-w-0"}`}>
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 px-0.5">
            {isUser ? "You" : "RepoMind"}
          </span>

          {isUser ? (
            <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            </div>
          ) : (
            <div className="w-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
              {isThinking ? (
                <div className="flex items-center gap-1.5 py-0.5">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              ) : (
                <div className={`prose-chat${isStreaming ? " streaming-cursor" : ""}`}>
                  <ReactMarkdown components={mdComponents}>{message.content}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* Citations */}
          {!isUser && !isStreaming && message.citations?.length > 0 && (
            <div className="flex flex-wrap items-center mt-1.5 px-0.5 w-full">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 w-full mb-1.5 uppercase tracking-wider">
                Sources — click to view
              </span>
              {message.citations.map((c, i) => <CitationBadge key={i} citation={c} onClick={setOpenCitation} />)}
            </div>
          )}

          {/* Meta */}
          {!isUser && !isStreaming && message.chunks_used > 0 && (
            <p className="text-[10px] text-slate-300 dark:text-slate-600 px-0.5">
              {message.chunks_used} chunk{message.chunks_used !== 1 ? "s" : ""} retrieved
            </p>
          )}
        </div>
      </div>

      {openCitation && <CitationModal citation={openCitation} onClose={() => setOpenCitation(null)} />}
    </>
  );
}
