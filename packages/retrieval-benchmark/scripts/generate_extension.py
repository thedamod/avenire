"""
Generates v2's extension queries for the slices v1's dataset leaves thin: exact
values, unanswerable questions (with a development split to calibrate abstention
on), and timestamped lecture questions. Every label is checked mechanically:

- exact-value: the answer must sit inside a short verbatim needle from one chunk,
  and that needle must occur in exactly one artifact of the corpus;
- unanswerable: no chunk in the corpus may contain all of the question's subject terms;
- timestamp: the evidence is the caption window (from the SRT itself) the question
  was written from.

Questions are drafted by an LLM (Groq, openai/gpt-oss-120b) from corpus text, then
filtered by these checks. Run after `bench:v1` has indexed the corpus:

    DATABASE_URL=... GROQ_API_KEY=... python3 scripts/generate_extension.py
"""

import json, os, random, re, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data/v1/.cache"
OUT = ROOT / "data/v2/extension.json"
SEED = 20261008
MODEL = "openai/gpt-oss-120b"
rng = random.Random(SEED)


def norm(text):
    return re.sub(r"\s+", " ", text).strip().lower()


def llm(system, user):
    body = json.dumps({
        "model": MODEL,
        "temperature": 0.4,
        "reasoning_effort": "low",
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }).encode()
    request = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {os.environ['GROQ_API_KEY']}", "Content-Type": "application/json", "User-Agent": "avenire-benchmark/1.0"},
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return json.loads(json.load(response)["choices"][0]["message"]["content"])
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 5:
                print("  skipped:", error, file=sys.stderr)
                return None
            time.sleep(int(error.headers.get("retry-after") or 0) or 10 * (attempt + 1))
        except Exception as error:  # malformed JSON: retry, then skip
            if attempt == 5:
                print("  skipped:", str(error)[:120], file=sys.stderr)
                return None


