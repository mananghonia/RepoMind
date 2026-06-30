import { useState } from "react";
import { login, signup } from "../api/client";

function AuthForm({ mode, onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) return;
    if (isSignup && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const fn = isSignup ? signup : login;
      const { data } = await fn(username.trim(), password);
      localStorage.setItem("rm_token", data.token);
      localStorage.setItem("rm_username", data.username);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
      <h2 className="text-base font-semibold text-slate-100 mb-5">
        {isSignup ? "Create your account" : "Sign in to continue"}
      </h2>

      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your username"
            autoFocus
            autoComplete="username"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSignup ? "At least 6 characters" : "Your password"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        </div>
        {isSignup && (
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              autoComplete="new-password"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400 mb-4 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !username.trim() || !password || (isSignup && !confirm)}
        className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
      >
        {loading ? (isSignup ? "Creating account…" : "Signing in…") : (isSignup ? "Create account" : "Sign in")}
      </button>
    </form>
  );
}

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login");

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4 shadow-xl shadow-indigo-900/40">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">RepoMind</h1>
          <p className="text-sm text-slate-400 mt-1">AI Codebase Assistant</p>
        </div>

        <AuthForm mode={mode} onSuccess={onLogin} />

        <p className="text-center text-xs text-slate-500 mt-5">
          {mode === "login" ? (
            <>Don't have an account?{" "}
              <button onClick={() => setMode("signup")} className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                Sign up
              </button>
            </>
          ) : (
            <>Already have an account?{" "}
              <button onClick={() => setMode("login")} className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
