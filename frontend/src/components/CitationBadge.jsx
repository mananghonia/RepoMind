export default function CitationBadge({ citation, onClick }) {
  const file = citation.filename.replace(/\\/g, "/").split("/").pop();
  const lines = `${citation.start_line}–${citation.end_line}`;
  return (
    <button
      onClick={() => onClick?.(citation)}
      className="inline-flex items-center gap-1 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300 text-xs font-mono px-2 py-0.5 rounded-md mr-1.5 mb-1 hover:bg-violet-100 dark:hover:bg-violet-900/50 hover:border-violet-300 transition-colors cursor-pointer"
    >
      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="font-medium">{file}</span>
      <span className="text-violet-400 dark:text-violet-500">:{lines}</span>
    </button>
  );
}
