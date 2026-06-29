import { useEffect, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export default function CitationModal({ citation, onClose }) {
  const isDark = useIsDark();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!citation) return null;

  const file = citation.filename.replace(/\\/g, "/");
  const shortFile = file.split("/").pop();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-mono">{shortFile}</p>
            <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">{file}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-md font-mono">
              lines {citation.start_line}–{citation.end_line}
            </span>
            {citation.name && (
              <span className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md font-mono">
                {citation.name}
              </span>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Code */}
        <div className="flex-1 overflow-auto">
          {citation.code ? (
            <SyntaxHighlighter
              style={isDark ? oneDark : oneLight}
              language={citation.language || "text"}
              showLineNumbers
              startingLineNumber={citation.start_line}
              customStyle={{ margin: 0, borderRadius: 0, fontSize: "0.78rem", minHeight: "100%", background: isDark ? "#0d1117" : "#f8fafc" }}
            >
              {citation.code}
            </SyntaxHighlighter>
          ) : (
            <p className="text-sm text-slate-400 p-6">Code preview not available for this citation.</p>
          )}
        </div>
      </div>
    </div>
  );
}
