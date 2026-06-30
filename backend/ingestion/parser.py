import ast
import re
import textwrap
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class CodeChunk:
    code: str
    filename: str
    chunk_type: str   # "function" | "class" | "module" | "block"
    name: str
    start_line: int
    end_line: int
    language: str = "unknown"


# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------

_EXT_TO_LANG = {
    ".py": "python",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".cs": "csharp",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".c": "c", ".h": "c", ".hpp": "cpp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin", ".kts": "kotlin",
    ".scala": "scala",
    ".r": "r", ".R": "r",
    ".sh": "shell", ".bash": "shell",
    ".sql": "sql",
    ".html": "html", ".htm": "html",
    ".css": "css", ".scss": "css", ".sass": "css",
    ".json": "json",
    ".yaml": "yaml", ".yml": "yaml",
    ".xml": "xml",
    ".md": "markdown",
}

# File extensions we index (skip binaries, lock files, etc.)
_INDEXABLE_EXTS = set(_EXT_TO_LANG.keys())

# Regex patterns to detect function/class/method starts per language family
# Each pattern yields (name, chunk_type)
_BRACE_FUNC_RE = re.compile(
    r"^\s*(?:(?:public|private|protected|static|async|export|default|abstract|override|"
    r"readonly|final|virtual|inline|unsafe|pub|fn|def|fun|func)\s+)*"
    r"(?:class|interface|struct|enum|trait|impl|object)\s+(\w+)|"
    r"^\s*(?:(?:public|private|protected|static|async|export|default|abstract|override|"
    r"readonly|final|virtual|inline|unsafe|pub)\s+)*"
    r"(?:function\s+(\w+)|(\w+)\s*[:=]\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))|"
    r"^\s*(?:(?:public|private|protected|static|async|abstract|override|final|virtual|"
    r"inline|unsafe|pub|fn|fun|func|def)\s+)+(\w+)\s*[(<]",
    re.MULTILINE,
)

_GO_FUNC_RE = re.compile(r"^\s*func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(", re.MULTILINE)
_RUST_FUNC_RE = re.compile(r"^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*[<(]", re.MULTILINE)
_JAVA_CLASS_RE = re.compile(
    r"^\s*(?:public|private|protected|static|abstract|final)?\s*"
    r"(?:class|interface|enum|record|@interface)\s+(\w+)", re.MULTILINE
)
_JAVA_METHOD_RE = re.compile(
    r"^\s*(?:(?:public|private|protected|static|final|abstract|synchronized|"
    r"native|transient|volatile|override)\s+)*"
    r"(?:<[^>]+>\s+)?[\w<>\[\]]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+\w+\s*)?[{;]",
    re.MULTILINE,
)


def detect_language(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return _EXT_TO_LANG.get(ext, "unknown")


# Directories that should never be indexed (dependency/build/cache folders)
_SKIP_DIRS = {
    "node_modules", "vendor", "dist", "build", ".git", "__pycache__",
    "venv", ".venv", "env", ".env", "site-packages", ".tox",
    "target",           # Rust / Java Maven
    "bin", "obj",       # C# / .NET
    ".gradle", ".mvn",  # Java
    "coverage", ".nyc_output", ".next", ".nuxt", ".output",
    "static", "staticfiles", "media",   # Django collected static
    "migrations",       # Django auto-generated migrations
    "eggs", ".eggs", "dist-info", "egg-info",
    "__mocks__", "fixtures",
    "public", "assets",
}

_SKIP_FILE_NAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
    "Cargo.lock", "Gemfile.lock", "composer.lock", "Pipfile.lock",
    "webpack.config.js", "babel.config.js", "jest.config.js",
    "tailwind.config.js", "vite.config.js", "postcss.config.js",
    "rollup.config.js", "eslint.config.js",
    "setup.cfg", "setup.py", "pyproject.toml",
}

_MAX_FILE_BYTES = 200_000  # skip files larger than 200 KB (likely generated/minified)


def is_indexable(filename: str, file_size: int = 0) -> bool:
    if filename.endswith("/"):
        return False

    parts = Path(filename.replace("\\", "/")).parts
    # Skip if any path segment is a known dependency/build directory
    for part in parts[:-1]:   # exclude the filename itself
        if part.lower() in _SKIP_DIRS or part.startswith("."):
            return False

    name = Path(filename).name
    if name in _SKIP_FILE_NAMES:
        return False

    # Skip minified / generated files (common patterns)
    stem = Path(filename).stem
    if stem.endswith(".min") or ".min." in name or name.endswith(".bundle.js"):
        return False

    ext = Path(filename).suffix.lower()
    if ext not in _INDEXABLE_EXTS:
        return False

    if file_size > _MAX_FILE_BYTES:
        return False

    return True


# ---------------------------------------------------------------------------
# Python parser (AST-based — exact boundaries)
# ---------------------------------------------------------------------------

def _parse_python(source: str, filename: str) -> list[CodeChunk]:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return _fallback_chunk(source, filename, "python")

    _annotate_parents(tree)
    lines = source.splitlines()
    chunks: list[CodeChunk] = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        parent = getattr(node, "_parent", None)
        if not isinstance(parent, (ast.Module, ast.ClassDef, type(None))):
            continue

        start = node.lineno - 1
        end = node.end_lineno
        code = textwrap.dedent("\n".join(lines[start:end]))
        chunk_type = "class" if isinstance(node, ast.ClassDef) else "function"
        chunks.append(CodeChunk(
            code=code, filename=filename, chunk_type=chunk_type,
            name=node.name, start_line=node.lineno, end_line=node.end_lineno,
            language="python",
        ))

    return chunks or _fallback_chunk(source, filename, "python")


