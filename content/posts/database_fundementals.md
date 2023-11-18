+++
title = "Database Fundamentals"
date = "2023-12-15"
+++

About a year ago, I tried thinking which database I should choose for my next project, and came to the realization that I don't really know the differences of databases enough. I went to different database websites and saw mostly marketing and words I don't understand.

This is when I decided to read the excellent books `Database Internals` by Alex Petrov and `Designing Data-Intensive Applications` by Martin Kleppmann.

The books piqued my curiosity enough to write my own little database I called <a href="https://github.com/tontinton/dbeel">dbeel</a>.

This post is basically a short summary of these books, with a focus on the fundamental problems a database engineer thinks about in the shower.

# bashdb

Let's start with the simplest database program ever written, just 2 bash functions (we'll call it `bashdb`):

```bash
#!/bin/bash

db_set() {
    echo "$1,$2" >> database
}

db_get() {
    grep "^$1," database | sed -e "s/^$1,//" | tail -n 1
}
```

Try it out:

```sh
$ db_set 500 '{"movie": "Airplane!", "rating": 9}'

$ db_set 111 '{"movie": "Tokio Drift", "rating": 6}'

$ db_get 500
{"movie": "Airplane!", "rating": 9}
```

Before you continue reading, I want you to pause and think about why you wouldn't use `bashdb` in production.

```







Some space for you to think :)







```

You probably came up with at least a dozen issues in `bashdb`. Now I won't go over *all* of the possible issues, for this post I will focus on the following ones:

* **Durability** - If the machine crashes after a successful `db_set`, the data might be lost, as it was not flushed to disk.
* **Atomicity** - If the machine crashes while you call `db_set`, data might be written partially, corrupting our data.
* **Isolation** - If one process calls `db_get`, while another calls `db_set` concurrently on the same item, the first process might read only part of the data, leading to a corrupt result.
* **Performance** - `db_get` uses `grep`, so search goes line by line and is `O(n)`, `n` = all items saved.

Could you figure out these problems yourself? If you could, well done, you don't need me, you already understand databases 😀

In the next section, we'll try get rid of these problems, to make `bashdb` a *real* database we might use in production (not really, please don't, just use `PostgreSQL`).

## Improving bashdb to be ACID

Before we begin, know that I did not come up with most of these problems on my own, they are part of an acronym named `ACID`, which almost all databases strive to guarantee:

* **Atomicity** - Not to be confused with multi-threading's definition of atomicity (which is more similar to isolation), a transaction is considered atomic when a fault happens in the middle of a write, and the database either undos or aborts it completely, as if the write never started, leaving no partially written data.
* **Consistency** - Illegal transactions should not corrupt the database. To be honest, consistency in ACID is a bit convoluted and overloaded, and it's less interesting.
* **Isolation** - No race conditions in concurrent accesses to the same data. There are multiple isolation levels, and we will discuss some of them later.
* **Durability** - The first thing that comes to mind when talking about a database. It should store data you wrote to it, forever, even in the event of monkeys pulling the power plug out.

> Not all database transactions need to guarantee ACID, for some use cases, it is fine to drop guarantees for performance reasons.

But *how* can we make `bashdb` ACID?

We can start with durability, as it's pretty easy to make `bashdb` durable by running `sync` right after writing in `db_set`:

```bash
db_set() {
    echo "$1,$2" >> database && sync -d database
}
```

But wait a minute, what is going on, what is `sync` really doing? And what is that `-d`?

### Durability

The `write` syscall writes a buffer to a file, but who said it writes to disk?

The buffer you write could end up in any cache along the way to the non volatile memory. For example, the kernel stores the buffer in the page cache with each page marked as dirty, meaning it will flush it to disk sometime in the future.

To make matters worse, the disk device, or something managing your disks (for example a RAID system), might have a write cache as well.

So how do you tell all the systems in the middle to flush all dirty pages to the disk? For that we have `fsync` / `fdatasync`, let's see what `man` has to say:

```
$ man 2 fsync

...

fsync() transfers ("flushes") all modified in-core data of (i.e., modified buffer cache pages for)
the file referred to by the file descriptor fd to the disk device (or other permanent storage
device) so that all changed information can be retrieved even if the system crashes or is rebooted.
This includes writing through or flushing a disk cache if present.
The call blocks until the device reports that the transfer has completed.

...

fdatasync() is similar to fsync(), but does not flush modified metadata unless that metadata itself
in order to allow a subsequent data  retrieval to be correctly handled.

...
```

