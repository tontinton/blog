+++
title = "Search logs faster than Sonic"
date = "2025-01-17"
description = "Learn how log search engines like Apache Lucene & tantivy work"

[extra]
preloads = [
    "/trie.svg",
    "/fst.svg",
    "/dawg.svg",
]
+++

Have you ever wondered how Elasticsearch works? How is it so fast? What makes it different from other databases like PostgreSQL? What cool data structures are at play?

We mostly take things like this for granted, without ever peeking inside, reverse engineering, and learning how the thing actually works.

At their core, search engines solve the problem of: *get the most relevant documents containing a specific word as fast as possible*. Usually, we don't even really care about the time it takes to write these documents, as long as search time is fast.

In addition to this, search engines also usually contain elements that allow for fast searching by a word's prefix (`abc*`), suffix (`*def`) and even sometimes infix (`*cde*`).

My hope with this blog post is that you will learn how search engines work, and what allows them to be so fast.

# jqdb

If you know me, you know I like explaining problems by showing a <a href="https://tontinton.com/posts/database-fundementals/#bashdb">simple but bad solution</a> first, before we get to the complex but good solution.

Let's do it again, by implementing a log search engine using the wonderful <a href="https://jqlang.github.io/jq/">jq</a> in bash.

```sh
#!/bin/bash

log_add() {
    echo "$1" >> logs
}

log_search() {
    jq "select(.$1 | contains(\"$2\"))" logs
}
```

Great, now try it out:

```sh
$ log_add '{"hello": "world"}'

$ log_add '{"hello": "there world"}'

$ log_search hello world
{
  "hello": "world"
}
{
  "hello": "there world"
}

$ log_search hello there
{
  "hello": "there world"
}
```

It works well, do we actually need Elasticsearch in this world?

Yes, `jqdb` is too slow. Try adding a few million logs and then searching again.

`log_search` works by iterating over all stored JSON logs one by one, running the `contains` function. The time complexity of this is `O(n * m)`, where `n` is number of logs and `m` is the average size of the search field's value.

It's also missing a few critical features like:
* Free text search - search for "world" in any field, not just in "hello".
* Relevance scoring - most likely you want to get only a few results that are the most relevant to the search, for example by counting the number of occurances of the searched word in the text it's found in.

Let's begin with solving the time complexity problem.

# Log search engines

In most database storage engines you are likely to find either B-Trees or LSM-Trees. These data structures are excellent at *getting an item by its id*.

But if what we actually want is *getting an item by a word (or phrase) it contains*? We need to create some other data structure as our index to the data.

The simplest solution is to build a map where the key is each unique word contained in our all logs, and the value is the log itself:

```go
package main

import (
    "fmt"
    "strings"
)

type Index struct {
    wordToLogs map[string][]string
}

func newIndex() Index {
    return Index{wordToLogs: make(map[string][]string)}
}

func (i *Index) add(log string) {
    // Fields() splits consecutive white space characters, basically a smarter Split(" ").
    for _, word := range strings.Fields(log) {
        i.wordToLogs[word] = append(i.wordToLogs[word], log)
    }
}

func (i *Index) find(word string) []string {
    logs, exists := i.wordToLogs[word]
    if exists {
        return logs
    }
    return nil
}

func main() {
    index := newIndex()

    index.add("Go is an open source programming language")
    index.add("Please open your mouth")

    // Prints both logs.
    fmt.Println(index.find("open"))

    // Prints only first log.
    fmt.Println(index.find("Go"))
}
```

This simple go code implements a data structure called an **inverted index** (sometimes also postings list).

There are a few problems with this implementation.

First, notice how I put capitalized *"Go"*? We probably want to find the log even if we search for *"go"*. Related to this, what if we wanted to search *"change"* and find logs containing *"changing"*?

