+++
title = "The New Age of Data-Intensive Applications"
date = "2024-07-21"
description = "An exploration of using object storages (like s3) as the storage for data-intensive applications"
+++

In his book `Designing Data-Intensive Applications`, Martin Kleppmann suggests that all data applications follow a similar pattern. Their goal is to read data, run some transformation on it, and store the result somewhere, all to have a faster way to read that data later.

We see this pattern everywhere:
* A RDBMS (e.g. Postgres, MySQL) receives rows and computes a B-Tree.
* A log search engine (e.g. Elasticsearch, Splunk) receives documents and computes an inverted index.
* A streaming data pipeline using Spark / Flink, which receives records from Kafka and computes a pre-aggregated Iceberg table.
  * If you squint hard enough, Kafka looks like a transaction log (just distributed), and the data pipeline looks like a materialized view (just distributed and fault-tolerant). Not that far off from a database huh?

Lately, I've been seeing more and more data applications using object storages (e.g. AWS S3, Azure Blob Store, Google Cloud Storage) instead of the traditional file system to store data, claiming to be a much cheaper solution than the old alternatives.

In this post, we'll explore the benefits and drawbacks of this architecture, with 3 real-world examples:
* <a href="https://quickwit.io/">Quickwit</a> - A cheap log search engine as an alternative to Elasticsearch.
* <a href="https://warpstream.com/">WarpStream</a> - A cheap distributed log as an alternative to Kafka.
* <a href="https://neon.tech/">Neon</a> - Serverless Postgres, a sort of alternative to <a href="https://aws.amazon.com/rds/aurora/">AWS Aurora</a>.

Choosing between file system and object storage is **critical** to do before you write even a single line of code, as they have different APIs, performance characteristics, costs, and deployment operations. The architecture you choose to make will turn out to be **vastly** different.

I hope this can serve as a guide to deciding whether object storage is the correct approach for your next data application.

# What is an object storage?

Before we begin, here's a quick intro to what makes an object storage (also sometimes called blob storage).

Object storage is a service that is a kind of key-value database, that is very cheap to store huge amounts of unstructured data called blobs. "Blob" stands for "Binary large object".

