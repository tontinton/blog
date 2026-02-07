+++
title = "Lance table format explained simply"
date = "2026-02-08"
description = "Lance is a new table and file format. A modern successor to Apache Iceberg / Delta Lake. (Animated)"

[extra]
preloads = [
    "/io.min.html",
    "/table.min.html",
]
+++

**TLDR** (but stay for the animations!): Lance is a successor to Iceberg / Delta Lake, more optimized for random reads, and supports adding ad-hoc columns without needing to copy all the data.

---

Some big things happened in the *big data over object storage* world in 2025:
* Iceberg V3 spec got released and added cool stuff like <a href="https://iceberg.apache.org/spec/#semi-structured-types">VARIANT</a>.
* <a href="https://turbopuffer.com/">turbopuffer</a> announced a vector search over object storages (similar to [Quickwit](/posts/new-age-data-intensive-apps/#quickwit)).
* <a href="https://jack-vanlightly.com/blog/2025/9/2/understanding-apache-fluss">Apache Fluss</a> lets Flink manage real-time streams with tiering to object storage.
* Datadog bought Quickwit.
* Databricks bought [Neon](/posts/new-age-data-intensive-apps/#neon).

But something way bigger flew completely under my radar, most likely as I was pretty busy building at <a href="https://vega.io/">$DAY_JOB</a> (some <a href="https://blog.vega.io/posts/partial_stream/">pretty cool stuff</a>, I must say).

This thing is called <a href="https://lance.org/">Lance</a>. It's a file format (like Apache Parquet), a table format (like Apache Iceberg), and a catalog spec (like Iceberg's REST catalog spec).

# Lance file format

Lance file format is similar to Parquet, but more optimized for random reads (`WHERE id = 123`), while still preserving Parquet's performance when doing sequential reads over all values of a specific column.

Official docs <a href="https://lance.org/format/file/">here</a>. 

{{ iframe(src="/animations/lance/io.min.html") }}

> Numbers are not exactly real, and should only serve as an order of magnitude estimation to build intution.
>
> Something interesting to test is how would Parquet behave if we configure it to store each page as 64kb instead of the default 1mb 🤔.

# Lance table format

Lance table format is similar to Iceberg, but allows adding columns ad-hoc without copying all the data (just to add a value for the new column to all rows), while still preserving Iceberg's MVCC.

Another great feature of Lance tables is they also support <a href="https://lance.org/format/table/index/">indexes</a>, such as <a href="https://lance.org/format/table/index/">BTree</a>, <a href="https://lance.org/format/table/index/scalar/fts/">inverted index (FTS)</a>, and <a href="https://lance.org/format/table/index/vector/">vectors (e.g. HNSW)</a>.

Official docs <a href="https://lance.org/format/table/">here</a>. 

{{ iframe(src="/animations/lance/table.min.html") }}

# Thanks to AI?

Apparently there's another open-source Parquet competing file format called <a href="https://vortex.dev/">vortex</a> created by <a href="https://spiraldb.com/">SpiralDB</a> which seems like a direct competitor to <a href="https://lancedb.com/">LanceDB</a>.

These technologies only came about because of a need for multi-modal data lakes now that AI is so prevalent.

I wonder what other technologies will come from this AI software era.
