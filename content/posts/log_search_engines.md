+++
title = "Search logs faster than Sonic"
date = "2025-01-11"
description = "Learn how log search engines like Apache Lucene & tantivy work"

[extra]
preloads = [
    "/trie.svg",
    "/fst.svg",
]
+++

Have you ever wondered how Elasticsearch works? How is it so fast? What makes it different from other databases like PostgreSQL? What cool data structures are at play?

We mostly take things like this for granted, without ever peeking inside, reverse engineering, and learning how the thing actually works.

My hope is to both answer all these questions and more in this post.

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
* Full text search - search for "world" in any field, not just in "hello".
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

Second, we don't return the most relevant logs, we return the first ones who happen to be first in the list. We'll solve this later in the post.

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

A quick trick to support suffix searches (`.*llo`) is to store another Trie, that stores all the words reversed. A suffix search will traverse this reverse Trie on the suffix query (reversed), instead of the regular Trie. The problem with this trick is that you've increased by 2x the amount of memory needed to store the index, and by 2x the amount of time needed to construct the index.

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

Now we can do both prefix and suffix searches. A suffix search would simply start at the <span style="color: #FF8fa6"><b>end</b></span> instead of the <span style="color: #3a9fff"><b>root node</b></span>, and go backwards:

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

> To learn how to construct a Trie / FST, check out BurntSushi's (the creator of [ripgrep](https://github.com/BurntSushi/ripgrep)) amazing [blog](https://burntsushi.net/transducers).

FST is the data structure used by [Apache Lucene](https://lucene.apache.org/) and [tantivy](https://github.com/quickwit-oss/tantivy) (which is heavily expired by Lucene).

Both of these log search engines don't support efficient infix searches (tantivy doesn't even support suffix search). But, like the quick trick I gave earlier to support suffix searches with a prefix search (storing an extra inverted index but on the words reversed), you can create another inverted index but on rotations of the words. For example, "hey" will index "eyh" and "yhe". Then you simply remove the start of the infix query (`.*ell.*` becomes `ell.*`), and traverse this special infix inverted index.

> If this got you excited, you might also want to learn about the [Aho-Corasick](https://github.com/BurntSushi/aho-corasick) algorithm.

# Ranking the most relevant documents

> Logs are a special case of documents. Because inverted indexes work on text and not some semi-structured format like JSONs (which also happen to be text), we'll call them documents from now on.

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

Using Lucene and tantivy means you limit yourself to a single machine (unscalable), and their API is not simple.

That's why we have products like [Elasticsearch](https://www.elastic.co/elasticsearch) and [Quickwit](https://quickwit.io/), to distribute these log engines over many machines in a nicely packaged API.

* Elasticsearch == Distributed Lucene over disks, with a nice REST API.
* Quickwit == Distributed stateless tantivy over object stores, with an [Elasticsearch compatible REST API](https://quickwit.io/docs/reference/es_compatible_api).

> I've written more on Quickwit's architecture [in another blog post](https://tontinton.com/posts/new-age-data-intensive-apps/#quickwit).

# That's it for now

There's a whole lot more to be learned about log searching, but this should give you a great start.

If you want to read more about tantivy's internals specifically, I recommend you read [Of tantivy, a search engine](https://fulmicoton.com/posts/behold-tantivy/) and [Of tantivy's indexing](https://fulmicoton.com/posts/behold-tantivy-part2/) by fulmicoton (the creator).

I've had [a lot of fun](https://github.com/tontinton/toshokan) learning about tantivy and Quickwit, hope you got a little dopamine rush reading this blog post as well.
