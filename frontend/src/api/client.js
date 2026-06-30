import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("rm_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("rm_token");
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

export const login = (password) =>
  axios.post(`${BASE}/auth/login/`, { password });

export const logout = () => {
  localStorage.removeItem("rm_token");
  window.location.href = "/";
};

export const uploadZip = (file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/upload/", form, { headers: { "Content-Type": "multipart/form-data" } });
};

export const uploadSource = (source, filename) =>
  api.post("/upload/", { source, filename });

export const getUploadStatus = (taskId) =>
  api.get(`/upload/status/${taskId}/`);

export const reindexZip = (sessionId, file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/sessions/${sessionId}/reindex/`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const getSessionFiles = (sessionId) =>
  api.get(`/sessions/${sessionId}/files/`);

// Non-streaming fallback
export const sendQuery = (question, session_id) =>
  api.post("/query/", { question, session_id });

// SSE streaming — calls onToken for each token, onDone when complete
export const streamQuery = async (question, session_id, onToken, onDone, onError) => {
  const token = localStorage.getItem("rm_token");
  const response = await fetch(`${BASE}/query/stream/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ question, session_id }),
  });

  if (!response.ok) {
    let msg = "Request failed";
    try { msg = (await response.json()).error || msg; } catch {}
    throw new Error(msg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === "token") onToken(data.content);
        else if (data.type === "done") onDone(data);
        else if (data.type === "error") onError?.(data.content);
      } catch {}
    }
  }
};

export const getSessions = () => api.get("/sessions/");
export const getSession = (id) => api.get(`/sessions/${id}/`);
export const createSession = () => api.post("/sessions/", { title: "New chat" });
export const deleteSession = (id) => api.delete(`/sessions/${id}/`);
export const renameSession = (id, title) => api.patch(`/sessions/${id}/`, { title });
