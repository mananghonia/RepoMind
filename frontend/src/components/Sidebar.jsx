import { useEffect, useState, useRef } from "react";
import { getSessions, deleteSession, renameSession } from "../api/client";

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    return stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return [dark, setDark];
}

function SessionItem({ session, isActive, onSelect, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title || "Untitled");
  const inputRef = useRef(null);

  const startEdit = (e) => {
    e.stopPropagation();
    setDraft(session.title || "Untitled");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(session.id, trimmed);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") { setEditing(false); setDraft(session.title || "Untitled"); }
    e.stopPropagation();
  };

  return (
    <div
      onClick={() => !editing && onSelect(session.id)}
      className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-all
        ${isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={onKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-white/10 text-white text-sm rounded px-1 py-0.5 outline-none border border-white/20 focus:border-indigo-400"
          />
        ) : (
          <span onDoubleClick={startEdit} className="truncate" title="Double-click to rename">
            {session.title || "Untitled"}
          </span>
        )}
      </div>
      {!editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
          className="hidden group-hover:flex items-center text-slate-500 hover:text-red-400 ml-1 flex-shrink-0 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function Sidebar({ activeId, onSelect, onNew, onLogout, refreshKey }) {
  const [sessions, setSessions] = useState([]);
  const [dark, setDark] = useDarkMode();

  useEffect(() => {
    getSessions().then(({ data }) => setSessions(data)).catch(() => {});
  }, [refreshKey]);

  const handleDelete = async (id) => {
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) onNew();
  };

  const handleRename = async (id, title) => {
    await renameSession(id, title);
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title } : s));
  };

  return (
    <aside className="w-64 bg-[#0f172a] text-slate-100 flex flex-col h-screen select-none">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">RepoMind</p>
            <p className="text-[10px] text-slate-400 mt-0.5">AI Codebase Assistant</p>
          </div>
        </div>
      </div>

      {/* New Chat */}
      <div className="px-3 pt-4">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-sm font-medium transition-all border border-white/5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {sessions.length > 0 && (
          <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 pb-1 pt-1">Recent</p>
        )}
        {sessions.map((s) => (
          <SessionItem
            key={s.id}
            session={s}
            isActive={s.id === activeId}
            onSelect={onSelect}
            onDelete={handleDelete}
            onRename={handleRename}
          />
        ))}
      </div>

      {/* Footer: dark mode + logout */}
      <div className="px-4 py-4 border-t border-white/5 flex items-center justify-between gap-2">
        <button
          onClick={onLogout}
          title="Sign out"
          className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-red-400 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
        <button
          onClick={() => setDark((d) => !d)}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-all"
        >
          {dark ? (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>
    </aside>
  );
}
