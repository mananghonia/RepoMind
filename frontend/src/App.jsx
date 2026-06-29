import { useState, useEffect, useRef } from "react";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import SessionHeader from "./components/SessionHeader";

export default function App() {
  const [activeSession, setActiveSession] = useState(() => localStorage.getItem("rm_session") || null);
  const [sidebarKey, setSidebarKey] = useState(0);
  const [uploadKey, setUploadKey] = useState(0);
  const [showTree, setShowTree] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const messagesRef = useRef([]);

  // Persist active session so page refresh restores the last chat
  useEffect(() => {
    if (activeSession) localStorage.setItem("rm_session", activeSession);
    else localStorage.removeItem("rm_session");
  }, [activeSession]);

  const refreshSidebar = () => setSidebarKey((k) => k + 1);

  const handleNewChat = () => {
    setActiveSession(null);
    setUploadKey((k) => k + 1);
    setShowTree(false);
    setMessageCount(0);
    messagesRef.current = [];
  };

  const handleSessionReady = (sessionId) => {
    setActiveSession(sessionId);
    refreshSidebar();
  };

  const handleExport = () => {
    const msgs = messagesRef.current;
    if (!msgs.length) return;
    const md = msgs.map((m) => {
      const role = m.role === "user" ? "## You" : "## RepoMind";
      const src = m.citations?.length
        ? "\n\n**Sources:** " + m.citations.map((c) => `${c.filename}:${c.start_line}–${c.end_line}`).join(", ")
        : "";
      return `${role}\n\n${m.content}${src}`;
    }).join("\n\n---\n\n");
    const blob = new Blob([`# RepoMind Chat Export\n\n${md}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: "repomind-export.md" }).click();
    URL.revokeObjectURL(url);
  };

  const handleMessagesChange = (msgs) => {
    messagesRef.current = msgs;
    setMessageCount(msgs.length);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar
        activeId={activeSession}
        onSelect={(id) => { setActiveSession(id); setShowTree(false); }}
        onNew={handleNewChat}
        refreshKey={sidebarKey}
      />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <SessionHeader
          key={uploadKey}
          activeSession={activeSession}
          onSessionReady={handleSessionReady}
          showTree={showTree}
          onToggleTree={() => setShowTree((v) => !v)}
          onExport={handleExport}
          hasMessages={messageCount > 0}
        />
        <div className="flex-1 overflow-hidden">
          <ChatWindow
            sessionId={activeSession}
            showTree={showTree}
            onToggleTree={() => setShowTree((v) => !v)}
            onMessagesChange={handleMessagesChange}
            onSessionCreated={(id) => { setActiveSession(id); refreshSidebar(); }}
          />
        </div>
      </main>
    </div>
  );
}
