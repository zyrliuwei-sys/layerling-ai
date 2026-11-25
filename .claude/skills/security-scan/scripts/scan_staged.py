#!/usr/bin/env python3
"""Deterministic pre-commit security scan.

Checks (no LLM required — run this first, then do the manual diff review):
  1. Staged files that should never be committed (.env, keys, dumps, db files)
  2. Secrets / credentials in added lines of the staged diff
  3. .gitignore coverage for common sensitive paths (via `git check-ignore`)
  4. Tracked files that look like they should be ignored
  5. .dockerignore presence/coverage when a Dockerfile exists
  6. Oversized staged files

Usage:
  scan_staged.py             # scan staged changes (pre-commit)
  scan_staged.py --worktree  # scan staged + unstaged changes vs HEAD

Exit codes: 0 = clean or LOW only, 1 = HIGH findings, 2 = not a git repo / error.
"""

import argparse
import re
import subprocess
import sys
from fnmatch import fnmatchcase
from pathlib import Path

# ---------------------------------------------------------------- helpers


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", "-c", "core.quotePath=false", *args], capture_output=True, text=True, check=False
    )
    if result.returncode != 0 and args[0] not in ("check-ignore",):
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


findings: list[tuple[str, str, str]] = []  # (level, location, message)


def add(level: str, location: str, message: str) -> None:
    findings.append((level, location, message))


# ------------------------------------------- 1. forbidden staged filenames

# (pattern, message) — matched against the full repo-relative path
FORBIDDEN_FILES = [
    (r"(^|/)\.env(\..+)?$", "env file — likely contains real credentials"),
    (r"\.(pem|key|p12|pfx|keystore|jks)$", "certificate / private key material"),
    (r"(^|/)id_(rsa|ed25519|ecdsa)(\.pub)?$", "SSH key"),
    (r"(^|/)(credentials|service[-_]?account)[^/]*\.json$", "cloud credentials file"),
    (r"\.(db|sqlite|sqlite3)(-(journal|wal|shm))?$", "database file"),
    (r"(^|/)\.(npmrc|netrc|pypirc)$", "package-manager auth config — check for tokens"),
    (r"\.(log|dump|sql\.gz|bak)$", "log/dump/backup file"),
    (r"(^|/)\.DS_Store$", "OS junk file"),
]
FORBIDDEN_EXCEPTIONS = re.compile(r"\.(example|template|sample)(\.|$)|(^|/)example\.")


def check_staged_filenames(files: list[str]) -> None:
    for f in files:
        if FORBIDDEN_EXCEPTIONS.search(f):
            continue
        for pattern, msg in FORBIDDEN_FILES:
            if re.search(pattern, f):
                level = "LOW" if "junk" in msg or msg.startswith("log") else "HIGH"
                add(level, f, f"staged file should not be committed: {msg}")
                break


# ------------------------------------------------- 2. secrets in added lines