We can fix this by modifying `add` to lowercase and apply a process called [stemming](https://en.wikipedia.org/wiki/Stemming). The problem with this is that it will only support English, which means we need to handle each language we might want to support, but you can't really escape it.

Second, we don't return the most relevant logs, we return the first ones which happen to be first in the list. We'll solve this later in the post.

Third, the index is currently a hashmap, which means it lives in memory. What if we want to index the whole of Wikipedia? We must utilize disk or go with a distributed in-memory hashmap like redis.

Suppose we want a cheap solution, and disk is cheaper than RAM, let's modify our solution. Storing a hashmap on disk is simple, but modifying it is complex. Plus, reading from disk means we read at `PAGE_SIZE` granularity, let's try to utilize as much of the page as possible before going to disk again (reading from memory is a lot faster).

Learning from database storage engines, we know of [B-Trees](https://tontinton.com/posts/database-fundementals/#mutable-b-trees) and [SSTables](immutable-lsm-tree) (Sorted String Tables). Both will work great for us.

There are lesser known data structures, that are actually more efficient for specific types of searches.

## Trie

Sometimes, you might want to not only search for a word, but for a broader set of words using a regex. Let's take for example `hell.*`, the classic *prefix query*.

In an SSTable, the steps to execute this query, are:
* Use binary search to find the first and last words that start with 'h'.
* Continue recursively to binary search within the narrowed range for words starting with 'he', then 'hel', and finally 'hell'.

This algorithm has a time complexity of `O(m * log(n))`, where `m` is the number of characters in the prefix query (4 in our example), and `n` is the number of words in the whole table.

A [Trie](https://en.wikipedia.org/wiki/Trie) is more suited to this specific task of prefix searching, by running in `O(m)` time complexity, and needing a lot less memory to store all the words.

It's a variation of a binary search tree, where each node in the tree is a single character. Example:

<img class="svg" src="/trie.svg" style="width:50%"/>

> A Trie tree containing the words: mom, moo, hell, hello, helix.
>
> <span style="color: #FF8fa6"><b>Red nodes</b></span> are leaf nodes that also contain a value, in our case the logs, or a pointer to them.

The lookup traversal algorithm is very simple, start with the root node and traverse down to the node holding the next character of the prefix search query, until reaching the sub-tree of all relevant words, to then iterate over using DFS / BFS. Each node traversal can be done in `O(1)` using either a hashmap or array lookup, making it `O(m)`.

It's also more memory efficient, as it doesn't hold the words in their entirety, so there are no duplicate prefixes.

To support more complex prefix queries like `h[eE]ll.*`, you traverse the two sub-trees containing 'e' and 'E' under 'h'.

While a Trie is awesome (if there's anything useful to remember in this post, it's probably this), it only solves prefix queries, what about `.*llo`? What about `.*el.*` or `.*el.*o`?

A quick trick to support suffix searches (`.*llo`) is to store another Trie, with all the words reversed. A suffix search will traverse this reverse Trie on the suffix query (reversed), instead of the regular Trie. The problem with this trick is that you've increased by 2x the amount of memory needed to store the index, and by 2x the amount of time needed to construct the index.

## FST

A more efficient data structure to our problem at hand is the [FST](https://en.wikipedia.org/wiki/Finite-state_transducer) (Finite State Transducer). It's not a tree, but an *acyclic graph*.

Here's an example of an FST map of the following values:

```json
{
  "mon": 2,
  "thurs": 5,
  "tues": 3,
  "tye": 99
}
```

<img class="svg" src="/fst.svg"/>

> <span style="color: #3a9fff"><b>Blue node</b></span> is the root.
>
> <span style="color: #FF8fa6"><b>Red node</b></span> is the end.
>
> <span style="color: #a7fb78"><b>Green arrows</b></span> are paths that contain a value diff.

FST lookup works by starting at the <span style="color: #3a9fff"><b>root node</b></span> and iterating it like you would a Trie. While you iterate it, starting from 0, you sum the <span style="color: #a7fb78"><b>values</b></span> of paths that contain a value diff, until reaching the <span style="color: #FF8fa6"><b>end</b></span>.

You can set the value as a `u64` number representing a pointer, thus being able to store pretty much anything.

> To learn how to construct a Trie / FST, check out BurntSushi's (the creator of [ripgrep](https://github.com/BurntSushi/ripgrep)) amazing [blog](https://burntsushi.net/transducers).

FST is the data structure used by [Apache Lucene](https://lucene.apache.org/) and [tantivy](https://github.com/quickwit-oss/tantivy) (which is heavily expired by Lucene).

Both of these log search engines don't support efficient suffix and infix searches on the same inverted index. But, like the quick trick I gave earlier to support suffix searches with a prefix search (storing an extra inverted index but on the words reversed), you can create another inverted index but on rotations of the words. For example, "hey" will index "eyh" and "yhe". Then you simply remove the start of the infix query (`.*ell.*` becomes `ell.*`), and traverse this special infix inverted index.

A drawback of an FST compared to a Trie is that it's more challenging to add items to it after creation. This is because FST construction typically assumes the input data is sorted. FSTs are often used as immutable data structures, meaning updates often require a full rebuild of the structure. This is why tantivy and Lucene batch writes before constructing an immutable FST once in a while, to later merge.

Another drawback is the computational cost of sorting the input (if not already sorted) and performing the minimization step during construction. Minimization involves merging states with identical suffixes or transitions, which can be computationally intensive for large datasets.

Even with these drawbacks, this is the most common data structure used for search engines.

### Bi-Directional FSTs

By also storing the parent nodes, you create a variation of a FST, where the paths are bi-directional, thus allowing for both prefix and suffix searches using the same FST graph.

A suffix search would simply start at the <span style="color: #FF8fa6"><b>end</b></span> instead of the <span style="color: #3a9fff"><b>root node</b></span>, and go backwards:

```py
# Prefix search.
search('hel', root, lambda node: node.next_paths(), 0)

# Suffix search.
search('olle', end, lambda node: node.prev_paths(), 0)


def search(query, root, get_paths, acc):
  if root is None:
    # No match.
    return []

  if len(query) == 0:
    # Match, get all possible values.
    return get_subtree(root, get_paths, acc)

  paths = get_paths(root)
  if len(paths) == 0:
    # Exact match, return the only value.
    return [acc]

  next_node, value = paths.get(query[0])
  return search(query[1:], next_node, get_nodes, acc + value if value else acc)


def get_subtree(root, get_paths, acc):
  paths = get_paths(root)
  if len(paths) == 0:
    return [acc]

  subtrees = []
  for node, value in paths:
    subtrees.extend(get_subtree(node, get_paths, acc + value if value else acc))

  return subtrees
```

Beautiful, isn't it?

> If this got you excited, you might also want to learn about the [Aho-Corasick](https://github.com/BurntSushi/aho-corasick) algorithm.

## DAWG

If FSTs are an upgrade of Tries that merge common prefixes, you can think of DAWGs (Directed Acyclic Word Graphs) as an upgrade of FSTs that merge common suffixes.

<img class="svg" src="/dawg.svg"/>

> A DAWG containing the words: cat, cats, fact, facts, facet, facets.
>
> <span style="color: #FF8fa6"><b>Red nodes</b></span> indicate the end of a word contained in the graph.

Their construction is even more computationally expensive than FSTs, as you also need to merge common suffixes.

Using a DAWG as a map can be done by keeping another data structure like an array, where the index of the <span style="color: #FF8fa6"><b>stop node</b></span> is used as the index to the value in the array.

This book keeping of another full data structure just for mapping words to values, and the computationally expensive insert operation, is why most search engines prefer FSTs.

# Phrase search

> Logs are a special case of documents. Because inverted indexes work on text and not some semi-structured format like JSONs (which also happen to be text), we'll call them documents from now on.

What if you want to search for "hello world"? Because there are two words in this query, we cannot simply search them using any of the data structures we've discussed.

In addition to the list of documents a word in contained in, you need to also store the position of it in the given document.

With positioning of words in place, you split the query into 2 words "hello" and "world", then search for documents containing "hello", and keep only documents that also contain "world", where "world" has a position equal to "hello" + 1.

In tantivy for example, you can choose for an index which fields you also want to store [the positioning](https://docs.rs/tantivy/latest/tantivy/positions/index.html) to be able to make phrase queries on.

# Ranking the most relevant documents

Both Lucene and tantivy choose the most relevant documents depending on the query, by using an algorithm called [BM25](https://en.wikipedia.org/wiki/Okapi_BM25).

Here's a step-by-step description of the algorithm:
* Start with the search term:
  * Let’s say the query is: *"cats"*.
* Get how many times the term appears in the document:
  * Count how many times *"cats"* shows up in the document. This is called TF (Term Frequency). A higher term frequency means the document is more relevant.
  * You can calculate and store TF when indexing instead of searching (write once read many).
* Adjust for long documents:
  * If the document is long, BM25 reduces the multiplication by the term frequency. This allows for a word in short documents (e.g. titles), to show up higher than that word in long documents (e.g. article body).
* Look at how rare the term is:
  * Get the number of documents that include the word *"cats"*. This is called IDF (Inverse Document Frequency):
    * If *"cats"* appears in only a few documents, those documents will get a higher score.
    * If *"cats"* appears in almost every document, it’s less useful for deciding relevance, so its score is lower.
* Combine everything into a score:
  * BM25 combines the TF and IDF into a single score for the document. A higher score means the document is more relevant.

Simple, but gets the job done.

# Search on massive scales

Lucene and tantivy are embeddable libraries (like [SQLite](https://www.sqlite.org/)), which means you limit yourself to a single machine, and to expose searching over a network, you need to implement a server yourself.

That's why we have products like [Elasticsearch](https://www.elastic.co/elasticsearch) and [Quickwit](https://quickwit.io/), to distribute these log engines over many machines in a nicely packaged API.

* Elasticsearch == Distributed Lucene over disks, with a nice REST API.
* Quickwit == Distributed stateless tantivy over object stores, with an [Elasticsearch compatible REST API](https://quickwit.io/docs/reference/es_compatible_api).

> I've written more on Quickwit's architecture [in another blog post](https://tontinton.com/posts/new-age-data-intensive-apps/#quickwit).

# That's it for now

There's a whole lot more to be learned about log searching, but this should give you a great start.

If you want to read more about tantivy's internals specifically, I recommend you read [Of tantivy, a search engine](https://fulmicoton.com/posts/behold-tantivy/) and [Of tantivy's indexing](https://fulmicoton.com/posts/behold-tantivy-part2/) by fulmicoton (the creator).

I've had [a lot of fun](https://github.com/tontinton/toshokan) learning about tantivy and Quickwit, and I truly hope you too got a little dopamine rush learning new and exciting data structures while reading this blog post.
