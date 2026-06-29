# RepoMind — AI Codebase Assistant

Ask natural language questions about any Python codebase. Powered by function-level AST chunking, ChromaDB vector search, and a LangGraph agent loop with Claude.

## Quick Start

### 1. Set up environment variables

Copy `.env.example` to `.env` and fill in your keys:

```
cp .env.example .env
```

Required keys:
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `OPENAI_API_KEY` — for `text-embedding-3-small` embeddings
- `MONGODB_URI` — MongoDB Atlas connection string
- `DJANGO_SECRET_KEY` — any random string for dev

### 2. Start the backend

```bash
cd backend
pip install -r requirements.txt
python manage.py runserver
```

Backend runs at `http://localhost:8000`

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

### 4. Use it

1. Drag-and-drop a `.zip` of your Python repo into the upload area
2. Wait for indexing to complete (you'll see chunk count)
3. Ask questions in the chat — answers include `filename:start-end` citations

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/upload/` | POST | Upload ZIP or raw source (multipart or JSON) |
| `/api/query/` | POST | Ask a question, get answer + citations |
| `/api/sessions/` | GET/POST | List or create chat sessions |
| `/api/sessions/<id>/` | GET/DELETE | Get or delete a session |

## Architecture

```
User question
     │
     ▼
[Retrieve] ── top-5 chunks from ChromaDB
     │
     ▼
[Grade] ── relevant or irrelevant?
     │
     ├─ irrelevant ──► [Rewrite] ──► back to Retrieve (max 2 retries)
     │
     └─ relevant ───► [Generate] ── Claude answers with citations
```

Chunking is by function/class scope (Python `ast` module), not word count — so the LLM always receives complete, syntactically valid code.