In short, `fdatasync` flushes the dirty raw buffers we gave `write`. `fsync` also flushes the file's metadata like `mtime`, which we don't really care about.

The `sync` program is basically like running `fsync` on all dirty pages, unless a specific file is specified as one of the arguments. It has the `-d` flag for us to call `fdatasync` instead of `fsync`.

The biggest drawback in adding `sync` is that we get worse performance. Usually sync is slower than even the write itself. But hey, at least we are now *durable*.

> A short but important note about fsync. When fsync() returns success it means "all writes since the last fsync have hit disk" when you might have assumed it means "all writes since the last SUCCESSFUL fsync have hit disk". PostgreSQL learned about this only recently (2018), which led to them modifying the behavior of syncing from retrying fsync until a success is returned, to simply panic on fsync failure. This incident got famous and was named fsyncgate. You can learn a lot more about fsync failures <a href="https://www.usenix.org/system/files/atc20-rebello.pdf">here</a>.

> Dear `MongoDB` users, know that by default writes are <a href="https://www.mongodb.com/docs/manual/core/journaling/">synced every 100ms</a>, meaning it is not 100% durable.

### Isolation

The simplest way to have multiprocess isolation in `bashdb` is to add a lock before we read / write to the storage file.

There's a program in linux called `flock`, which locks a file, and you can even provide it with the `-s` flag, to specify that you will not modify the file, meaning all callers who specify `-s` are allowed to read the file concurrently. `flock` blocks until it has taken the lock.

> flock simply calls the flock syscall

With such an awesome program, `bashdb` can guarantee *isolation*, here's the code:

```bash
db_set() {
    (
        flock 9 && echo "$1,$2" >> database && sync -d database
    ) 9>database.lock
}

db_get() {
    (
        flock -s 9 && grep "^$1," database | sed -e "s/^$1,//" | tail -n 1
    ) 9>database.lock
}
```

The biggest drawback is that we are now locking the entire database whenever we write to it.

The only things left are atomicity and improving the algorithm to not be `O(n)`.

## Bad News

I'm sorry, this is as far as I could get with `bashdb`, I could not find a simple way to ensure atomicity in bash ☹️

I mean you could somehow probably use `mv -T` / `rename` for this, I'll leave it as an exercise for you.

And even if it was possible, we still need to fix the `O(n)` situation.

Before beginning the `bashdb` adventure, I knew that we won't be able to easily solve all these problems in less than 10 lines of bash, but by trying to, you've hopefully started to get a feel for the problems database engineers face.

# Storage Engine

Let's start with the first big component of a database, the `Storage Engine`.

The purpose of the storage engine is to provide an abstraction over reading and writing data to persistent storage, with the main goal to be **fast**, i.e. have **high throughput** and **low latency** on requests.

But what makes software slow?

```
Latency Comparison Numbers (~2012)
----------------------------------
L1 cache reference                           0.5 ns
Branch mispredict                            5   ns
L2 cache reference                           7   ns                      14x L1 cache
Mutex lock/unlock                           25   ns
Main memory reference                      100   ns                      20x L2 cache, 200x L1 cache
Compress 1K bytes with Zippy             3,000   ns        3 us
Send 1K bytes over 1 Gbps network       10,000   ns       10 us
Read 4K randomly from SSD              150,000   ns      150 us          ~1GB/sec SSD
Read 1 MB sequentially from memory     250,000   ns      250 us
Round trip within same datacenter      500,000   ns      500 us
Read 1 MB sequentially from SSD      1,000,000   ns    1,000 us    1 ms  ~1GB/sec SSD, 4X memory
Disk seek                           10,000,000   ns   10,000 us   10 ms  20x datacenter roundtrip
Read 1 MB sequentially from disk    20,000,000   ns   20,000 us   20 ms  80x memory, 20X SSD
Send packet CA->Netherlands->CA    150,000,000   ns  150,000 us  150 ms
```

If L1 cache reference took as long as a heart beat (around half a second), reading 1 MB sequentially from SSD would take ~12 days and reading 1 MB sequentially from disk would take ~8 months.

This is why the main limitation of storage engines is the disk itself, and thus all designs try to minimize disk I/O and disk seeks as much as possible. Some designs even get rid of disks in favor of SSDs (although they are much more expensive).

A storage engine design usually consists of:

* The underlying data structure to store items on disk.
* ACID transactions.
  * Some may skip this to achieve better performance for specific use cases where ACID is not important.