def chunks():
    sql = """
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT substr(c.item_id, length('bench-v1:') + 1) AS artifact, i.title, c.kind, c.content
        FROM chunk c JOIN item i ON i.id = c.item_id
        WHERE c.user_id = 'bench-v1' AND c.kind NOT IN ('outline')
      ) t"""
    out = subprocess.run(["psql", os.environ["DATABASE_URL"], "-Atc", sql], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def split_of(index):
    return "development" if index % 2 == 0 else "test"


def exact_values(rows, want=44):
    corpus = {}
    for row in rows:
        corpus.setdefault(row["artifact"], []).append(norm(row["content"]))
    numeric = [r for r in rows if len(re.findall(r"\d", r["content"])) >= 12 and len(r["content"]) > 400]
    rng.shuffle(numeric)
    used, out = {}, []
    system = (
        "You write retrieval benchmark questions for a student's study library. Given a passage and the title "
        "of the document it comes from, write ONE question whose answer is a specific value that appears "
        "verbatim in the passage: a number with its unit, a score, a year, an identifier, or a named setting. "
        "The question must name the document's subject so it is answerable from a whole library, must not copy "
        "the passage's wording, and must have exactly one correct answer in the passage. Return JSON "
        '{"question": str, "answer": str, "needle": str} where needle is a verbatim span of the passage '
        "(10 to 80 characters) that contains the answer. Return {} if no such value exists."
    )
    for row in numeric:
        if len(out) >= want:
            break
        if used.get(row["artifact"], 0) >= (2 if row["artifact"].startswith("controlled") else 1):
            continue
        draft = llm(system, f"Title: {row['title']}\n\nPassage:\n{row['content'][:3000]}")
        if not draft or not all(isinstance(draft.get(k), str) and draft[k].strip() for k in ("question", "answer", "needle")):
            continue
        needle, answer, question = norm(draft["needle"]), norm(draft["answer"]), draft["question"].strip()
        holders = [a for a, texts in corpus.items() if any(needle in t for t in texts)]
        copied = any(" ".join(w) in norm(question) for w in zip(*(needle.split()[i:] for i in range(5))))
        if not (10 <= len(needle) <= 80 and answer in needle and holders == [row["artifact"]] and not copied):
            continue
        used[row["artifact"]] = used.get(row["artifact"], 0) + 1
        out.append((row["artifact"], question, draft["needle"].strip(), draft["answer"].strip()))
        print(f"  exact {len(out)}: {question}", file=sys.stderr)
    return out


def unanswerable(rows, titles, want=30):
    system = (
        "You write questions a student might plausibly ask their study library which these documents do NOT "
        "answer: same subjects (statistics, biology, climate, graph algorithms, history, thermodynamics, "
        "information retrieval, linear algebra, machine learning, differential equations), but specific facts, "
        "values or events that a library of these titles would not contain. Return JSON "
        '{"questions": [{"question": str, "terms": [str, str]}]} with 40 items; "terms" are the 1-2 distinctive '
        "words or names a passage answering it would have to contain."
    )
    draft = llm(system, "Library titles:\n" + "\n".join(sorted(set(titles))))
    texts = [norm(r["content"]) for r in rows]
    out = []
    for item in (draft or {}).get("questions", []):
        terms = [norm(t) for t in item.get("terms", []) if isinstance(t, str) and len(t) >= 4]
        if not terms or any(all(t in text for t in terms) for text in texts):
            continue
        out.append(item["question"].strip())
        if len(out) >= want:
            break
    return out


def parse_srt(path):
    cues = []
    for block in re.split(r"\n\s*\n", path.read_text(encoding="utf-8-sig").replace("\r", "")):
        lines = block.strip().split("\n")
        timing = next((l for l in lines if "-->" in l), None)
        if not timing:
            continue
        start, end = [
            sum(float(x) * m for x, m in zip(t.strip().replace(",", ".").split(":"), (3600, 60, 1)))
            for t in timing.split("-->")
        ]
        text = " ".join(lines[lines.index(timing) + 1:]).strip()
        if text:
            cues.append((start, end, text))
    return cues


def timestamps(manifest, per_lecture=7):
    system = (
        "You write retrieval benchmark questions about lecture videos. Given a lecture title and a 30-second "
        "caption excerpt starting at a timestamp, write ONE question a student would ask about what is said "
        "there, mentioning the time as 'at about M:SS' and which lecture, answerable from the excerpt alone, "
        'without copying its wording. Return JSON {"question": str}.'
    )
    out = []
    for artifact in manifest["artifacts"]:
        if not artifact["id"].endswith("-captions"):
            continue
        cues = parse_srt(CACHE / artifact["path"])
        starts = sorted(rng.sample(range(120, int(cues[-1][1]) - 60, 30), per_lecture))
        for at in starts:
            window = [c for c in cues if c[0] >= at and c[1] <= at + 30]
            if len(" ".join(c[2] for c in window)) < 200:
                continue
            stamp = f"{int(window[0][0]) // 60}:{int(window[0][0]) % 60:02d}"
            draft = llm(system, f"Lecture: {artifact['title']}\nExcerpt from {stamp}:\n" + " ".join(c[2] for c in window))
            if draft and isinstance(draft.get("question"), str):
                out.append((artifact["id"], draft["question"].strip(), int(window[0][0] * 1000), int(window[-1][1] * 1000)))
                print(f"  time {len(out)}: {draft['question']}", file=sys.stderr)
    return out


def main():
    manifest = json.loads((ROOT / "data/v1/manifest.json").read_text())
    rows = chunks()
    # Keep families a previous run already filled; regenerate only the short ones.
    previous = json.loads(OUT.read_text()) if OUT.exists() else {"evidence": [], "queries": [], "judgments": []}
    kept = lambda prefix, want: [q for q in previous["queries"] if q["id"].startswith(prefix)] if sum(
        q["id"].startswith(prefix) for q in previous["queries"]) >= want else []
    evidence, queries, judgments = [], [], []

    def add(qid, family, text, split, evidence_rows):
        queries.append({"id": qid, "text": text, "family": family, "split": split,
                        "requiredEvidenceGroups": [[e["id"]] for e in evidence_rows]})
        for e in evidence_rows:
            evidence.append(e)
            judgments.append({"queryId": qid, "evidenceId": e["id"], "grade": 3})

    def reuse(prefix, want):
        old = kept(prefix, want)
        ids = {q["id"] for q in old}
        queries.extend(old)
        evidence.extend(e for e in previous["evidence"] if e["id"].removesuffix("-e") in ids)
        judgments.extend(j for j in previous["judgments"] if j["queryId"] in ids)
        return bool(old)

    if not reuse("x-exact-", 40):
        for i, (artifact, question, needle, answer) in enumerate(exact_values(rows)):
            add(f"x-exact-{i:02d}", "exact-value", question, split_of(i),
                [{"id": f"x-exact-{i:02d}-e", "artifactId": artifact, "locator": {"kind": "text", "needle": needle}}])
    if not reuse("x-none-", 30):
        for i, question in enumerate(unanswerable(rows, [a["title"] for a in manifest["artifacts"]])):
            add(f"x-none-{i:02d}", "unanswerable", question, split_of(i), [])
    if not reuse("x-time-", 18):
        for i, (artifact, question, start, end) in enumerate(timestamps(manifest)):
            add(f"x-time-{i:02d}", "timestamp", question, split_of(i),
                [{"id": f"x-time-{i:02d}-e", "artifactId": artifact, "locator": {"kind": "time", "startMs": start, "endMs": end}}])

    OUT.write_text(json.dumps({"schemaVersion": 1, "version": "v2-extension-0.1", "evidence": evidence,
                               "queries": queries, "judgments": judgments}, indent=2) + "\n")
    families = {}
    for q in queries:
        key = (q["family"], q["split"])
        families[key] = families.get(key, 0) + 1
    print(json.dumps({f"{f}/{s}": n for (f, s), n in sorted(families.items())}, indent=1))


main()
