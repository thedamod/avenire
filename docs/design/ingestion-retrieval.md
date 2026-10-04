# Ingestion & retrieval — audit and v2 design

Why indexed videos don't come back in search, why some never get indexed, why storage
is wasteful, how rigorous retrieval is, how to fix v1 under a benchmark v2 then has to
beat (§3), and what v2 should do instead. The evidence is in `context/_notes/v1-ingestion-audit.md` (v1, with
line references) plus a direct review of `packages/ingestion` and
`packages/database/src/schema.ts` (v2). §1.1 and §1.5 are a line-level read of v1 retrieval in
`context/avenire/packages/ingestion`.

## 1. Findings

### 1.1 Why videos go missing from search (v1, ranked by impact)

These are videos that *were* ingested, with transcript chunks in the index, and still
don't come back. Paths are relative to `context/avenire/packages/ingestion/src`.
Item numbers like "§1.5 #12" point at the general retrieval audit below.

1. **Documents get bonuses a transcript can never earn.** On top of the score:
   `+0.35 × word overlap` and `+0.28` for an exact phrase (`retrieval/retrieve.ts:1049-1050`),
   `+0.18` more for pdf/document/markdown with ≥ 25% overlap (`:1052-1061`), and ×1.4
   under document intent (`:1006-1013`). Cosine scores sit around 0.3–0.6, so these
   additions decide the order. Written text repeats the question's words; speech
   paraphrases them ("so if we multiply by the transpose…"). The scored list then picks
   the 16 candidates the reranker sees (§1.5 #12). Videos that miss that cut are never
   reranked, however relevant.
2. **Everyday words demote videos by 85% and sort them last.** Document intent fires on
   *page, text, quote, chapter, paragraph* (`:30-31`). The preferred types become
   pdf/document/markdown/link, so every video candidate is ×0.15 (`:1015-1021`) and
   then hard-sorted after every document (`:1514-1524`). "Quote what Strang says about
   the column space" or "which chapter of the lecture…" bury the lecture itself.
   Visual intent helps video, but "slide" isn't in its regex (`:26-27`).
3. **Transcript chunks are bare speech fragments.** Transcripts are cut into windows of
   at most 30 s and 900 characters (`ingestion/video.ts:142-186`). Each window is
   embedded and indexed as just that text: no video title, no topic, often no
   punctuation (`video.ts:313-356`). A query naming the lecture ("in the SVD lecture,
   what kind of vectors…") gets low cosine against a window where "SVD" is never
   spoken. Lexical search needs *every* query word in those 150 words (§1.5 #2),
   which spoken paraphrase almost never has.
4. **Naming the video returns its first minutes.** The lexical query treats a title
   match as a match for every chunk of the resource, ties ordered by `chunk_index ASC`
   (§1.5 #2). "Lecture 6" or "the SVD lecture" fills the lexical list with chunk 0, the
   metadata stub (`Video source: … / Transcription mode: …`, `video.ts:292-312`), and
   the intro. The answer at 44:28 is chunk ~90 and never makes the list.
5. **Timestamps in the question are ignored.** The v1 benchmark's video queries are
   mostly of the form "At roughly 9:15 in lecture 1, what…". `extractQueryTimestampMs`
   and `temporalProximityMultiplier` exist and are unit-tested, but nothing calls them
   (`retrieve.ts:552-588`). Worse, the `:` makes the query "symbol-heavy"
   (`:41, :626-631`), so the whole question is sent to trigram search as a single
   `ILIKE '%…%'` substring that can't match.
6. **Video hits cost the most context, so they're the first dropped.** Transcript
   chunks almost always look "fragmentary": they start lowercase or lack terminal
   punctuation (`:702-712`). So each video hit pulls in both neighbours, while a
   well-punctuated PDF paragraph doesn't. Under the 2,400-token budget the greedy loop
   skips whatever no longer fits (§1.5 #18), which in practice is the lower-ranked
   video hit.
7. **The reranker sees fragments without context.** Rerank documents are
   `[9:00-9:30] so the…` with no title (`:1645-1649`), so the cross-encoder compares a
   context-free fragment against complete document paragraphs. If the reranker fails,
   heuristic scores decide (§1.5 #13), which brings back item 1.
8. **Keyframe chunks crowd out their own transcript.** Each keyframe becomes a chunk
   holding title, caption, OCR and ±15 s of transcript, embedded together with the
   image (`video.ts:358-419`). It duplicates transcript text, sits in a different region
   of embedding space than text queries (image + text), and uses one of the 3–8 slots
   per resource (`retrieve.ts:377-403`). The transcript chunk that actually answers
   can be the one cut. Keyframe chunks do carry the title, which transcript chunks don't.
9. **Noise filters hit non-Latin lectures.** Any candidate under 80% printable ASCII is
   ×0.3 (`:636-648`), so lectures in non-Latin scripts are demoted across the board.
10. **The fast path never reranks.** When it's taken, items 1–2 decide the order on
    their own (§1.5 #15).

Items 1, 2 and 6 are scoring bias, 3–5 and 8 are representation, and 7 compounds both.
Together they explain why a correctly transcribed lecture is reliably out-ranked by any
PDF that shares the question's vocabulary.

### 1.2 Why some videos never get indexed (v1)

1. **Extension captures of native video were silently routed as notes.** `popup.js`
   hard-coded `type: "note"`; the worker passed `content: ""`, string content won over MIME
   routing, and empty markdown threw. Every extension-captured MP4/audio failed before
   media processing. *Deterministic, not flaky.*
2. **YouTube had no transcript path.** oEmbed supplied title and channel only; "video"
   ingestion fed the YouTube HTML page to ffmpeg. The YouTube links that did succeed were
   metadata-only.
3. **No lecture, LMS, embedded-player or HLS/DASH discovery.** Page text was clipped,
   never the video.
4. **Caps and quality filters.** A 100 MiB in-memory fetch limit, no ffmpeg wall-clock
   timeout, audio beyond 6 h silently dropped, and a transcript-quality heuristic that
   rejected terse or math-heavy lectures (high numeric or short-word ratio).
5. **Silent downgrades.** Failed transcription fell back to link metadata and was
   reported as success.

### 1.3 Video in v2 today

- **Video coverage is narrower than v1.** Only YouTube URLs with available captions
  (`youtube-transcript`, which scrapes and breaks often). Uploaded video/audio, Vimeo,
  lecture sites and direct media URLs all fail as `UnsupportedSource`. There's no
  speech-to-text, ffmpeg, keyframes or OCR.
- **Capture never produces videos.** The desktop collector reports no media sessions, and
  the contract's `CapturedMedia.url` is only set when a player exposes it.
- Routing trusts `item.kind` + `sourceUrl`; there's no MIME or byte sniffing.

For video **search** (v2 has none of v1's scoring biases, items 1–2, 6 and 10):

- **Title and naming queries can't reach a video at all.** `chunk.search` is
  `to_tsvector(content)` and embeddings are bare content, so "the SVD lecture" matches
  only if someone says "SVD" in that minute. This is worse than v1, where at least the
  intro matched.
- **Timestamps in queries:** unsupported, the same as v1 item 5.
- **Transcript chunks are fixed 60 s windows with no overlap** (`extract/youtube.ts:16-33`),
  joined with spaces, so an explanation that crosses a minute boundary is split in two.
  Caption text isn't cleaned. `youtube-transcript` is known to return HTML-entity-encoded
  text (`&amp;#39;`) for some videos; unverified here, and nothing decodes it.
- **No reranker,** so speech fragments compete with document paragraphs on raw RRF
  rank alone.

### 1.4 Storage

| Issue | v1 | v2 |
| --- | --- | --- |
| Re-ingesting unchanged content re-extracts and re-embeds everything | yes (except markdown notes) | **yes**: delete-all + insert-all, and `item.content_hash` is unused |
| Transcript stored twice (chunks + `file_transcript_cue`) | yes, and the "cues" were copies of the 30 s chunks, not caption cues (below) | no, but only because v2 keeps **no** cue-level timing at all (below) |
| Chunk metadata JSON duplicating resource fields | yes | no |
| Separate embedding table | yes | no (vector inline) |
| Normalized extracted document kept | no | **no**, so a chunking change means re-fetching sources that may have changed or vanished |
| Web page snapshot kept | no | **no**, only the URL |
| Vector precision | float32 ×1024 | float32 ×1536 (6 KB/chunk); `halfvec` would halve it |
| Large media buffered fully in memory | yes | **yes**: `Storage.get` returns the whole object |

**What v1's cue table actually held.** `toTranscriptCues` (`ingestion/pipeline.ts:38-60`)
copies the `video-transcript` *chunks* into `file_transcript_cue`. Those are 30 s,
900-character windows, with any keyframe `labels: … | ocr: …` text appended
(`video.ts:313-356`). The `captions.vtt` route then serves those rows as captions
(`apps/web/…/captions.vtt/workspace-file-captions-route-get.ts`). So v1 stored the same
text twice in Postgres at the same coarse granularity, showed 30-second caption blocks
with OCR noise, and threw away the real cue timing from SRT/VTT/Whisper segments after
windowing. It also kept only the last video resource per file and capped at 5,000 rows.

**v2 today** drops cues entirely: `extract/youtube.ts` folds caption cues into 60 s
sections, and only those sections reach `chunk`. Captions, seeking finer than a minute,
and "highlight what's being said" are impossible without re-fetching the source.

### 1.5 Retrieval in v1, in depth

v1 retrieval (`context/avenire/packages/ingestion/src/retrieval/`, SQL in
`context/avenire/packages/database/src/ingestion-data.ts`) looks rigorous: hybrid search,
query expansion, HyDE, decomposition, RRF, a reranker, abstention, a fast path with shadow
calibration, learner boosts, a warm cache and trace telemetry. Read closely, most of that
machinery doesn't do what its name says. Paths below are relative to those two
directories (`retrieve.ts` = `retrieval/retrieve.ts`, `ingestion-data.ts` = the database
file).

#### Candidate generation

1. **Dense search is capped and polluted.** `ORDER BY e.embedding <=> q LIMIT n` over
   all workspaces' embeddings (`ingestion-data.ts:1188`), filtered by workspace
   afterwards. Without iterative scans, pgvector's HNSW returns at most `hnsw.ef_search`
   (default 40) rows *before* the workspace filter. So the 80-candidate "coverage" limit
   is unreachable, and a busy deployment returns a handful of this workspace's chunks.
   The query also doesn't filter `ingestion_embedding.model`, so a model or dimension
   change compares vectors from different spaces. And it selects `e.embedding` back to
   the app (`:1181`), about 1024 floats as text per row, which nothing reads.
2. **Lexical search ANDs every term, and ranking is dominated by titles.**
   `plainto_tsquery` (`:1241`) requires every word, so question-style queries rarely
   match. The match condition ORs the chunk vector with `to_tsvector(title | source |
   provider)` (`:1270-1275`), so *every* chunk of a resource whose title matches
   qualifies with the same title score. Ties are broken by `chunk_index ASC` (`:1305`),
   so a title hit fills the lexical list with the first N chunks of that file. Those
   per-row `to_tsvector` calls and the OR also stop Postgres using the GIN index, so
   each lexical query scans the whole workspace.
3. **Trigram search can't use its index.** The predicate runs `regexp_replace(translate(
   normalize(content)))` before `ILIKE` (`:1440`), which the `gin_trgm_ops` index on raw
   `content` can't serve. That's a sequential scan with a regex per chunk.
   `similarity(whole chunk, short query)` is close to 0, so the score is effectively the
   0/1 substring match.
4. **The search vector indexes noise.** `buildChunkSearchText` (`ingestion-data.ts:111`)
   puts the inferred `kind` label ("generic", "example", "mistake") and the `source`
   string (storage keys, URLs) into every chunk's tsvector. The words "example" and
   "wrong", and URL fragments, match unrelated chunks.
5. **Fan-out is large.** Each retrieval runs up to 4 query variants (original, LLM
   expansion, 2+ decomposed clauses). Each variant runs dense + lexical + trigram + up to
   4 modality-filtered dense searches, and HyDE adds more (`retrieve.ts:1144-1199,
   1402-1459`). That's roughly 20–30 SQL statements per question, several of them
   sequential scans.

#### Fusion and scoring

6. **The "RRF" is decoration.** `fuseCandidatesByRrf` (`retrieve.ts:456`) computes
   1/(60+rank), about 0.016 per list. Then `scoreRetrievedCandidate` ranks by
   `candidate.score + fusionScore` (`:1099`). The raw scores are on incompatible scales:
   cosine 0–1, `ts_rank_cd` plus title bonuses, trigram 1–2. Where a chunk appears in
   several lists, the copy with the highest raw score wins (`:480`). So ordering is
   really "max raw score across incomparable signals", and a trigram substring hit
   (≥ 1.14 after its weight) beats any cosine similarity. The per-signal weights in config
   (`lexical 1.08`, `trigram 1.14`, `hyde 0.92`) scale the raw scores, which RRF ignores.
7. **Intent regexes misfire on everyday words.** Visual intent fires on *show, see, look,
   scene, screen* (`retrieve.ts:26`), document intent on *text, page, quote*, and
   synthesis on *both, together, across*. "Can you show me the derivation of…" is
   classified visual: documents get ×0.42, then ×0.15 for being outside the preferred
   types (`:978-1021`), a 94% penalty. Then `sortedByModalityPreference` puts all
   video/image candidates first regardless of score (`:1514-1524`). Synthesis and
   visual/audio intent also switch off abstention (`:590-604`).
8. **About fifteen hand-tuned constants stack multiplicatively.** Modality ×1.85 / ×0.42
   / ×2.0 / ×0.35 / ×1.4 / ×0.15, lexical overlap +0.35, exact phrase +0.28, doc bonus
   +0.18, noise ×0.3, audio ×1.2, title +0.08, learner ×≤1.6 (`:956-1112`). Nothing in
   the code ties them to a benchmark run, and they compound with each other.
9. **"Preserve dense" isn't dense-only.** `preserveCandidateFloor` keeps 40% of
   `querySearchResults[0]`, which is the original query's already-fused list (dense +
   lexical + trigram + modality), not the dense list (`:1468-1473`).
10. **Decomposition splits on stopwords.** Clauses split on *and / or / with / then /
    vs* and commas (`:361`). "Integration by parts with trig substitution" becomes two
    unrelated sub-queries, each doubling the candidate budget (`:1355-1358`).
11. **Learner boosts are dead code.** `getLearnerSignalBoosts` reads `concepts`,
    `conceptIds`, `topic` and `subject` from chunk metadata (`learner-signals.ts:46`).
    No extractor in `packages/ingestion` sets them, so every retrieval runs the concept
    lookup and gets an empty map. If they were populated, boosting weak concepts by
    relevance-independent factors before rerank would still be the wrong layer for it.

#### Reranking and abstention

12. **Few candidates reach the reranker.** `max(limit × 2, 12)` = 16 candidates
    (`:1533-1542`, `config.ts:139`), picked by the heuristic score above. The reranker
    can only reorder what items 6–8 let through.
13. **The rerank fallback is broken and expensive.** If the primary reranker fails,
    `rerankByCohereWithQueryEmbedding` re-embeds all 16–80 candidates through Cohere
    (`embeddings.ts:469`) and computes cosine scores. The caller then discards those and
    uses `candidate.score`, the heuristic score, as `rerankScore` (`retrieve.ts:1677-1681`).
    The second fallback does the same (`:1692-1696`). Re-embedding also runs into the
    12 RPM Cohere guard used in safe mode (`config.ts:17`).
14. **Abstention is uncalibrated and mostly bypassed.** It applies one threshold (0.18)
    to whatever scale `rerankScore` holds: a reranker probability, or a heuristic score
    above 1 after a fallback. It's skipped for visual, audio or synthesis intent, any
    decomposed query, or an explicit `sourceType` (`:590-604`). Item 7 shows how often
    those fire.

#### Fast path and calibration

15. **The fast path's confidence is meaningless.** `buildQueryResultPreview` sets
    `rerankScore = heuristic score` (`:1853-1856`) and feeds it to a confidence formula
    designed for reranker probabilities (`:873-894`). The route also requires no
    ambiguity reasons. Any query under 6 tokens without quotes or code is tagged
    `weak_anchor` (`:851-857`), so most real questions go slow anyway. When the fast path
    is taken, it skips reranking and neighbour expansion.
16. **Shadow calibration costs money and isn't used.** 15% of fast-path queries rerun the
    full slow path in the background, with two LLM calls, rerank and every search
    (`:2160-2199`). The comparison is logged and never read back to tune
    `FAST_PATH_CONFIDENCE_THRESHOLD`.

#### Query enhancement

17. **Expansion and HyDE run on every slow query.** Both are on by default (`config.ts:150-157`),
    both call `apollo-tiny`, and the slow path awaits both before searching
    (`retrieve.ts:1343-1346`). HyDE's token cap is `Math.max(512, config)`
    (`query-expansion.ts:73`), so the 160-token setting is always overridden to 512.
    The expanded query is searched dense-only (`retrieve.ts:1414`), which drops the
    synonyms it was asked to add for lexical recall.

#### Context assembly

18. **Eight results become two or three.** The budget is 2,400 tokens estimated as
    chars/4 (`:18, :251`). A chunk counts as "fragmentary" if it starts lowercase or
    lacks terminal punctuation (`:702-712`). That's nearly every word-window split and
    every transcript chunk, so each gets its two neighbours, around 1,000 tokens per hit.
    The greedy loop then `continue`s past hits that don't fit (`:763-766`).
19. **Context duplicates text and blurs citations.** Chunks overlap by 48 tokens, and
    expansion concatenates neighbours without trimming the overlap. Two hits from
    adjacent chunks repeat the same passage. The result keeps the hit's `chunkId` but its
    `content` is now three chunks, so a citation points at a span the model didn't
    necessarily use. Neighbour lookups run as one query per hit (`:1717-1733`).
20. **Embeddings carry no context.** Chunks are embedded as bare content
    (`persist.ts` → `textToMultimodalInput(chunk.content)`). Only the first chunk of a
    section contains its heading (`chunking.ts:166-186`), and the document title is never
    included.

#### Cache, warmup, telemetry

21. **Warmup fills a 45-second cache.** After each ingestion,
    `warmWorkspaceWithAdapters` runs up to 12 full adaptive retrievals, with LLM
    expansion, HyDE and rerank, built from file names and session summaries
    (`workspace-retrieval.ts:586-731`). The Redis cache TTL is 45 s
    (`workspace-retrieval-cache.ts:7`), so warmed entries almost always expire before
    anyone asks. Each request also reads `workspace.ingestion_revision` from Postgres to
    build the key.
22. **"Quality" telemetry is circular.** `computeRetrievalQualitySignal` marks a chunk
    as "used" if the answer shares ≥ 12% of its tokens or 8 words with it
    (`quality.ts:241-281`), then reports precision and recall against that. It measures
    what the model copied, not relevance, and nothing consumes it.

#### What v1 got right (keep)

- Cohere `search_query` / `search_document` input types for asymmetric embeddings.
- A trigram or exact lane for formulas, code identifiers and quoted phrases. The idea is
  sound; it needs an indexable implementation.
- Timestamp-aware rerank documents (`[mm:ss-mm:ss] text`) and the
  `temporalProximityMultiplier` idea (written and tested, but never called).
- Per-stage trace snapshots (`RetrievalTraceCollector`) that the benchmark can replay.
- Hash-diffed incremental re-embedding for notes (`persist.ts:46-87`).

### 1.6 Retrieval in v2 today

`packages/ingestion/src/retrieval.ts` is about 200 lines: per-user dense + lexical, RRF,
two chunks per item. Ruth calls it through `search_materials` and can read neighbours
itself with `read_item` (`packages/ai/src/tools/ruth.ts`). Commit `9112434` fixed three
§2.5 items:

| Gap | Status in v2 |
| --- | --- |
| Per-user ANN recall | **Fixed:** `hnsw.iterative_scan = relaxed_order`, `ef_search = 200` |
| Lexical ANDs every term | **Fixed, with a regression:** `' & '` → `' \| '` rewrite of `websearch_to_tsquery`. It also turns negation into a disjunction: `cells -plants` → `'cell' \| !'plant'`, which matches every chunk without "plant" |
| One item fills the top-k | **Fixed:** at most 2 chunks per item |
| Scale-mixing fusion | **Fixed by design:** pure rank-based RRF |
| Title/heading weighting in lexical | Missing: `chunk.search` is `to_tsvector(content)` only |
| Contextual chunk embeddings | Missing |
| Embedding model guard | Missing: `chunk.embedding_model` exists but isn't filtered on |
| Exact/identifier lane (formulas, code, quotes) | Missing |
| Reranker | Missing |
| Calibrated relevance / abstention | Missing. `SearchHit.score` is the RRF score (≈ 0.016–0.033), which tells Ruth nothing about relevance |
| Timestamp/page-aware queries | Missing |
| Neighbour expansion | Agent-driven via `read_item`. That's cheaper than v1, but costs a tool round trip |
| Benchmark | `packages/retrieval-benchmark` reports recall@10 / P@10 / MRR / nDCG@10 per query type. It has no video lane and no abstention metric |

## 2. v2 design

### 2.1 Pipeline shape

```
capture / upload / URL
  → resolve      (what is this? MIME + magic bytes + URL adapters → SourceDescriptor)
  → acquire      (stream bytes to storage or a scratch volume; never buffer whole media)
  → extract      (per-modality extractors → NormalizedDocument)
  → persist doc  (versioned NormalizedDocument in object storage, content-hashed)
  → chunk        (deterministic over the document → chunks with stable hashes)
  → embed        (only chunks whose (hash, model) has no cached vector)
  → index        (upsert chunks; delete only chunks no longer present)
  → cluster
```

Each stage is recorded on the job with a coverage report (`coverage: { transcript:
"full" | "partial" | "none", ocr, pages, truncatedAtSec? }`) so "metadata-only" is visible
and never passed off as success.

### 2.2 Source resolution

- `resolve` decides the extractor from **validated MIME + magic bytes + extension + URL
  adapter**, never from a caller-supplied "note" flag. Content provided as a string is
  only a note when its MIME says so.
- URL adapters (bounded and testable): YouTube, Vimeo, generic `<video>` / `<source>`,
  OpenGraph `og:video`, HLS/DASH manifests, and LMS players as needed (Coursera, edX,
  Canvas/Panopto via yt-dlp extractors). Use **yt-dlp** in the media sandbox for platform
  coverage (captions + audio) instead of scraping each site.
- The browser extension and desktop capture report video pages explicitly:
  `{ url, currentTimeSec, durationSec, title }` from the page's `<video>` element or the
  YouTube player API, so a captured lecture arrives as a media source with a seek
  position.

### 2.3 Media extraction (one pipeline for every video and audio source)

Runs in the Daytona media sandbox (ffmpeg, yt-dlp, a speech-to-text client and Tesseract
baked into a snapshot), or in a worker container with the same tools:

1. **Captions first:** platform captions via yt-dlp (`--write-subs --write-auto-subs`),
   uploaded SRT/VTT, or embedded subtitle streams (`ffprobe`).
2. **Speech-to-text fallback:** ffmpeg extracts 16 kHz mono audio in **streamed
   segments** (10 min, with overlap), transcribed by Whisper (Groq `whisper-large-v3-turbo`
   or OpenAI), with offsets stitched onto the timeline. Long media is checkpointed per
   segment, so a crash resumes instead of restarting.
3. **Slides:** scene-change keyframes (`select='gt(scene,0.3)'`, capped per hour), OCR'd,
   with consecutive frames deduplicated by perceptual hash. Each becomes a `slide` section
   at its timestamp, so slide text that's never spoken is still retrievable.
4. **No silent quality rejection.** Keep the transcript; record `asrConfidence` and
   `speechRatio` on the coverage report; down-rank (don't delete) very low-confidence
   segments.
5. **Bounds:** byte, duration and wall-clock limits with ffmpeg timeouts. Exceeding one
   produces `partial` coverage with `truncatedAtSec`, never an empty success.

The output is a `NormalizedDocument` with `transcript` sections (start/end sec, speaker
if known) and `slide` sections (sec, OCR text, frame key).

### 2.4 Storage layout

| Data | Where | Notes |
| --- | --- | --- |
| Original source | object storage, `users/<id>/items/<id>/source/*` | content-hash dedupe per user; streamed, never buffered |
| Web page snapshot | object storage (`snapshot.html` + readable markdown) | so re-chunking never re-fetches |
| `NormalizedDocument` | object storage, `document.v<extractorVersion>.json.gz` | the single canonical extracted text with locations |
| Keyframes | object storage, only frames that were OCR'd and kept | referenced from slide sections |
| Caption cues | inside `NormalizedDocument` (`transcript.cues[]`: `startMs`, `endMs`, `text`, optional `speaker`), plus a derived `captions.v<extractorVersion>.vtt` next to it | the only cue store; immutable per extractor version, so the VTT is served straight from storage/CDN |
| Chunks | Postgres `chunk` | text, location, `content_hash`, `token_count`, `embedding halfvec(1536)`, `search` tsvector (weighted) |
| Embedding cache | Postgres `embedding_cache(model, content_hash) → halfvec` | reused across re-ingestion and identical passages |

**How cues are stored once.** Postgres is the *index*; object storage is the *record*.
The record is the `NormalizedDocument`: the real caption cues at source granularity
(SRT/VTT cue, platform caption line, or Whisper segment), never re-windowed. Transcript
chunks are built from contiguous cue runs. Each chunk's `location` holds `{ startSec,
endSec, cues: [first, last] }`, and its `content` is the joined cue text, because FTS and
embedding need text in the row. That copy is index material, derivable and rebuilt on
re-chunk, not a second record. There's no cue table:

- **Playback captions:** `<track src>` points at the derived `captions.vtt`. A 1-hour
  lecture is about 60 KB of text (≈ 20 KB gzipped). It's written once per extractor
  version and cacheable forever.
- **Seek from a search hit:** the hit's `location.startSec`; with `cues`, the player can
  highlight the exact cue run that matched.
- **Ruth quoting a moment:** `read_item` already returns chunk content and location;
  finer quotes come from the cue range in the document.
- **Re-chunking** (new window size, chapters) reads cues from the document, with no
  re-fetch or re-transcription.

v2 change: `extract/youtube.ts` (and every media extractor) returns `cues` alongside
`sections`, and the pipeline persists them with the document (§2.1 "persist doc").

New columns: `item.content_hash` (actually used), `item.document_key`,
`item.extractor_version`, `chunk.content_hash`. Re-ingestion is a no-op when
`(content_hash, extractor_version, chunker_version, embedding_model)` is unchanged;
otherwise chunks are diffed by hash and only changed chunks are embedded and written.

### 2.5 Retrieval

Principles from §1.5. **Fuse by rank, never by raw score.** **Every stage must be
measurable on the benchmark before it ships**, because v1's constants and fallbacks
compounded unmeasured. **Prefer an index-backed SQL lane over an LLM call.** **Let Ruth
own query rewriting**: it already writes the `search_materials` query, so there's no
per-query expansion or HyDE in the hot path.

Already done (`9112434`): iterative HNSW scans, OR lexical, two chunks per item, pure
RRF. Next steps, in order, each landing on its own:

1. **Fix negation in the OR rewrite.** Build the tsquery from tokens instead of
   string-replacing `websearch_to_tsquery` output: OR the positive terms, keep phrases as
   `<->`, AND any `!term` onto the whole disjunction (`(a | b) & !c`). Unit test:
   `cells -plants` must not match a chunk that contains neither word.
2. **Guard the embedding space.** Add `AND c.embedding_model = ${embedder.model}` to the
   semantic lane, and backfill or re-embed on model change. This is cheap, and prevents
   silently comparing vectors from different models.
3. **Weighted lexical vector.** Replace the generated `search` column with a stored
   `setweight(to_tsvector(title), 'A') || setweight(to_tsvector(heading), 'B') ||
   setweight(to_tsvector(content), 'D')`, written at chunk insert (the title is
   denormalised per chunk, and rewritten on item rename). Keep it a single GIN-indexed
   column: v1's OR across per-row `to_tsvector(title)` lost the index and flooded results
   with title-only matches (§1.5 item 2). Don't index `kind` or `source`.
4. **Contextual chunk embeddings.** Embed `"{item title} › {heading path}\n{content}"`,
   plus `[mm:ss]` for transcript chunks. Display and FTS keep the raw content. This
   needs a `chunker_version` bump and a re-embed, so it goes with the embedding-cache
   work in §2.4.
5. **Exact lane for symbols.** When the query has a quoted phrase, a code identifier or
   math symbols (v1's `extractTrigramQuery` heuristic is fine), add a third RRF list:
   `content ILIKE '%…%'` on raw `content`, served by a `gin_trgm_ops` index. Do the
   normalisation (NFKC, dash folding) at insert time in a stored `content_norm` column,
   so the predicate stays indexable (§1.5 item 3).
6. **Reranker with a real score.** A `Reranker` service (Cohere `rerank-v3.5` or Voyage
   `rerank-2`) over the top ~30 fused candidates, documents formatted as `"{title} ›
   {heading} [{location}]\n{content}"`. If it fails, return the RRF order and flag
   `reranked: false`. No re-embedding fallback, and no reuse of another stage's scores as
   a rerank score (§1.5 item 13).
7. **Expose relevance, then abstain.** `SearchHit` gains `relevance` (the rerank score,
   or `null` when not reranked) and the result gains `reranked`. Pick one threshold on
   the benchmark's no-answer queries; below it, return no hits plus `abstained: true`, so
   Ruth says the materials don't cover it. No intent-based bypasses (§1.5 item 14).
8. **Location-aware queries.** Parse `p. 12`, `page 12`, `12:30` and `slide 4` from the
   query, and add an RRF list of chunks whose `location` contains that page or time
   (v1's `temporalProximityMultiplier`, as a ranked list instead of a multiplier).
9. **Neighbour stitching in the hit, not the context.** Keep `read_item` for deliberate
   reads. For hits whose chunk was a mid-paragraph word-window split, attach
   `before`/`after` snippets of about 60 tokens with the overlap removed, fetched in one
   query for all hits. Don't splice whole neighbours into the hit content; v1 blew its
   budget and blurred citations that way (§1.5 items 18–19).

**Video search specifically** (fixes §1.1 and the v2 gaps in §1.3):

- **Title, chapter and time in every transcript chunk.** Steps 3–4 apply to transcripts
  as `"{video title} › {chapter} [mm:ss]\n{text}"` in the embedding text, with title and
  chapter in the weighted lexical vector. This fixes v1 #3 and v2's title blindness
  without v1's flood of intro chunks (#4).
- **Timestamp lane first.** Step 8 is the highest-value change for lectures. "At 9:15 in
  lecture 1" becomes a location list (chunks whose `[startSec, endSec]` contains or is
  near 555 s) fused with the title match, so the right minute of the right video ranks
  first. Strip the parsed time from the text before it reaches the other lanes (v1 #5).
- **Better transcript windows.** About 45–60 s, broken at cue gaps ≥ 1.5 s or at YouTube
  chapter boundaries, with about 10 s of overlap. Decode HTML entities and drop `[Music]`
  style cues.
- **One `outline` chunk per video.** Title, channel or source, and chapters with
  timestamps (YouTube chapters when present, otherwise generated once at ingest). It
  replaces v1's metadata stub and is where "what's in the SVD lecture" lands. Its hits
  carry `startSec` pointers, so Ruth can `read_item` at the right ordinal.
- **Slides as their own `slide` chunks** (§2.3), embedded as OCR text rather than
  image + duplicated transcript (v1 #8). The per-item cap counts a slide and the
  transcript chunk at the same timestamp as one slot.
- **No modality multipliers.** When the user means a video, Ruth passes
  `kinds: ["video"]`; otherwise every kind competes on rank (v1 #1–2).
- **Rerank documents carry title and time** (step 6), so the cross-encoder judges a
  fragment in context (v1 #7).

Deliberately not ported from v1: regex intent detection and modality multipliers (use
`kinds` filters chosen by Ruth instead), LLM query expansion, HyDE and decomposition in
the hot path, learner-signal boosts, the fast/slow router and shadow calibration, the
warm-up job, and token-overlap "quality" telemetry. Any of these can come back only with
a benchmark result showing it helps.

Later, when the data justifies it: per-user `chunk` partitioning, `halfvec`, and a
small learned weight for RRF lists (dense / lexical / exact / location) fitted on the
benchmark.

### 2.6 Benchmark additions

- A **video lane:** captioned and captionless YouTube, an uploaded MP4 lecture with
  slides, an audio-only recording, a long clip (truncation), and a silent clip. Measure
  ingest success, transcript coverage, OCR coverage, and timestamp error (|hit.startSec −
  gold| ≤ 15 s).
- **Capture → index end to end:** a fixture snapshot from the desktop/extension contract
  goes through `submitCapture` into the pipeline, asserting video pages become media items.
- Per-lane Recall@k / MRR / nDCG, plus per-source false-skip rate.
- A **video retrieval lane**, separate from ingest. Port v1's 13 video/audio queries
  (`context/avenire/packages/retrieval-benchmark/data/dataset.json`, mostly "at about
  mm:ss in lecture N…") and seed them into a corpus that also has PDFs sharing the
  lectures' vocabulary, so v1 #1-style bias shows up as a metric. Report Recall@10 for
  video items and timestamp error.
- A **no-answer lane:** questions whose answer is not in the seeded corpus. Report
  abstention precision and recall next to Recall@k, so the threshold in §2.5 step 7 is
  chosen on data.
- **Query-shape lanes** matching §1.5's failure modes: question-style, negation, quoted
  phrase or formula, code identifier, title-only ("what's in the thermodynamics notes"),
  page or timestamp reference, and everyday "show me…" phrasing.
- Report **p50/p95 latency and provider calls per query** with the quality metrics, so
  a stage that adds cost has to pay for itself.

## 3. Fixing v1 as the baseline v2 must beat

v1 is the only system with real ingested material, a serious benchmark (below), and
per-stage traces. Fixing it *under that benchmark*, one measured step at a time, gives
v2 two things it doesn't have: **numbers to beat per slice**, and **evidence for which
techniques are worth porting**. v2 then builds on measured results instead of a list of
ideas.

### 3.1 What v1 fails at

| Area | Failure | Where | Benchmark signal that should catch it |
| --- | --- | --- | --- |
| Capture | Extension video/audio routed as empty notes; YouTube metadata-only; no player/LMS/HLS discovery; silent downgrades | §1.2 | evidence materialization rate (unmatched evidence = ingest failure) |
| Captions | "Cues" are 30 s chunk copies with OCR noise; real cue timing discarded | §1.4 | time-locator precision: matched chunk span vs evidence span |
| Dense recall | ≤ 40 HNSW rows before the workspace filter; no model filter | §1.5 #1 | Recall@50 at the `dense` trace stage |
| Lexical | AND semantics; title match floods intro chunks; seq scans; noisy tsvector | §1.5 #2–4 | `lexical` stage Recall@50; `paraphrase` and `timestamp` families |
| Fusion | raw scores of incompatible scales decide order; RRF is cosmetic | §1.5 #6 | `query-fusion` / `global-fusion` stage nDCG@10 vs best single lane |
| Bias | doc bonuses, intent regexes, ×0.15 demotion of video | §1.1 #1–2, §1.5 #7–8 | `video-transcript` modality slice; `timestamp` family |
| Video representation | bare 30 s fragments; keyframe duplicates; timestamps ignored | §1.1 #3–5, #8 | `timestamp` family, MRR@10 |
| Rerank | 16 candidates; fallback discards its own scores | §1.5 #12–13 | `rerank-input` Recall@16 (ceiling) vs `rerank-output` |
| Abstention | one uncalibrated threshold, bypassed for most queries | §1.5 #14 | `unanswerable` family (10 queries already in the dataset) |
| Context | 8 results become 2–3; duplicated overlap; citations blurred | §1.5 #18–19 | `final` stage Recall@8 vs `rerank-output` Recall@8 |
| Cost | HyDE + expansion every query; shadow reruns; warm-up for a 45 s cache | §1.5 #16–17, #21 | provider calls and p95 latency per query (to add) |

### 3.2 The benchmark v2 inherits

v1's `context/avenire/packages/retrieval-benchmark` is the better foundation, so v2
adopts its contract. v2's current `packages/retrieval-benchmark` is document-level
relevance over inline synthetic text, three query types and no media; it becomes a fast
offline smoke lane.

What carries over unchanged:

- **Pinned corpus.** `data/manifest.json`: 65 artifacts (49 PDF, 6 markdown, 5 video,
  3 office, 1 image, 1 audio), each with license, byte size and SHA-256. Media excerpts
  are derived by deterministic ffmpeg stream copies.
- **Locator-based qrels.** `data/dataset.json`: 48 evidence targets addressed by `page`,
  `slide`, `sheet`, `time` (`startMs`/`endMs`), `text` (needle) or `document`. There are
  95 graded judgments (0–3) and `requiredEvidenceGroups` for multi-evidence queries.
  Qrels are materialized to *whatever chunks a run produced*
  (`materialize-qrels.ts`), so **v1 and v2 can chunk differently and still be scored
  on the same judgments**. This is the property that makes a cross-version comparison
  possible.
- **84 queries in 13 families** (timestamp 11, paraphrase 10, formula-chart 10,
  multi-hop 10, cross-file 10, unanswerable 10, direct-fact 8, exact-identifier 7, …),
  split 15 development / 69 test.
- **Metrics** per trace stage: Recall@k, Precision@k, MRR@10, nDCG@k, AP, all-evidence
  success. Slices by family, source type, format and evidence modality.
  `classifyStrength` refuses claims for slices under 40 queries.

What has to be added, in both systems' runners:

1. **One retriever adapter.** `retrieve(query) → { hits: [{ itemRef, location: { page?,
   slide?, sheet?, startMs?, endMs? }, content }], abstained, trace?, providerCalls,
   latencyMs }`. v1 implements it with `retrieveRelevantChunks(new
   PostgresVectorStore(ws), …)`, as `run-database-benchmark.ts` already does. v2
   implements it with `Retrieval.search` plus a `hnsw`/`lexical`/`rrf` trace.
2. **Ingest through each system's own pipeline.** Unmatched evidence is reported as an
   ingest failure, not dropped (v1 already does this). That makes capture and caption
   fixes measurable in the same run as retrieval.
3. **Abstention scoring** on the `unanswerable` family: abstention precision and
   recall, and false abstentions on answerable queries.
4. **Cost columns:** p50/p95 latency, LLM calls, embedding calls and rerank calls per
   query.
5. **Versioned baselines.** Commit run *summaries* (not raw traces) as
   `baselines/<system>-<step>.json` with git SHA, corpus version, dataset version and
   model IDs. Tune on `development` and report `test` only.
6. **Grow the thin slices to 40.** Timestamp/video (11 + 10 evidence), visual-only (2)
   and table-cell (1) are below the gate. Grow them before claiming anything about
   video; the MIT OCW candidates in `VIDEO_DOWNLOAD_CANDIDATES.md` are the intended
   source.

### 3.3 Fix ladder for v1

Each rung is a config flag or a small patch, measured on `development`, then frozen and
reported on `test`. Rung 0 is the baseline every later number is compared against.

| Rung | Change (v1) | Expected movement | Port to v2? |
| --- | --- | --- | --- |
| 0 | **Baseline as-is:** `auto`, `full` and `fast` modes; expansion/HyDE on and off | establishes `v1-asis` | — |
| 1 | **No-regret bugs:** rerank fallback uses its cosine scores (or drop the fallback); HyDE token cap; `ingestion_embedding.model` filter; stop selecting `e.embedding`; don't send `:`-containing questions to trigram | correctness; fewer provider calls | model filter and no re-embed fallback are already in §2.5 |
| 2 | **Recall:** `hnsw.iterative_scan` + `ef_search = 200`; OR lexical with negation preserved | `dense` / `lexical` stage Recall@50 | already in v2, negation fix in §2.5 step 1 |
| 3 | **Lexical quality:** stored weighted tsvector (title A, content D) as one GIN column; drop `kind`/`source` from it; trigram on a stored normalized column | `paraphrase`, `exact-identifier`; latency | §2.5 steps 3, 5 |
| 4 | **Fusion:** pure RRF over lanes; remove raw-score addition, modality multipliers, doc bonus and intent regexes, as one ablation | `video-transcript` slice; no regression on `direct-fact` | already in v2 (pure RRF) |
| 5 | **Timestamp lane:** wire `extractQueryTimestampMs` as an RRF location list | `timestamp` family MRR@10 | §2.5 step 8 |
| 6 | **Contextual transcript chunks:** re-ingest the benchmark corpus with title + `[mm:ss]` in the embedding text; keyframes stop duplicating transcript | `timestamp`, `video-transcript`, `cross-file` | §2.5 step 4 and the video block |
| 7 | **Rerank wider and with context:** top 40 RRF candidates, documents include title + location | `rerank-output` nDCG@10 | §2.5 step 6 |
| 8 | **Calibrated abstention:** one threshold fitted on `development` unanswerables, no bypasses | `unanswerable` abstention F1 | §2.5 step 7 |
| 9 | **Context assembly:** no whole-neighbour splicing; trim overlap | `final` Recall@8 ≈ `rerank-output` Recall@8 | §2.5 step 9 |
| 10 | **Cost ablations:** expansion, HyDE, decomposition, learner boosts, fast path, each on and off on top of rung 9 | quality delta vs calls/latency | port only what wins on `test` |
| 11 | **Ingest:** extension media routing; real caption cues (store SRT/Whisper cues, serve VTT from them) | evidence materialization rate; time-locator precision | §2.2–2.4 |

Rungs 1–5 and 9 are SQL or config only. Rung 6 needs a re-ingest of the ~65-artifact
corpus, not production. Rung 11 changes v1's capture path; do it only if v1 must keep
serving users while v2 is built.

### 3.4 How v2 uses the result

- **The bar:** v2 replaces v1 retrieval when, on `test`, every slice with ≥ 40 queries
  is within the bootstrap confidence interval of `v1-best` or above it, abstention F1 is
  ≥ v1's, and p95 latency and provider calls per query are ≤ v1's.
- **The port list:** a technique from rung 10 enters v2 only if it moved a `test` slice
  in v1. Everything else stays in the "deliberately not ported" list in §2.5.
- **The regression gate:** after cut-over, `v2-<sha>` runs on every retrieval change,
  and a drop beyond the interval on any supported slice fails the check.

Prerequisites, checked: v1's tree under `context/avenire` has no `node_modules`, so it
needs `pnpm install` there. It also needs Postgres with pgvector ≥ 0.8 (for rung 2),
`COHERE_API_KEY`, and the `apollo` reranking/LLM provider keys. The commands are already
in its README: `corpus:fetch`, `corpus:ingest-controlled -- --user-email …`,
`run:controlled`, `report:run`.

## 4. What changes in code (when we implement)

| Package | Change |
| --- | --- |
| `contracts` | `CapturedMedia` gains `pageUrl`, `currentTimeSec`; `IngestionJob` gains `coverage`; `ChunkKind` gains `slide` and `outline`; `SearchHit` gains `relevance`, search results gain `reranked` / `abstained` |
| `database` | `chunk.embedding → halfvec(1536)`, `chunk.content_hash`; stored weighted `search` (title A, heading B, content D); `content_norm` + `gin_trgm_ops` index; `embedding_cache`; `item.document_key`, `extractor_version` |
| `ingestion` | `resolve` stage; media extractor (sandboxed ffmpeg / yt-dlp / Whisper / OCR); `NormalizedDocument` persistence; hash-diffed chunk upsert; contextual embedding text; retrieval changes in §2.5 |
| `cloud` | `avenire-media` snapshot and a `MediaJobs` runner (segment checkpointing) |
| `apps/desktop` + extension | report video pages with time position; native media goes through the media path, never "note" |
| `retrieval-benchmark` | adopt v1's contract (pinned manifest, locator qrels, families, stage metrics, strength gate) behind one retriever adapter for v1 and v2; versioned baselines; then the video, capture-to-index, no-answer, query-shape and cost additions (§2.6, §3.2) |

The retrieval steps in §2.5 are independent of the media pipeline. Steps 1–3 and 5
are SQL and schema only. Step 4 rides on the re-embed in §2.4. Steps 6–7 need the
no-answer benchmark lane first.