def _annotate_parents(tree: ast.AST) -> None:
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            child._parent = node  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Brace-language parser (JS/TS/Java/C#/Go/Rust/etc.) — regex + brace counting
# ---------------------------------------------------------------------------

def _parse_brace_language(source: str, filename: str, language: str) -> list[CodeChunk]:
    lines = source.splitlines()

    if language == "go":
        header_re = _GO_FUNC_RE
    elif language == "rust":
        header_re = _RUST_FUNC_RE
    else:
        header_re = None  # use combined matcher below

    chunks: list[CodeChunk] = []

    i = 0
    while i < len(lines):
        line = lines[i]

        # Detect a function/class/method header
        name, chunk_type = _detect_header(line, language, header_re)
        if name is None:
            i += 1
            continue

        # Find the opening brace (may be on same line or next)
        brace_start = i
        brace_depth = 0
        found_open = False
        scan = i
        while scan < min(i + 5, len(lines)):
            for ch in lines[scan]:
                if ch == "{":
                    brace_depth += 1
                    found_open = True
                elif ch == "}" and found_open:
                    brace_depth -= 1
            if found_open and brace_depth == 0:
                chunks.append(CodeChunk(
                    code="\n".join(lines[brace_start: scan + 1]),
                    filename=filename, chunk_type=chunk_type,
                    name=name, start_line=brace_start + 1, end_line=scan + 1,
                    language=language,
                ))
                i = scan + 1
                break
            scan += 1
            if found_open and brace_depth > 0:
                # brace open but not closed yet — keep scanning
                while scan < len(lines):
                    for ch in lines[scan]:
                        if ch == "{":
                            brace_depth += 1
                        elif ch == "}":
                            brace_depth -= 1
                    if brace_depth <= 0:
                        chunks.append(CodeChunk(
                            code="\n".join(lines[brace_start: scan + 1]),
                            filename=filename, chunk_type=chunk_type,
                            name=name, start_line=brace_start + 1, end_line=scan + 1,
                            language=language,
                        ))
                        i = scan + 1
                        break
                    scan += 1
                else:
                    i = scan
                break
        else:
            i += 1

    return chunks or _fallback_chunk(source, filename, language)


def _detect_header(line: str, language: str, header_re) -> tuple[str | None, str]:
    stripped = line.strip()
    if not stripped or stripped.startswith("//") or stripped.startswith("#"):
        return None, "function"

    if language == "go":
        m = _GO_FUNC_RE.match(line)
        if m:
            return m.group(1), "function"
        return None, "function"

    if language == "rust":
        m = _RUST_FUNC_RE.match(line)
        if m:
            return m.group(1), "function"
        return None, "function"

    # Java / C# / Kotlin / Swift — class first, then method
    m = _JAVA_CLASS_RE.match(line)
    if m:
        return m.group(1), "class"

    m = _JAVA_METHOD_RE.match(line)
    if m:
        return m.group(1), "function"

    # JS / TS function/class patterns
    js_class = re.match(r"^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)", line)
    if js_class:
        return js_class.group(1), "class"

    js_func = re.match(
        r"^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*[(<]", line
    )
    if js_func:
        return js_func.group(1), "function"

    js_arrow = re.match(
        r"^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?"
        r"(?:\([^)]*\)|\w+)\s*=>", line
    )
    if js_arrow:
        return js_arrow.group(1), "function"

    js_method = re.match(
        r"^\s*(?:(?:async|static|get|set|public|private|protected|override|abstract)\s+)*"
        r"(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?[{]", line
    )
    if js_method and js_method.group(1) not in ("if", "for", "while", "switch", "catch"):
        return js_method.group(1), "function"

    return None, "function"


# ---------------------------------------------------------------------------
# Fallback: sliding-window line chunks (SQL, HTML, CSS, unknown, etc.)
# ---------------------------------------------------------------------------

_CHUNK_SIZE = 60
_CHUNK_OVERLAP = 10


def _line_chunk(source: str, filename: str, language: str) -> list[CodeChunk]:
    lines = source.splitlines()
    if not lines:
        return []
    chunks = []
    step = _CHUNK_SIZE - _CHUNK_OVERLAP
    for i in range(0, len(lines), step):
        block = lines[i: i + _CHUNK_SIZE]
        chunks.append(CodeChunk(
            code="\n".join(block),
            filename=filename, chunk_type="block",
            name=f"lines_{i+1}_{i+len(block)}",
            start_line=i + 1, end_line=i + len(block),
            language=language,
        ))
    return chunks


def _fallback_chunk(source: str, filename: str, language: str) -> list[CodeChunk]:
    lines = source.splitlines()
    return [CodeChunk(
        code=source, filename=filename, chunk_type="module",
        name=Path(filename).name,
        start_line=1, end_line=len(lines) or 1,
        language=language,
    )]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

_BRACE_LANGS = {
    "javascript", "typescript", "java", "csharp", "go", "rust",
    "kotlin", "swift", "scala", "cpp", "c", "php", "ruby",
}
_LINE_LANGS = {"sql", "html", "css", "markdown", "yaml", "json", "xml", "shell", "r"}


def parse_file(source: str, filename: str) -> list[CodeChunk]:
    if not source or not source.strip():
        return []

    language = detect_language(filename)

    if language == "python":
        return _parse_python(source, filename)

    if language in _BRACE_LANGS:
        return _parse_brace_language(source, filename, language)

    if language in _LINE_LANGS:
        return _line_chunk(source, filename, language)

    # Unknown — line-based fallback
    return _line_chunk(source, filename, language or "unknown")
