# Ingestion & retrieval — audit and v2 design

Why videos go missing, why storage is wasteful, how rigorous retrieval is, and what v2
should do instead. The evidence is in `context/_notes/v1-ingestion-audit.md` (v1, with
line references) plus a direct review of `packages/ingestion` and
`packages/database/src/schema.ts` (v2).

## 1. Findings

### 1.1 Why videos go missing (v1, ranked by impact)

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

### 1.2 v2 today

- **Video coverage is narrower than v1.** Only YouTube URLs with available captions
  (`youtube-transcript`, which scrapes and breaks often). Uploaded video/audio, Vimeo,
  lecture sites and direct media URLs all fail as `UnsupportedSource`. There's no
  speech-to-text, ffmpeg, keyframes or OCR.
- **Capture never produces videos.** The desktop collector reports no media sessions, and
  the contract's `CapturedMedia.url` is only set when a player exposes it.
- Routing trusts `item.kind` + `sourceUrl`; there's no MIME or byte sniffing.

### 1.3 Storage

| Issue | v1 | v2 |
| --- | --- | --- |
| Re-ingesting unchanged content re-extracts and re-embeds everything | yes (except markdown notes) | **yes**: delete-all + insert-all, and `item.content_hash` is unused |
| Transcript stored twice (chunks + `file_transcript_cue`) | yes | no (chunks only) |
| Chunk metadata JSON duplicating resource fields | yes | no |
| Separate embedding table | yes | no (vector inline) |
| Normalized extracted document kept | no | **no**, so a chunking change means re-fetching sources that may have changed or vanished |
| Web page snapshot kept | no | **no**, only the URL |
| Vector precision | float32 ×1024 | float32 ×1536 (6 KB/chunk); `halfvec` would halve it |
| Large media buffered fully in memory | yes | **yes**: `Storage.get` returns the whole object |

### 1.4 Retrieval rigor (v2)

- **Per-user ANN filtering loses recall.** HNSW returns its nearest candidates across all
  users and `WHERE user_id = …` filters afterwards, so with many users the top-50 can
  contain few of this user's chunks.
- **Lexical search requires every term.** `websearch_to_tsquery` ANDs all terms, so
  question-style queries ("why does the arm stop moving") rarely match. There's no
  weighting for title or heading.
- **Chunk embeddings carry no context.** "it converges when…" is embedded without its
  document title or heading.
- **No diversity:** one long item can occupy the whole top-8. No neighbouring-chunk
  expansion.
- **No reranker or calibrated threshold**, so it never abstains on irrelevant material.
- **The benchmark has no video lane** (v1's had curated transcript/keyframe evidence but
  never tested end-to-end capture → transcript).

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
| Chunks | Postgres `chunk` | text, location, `content_hash`, `token_count`, `embedding halfvec(1536)`, `search` tsvector (weighted) |
| Embedding cache | Postgres `embedding_cache(model, content_hash) → halfvec` | reused across re-ingestion and identical passages |

New columns: `item.content_hash` (actually used), `item.document_key`,
`item.extractor_version`, `chunk.content_hash`. Re-ingestion is a no-op when
`(content_hash, extractor_version, chunker_version, embedding_model)` is unchanged;
otherwise chunks are diffed by hash and only changed chunks are embedded and written.

### 2.5 Retrieval

1. **Correct per-user ANN:** enable pgvector ≥ 0.8 iterative scans
   (`SET LOCAL hnsw.iterative_scan = relaxed_order; SET LOCAL hnsw.ef_search = 200`) inside
   the search transaction, so filtering by user keeps scanning until it has enough rows.
   At larger scale, partition `chunk` by user hash.
2. **Lexical that matches questions:** build the tsquery with OR semantics over stemmed
   terms (`to_tsquery` with `|`, phrases kept with `<->`), ranked by `ts_rank_cd` over a
   weighted vector: `setweight(title, 'A') || setweight(heading, 'B') || setweight(content, 'C')`.
3. **Contextual chunk embeddings:** embed `"{item title} › {heading}\n{content}"` (and the
   timestamp for transcripts); store the raw content for display and FTS.
4. **Fusion and shaping:** weighted RRF (dense 1.0, lexical 0.8), then **at most 2 chunks
   per item** in the top-k, then **neighbour expansion** (merge adjacent ordinals of the
   same item for the context Ruth reads).
5. **Rerank:** cross-encoder rerank over the top ~30 (Cohere `rerank-v3.5` or Voyage
   `rerank-2`), behind a `Reranker` service with a no-op fallback. Abstain below a
   threshold calibrated on the benchmark.
6. **Video-aware hits:** transcript hits carry `startSec`; the client deep-links the
   player. Slide hits show the keyframe thumbnail.

### 2.6 Benchmark additions

- A **video lane:** captioned and captionless YouTube, an uploaded MP4 lecture with
  slides, an audio-only recording, a long clip (truncation), and a silent clip. Measure
  ingest success, transcript coverage, OCR coverage, and timestamp error (|hit.startSec −
  gold| ≤ 15 s).
- **Capture → index end to end:** a fixture snapshot from the desktop/extension contract
  goes through `submitCapture` into the pipeline, asserting video pages become media items.
- Per-lane Recall@k / MRR / nDCG, plus per-source false-skip rate.

## 3. What changes in code (when we implement)

| Package | Change |
| --- | --- |
| `contracts` | `CapturedMedia` gains `pageUrl`, `currentTimeSec`; `IngestionJob` gains `coverage`; `ChunkKind` gains `slide` |
| `database` | `chunk.embedding → halfvec(1536)`, `chunk.content_hash`, weighted `search`; `embedding_cache`; `item.document_key`, `extractor_version` |
| `ingestion` | `resolve` stage; media extractor (sandboxed ffmpeg / yt-dlp / Whisper / OCR); `NormalizedDocument` persistence; hash-diffed chunk upsert; contextual embedding text; retrieval changes in §2.5 |
| `cloud` | `avenire-media` snapshot and a `MediaJobs` runner (segment checkpointing) |
| `apps/desktop` + extension | report video pages with time position; native media goes through the media path, never "note" |
| `retrieval-benchmark` | video lane and capture-to-index fixtures |

The retrieval fixes in §2.5 (iterative scans, OR lexical, diversity cap) are small and
can land independently of the media pipeline.
