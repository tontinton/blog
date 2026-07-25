+++
title = "Lance table format explained simply"
date = "2026-02-08"
description = "Lance is a new table and file format. A modern successor to Apache Iceberg / Delta Lake. (Animated)"

[extra]
preloads = [
    "/io.min.html",
    "/encoding.min.html",
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

Before we watch the animation, let's understand what reading a single row actually costs:

```
cost of 1 random read = (number of reads) x (waste in each read)
```

This waste has a name: *read amplification*. If the smallest thing a format lets you read is 1mb, and all you wanted is an 8 byte int, you just read 125,000x more than you needed.

There's also a third cost that's easy to forget: **memory**. You can always make reads cheaper by keeping a bigger map of "where does each value live" in RAM, another of your precious resources.

So the costs are number of reads, waste in each read, and memory. Almost every decision in a file format improves one of them by hurting another, and that's basically the whole game.

{{ iframe(src="/animations/lance/io.min.html") }}

> Numbers are not exactly real, and should only serve as an order of magnitude estimation to build intution.
>
> Real files are messier. Each column gets a different chunk/page size, and a different number of them: a `bool` column can be a few KB, an embedding column hundreds of MB. The two formats also don't cut a column into the same number of parts.

## Can't we just configure Parquet?

Isn't this all just a configuration problem? Make the pages small and Parquet is suddenly good at random reads, no?

The <a href="https://arxiv.org/abs/2504.15247">Lance paper</a> actually measured it: 8kb pages, no dictionary encoding, and no page statistics, made random access **over 60x faster**. Full scans didn't get slower either, 8kb was close to optimal for both.

So the defaults are simply wrong (they measured on a local NVMe drive though, on S3 a read smaller than ~100kb costs the same as a 100kb read, so the numbers probably differ, but you get the gist).

> The library defaults mattered even more than the format's. Reading small values with a default `parquet-rs` gave 5,500 rows/sec, and 350,000 rows/sec after tuning it. Meaning most format benchmarks you read out there are really just API benchmarks.

But then there's a wall you can't configure your way out of: Parquet stores a *page offset index*, a table of where every page begins (~20 bytes per page) in memory. Smaller pages mean more pages. Let's say you store 1 billion rows of 3kb embeddings:

| page size | pages | offset index in memory | read amplification of 1 row |
|---|---|---|---|
| 1mb | ~3M | ~60mb | ~341x |
| 8kb | ~1B | **~20gb** | ~2.7x |

Small pages fix random reads and destroy memory. Big pages fix memory and destroy random reads. No configuration escapes this, which is exactly where Lance comes in.

Lance's answer is to not keep a page index at all for big values. Instead, everything belonging to a row, inside that one column, is stored next to each other, so finding it is just a math operation (multiplication).

## Structural encoding

Let's talk about that "everything belonging to a row", as it's also interesting.

A column is not always a flat array of values. Take a `List<String>` column (e.g. the tags of a document), to store it on disk you actually need 5 different arrays:

1. Is the row null?
2. Where does each row's list start?
3. Is each string null?
4. Where does each string start?
5. The text bytes themselves.

Splitting one logical column into many physical arrays is called *structural encoding*. Compressing each of those arrays is a completely different thing (*compressive encoding*), and it's where almost all of the research goes (<a href="https://github.com/cwida/FastLanes">FastLanes</a>, <a href="https://github.com/cwida/ALP">ALP</a>, <a href="https://github.com/maxi-k/btrblocks">BtrBlocks</a>).

The Lance paper basically proclaims nobody talks about the structural part, even though it's the one deciding how many disk reads a single row costs.

{{ iframe(src="/animations/lance/encoding.min.html") }}

# Lance table format

Lance table format is similar to Iceberg, but allows adding columns ad-hoc without copying all the data (just to add a value for the new column to all rows), while still preserving Iceberg's MVCC.

Another great feature of Lance tables is they also support <a href="https://lance.org/format/table/index/">indexes</a>, such as <a href="https://lance.org/format/table/index/">BTree</a>, <a href="https://lance.org/format/table/index/scalar/fts/">inverted index (FTS)</a>, and <a href="https://lance.org/format/table/index/vector/">vectors (e.g. HNSW)</a>.

Official docs <a href="https://lance.org/format/table/">here</a>. 

{{ iframe(src="/animations/lance/table.min.html") }}

# Thanks to AI?

Apparently there's another open-source Parquet competing file format called <a href="https://vortex.dev/">vortex</a> created by <a href="https://spiraldb.com/">SpiralDB</a> which seems like a direct competitor to <a href="https://lancedb.com/">LanceDB</a>.

These technologies only came about because of a need for multi-modal data lakes now that AI is so prevalent.

I wonder what other technologies will come from this AI software era.