* Some cache - to not read from disk *every* time.
  * Most use buffered I/O to let the OS cache for us.
* API layer - SQL / document / graph / ...

Storage engine data structures come in all shapes and sizes, I'm going to focus on the 2 categories you will most likely find in the wild - mutable and immutable data structures.

Mutable means that after writing data to a file, the data can be overwritten later in the future, while immutable means that after writing data to a file, it can only be read again.

## Mutable B-Trees

To achieve the goal of maintaining good performance as the amount of data scales up, the data structure we use should be able to search an item in at most logarithmic time, and not linear time like in `bashdb`.

A simple data structure you are probably familiar with is the BST (binary search tree), where lookups are made in `O(log n)` time.

The problem with BSTs is nodes are placed randomly apart from each other, which means that after reading a node while traversing the tree, the next node is most likely going to be somewhere far away on disk. To minimize disk I/O & seeks, each page read from disk should be read as much as possible from memory again, without reaching to disk.

The property we're looking for is called "spatial locality", and one of the most famous "spatially local" variations of BSTs are B-trees.

B-tree generalizes BST, allowing for nodes with more than two children. Here's what they look like:

```
                  ------------------------------------
                  |     7     |     16     |    |    |
                  ------------------------------------
                 /            |             \
-----------------     ----------------       -----------------
| 1 | 2 | 5 | 6 |     | 9 | 12 |  |  |       | 18 | 21 |  |  |
-----------------     ----------------       -----------------
```

With the search algorithm in pseudo python code:

```python
def get(node, key):
    for i, child in enumerate(node.children):
        if not child:
            return None

        if child.key == key:
            # Found it!
            return child.value

        if child.key > key:
            return get(node.nodes[i], key)

    return get(node.nodes[-1], key)
```

On each read of a page from disk (usually 4KB or 8KB), we iterate over multiple nodes sequentially from memory and the various CPU caches, trying to keep the least amount of bytes read go to waste.

Remember, reading from memory and the CPU caches is a few order of magnitudes faster than disk, so much faster in fact, that it can be considered to be basically free in comparison.

I know some of you reading this right now think to themselves *"Why not binary search instead of doing it linearly?"*, to you I say, please look at the L1 / L2 cache reference times in the latency comparison numbers table again. Also, modern CPUs execute multiple operations in parallel when it operates on sequential memory thanks to <a href="https://en.wikipedia.org/wiki/Single_instruction,_multiple_data">SIMD</a>, <a href="https://en.wikipedia.org/wiki/Instruction_pipelining">instruction pipelining</a> and <a href="https://en.wikipedia.org/wiki/Cache_prefetching">prefetching</a>. You would be surprised just how far reading sequential memory can take you in terms of performance.

There's a variation of the B-tree that takes this model even further, called a B+ tree, where the final leaf nodes hold a value and all other nodes hold only keys, thus fetching a page from disk results in a lot more keys to compare.

B-trees, to be space optimized, need to sometimes reclaim space as a consequence of data fragmentation created by operations on the tree like:

* Big value updates - updating a value into a larger value might overwrite data of the next node, so the tree relocates the item to a different location, leaving a "hole" in the original page.
* Small value updates - updating a value to a smaller value leaves a "hole" at the end.
* Deletes - deletion causes a "hole" right where the deleted value used to reside.

The process that takes care of space reclamation and page rewrites can sometimes be called vacuum, compaction, page defragmentation, and maintenance. It is usually done in the background to not interfere and cause latency spikes to user requests.

> See for example how in `PostgreSQL` you can configure an <a href="https://www.postgresql.org/docs/current/routine-vacuuming.html">auto vacuum daemon</a>.

