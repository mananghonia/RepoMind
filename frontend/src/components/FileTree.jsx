import { useState } from "react";

function buildTree(paths) {
  const root = {};
  for (const path of paths) {
    const parts = path.replace(/\\/g, "/").split("/");
    let node = root;
    for (const part of parts) {
      if (!node[part]) node[part] = {};
      node = node[part];
    }
  }
  return root;
}

function TreeNode({ name, node, depth = 0 }) {
  const isFile = Object.keys(node).length === 0;
  const [open, setOpen] = useState(depth < 2);

  if (isFile) {
    return (
      <div
        className="flex items-center gap-1.5 py-0.5 px-2 rounded text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 truncate"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <svg className="w-3 h-3 flex-shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="truncate font-mono">{name}</span>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 py-0.5 px-2 rounded text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 truncate"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <svg
          className={`w-3 h-3 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <svg className="w-3 h-3 flex-shrink-0 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
        </svg>
        <span className="truncate font-medium">{name}</span>
      </button>
      {open && Object.entries(node).sort(([a, av], [b, bv]) => {
        const aIsFile = Object.keys(av).length === 0;
        const bIsFile = Object.keys(bv).length === 0;
        if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
        return a.localeCompare(b);
      }).map(([k, v]) => (
        <TreeNode key={k} name={k} node={v} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function FileTree({ files, onClose }) {
  const tree = buildTree(files);

  return (
    <div className="w-72 flex-shrink-0 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Indexed files</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{files.length} files</p>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {files.length === 0 ? (
          <p className="text-xs text-slate-400 px-4 py-3">No files indexed yet.</p>
        ) : (
          Object.entries(tree).sort(([a, av], [b, bv]) => {
            const aIsFile = Object.keys(av).length === 0;
            const bIsFile = Object.keys(bv).length === 0;
            if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
            return a.localeCompare(b);
          }).map(([k, v]) => (
            <TreeNode key={k} name={k} node={v} depth={0} />
          ))
        )}
      </div>
    </div>
  );
}