# High-confidence: always flagged, even in example/template files
HIGH_CONFIDENCE = [
    (r"AKIA[0-9A-Z]{16}", "AWS access key ID"),
    (r"gh[pousr]_[A-Za-z0-9]{36,}", "GitHub token"),
    (r"github_pat_[A-Za-z0-9_]{40,}", "GitHub fine-grained token"),
    (r"sk-(?:proj|svcacct)-[A-Za-z0-9_-]{35,}", "OpenAI project or service account key"),
    (r"sk-ant-[A-Za-z0-9_-]{20,}", "Anthropic API key"),
    (r"sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}", "OpenAI API key"),
    (r"sk_live_[A-Za-z0-9]{20,}", "Stripe live secret key"),
    (r"rk_live_[A-Za-z0-9]{20,}", "Stripe live restricted key"),
    (r"whsec_[A-Za-z0-9]{30,}", "Stripe webhook signing secret"),
    (r"xox[baprs]-[A-Za-z0-9-]{10,}", "Slack token"),
    (r"AIza[0-9A-Za-z_-]{35}", "Google API key"),
    (r"-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY", "private key block"),
    (r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", "JWT"),
    (
        r"(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp)://[^:/\s'\"]+:[^@/\s'\"]+@",
        "connection string with embedded password",
    ),
]

# Generic: skipped in example/template/test/lock files and on placeholder values
GENERIC = [
    (
        r"(?i)\b(password|passwd|secret|token|api[_-]?key|access[_-]?key|auth[_-]?key|client[_-]?secret|private[_-]?key)\b"
        r"\s*[:=]\s*['\"][^'\"]{8,}['\"]",
        "hardcoded credential-like assignment",
    ),
    (
        r"(?i)\bAuthorization\b['\"]?\s*[:=]\s*['\"](Bearer|Basic) [A-Za-z0-9+/._=-]{16,}['\"]",
        "hardcoded Authorization header",
    ),
]

PLACEHOLDER = re.compile(
    r"(?i)(example|placeholder|your[-_ ]|xxx|<[^>]+>|changeme|change-me|dummy|fake|"
    r"sample|test[-_]|\*{3,}|process\.env|import\.meta\.env|env\(|getenv|\$\{)"
)
GENERIC_SKIP_FILES = re.compile(
    r"(\.(example|template|sample|md|mdx|lock)(\.|$))|(^|/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$"
    r"|(^|/)(test|tests|__tests__|spec)s?/"
)


def parse_diff_added_lines(diff_text: str):
    """Yield (file, line_number, content) for each added line in a unified diff."""
    current_file = None
    new_line = 0
    for raw in diff_text.splitlines():
        if raw.startswith("+++ b/"):
            current_file = raw[6:]
        elif raw.startswith("@@"):
            m = re.search(r"\+(\d+)", raw)
            new_line = int(m.group(1)) if m else 0
        elif raw.startswith("+") and not raw.startswith("+++"):
            if current_file:
                yield current_file, new_line, raw[1:]
            new_line += 1
        elif not raw.startswith("-") and not raw.startswith("\\"):
            new_line += 1


def check_secrets(diff_text: str) -> None:
    for file, line_no, content in parse_diff_added_lines(diff_text):
        loc = f"{file}:{line_no}"
        for pattern, msg in HIGH_CONFIDENCE:
            if re.search(pattern, content):
                add("HIGH", loc, f"{msg} in diff (value redacted)")
                break
        else:
            if GENERIC_SKIP_FILES.search(file):
                continue
            for pattern, msg in GENERIC:
                m = re.search(pattern, content)
                if m and not PLACEHOLDER.search(content):
                    add("MEDIUM", loc, f"{msg} (value redacted)")
                    break


# --------------------------------------------------- 3. .gitignore coverage

# Representative paths that `git check-ignore` must match
IGNORE_PROBES = [
    (".env", "HIGH"),
    (".env.local", "HIGH"),
    (".env.development", "HIGH"),
    (".env.production", "HIGH"),
    ("node_modules/pkg/index.js", "MEDIUM"),
    (".output/server/index.mjs", "MEDIUM"),
    (".nitro/x", "MEDIUM"),
    ("src/paraglide/runtime.js", "MEDIUM"),
    ("src/routeTree.gen.ts", "MEDIUM"),
    ("data/local.db", "HIGH"),
    ("private/credentials.json", "HIGH"),
    ("private/deploy.key", "HIGH"),
    ("private/data.sqlite3-wal", "HIGH"),
    ("public/uploads/image.png", "MEDIUM"),
    (".DS_Store", "LOW"),
    ("npm-debug.log", "LOW"),
]


def check_gitignore_coverage() -> None:
    for probe, level in IGNORE_PROBES:
        rc = subprocess.run(
            ["git", "check-ignore", "-q", probe], capture_output=True
        ).returncode
        if rc != 0:
            add(level, ".gitignore", f"does not ignore `{probe}`")


# ------------------------------------- 4. tracked files that should be ignored


def check_tracked_files() -> None:
    tracked = git("ls-files", "-z").split("\0")
    for f in tracked:
        if FORBIDDEN_EXCEPTIONS.search(f):
            continue
        for pattern, msg in FORBIDDEN_FILES:
            if re.search(pattern, f):
                add("HIGH", f, f"already tracked in git but should be ignored: {msg}")
                break


# ------------------------------------------------------- 5. dockerignore

DOCKERIGNORE_PROBES = [
    ".env", ".env.local", ".env.development", ".env.production",
    ".env.production.local", ".git", "node_modules", "public/uploads",
]


def check_dockerignore(repo_root: Path) -> None:
    if not any(repo_root.glob("Dockerfile*")):
        return
    ignore_file = repo_root / ".dockerignore"
    if not ignore_file.exists():
        add("HIGH", ".dockerignore", "Dockerfile exists but .dockerignore is missing")
        return
    rules = [line.strip() for line in ignore_file.read_text().splitlines()]
    for probe in DOCKERIGNORE_PROBES:
        ignored = False
        for rule in rules:
            if not rule or rule.startswith("#"):
                continue
            pattern = rule.removeprefix("!").strip("/").removeprefix("**/")
            if fnmatchcase(probe, pattern):
                ignored = not rule.startswith("!")
        if not ignored:
            level = "HIGH" if probe.startswith(".env") else "MEDIUM"
            add(level, ".dockerignore", f"build context includes `{probe}`")


# ------------------------------------------------------- 6. oversized files

MAX_BYTES = 5 * 1024 * 1024


def check_file_sizes(files: list[str], repo_root: Path) -> None:
    for f in files:
        p = repo_root / f
        if p.is_file() and p.stat().st_size > MAX_BYTES:
            add("MEDIUM", f, f"staged file is {p.stat().st_size // 1024 // 1024}MB — belongs in git?")


# ---------------------------------------------------------------- main


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--worktree",
        action="store_true",
        help="scan staged + unstaged changes vs HEAD instead of staged only",
    )
    args = parser.parse_args()

    try:
        repo_root = Path(git("rev-parse", "--show-toplevel").strip())
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    if args.worktree:
        files = git("diff", "HEAD", "--name-only", "-z").split("\0")
        untracked = git("ls-files", "--others", "--exclude-standard", "-z").split("\0")
        files += untracked
        diff_text = git("diff", "HEAD", "--unified=0", "--no-color")
        # include untracked file contents as fully-added diffs
        for f in filter(None, untracked):
            p = repo_root / f
            try:
                lines = p.read_text(errors="ignore").splitlines()
            except (OSError, UnicodeDecodeError):
                continue
            diff_text += f"\n+++ b/{f}\n@@ -0,0 +1 @@\n"
            diff_text += "\n".join("+" + l for l in lines)
    else:
        files = git("diff", "--cached", "--name-only", "-z").split("\0")
        diff_text = git("diff", "--cached", "--unified=0", "--no-color")

    files = sorted(set(f for f in files if f))

    check_staged_filenames(files)
    check_secrets(diff_text)
    check_gitignore_coverage()
    check_tracked_files()
    check_dockerignore(repo_root)
    check_file_sizes(files, repo_root)

    if not files:
        print("note: no staged changes found (use --worktree to scan the working tree)")

    if not findings:
        print(f"✅ clean — scanned {len(files)} changed file(s), no findings")
        return 0

    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    findings.sort(key=lambda x: order[x[0]])
    for level, loc, msg in findings:
        icon = {"HIGH": "🔴", "MEDIUM": "🟡", "LOW": "⚪"}[level]
        print(f"{icon} {level:6} {loc}\n          {msg}")

    highs = sum(1 for f in findings if f[0] == "HIGH")
    print(
        f"\n{len(findings)} finding(s): "
        f"{highs} high, "
        f"{sum(1 for f in findings if f[0] == 'MEDIUM')} medium, "
        f"{sum(1 for f in findings if f[0] == 'LOW')} low"
    )
    return 1 if highs else 0


if __name__ == "__main__":
    sys.exit(main())