B-trees are most commonly used as the underlying data structure of an index (`PostgreSQL` creates B-tree indexes by default), or all data (I've seen `DynamoDB` once jokingly called *"a distributed B-tree"*).

## Immutable LSM Tree

As we have already seen in the latency comparison numbers table, disk seeks are really expensive, which is why the idea of sequentially written immutable data structures got so popular.

The idea is that if you only append data to a file, the disk needle doesn't need to move as much to the next position where data will be written. On write heavy workloads it has been proven very beneficial.

One such append only data structure is called the `Log Structured Merge tree` or `LSM tree` in short, and is what powers *a lot* of modern database storage engines, such as `RocksDB`, `Cassandra` and my personal favorite `ScyllaDB`.

LSM trees' general concept is to buffer writes to a data structure in memory, preferably one that is easy to iterate in a sorted fashion (for example `AVL tree` / `Red Black tree` / `Skip List`), and once it reaches some capacity, flush it sorted to a new file called a `Sorted String Table` or `SSTable`. An SSTable stores sorted data, letting us leverage binary search and sparse indexes to lower the amount of disk I/O.

<img class="svg" src="/lsm_tree_write.svg"/>

To maintain durability, when data is written to memory, the action is stored in a `Write-Ahead Log` or `WAL`, which is read on program's startup to reset state to as it was before shutting down / crashing.

Deletions are also appended the same way a write would, it simply holds a tombstone instead of a value. The tombstones get deleted in the compaction process detailed later.

The read path is where it gets a bit wonky, reading from an LSM tree is done by first searching for the item of the provided key in the data structure in memory, if not found, it then searches for the item by iterating over all SSTables on disk, from the newest one to the oldest.

<img class="svg" src="/lsm_tree_read.svg"/>

You can probably already tell that as more and more data is written, there will be more SSTables to go through to find an item of a specific key, and even though each file is sorted, going over a lot of small files is slower than going over one big file with all items (lookup time complexity: `log(num_files * table_size) < num_files * log(table_size)`). This is another reason why LSM trees require compaction, in addition to removing tombstones.

In other words: compaction combines a few small SSTables into one big SSTable, removing all tombstones in the process, and is usually run as a background process.

<img class="svg" src="/lsm_tree_compact.svg"/>

Compaction can be implemented using a binary heap / priority queue, something like:

```python
def compact(sstables, output_sstable): 
    # Ordered by ascending key. pop() results in the item of the smallest key.
    heap = heapq.heapify([(sstable.next(), sstable) for sstable in sstables])

    while (item, sstable) := heap.pop()
        if not item.is_tombstone():
            output_sstable.write(item)

        if item := sstable.next():
            # For code brevity, imagine pushing an item with a key that exists
            # in the heap removes the item with the smaller timestamp,
            # resulting in last write wins.
            heap.push((item, sstable))
```

> For a real working example in rust 🦀, <a href="https://github.com/tontinton/dbeel/blob/ee3de152a5/src/storage_engine/lsm_tree.rs#L1038">click here</a>.

To optimize an LSM tree, you should decide *when* to compact and on *which* sstable files. `RocksDB` for example implements <a href="https://github.com/facebook/rocksdb/wiki/Leveled-Compaction">Leveled Compaction</a>, where the newly flushed sstables are said to reside in level 0, and once a configured N number of files are created in a level, they are compacted and the new file is promoted to the next level.

It's important to handle removal of tombstones with care to not cause data resurrection. An item might be removed and then resurrected on compaction with another file that holds that item, even if the write happened before the deletion, there is no way to know once deleted in a previous compaction. `RocksDB` keeps tombstones around until a compaction of files that result in a promotion to the last level.

### Bloom Filters

LSM trees can be further optimized by something called a bloom filter.

A bloom filter is a probabilistic set data structure that lets you to efficiently check whether an item doesn't exist in a set. Checking whether an item exists in the set results in either `false`, which means the item is definitely not in the set, or in `true`, which means the item is **maybe** in the set, and that's why it's called a *probabilistic* data structure.

The beauty is that the space complexity of a bloom filter set of `n` items is `O(log n)`, while a regular set with `n` items is `O(n)`.

How do they work? The answer is hash functions! On insertion, they run multiple different hash functions on the inserted key, then take the results and store 1 in the corresponding bit (`result % number_of_bits`).

```python
# A bloom filter's bitmap of size 8 (bits).
bloom = [0, 0, 0, 0, 0, 0, 0, 0]

# Inserting key - first run 2 hash functions.
Hash1(key1) = 100
Hash2(key1) = 55

# Then calculate corresponding bits.
bits = [100 % 8, 55 % 8] = [4, 7]

# Set 1 to corresponding bits.
bloom[4] = 1
bloom[7] = 1

# After insertion it should look like:
[0, 0, 0, 0, 1, 0, 0, 1]
```

Now comes the exciting part - checking!

```python
bloom = [0, 0, 0, 0, 1, 0, 0, 1]

# To check a key, simply run the 2 hash functions and find the corresponding
# bits, exactly like you would on insertion:
Hash1(key2) = 34
Hash2(key2) = 35

bits = [34 % 8, 35 % 8] = [2, 3]

# And then check whether all the corresponding bits hold 1, if true, the item
# maybe exists in the set, otherwise it definitely isn't.
result = [bloom[2], bloom[3]] = [0, 0] = false

# false. key2 was never inserted in the set, otherwise those exact same bits
# would have all been set to 1.
```

> Think about why it is that even when all checked bits are 1, it doesn't guarantee that the same exact key was inserted before.

A nice benefit of bloom filters is that you can control the chance of being certain that the item doesn't exist in the set, by allocating more memory for the bitmap and by adding more hash functions. There are even <a href="https://hur.st/bloomfilter/">calculators</a> for it.

LSM trees can store a bloom filter for each SSTable, to skip searching in SSTables if their bloom filter validates that an item doesn't exist in it. Otherwise, we search the SSTable normally, even if the item doesn't necessarily exist in it.

## Write Ahead Log

Remember ACID? Let's talk briefly about how storage engines achieve ACID transactions.

Atomicity and durability are properties of whether data is correct at all times, even when the machine shuts down due to a power shortage.

The most popular method to survive sudden crashes is to log all transaction actions into a special file called a `Write-Ahead Log` / `WAL` (we touched on this briefly in the `LSM tree` section).

When the database process starts, it reads the `WAL` file, and reconstructs the state of the data, skipping all transactions that don't have a commit log, thus achieving atomicity.

Also, as long as a write request's data is written + flushed to the `WAL` file before the user receives the response, the data is going to be 100% read at startup, meaning you also achieve durability.

WALs are basically a sort of <a href="https://martinfowler.com/eaaDev/EventSourcing.html">event sourcing</a> of the transactional events.

## Isolation

To achieve isolation, you can either:

* Use pessimistic locks - Block access to data that is currently being written to.
* Use optimistic locks - Update a copy of the data and then commit it only whether the data was not modified during the transaction, if it did, retry on the new data. Also known as optimistic concurrency control.
* Read a copy of the data - MVCC (Multiversion concurrency control) is a common method used to avoid blocking user requests. In MVCC when data is mutated, instead of locking + overwriting it, you create a new version of the data that new requests read from. Once no readers remain that are reading the old data it can be safely removed. With MVCC, each user sees a *snapshot* of the database at a specific instant in time.

Some applications don't require perfect isolation (or `Serializable Isolation`), and can relax their read isolation levels.

The ANSI/ISO standard SQL 92 includes 3 different possible outcomes from reading data in a transaction, while another transaction might have updated that data:

* **Dirty reads** - A dirty read occurs when a transaction retrieves a row that has been updated by another transaction that is not yet committed.

```sql
BEGIN;
SELECT age FROM users WHERE id = 1;
-- retrieves 20


                                        BEGIN;
                                        UPDATE users SET age = 21 WHERE id = 1;
                                        -- no commit here


SELECT age FROM users WHERE id = 1;
-- retrieves in 21
COMMIT;
```

* **Non-repeatable reads** - A non-repeatable read occurs when a transaction retrieves a row twice and that row is updated by another transaction that is committed in between.

```sql
BEGIN;
SELECT age FROM users WHERE id = 1;
-- retrieves 20


                                        BEGIN;
                                        UPDATE users SET age = 21 WHERE id = 1;
                                        COMMIT;


SELECT age FROM users WHERE id = 1;
-- retrieves 21
COMMIT;
```

* **Phantom reads** - A phantom read occurs when a transaction retrieves a set of rows twice and new rows are inserted into or removed from that set by another transaction that is committed in between.

```sql
BEGIN;
SELECT name FROM users WHERE age > 17;
-- retrieves Alice and Bob
	

                                        BEGIN;
                                        INSERT INTO users VALUES (3, 'Carol', 26);
                                        COMMIT;


SELECT name FROM users WHERE age > 17;
-- retrieves Alice, Bob and Carol
COMMIT;
```

Your application might not need a guarantee of no dirty reads for example in a specific transaction, so it can choose a different isolation level to allow greater performance, as to achieve higher isolation levels, you usually sacrifice performance.

Here are isolation levels defined by the ANSI/SQL 92 standard from highest to lowest (higher levels guarantee at least everything lower levels guarantee):

* **Serializable** - The highest isolation level. Reads always return data that is committed, including range based writes on multiple rows (avoiding phantom reads).
* **Repeatable reads** - Phantom reads are acceptable.
* **Read committed** - Non-repeatable reads are acceptable.
* **Read uncommitted** - The lowest isolation level. Dirty reads are acceptable.

> The ANSI/SQL 92 standard isolation levels are often criticized for not being complete. For example, many MVCC implementations offer <a href="https://en.wikipedia.org/wiki/Snapshot_isolation">snapshot isolation</a> and not serializable isolation (for the differences, read the provided wikipedia link). If you want to learn more about MVCC, I recommend reading about <a href="https://db.in.tum.de/~muehlbau/papers/mvcc.pdf">HyPer</a>, a fast serializable MVCC algorithm.

So to conclude the storage engine part of this post, the fundamental problems you solve writing a storage engine are: how to store / retrieve data while trying to guarantee some ACID transactions in the most performant way.

> One topic I left out is the API to choose when writing a database / storage engine, but I'll leave a post called <a href="https://www.scattered-thoughts.net/writing/against-sql/">"Against SQL"</a> for you to start exploring the topic yourself.

# Distributed Systems

Going distributed should be a last mile resort, introducing it to a system adds a **ton** of complexity, as we will soon learn. Please avoid using distributed systems when non distributed solutions suffice.

> A distributed system is one in which the failure of a computer you didn’t even know existed can render your own computer unusable. ~Leslie Lamport

The common use cases of needing to distribute data across multiple machines are:

* **Availability** - If for some reason the machine running the database crashes / disconnects from our users, we might still want to let users use the application. By distributing data, when one machine fails, you can simply point requests to another machine holding the "redundant" data.
* **Horizontal Scaling** - Conventionally, when an application needed to serve more user requests than it can handle, we would have upgraded the machine's resources (faster / more disk, RAM, CPUs). This is called `Vertical Scaling`. It can get very expensive and for some workloads there just doesn't exist hardware to match the amount of resources needed. Also, most of the time you don't need all those resources, except in peaks of traffic (imagine Shopify on Black Friday). Another strategy called `Horizontal Scaling`, is to operate on multiple separate machines connected over a network, seemingly working as a single machine.

Sounds like a dream, right? What can go wrong with going distributed?

Well, you have now introduced operational complexity (deployments / etc...) and more importantly partitioning / network partitioning, infamous for being the P in something called the CAP theorem.

The CAP theorem states that a system can guarantee only 2 of the following 3:

* **Consistency** - Reads receive the most recent write.
* **Availability** - All requests succeed, no matter the failures.
* **Partition Tolerance** - The system continues to operate despite dropped / delayed messages between nodes.

To understand why this is, imagine a database operating on a single machine. It is definitely *partition tolerant*, as messages in the system are not sent through something like a network, but through function calls operating on the same hardware (CPU / memory). It is also *consistent*, as the state of the data is saved on the same hardware (memory / disk) that all other read / write requests operate on. Once the machine fails (be it software failures like SIGSEGV or hardware failures like the disk overheating) all new requests to it fail, violating *availability*.

Now imagine a database operating on 2 machines with separate CPUs, memory and disks, connected through some cable. When a request to one of the machines fails, for whatever reason, the system can choose to do one of the following:

* Cancel the request, thus sacrificing *availability* for *consistency*.
* Allow the request to continue only on the working machine, meaning once the other machine will now have inconsistent data (reads from it will not return the most recent write), thus sacrificing *consistency* for *availability*. When a system does this, it is called eventually consistent. 

> Network partitioning also means that you lose the ability to efficiently `JOIN` data, as you now need to pull together scattered data throughout the cluster. To mitigate that the `NoSQL` movement of databases tell you to <a href="https://en.wikipedia.org/wiki/Denormalization">denormalize</a> your data.

The original <a href="https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf">dynamo paper</a> is famous for many things, one of them being Amazon stating that amazon.com's shopping cart should be highly available, and that it's more important to them than consistency. In the unlikely scenario a user sees 2 of the same item in the shopping cart, they will simply remove one of them, which is a better situation then them not being able to purchase and pay money!

> I really enjoy out of the box thinking of sacrificing something that adds software complexity (like consistency in Amazon's shopping cart) for a simpler human solution like the user getting a refund. Software complexity can get more expensive to operate than having a refund budget for example.

To achieve *availability* it's not enough to have multiple nodes together combining all the data, there must also be data redundancy, or in other words, for each item a node stores there must be at least 1 other node to store a copy of that item. These nodes are usually called **replicas**, and the process of copying the data is called **replication**.

Assigning more replica nodes means that the system will be more *available*, with the obvious drawback of needing more resources to store all these copies.

> Copies of data don't need to be stored "whole", they can be split and scattered across multiple nodes using a technique called erasure coding, which also has some interesting <a href="https://brooker.co.za/blog/2023/01/06/erasure.html">latency characteristics</a> (by the way brooker's blog is simply amazing for learning distributed systems).

## Consistent Hashing

Now that you have multiple nodes, you need some kind of load balancing / data partitioning method. When a request to store some data comes in, how do you determine which node receives the request?

You could go for the simplest solution, which is to simply always take a primary key (some id) in addition to the data, hash the key and modulo the result by the number of available nodes, something like:

```python
def get_owning_node(nodes, key):
    return nodes[hash(key) % len(nodes)] 
```

This modulo method works fine, until a node is either added or removed from the cluster. Once that happens, the calculation returns a different result because the number of available nodes changed, meaning a different node will be selected for the same key. To accommodate, each node can migrate keys that should now live on different nodes, but then almost all items are migrated, which is really expensive.

One method to lower the amount of items to be migrated on node addition / removal that is used by some databases (e.g. `Dynamo` and `Cassandra`) is `Consistent Hashing`.

Consistent hashing creates a ring of nodes instead of an array, placing each node's name hash on the ring. Then each request's key is hashed just like before, but instead of doing the modulo operation, we get the first node in the ring whose name's hash is smaller than the request key hash:

```python
# Assume nodes are sorted, with the first node having the smallest hash value.
def get_owning_node(nodes, key):
    if len(nodes) == 0:
        return None

    key_hash = hash(key)

    for node in nodes:
        if node.hash >= key_hash:
            return node

    return nodes[0]
```

For a visual explanation, imagine a ring that goes from 0 -> 99, holding nodes with the names "half", "quarter" and "zero" whose hashes are 50, 25 and 0 respectively:

```
   zero
 /      \
|     quarter 
 \      /
   half
```

Let's say a user now wants to set an item with the key "four-fifths", with a hash value of 80. The first node with a name hash smaller than 80 is "half" (with hash value of 50), so that's the node to receive the request!

Choosing replicas is very simple, when an item is set to be stored on a specific node, go around the ring counter-clockwise, the next node will store a copy of that item. In our example, "zero" is the replica node for all items "half" owns, so when "half" dies and requests will now be routed to "zero", it can serve these requests, keeping our system *available*. This method is sometimes called `Leaderless Replication` and is used by "Dynamo" style databases like `Cassandra`.

> Another method is to choose a leader node and replica nodes is `Leader Election`, which is a huge topic on its own that I won't get into in this post.

Now, what happens when a node is added to the cluster? Let's add a node named "three-quarters" with a hash value of 75, the item "four-fifths" should be migrated to the new "three-quarters" node, as new requests to it will now point to it.

This migration process is a lot less expensive than what we previously had in the modulo solution. The number of keys that need to be migrated is equal to `num_keys / num_nodes` on average.

A cool trick is to introduce the concept of virtual nodes, where you add multiple instances of a node to the ring, to lower the chances of some nodes owning more items than other nodes (in our example "half" will store twice as many items on average than the other nodes). You can generate virtual node names by for example adding an index as a suffix to the node name ("half-0", "half-1", etc...) and then the hash will result in a completely different location on the ring.

Here's a more detailed example of a migration in a cluster with a replication factor of 3:

<img class="svg" src="/migration.svg"/>

> Same colored nodes are virtual nodes of the same node, green arrows show to which node an item is being migrated to, red arrows show item deletions from nodes and the brown diamonds are items.

## Leaderless Replication

In a leaderless setup, you get amazing *availability*, while sacrificing *consistency*. If the owning node is down on a write request, it will be written to the replica, and once the owning node is up and running again, a read request will read stale data.

When *consistency* is needed for a specific request, read requests can be sent in parallel to several replica nodes as well as to the owning node. The client will pick the most up to date data. Write requests are usually sent in parallel to all replica nodes but wait for an acknowledgement from only some of them. By choosing the number of read requests and number of write requests acknowledge, you can tune the *consistency* level on a request level.

To know whether a request is *consistent*, you just need to validate that `R + W > N/2 + 1`, where:

* **N** - Number of nodes holding a copy of the data.
* **W** - Number of nodes that will acknowledge a write for it to succeed.
* **R** - Number of nodes that have to respond to a read operation for it to succeed.

> Sending a request to a majority of nodes (where `W` or `R` is equal to `N/2 + 1`) is called a quorum.

Picking the correct read as the latest written one is called `Conflict Resolution` and it is not a simple task, you might think that simply comparing timestamps and choosing the biggest one is enough, but using times in a distributed system is unreliable.

> This didn't stop <a href="https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html#data-versioning">Cassandra from using timestamps</a> though.

Each machine has its own hardware clock, and the clocks *drift* apart as they are not perfectly accurate (usually a quartz crystal oscillator). Synchronizing clocks using NTP (Network Time Protocol), where a server returns the time from a more accurate time source such as a GPS receiver, is not enough to provide accurate results, as the NTP request is over the network (another distributed system) and we can't know exactly how much time will pass before receiving a response.

> Google's `Spanner` successfuly achieved providing consistency guarantees with clocks, by using special high precision time hardware and its API exposes the time range uncertainty of each timestamp. You can read more about it <a href="https://research.google/pubs/pub39966.pdf">here</a>.

But if clocks are so unreliable, how else are we supposed to know which value is correct?

Some systems (for example `Dynamo`) try to solve this partially using `Version Vectors`, where you attach a (node, counter) pair for each version of an item, which gives you the ability to find causality between the different versions. By finding versions of values that are definitely newer (have a higher counter) you can remove some versions of a value, which makes the problem easier.

<img class="svg" src="/version_vector.svg"/>

> An example showing how easily conflicts arise. At the end we are left with {v2, v3} as the conflicting values for the same key. The reason I removed v1 is to show that by using something like `Version Vectors`, versions of values can be safely removed to minimize the amount of conflicts. To learn more on `Version Vectors` and their implementations, I recommend reading <a href="https://github.com/ricardobcl/Dotted-Version-Vectors">Dotted Version Vectors</a>.

We could also decide to simply let the application decide how to deal with conflicts, by returning all conflicting values for the requested item. The application might know a lot more on the data than the database, so why not let it resolve conflicts? This is what `Riak KV` does for example.

> An idea I think about often is that you could even allow users to compile conflict resolution logic as a WASM module, and upload it to the database, so that when conflicts occur, the database resolves them, never relying on the application.

There are lots of different ideas to reduce conflicts in an eventually consistent system, they usually fall under the umbrella term `Anti Entropy`.

## Anti Entropy

Here are examples of some of the most popular `Anti Entropy` mechanisms:

**Read Repair** - After a client chooses the "latest" value from a read request that went to multiple nodes (by conflict resolution), it sends that value back to all the nodes that don't currently store that value, thus *repairing* them.

**Hinted Handoff** - When a write request can't reach one of the target nodes, send it instead as a "hint" to some other node. As soon as that target node is available again, send it the saved "hint". On a quorum write, this mechanism is also called `Sloppy Quorum`, which provides even better *availability* for quorum requests.

**Merkle Trees** - Because read repair only fixes queried data, a lot of data can still become inconsistent for a long time. Nodes can choose to start a synchronization process by talking to each other and see the differences in data. This is really expensive when there is a lot of data (`O(n)`). To make the sync algorithm faster (`O(log n)`) we can introduce <a href="https://en.wikipedia.org/wiki/Merkle_tree">merkle trees</a>. A merkle tree stores the hash of a range of the data in lowest leaf nodes, with the parent leaf nodes being a combined hash of the 2 of its children, thus creating a hierarchy of hashes up to the root of the tree. The sync process now starts by one node comparing the root of the merkle tree to another node's merkle tree, if the hashes are the same, it means they have exactly the same data. If the hashes differ, the leaf hashes are checked the same way, recursively until the inconsistent data is found.

**Gossip Dissemination** - Send broadcast events to all nodes in the cluster in a simple and reliable way, by imitating how humans spread rumors or a disease. You send the event message to a configured number of randomly chosen nodes (called the "fanout"), then when they receive the message they repeat the process and send the message to another set of randomly chosen `N` nodes. To not repeat the message forever in the cluster, a node stops broadcasting a gossip message when it sees it a configured number of times. To get a feel for how data converges using gossip, head over to the <a href="https://www.serf.io/docs/internals/simulator.html">simulator</a>! As an optimization, gossip messages are usually sent using UDP, as the mechanism is just that reliable.

# Conclusion

There is a lot more to talk about databases, be it the use of <a href="https://yarchive.net/comp/linux/o_direct.html">O_DIRECT</a> in linux and implementing your own page cache, failure detection in distributed systems, consensus algorithms like <a href="https://raft.github.io/">raft</a>, distributed transactions, leader election, and an almost infinite amount more.

I hope I have piqued your curiosity enough to explore the world of databases further, or provided the tools for you to better understand which database to pick in your next project 😀