They usually store data on the cheapest hardware, using HDDs instead of SSDs (until they'll be <a href="https://thecuberesearch.com/qlc-flash-hamrs-hdd/">cheaper</a>).

The API looks like:

```py
PutObject(bucket, path)
GetObject(bucket, path)
```

But you can also do more things, like listing files under a specific prefix:

```py
ListObjects(bucket, prefix)
```

One of the limitations of the API, compared to file systems, is that there's no way to overwrite a file partially, you can only overwrite the entirety of the file, replacing it.

AWS S3, the most popular object storage, doesn't even have a `MoveObject` request, you must `CopyObject(new)` -> `DeleteObject(old)`.

Also in S3, there are no transaction guarantees other than read-after-write consistency (a `GetObject` after a successful `PutObject` will always work). We'll soon learn how you can achieve ACID transactions over the different object storages.

Now that we get the gist, let's start diving deeper.

## Separation of storage and compute

The biggest advantage of object storages are that they are **extremely cheap** at scale, but why is that?

Look at S3's <a href="https://aws.amazon.com/s3/pricing/">pricing</a>:
* $21 - $23 per TB (monthly).
* PUT, COPY, POST, and LIST requests cost $5 per million requests.
* GET, SELECT, and all other requests cost $0.4 per million requests.

Notice how you don't pay much for the compute it takes AWS to keep S3 running. That's the magic of these object storage services. They allow for a pattern known as the separation of storage and compute.

In a traditional storage solution (for example Elasticsearch), when it runs out of disk space, it scales up to run another node. Thus, you pay for the accumulated CPU time of all the nodes running to hold your data.

What if most of the time, the data just sits there, accumulating dust, almost never to be queried? You pay for wasted CPU time.

This is why in the big data analytics world, we see products like <a href="https://www.snowflake.com">Snowflake</a>, <a href="https://delta.io/">Delta Lake</a> and <a href="https://iceberg.apache.org/">Apache Iceberg</a> (we'll expand on these later) being so popular lately. It's mainly because of costs.

> Be wary that you also pay for the network egress (data going outside the data center). On AWS specifically, it will cost ~53$ per TB, which depending on your workload, can be a deal breaker. As long as you run in the same AZ (availability zone) though, you <a href="https://docs.aws.amazon.com/cur/latest/userguide/cur-data-transfers-charges.html">shouldn't pay for egress</a>.
>
> There's a pretty new service by Cloudflare called <a href="https://www.cloudflare.com/developer-platform/r2/">R2</a> which provides the same API as S3, without the egress costs.

*"Why not use a mounted file system like EBS?"*, the reason is, again, cost. S3 is much cheaper in comparison (~8x cheaper per replica, 3 replicas will cost ~24x more). There's also the simplicity of not needing to deal with resizing the volume. For a more thorough explanation I'll link WarpStream's <a href="https://www.warpstream.com/blog/cloud-disks-are-expensive">Cloud Disks are (Really!) Expensive</a> blog post.

## Stateless

The separation of storage and compute also means your service is stateless, allowing for simple scalability and operation:
* You can add nodes / remove nodes by monitoring CPU / RAM / network usage.
  * Pay only for what you use.
  * Do so quickly. No need to synchronize the state with the cluster.
* Scale to zero with <a href="https://aws.amazon.com/lambda/">AWS Lambda</a> and pay nothing if there's usually no workload.
  * Or better yet, run on a cheap serverless edge solution like <a href="https://workers.cloudflare.com/">Cloudflare Workers</a>.
* Ability to break the monolith into different services.
  * For example a service for the write path, and a service for the read path.
* You can restart pods in case of a bug, and know that they will start with a clean state.
* Throw away that `StatefulSet` in k8s, and deploy a simple `Deployment`, just like your regular stateless web server.

## Reliability

S3 is designed to provide 99.999999999% durability and 99.99% availability of objects over a given year, but all object storages have similar guarantees.

They are designed to last bit-flips from cosmic rays and random earthquakes that destroy a data center.

> But can they protect against human error? Probably not 🙃

They remove the need to manage replicas of data in your system, which is a very complex problem.

One of the ways they achieve this is by using something called <a href="https://brooker.co.za/blog/2023/01/06/erasure.html">erasure coding</a>. It's an algorithm that breaks an object into `X` amount of chunks and distributes the storage of these chunks on different data centers. The beauty is that you only need a `Y` amount of chunks to reconstruct the object, where `Y < X`.

## Performance

As object storages are designed to be cheap and durable, it comes at the cost of performance, specifically latency.

When running a `GetObject` request to download a blob file, you can expect the median latency to be ~15ms, with P90 at ~60ms. Although these numbers got better with time and will continue to slowly improve, the latency of an NVMe SSD is 20–100 μs, which is 1000x faster.

The throughput is also not amazing by default, being somewhere around 50MB/s (while NVMe 5.0 can get to 12GB/s), but there's a trick to reach the throughput of even SSDs, and that is running multiple `GetObject` requests in parallel. For example, getting 20 blob files in parallel will give you 1GB/s of throughput.

This trick works even when you want to download 1 big file. For example in S3, there's a `Range` header you can provide to `GetObject`, where you specify the byte offset and size to download. Split the download into chunks, and fire multiple `GetObject` requests concurrently. Adding a bit of complexity for the benefit of better throughput.

Usually, the cloud providers also provide a more expensive but lower latency solution. For example, AWS has <a href="https://aws.amazon.com/s3/storage-classes/express-one-zone/">S3 Express</a>, which is somewhere in the middle of the pricing range between regular S3 and EBS, but it allows for tiering strategies without changing much of the architecture and code.

For example, if most reads from users are on new data and you write to an immutable log, like a LSM Tree, you can first write into the more expensive solution, and then on compaction write to the cheaper one. Access to new data will be fast, without paying that much more, as most of the time the data is in the cold storage.

Be wary of rate limits though. S3 for example, states they support 3500 write requests per second and 5500 read requests per second. Just remember the rate limits are applied per prefix, so storing data in different prefixes will allow you to have greater rate limits.

Finally, `ListObjects` requests are notoriously slow, mostly because object storages are flat and not hierarchical. Prefixes are called prefixes and not directories, because that's exactly what they are, a prefix to the key (remember how I said object storages are similar to K/V DBs?). To accommodate that, you should not store a bunch of small blobs, but a few big blobs. I can't say the best absolute size you should go for, experiment, and benchmark for your use case.

## Mostly cloud-based

Almost all object storages are services provided as part of the cloud. If you want your data to sit inside the internal company servers (On-Premise), it gets a bit more complex but definitely doable.

A popular solution for having an On-Prem object storage is to deploy <a href="https://min.io/">MinIO</a> using k8s or OpenShift.

MinIO strives to provide an API compatible with S3, but it has some differences. For example, in S3, a file and a directory can have the same name, while it is not supported in MinIO.

That's why when writing automated tests for your service, you should consider using <a href="https://docs.localstack.cloud/user-guide/aws/s3/">LocalStack's S3</a> instead of MinIO.

> Both MinIO and LocalStack have <a href="https://testcontainers.com/">testcontainers</a> modules, greatly simplifying the setup of your tests.

# ACID transactions?

If you have no idea what ACID is, you can go read my <a href="/posts/database-fundementals">Database Fundamentals</a> post.

Storing data in object storages and guaranteeing ACID transactions is possible, but has to be carefully designed.

This is not a novel problem anymore, let's look at how open-source solutions have solved this.

<a href="https://www.vldb.org/pvldb/vol13/p3411-armbrust.pdf">Delta lake</a> (**highly recommended** white paper linked) is an open source ACID table storage layer over cloud object storages, developed at <a href="https://www.databricks.com/">Databricks</a>. Think of it as adding the ability to run SQL over data stored in object storages.

In chapter 3.2 in the white paper, they state that both Google Cloud Storage and Azure Blob Store support an atomic put-if-absent operation, so they simply use these as the atomicity primitive. S3 is trickier, as it doesn't support any atomic put-if-absent / atomic rename operations, so you need to roll a coordination service that uses some concurrency primitive like locks, where all S3 write requests go through it.

> A very clever business move by Databricks. If you write to S3 with Spark running in Databricks, the writes automatically go through a coordination service implemented by them.

In Delta Lake version 1.2, they've included a way to use <a href="https://delta.io/blog/2022-05-18-multi-cluster-writes-to-delta-lake-storage-in-s3/">DynamoDB as the coordination service</a>.

This method of using a database that already implements ACID transactions is common, as it also improves the performance when listing files.

The biggest disadvantage with this approach is that the availability and durability guarantees of your application are only as good as the worst guarantees your different services provide. If you run Postgres self-hosted, and the node crashes for any reason, it can mean you don't have access to the data anymore, or at least transactional and efficient access to the data, depending on your architecture.

> Iceberg, a competitor to Delta Lake, developed by Netflix and is quickly becoming the industry standard, has an open-source coordination service called <a href="https://projectnessie.org/">Nessie</a>, which also supports git-like branching on your data (very cool 😎).
>
> Snowflake uses <a href="https://www.snowflake.com/blog/how-foundationdb-powers-snowflake-metadata-forward/">FoundationDB</a>.

I would really like it if one day AWS added an `IfMatch` header that checks, right before the end of a `PutObject` request, whether the ETag is different, and if it is, to fail the request. I mean there's already one in `GetObject`...

It would allow you to implement optimistic concurrency control right over the object storage by:
* Reading the current "metadata" file with `GetObject`.
* Treat the ETag as the version and increment it by 1.
* Upload a new file with the header `IfMatch: <just-read-version>`.
* If the request fails on the `IfMatch`, repeat from the beginning.

This will be less efficient in most cases than using Postgres, as you would need to upload a whole metadata file for each change, but it's much simpler when you don't need speed.

> Tony from the future here: AWS has just announced <a href="https://aws.amazon.com/about-aws/whats-new/2024/08/amazon-s3-conditional-writes/">conditional writes</a>, really exciting. Do you think this post had an influence? Probably not 🙃

# Implementation tips

It used to be that you would need to roll your own abstraction over object storages.

Since Apache's <a href="https://opendal.apache.org/">OpenDAL</a> was introduced, it made working with all the different object storages much simpler, by providing a single unified API.

Here's what it looks like in rust:

```rust
#[tokio::main]
async fn main() -> opendal::Result<()> {
    let mut builder = opendal::services::S3::default();
    builder.bucket("test");

    let op = opendal::Operator::new(builder)?
        .layer(opendal::layers::LoggingLayer::default())
        .finish();

    // Get the file length.
    let meta = op.stat("hello.txt").await?;
    let length = meta.content_length();

    // Read first 1024 bytes.
    let data = op.read_with("hello.txt").range(0..1024).await?;

    Ok(())
}
```

OpenDAL also supports the file system with `opendal::services::FS`, allowing you to run your object storage native app without relying on object storage. This can be great for testing, for example. However, don't expect it to be as optimized as an app designed to run on the file system from the start.

Finally, because object storages don't allow for partial writes, you should use immutable data structures like the LSM Tree, where files are only deleted or read after being written.

# Real-world examples

Ok, we're done with the theory, let's look at some real-world data applications that have explicitly decided to use an object storage.

We'll look at what they gained, and what they lost in the process.

Get ready for some opinions 🤠

## Quickwit

<a href="https://quickwit.io/">Quickwit</a> is a highly scalable, distributed and cheap log search engine. Or in simpler words: *"Elasticsearch but on an object storage"*.

It's open source (AGPL license) and written in rust using <a href="https://github.com/quickwit-oss/tantivy">tantivy</a> (MIT license), a fast text search engine, similar to Apache's <a href="https://lucene.apache.org/">Lucene</a> (Elasticsearch's search engine).

Tantivy and Lucene are libraries that receive text, tokenize it, and write to a data structure called an inverted index.

Let's say you provide them the following two strings: "My dog ate my food!", "My cat likes my dog", here's the resulting inverted index:

| Word  | Documents |
|-------|-----------|
| my    |      0, 1 |
| dog   |      0, 1 |
| ate   |         0 |
| food  |         0 |
| cat   |         1 |
| likes |         1 |

The tokenizer may also stem words and convert "changing", "changed" and "change" into "chang", so searching for "change" will find "My dog is changing". The inverted index may also store how many times a word comes up in each document, for sorting more relevant results on a search (the algorithm used is <a href="https://en.wikipedia.org/wiki/Okapi_BM25">BM25</a>). There's more to it, but I think you get the idea.

So what Quickwit does is:
* Read documents from a stream, for example, Kafka.
* Use tantivy to create an inverted index once every configurable amount of seconds.
* Store the newly created inverted index as a file in an object storage.
* Update the metadata store (Postgres) about this file.
  * Metadata can also be managed with a `metadata.json` file that's uploaded to the object storage. Less recommended on S3, which, as we've already discussed, can't guarantee ACID.

This is what they call the indexing pipeline.

Then on a search query:
* Get relevant file paths on object storage by querying the metadata.
* Download the files.
  * Note that it downloads the files in parallel, getting higher throughput.
* Use tantivy to search the relevant documents in each file's inverted index.

<img class="svg" src="/quickwit_architecture.svg"/>

> Image inspired by <a href="https://quickwit.io/blog/quickwit-101">Quickwit 101 - Architecture of a distributed search engine on object storage</a>.

Quickwit is much cheaper than Elasticsearch, ~10x cheaper (depending on the workload of course), and you can control which nodes and how many nodes are in the indexing and searching clusters, tuning it to match your read / write workload.

Sounds amazing, what's the catch? Latency.

As we've already discussed, each round trip takes 1000x more time than a modern SSD. Quickwit has built a few measures to lower the latency, for example:
* Designing a protocol with a maximum of 3 round trips per file.
* Caching the important sections of the inverted indexes in the searcher pods.
  * Cache hit lowers round trips.
* Rendezvous hashing (similar to consistent hashing) load balancing for a better cache hit rate.

There is also another more minor issue I found: no monitoring and alerting system. Minor because it can be implemented in the future

The bottom line is: if you don't need consistent sub 200ms search times, and you don't need an alerting system, then Quickwit is probably a good fit for you.

For most use cases, the drawbacks are so minor compared to the advantages, I truly think this is the future of log search engines.

> After learning about Quickwit, I got hyped and started implementing something like it myself, using tantivy and OpenDAL: <a href="https://github.com/tontinton/toshokan/">toshokan</a> 😛

## WarpStream

<a href="https://warpstream.com/">WarpStream</a> is a cheap distributed log and streaming platform with an API compatible with Kafka. Or in simpler words: *"Kafka but on an object storage"*.

It's not open-source, which means I can't recommend it.

> If you're from WarpStream (now Confluent?), please understand that I don't want support, I want to read code when stuff doesn't work.

Main differences with Kafka are:
* No leader / followers.
* Max latency starts at 250ms, as the WarpStream agents (the stateless service) buffer records in memory, and flush after 250ms have passed. This is only the default and can be modified, but lowering the time to flush will mean it's less cost efficient (more PUT / GET requests to S3).

The WarpStream devs understand S3's drawbacks well, they have implemented multiple nice tricks to design against them:
* Getting good throughput on S3 by distributing written records to multiple agents, and letting them write to S3 in parallel.
* Data locality for reads. Each agent is elected to specific split files. When an agent receives a request to a split file not owned by it, it will redirect the request to the owner agent, which caches these files in memory. This is especially useful as the most common pattern in a stream is to read from the end, meaning most read requests will want to read the latest file, which is most likely to be cached in memory.
* Data locality for historical reads. Split files are combined, sorted and compacted to allow for better efficiency when reading old historical records serially one after another.
* Can be configured to write new data to S3 Express, which is the most likely data to be read in a stream, and write old data (after compaction) to standard S3.

As you can probably already guess, WarpStream is ~5-10x cheaper than Kafka, and much simpler to operate as it's stateless.

Other than being new and mostly unproven *yet*, it has a pretty big problem. Try to guess what it is 😊

```








Some space for you to think :)








```

Latency.

The producer-to-consumer latency is (at the time of writing the post):
* P50 - half a second.
* P95 - almost a second.
* P99 - a second.

> Can they improve it? Maybe. But probably not near the latency of Kafka.

So, where do I see this product winning over Kafka?

Mostly in high throughput workloads, where you don't care about a second of latency, and you have enough throughput to start worrying about costs. For example, streaming security logs (e.g. AWS CloudTrail) into Quickwit to be searched by security analysts.

## Neon

<a href="https://neon.tech/">Neon</a> is an open-source (Apache license) serverless Postgres.

They took Postgres and made it work with an architecture that stores the actual data in an object storage instead of local disk.

<img class="svg" src="/neon_architecture.svg"/>

Postgres stores transaction logs into a data structure called a WAL (Write-Ahead-Log). Neon streams log entries from this WAL to a service they called Safekeeper, using the native Postgres replication protocol. Safekeeper nodes provide durability and fault-tolerance using a <a href="https://neon.tech/blog/paxos">custom made Paxos</a>, where the Postgres nodes are the proposers and safekeepers are the acceptors (verified by this <a href="https://github.com/neondatabase/neon/blob/main/safekeeper/spec/ProposerAcceptorConsensus.tla">TLA+</a>).

Once logs are accepted by the safekeepers, they stream to the next service called the page server. The page server behaves like an LSM Tree, where it buffers logs until they reach the size of 1GB, and then flushes them as a new immutable file into the object storage. Of course, just like the usual LSM Tree, you can query these logs even while they are buffered.

All read requests go directly to the page server, with the page id and a LSN (Log Sequence Number). The LSN is a monotonically increasing number that identifies a specific log in the WAL. So you know what that means, right?

Neon is an event source of Postgres` WAL! It has **history**, meaning you can have time-traveling queries and copy-on-write to your data. Or in other words: "git branching for your data".

Here are some use cases for git branching to data:
* Create a branch at the start of automation tests in CI.
  * This way you can test schema migrations in an isolated way.
* Simpler CD with zero downtime. Each deployment has a version and a branch, and services communicate with your DB on a specific branch.

Wow, this is so grea... Wait, don't tell me, latency?

Yep, cache misses go to the slow object storage.

Plus, you have to be careful to not treat it as a general-purpose distributed database. For example, JOIN queries are not distributed, they run on one of the stateless Postgres services. Neon is more similar to a single-writer, multiple-read-replicas kind of architecture.

I don't know whether I can recommend this one as a replacement for your usual OLTP workloads, as these must be super quick. It looks <a href="https://neon-latency-benchmarks.vercel.app/">promising</a>, but I'd have to play around with it more.

# Conclusion

Ok, hopefully you've learned of object storages, when they might be good and when they might be bad, by examining how they work on a high level, and by learning of 3 real solutions already running in the wild.

Think a bit, which of the 3 did you like the most? Why?

Object storage solutions can definitely be market-disrupting when applied to the right solution.

Don't be a sleeper, for your next open-source database startup, think about whether using them can be a right fit!
