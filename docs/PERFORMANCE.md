# Performance sweep: rc.14 completion follow-up

## Method

Measured on October 20 evening local time (October 21 UTC), Windows x64, Node 25.2.1, SQLite 3.50.4. A disposable tree contains three selected roots with 10,000 files each; a separate Git repository contains 4,001 tracked files. No installed service, real project tree, production index or tunnel is used. The old public candidate at ec7da59e46b2 is compared with this follow-up.

The primary A/B comparison alternates order in the same process, with separate indices over identical fixture files. This controls some host/cache variation. It is not a formal randomized study or a universal speed guarantee. All values below are milliseconds. Batch timings measure completion of the entire group, not per-request latency. P95 from three batches is simply the slowest observed batch and is not a stable tail estimate.

| Operation | Samples per version | Before median | After median | Before p95 | After p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rare filename | 60 | 3.54 | 2.67 | 4.83 | 3.68 |
| Missing filename | 60 | 3.20 | 2.04 | 4.18 | 2.74 |
| Common substring | 60 | 2.88 | 2.97 | 3.83 | 4.04 |
| Two-character query | 60 | 2.75 | 2.82 | 3.79 | 3.85 |
| 12 concurrent searches, batch elapsed | 10 | 41.14 | 24.63 | 55.57 | 29.65 |
| Project inspection, 4001 tracked files | 15 | 132.61 | 133.18 | 146.02 | 144.05 |
| 12 concurrent inspections, batch elapsed | 3 | 1195.65 | 1209.02 | 1205.77 | 1222.49 |

Rare searches improved about 24%, misses 36%, and twelve-search batches 40%. Common and short-query medians were about 3% slower; inspection was effectively unchanged. The search-loop yield also reduced measured event-loop p95 during the synthetic burst from 294.13 to 39.91 ms. This is a responsiveness observation for that burst, not a guarantee for every workload.

## Why the query changed

The predecessor put ESCAPE on every FTS5 LIKE query, which disables SQLite's trigram LIKE optimization. EXPLAIN QUERY PLAN showed a virtual-table scan without a LIKE constraint; the revised literal anchor shows L0. Queries with wildcard-looking filename characters still receive an exact escaped literal filter. Short queries fall back to scanning. No index schema migration, unsafe string interpolation, result cache or weakened path validation was introduced. SQLite's primary documentation describes this constraint: https://www.sqlite.org/fts5.html#the_trigram_tokenizer

## Real HTTP broker observations

A separate final loopback sweep ran after the full suite stopped competing for resources. The core endpoint started in 1273.00 ms and was observed serving status before all indices were ready. All three fresh indices were ready by 1711.83 ms from launch. These are fresh-database starts, not cold-disk measurements.

| Operation | Samples | Median ms | p95 ms |
| --- | ---: | ---: | ---: |
| Status | 40 | 0.97 | 1.24 |
| Ordinary file read | 20 | 65.64 | 72.03 |
| Indexed lookup | 40 | 7.37 | 9.52 |
| Project inspection | 10 | 155.39 | 182.87 |
| Acknowledged write plus immediate indexed lookup | 10 | 70.39 | 82.03 |
| External file creation to observed indexed visibility | 10 | 19.62 | 22.75 |
| Mixed batch of twelve status/search/read calls | 10 | 264.25 | 300.15 |

Authenticated index quiescence took 32.70 ms and all writer releases were acknowledged. The fixture child exited. The external-file visibility measure includes polling/search flushes, so it is not a pure filesystem-watcher notification latency.

Earlier independent sweeps varied substantially with concurrent machine activity. They were retained, not cherry-picked into the A/B table. In the source-only three-worker sweep, observed RSS after building was about 129 MiB and each 10,000-file database was about 7.04 MiB. The two-second idle CPU windows were too short and noisy for a battery-life or steady-state CPU claim.

## Reproduction

The harnesses under scripts/benchmarks accept explicit source, marked fixture and new output paths. Run locally as a normal user with Node 25+, Git, and prepared pinned dependencies. Fixture generation is excluded from measured operations. Outputs must not already exist. Keep benchmark artifacts outside the source checkout and do not select installed index databases.

    node scripts/benchmarks/fixture-sweep.mjs C:\Sources\DeskSom C:\Bench\fixture C:\Bench\single.json current
    node scripts/benchmarks/paired-sweep.mjs C:\Sources\DeskSom-before C:\Sources\DeskSom-after C:\Bench\fixture C:\Bench\paired.json
    node scripts/benchmarks/loopback-sweep.mjs C:\Sources\DeskSom-after C:\Bench\fixture C:\Bench\loopback.json

Create the parent C:\Bench directory first. The first harness creates the marked disposable fixture, and subsequent harnesses reuse it. The loopback harness needs the private engine overlay produced by setup against an explicitly disposable state configuration. Never run setup without an explicit fixture configuration for this purpose. Benchmark tokens are randomly generated fixture credentials and are not published.

Machine-readable sanitized measurements are retained in PERFORMANCE_RESULTS.json. Private raw receipts retain environment paths, failed harness attempts and original timing distributions separately. Visual acceptance, a normal-user installed task lifecycle, second-machine behavior and remote ChatGPT round-trip latency are not established by this sweep.
