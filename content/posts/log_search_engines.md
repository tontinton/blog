+++
title = "Log Search Engines"
date = "2025-01-03"
description = ""
+++

Have you ever wondered how Elasticsearch works? How is it so fast? What makes it different from other databases like PostgreSQL? What cool data structures are at play?

We mostly take things like this for granted, without ever peeking inside, reverse engineering, and learning how something actually works.

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
* Full text search - search for "world" in any field, not just "hello".
* Relevance scoring - most likely you want to get only a few results that are the most relevant to the search, for example by counting the number of occurances of the searched word in the text it's found in.

Let's begin with solving the time complexity problem.

# Search go brr

In most database storage engines you are likely to find either B-Trees or LSM-Trees. These data structures are excellent at *getting an item by its id*.

But our use case is *getting an item by a word (or phrase) it contains*.




How is it different (inverted index, Trie, FST) from other types of searches (B-Trees, LSM Trees).

Ideas about case insensitive / infix / suffix searches.

How does tantivy & lucene work (index & search top-k BM25)?

Quickwit & Elasticsearch vs tantivy & Lucene.
