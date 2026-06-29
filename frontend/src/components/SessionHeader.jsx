import { useState, useRef, useEffect } from "react";
import { uploadZip, getUploadStatus, reindexZip, getSessionFiles } from "../api/client";

const POLL = 1500;

function ActionBtn({ onClick, disabled, active, title, icon, label, variant = "default" }) {
  const base = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all select-none";
  const variants = {
    default: `bg-white/60 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400
      border-slate-200 dark:border-slate-700
      hover:bg-white dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200
      hover:border-slate-300 dark:hover:border-slate-600
      disabled:opacity-30 disabled:cursor-not-allowed`,
    active: `bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400
      border-indigo-200 dark:border-indigo-700
      hover:bg-indigo-100 dark:hover:bg-indigo-950/70`,
    success: `bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400
      border-emerald-200 dark:border-emerald-800`,
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${variants[active ? "active" : variant]}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function SessionHeader({
  activeSession, onSessionReady,
  showTree, onToggleTree, onExport, hasMessages,
}) {
  const [phase, setPhase] = useState(null);
  const [message, setMessage] = useState("");
  const [indexed, setIndexed] = useState(0);
  const [reindex, setReindex] = useState(null);
  const inputRef = useRef(null);
  const reindexRef = useRef(null);
  const pollRef = useRef(null);

  // When restoring a session from localStorage, fetch actual chunk count
  useEffect(() => {
    if (activeSession && phase === null) {
      getSessionFiles(activeSession)
        .then(({ data }) => { if (data.chunks > 0) setIndexed(data.chunks); })
        .catch(() => {});
    }
  }, [activeSession]);

  const stopPoll = () => { clearInterval(pollRef.current); };

  const startPoll = (taskId, sessionId, isReindex = false) => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await getUploadStatus(taskId);
        if (data.status === "parsing") {
          !isReindex && setMessage("Parsing files…");
        } else if (data.status === "embedding") {
          !isReindex && setMessage(`Embedding ${data.total} chunks…`);
          isReindex && setReindex("busy");
        } else if (data.status === "done") {
          stopPoll();
          if (isReindex) {
            setReindex("done");
            setIndexed(data.indexed);
            setTimeout(() => setReindex(null), 2500);
          } else {
            setPhase("done");
            setMessage(`${data.indexed} chunks indexed`);
            setIndexed(data.indexed);
            onSessionReady?.(sessionId);
          }
        } else if (data.status === "error") {
          stopPoll();
          if (isReindex) { setReindex(null); }
          else { setPhase("error"); setMessage(data.error || "Indexing failed"); }
        }
      } catch (err) {
        stopPoll();
        if (!isReindex) {
          // 404 means the server restarted and lost the task
          const msg = err.response?.status === 404
            ? "Server restarted mid-upload. Please try again."
            : "Connection lost during indexing.";
          setPhase("error");
          setMessage(msg);
        }
      }
    }, POLL);
  };

  const handleFile = async (file) => {
    if (!file?.name.endsWith(".zip")) {
      setPhase("error"); setMessage("Only .zip files supported"); return;
    }
    stopPoll();
    setPhase("uploading"); setMessage(`Uploading ${file.name}…`);
    try {
      const { data } = await uploadZip(file);
      setPhase("parsing"); setMessage("Parsing files…");
      startPoll(data.task_id, data.session_id);
    } catch (e) {
      setPhase("error");
      setMessage(e.response?.data?.error || "Upload failed. Check file and try again.");
    }
  };

  const handleReindex = async (file) => {
    if (!file?.name.endsWith(".zip") || !activeSession) return;
    stopPoll();
    setReindex("busy");
    try {
      const { data } = await reindexZip(activeSession, file);
      startPoll(data.task_id, activeSession, true);
    } catch (e) {
      setReindex(null);
    }
  };

  const onDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };
  const busy = phase && !["done", "error"].includes(phase);
  const isDone = phase === "done";
  const isError = phase === "error";

  // ── Compact session bar (shown after successful index OR restored session) ──
  if (isDone || (activeSession && phase === null)) {
    return (
      <div className="flex items-center px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 gap-3">
        {/* Status pill */}
        <div
          onClick={() => !busy && inputRef.current?.click()}
          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer group"
          title="Click to upload a new project ZIP"
        >
          <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-none">
              {indexed > 0 ? `${indexed} chunks indexed` : "Session active"}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate group-hover:text-indigo-500 transition-colors">
              Drop a new ZIP to start a fresh session
            </p>
          </div>
        </div>
        <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />

        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 flex-shrink-0" />

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Re-index */}
          <ActionBtn
            onClick={() => reindexRef.current?.click()}
            disabled={reindex === "busy"}
            variant={reindex === "done" ? "success" : "default"}
            title="Re-index with a new ZIP"
            label={reindex === "busy" ? "Re-indexing…" : reindex === "done" ? "Done!" : "Re-index"}
            icon={reindex === "busy" ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            ) : reindex === "done" ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            )}
          />
          <input ref={reindexRef} type="file" accept=".zip" className="hidden" onChange={(e) => handleReindex(e.target.files[0])} />

          {/* Export */}
          <ActionBtn
            onClick={onExport}
            disabled={!hasMessages}
            title="Export conversation as Markdown"
            label="Export"
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>}
          />

          {/* Files */}
          <ActionBtn
            onClick={onToggleTree}
            active={showTree}
            title="Browse indexed files"
            label="Files"
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>}
          />
        </div>
      </div>
    );
  }

  // ── Upload zone ────────────────────────────────────────────────────────────
  return (
    <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !busy && inputRef.current?.click()}
        className={`flex items-center gap-3.5 px-4 py-3 rounded-xl border-2 border-dashed transition-all
          ${busy
            ? "border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 cursor-wait"
            : isError
            ? "border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/30"
            : "border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/30 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20"}`}
      >
        <div className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center
          ${isError ? "bg-red-100 dark:bg-red-900/30" : "bg-indigo-100 dark:bg-indigo-900/30"}`}>
          {isError ? (
            <svg className="w-4.5 h-4.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          ) : busy ? (
            <svg className="w-4.5 h-4.5 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
          ) : (
            <svg className="w-4.5 h-4.5 text-indigo-500 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!phase ? (
            <>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Drop your repo <span className="text-indigo-600 dark:text-indigo-400">.zip</span> to start
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Python · JS/TS · Java · Go · Rust · C# · max 100 MB · each upload is isolated
              </p>
            </>
          ) : (
            <>
              <p className={`text-sm font-medium ${isError ? "text-red-600 dark:text-red-400" : "text-indigo-700 dark:text-indigo-400"}`}>
                {message}
              </p>
              {isError && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Click to try again</p>
              )}
            </>
          )}
        </div>

        <span className="hidden md:block text-[10px] text-slate-300 dark:text-slate-600 flex-shrink-0">click or drag</span>
        <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
      </div>
    </div>
  );
}
