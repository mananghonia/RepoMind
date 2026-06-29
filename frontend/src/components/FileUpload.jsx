import { useState, useRef } from "react";
import { uploadZip, getUploadStatus } from "../api/client";

const POLL_INTERVAL = 1500;

const PHASE_CONFIG = {
  uploading: { color: "indigo", label: "Uploading…" },
  parsing:   { color: "indigo", label: null },
  embedding: { color: "indigo", label: null },
  done:      { color: "emerald", label: null },
  error:     { color: "red",    label: null },
};

export default function FileUpload({ onSessionReady }) {
  const [state, setState] = useState({ phase: null, message: "", chunks: 0 });
  const inputRef = useRef(null);
  const pollRef = useRef(null);

  const stopPolling = () => { clearInterval(pollRef.current); pollRef.current = null; };

  const pollStatus = (taskId, sessionId) => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await getUploadStatus(taskId);
        if (data.status === "parsing") {
          setState({ phase: "parsing", message: `Parsing files…`, chunks: 0 });
        } else if (data.status === "embedding") {
          setState({ phase: "embedding", message: `Embedding ${data.total} chunks…`, chunks: data.total });
        } else if (data.status === "done") {
          stopPolling();
          setState({ phase: "done", message: `${data.indexed} chunks indexed — ready to chat`, chunks: data.indexed });
          onSessionReady?.(sessionId);
        } else if (data.status === "error") {
          stopPolling();
          setState({ phase: "error", message: data.error || "Indexing failed.", chunks: 0 });
        }
      } catch {
        stopPolling();
        setState({ phase: "error", message: "Lost connection to server.", chunks: 0 });
      }
    }, POLL_INTERVAL);
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.endsWith(".zip")) {
      setState({ phase: "error", message: "Only .zip files are supported.", chunks: 0 });
      return;
    }
    stopPolling();
    setState({ phase: "uploading", message: `Uploading ${file.name}…`, chunks: 0 });
    try {
      const { data } = await uploadZip(file);
      setState({ phase: "parsing", message: "Parsing files…", chunks: 0 });
      pollStatus(data.task_id, data.session_id);
    } catch (err) {
      setState({ phase: "error", message: err.response?.data?.error || "Upload failed.", chunks: 0 });
    }
  };

  const onDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };
  const busy = state.phase && !["done", "error"].includes(state.phase);
  const isDone = state.phase === "done";
  const isError = state.phase === "error";

  return (
    <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !busy && inputRef.current?.click()}
        className={`flex items-center gap-3.5 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all
          ${busy
            ? "border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30 cursor-wait"
            : isDone
            ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            : isError
            ? "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30"
            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20"}`}
      >
        {/* Icon */}
        <div className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center
          ${isDone ? "bg-emerald-100 dark:bg-emerald-900/40"
            : isError ? "bg-red-100 dark:bg-red-900/40"
            : "bg-indigo-100 dark:bg-indigo-900/40"}`}>
          {isDone ? (
            <svg className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          ) : isError ? (
            <svg className="w-4.5 h-4.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          ) : busy ? (
            <svg className="w-4.5 h-4.5 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
          ) : (
            <svg className="w-4.5 h-4.5 text-indigo-500 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          )}
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          {!state.phase ? (
            <>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Drop your repo <span className="text-indigo-600 dark:text-indigo-400 font-semibold">.zip</span> to start a new session
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Python · JS/TS · Java · Go · Rust · C# · Spring · FastAPI · MERN
              </p>
            </>
          ) : (
            <>
              <p className={`text-sm font-medium
                ${isDone ? "text-emerald-700 dark:text-emerald-400"
                  : isError ? "text-red-600 dark:text-red-400"
                  : "text-indigo-700 dark:text-indigo-400"}`}>
                {state.message}
              </p>
              {(isDone || isError) && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Drop another ZIP to start a new isolated session
                </p>
              )}
            </>
          )}
        </div>

        {/* Keyboard shortcut hint */}
        {!state.phase && (
          <span className="hidden md:flex items-center text-[10px] text-slate-300 dark:text-slate-600 font-mono flex-shrink-0">
            click or drop
          </span>
        )}

        <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
      </div>
    </div>
  );
}
