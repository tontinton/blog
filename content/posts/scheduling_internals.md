+++
title = "Scheduling Internals"
date = "2024-02-25"
+++

<div class="block" style="margin-top: 30px; height: 600px">
  <div style="margin-left: 20px">
    <div class="input-box">
      <input id="number-cpus" type="range" min="1" max="3" value="1">
      <p class="input-text">CPUs</p>
    </div>
    <div class="input-box">
      <input id="speed" type="range" min="1" max="5" value="2" style="direction: rtl">
      <p class="input-text">Speed</p>
    </div>
    <label class="cr-wrapper" style="margin-top: 12px">
      <input id="timer-interrupt" type="checkbox"/>
      <div class="cr-input"></div>
      <span>Limit Runtime</span>
    </label>
    <label class="cr-wrapper" style="margin-top: 4px">
      <input id="deadline" type="checkbox"/>
      <div class="cr-input"></div>
      <span>Deadline</span>
    </label>
  </div>
  <div id="app" style="height: calc(100% - 130px)"></div>
</div>

<script>
const loadScript=r=>new Promise((e,t)=>{var n=document.createElement("script");n.src=r,n.onload=e,n.onerror=t,document.head.appendChild(n)}),waitForDocumentLoad=()=>new Promise(e=>{document.addEventListener("DOMContentLoaded",e)});function getSize(){return window.innerWidth<400?"small":window.innerWidth<600?"medium":"big"}function applySize(e){for(const t of document.querySelectorAll(".block"))switch(e){case"small":t.style.height=t.classList.contains("small-block")?"320px":"420px";break;case"medium":t.style.height=t.classList.contains("small-block")?"400px":"500px";break;case"big":t.style.height=t.classList.contains("small-block")?"500px":"600px"}}let size=null,mainApp=null,apps=[];function reCreateMainApp(){mainApp&&mainApp.stop(),mainApp=window.createApp(size,document.querySelector("#app"),document.querySelector("#speed").value,document.querySelector("#timer-interrupt").checked?32:null,document.querySelector("#deadline").checked,document.querySelector("#number-cpus").value)}function reCreateApps(){for(const e of apps)e.stop();apps=[],reCreateMainApp(),apps.push(window.createApp(size,document.querySelector("#app_sched_fifo"),2)),apps.push(window.createApp(size,document.querySelector("#app_sched_rr"),2,32)),apps.push(window.createApp(size,document.querySelector("#app_sched_deadline"),3,32,!0)),apps.push(window.createApp(size,document.querySelector("#app_sched_multicore"),4,32,!1,2))}function run(e){var t=getSize();null===size||t!==size?(applySize(size=t),reCreateApps()):e&&reCreateMainApp()}Promise.all([loadScript("/pixi.min.js"),loadScript("/scheduling.min.js"),waitForDocumentLoad()]).then(()=>{run(),window.addEventListener("resize",()=>{run()}),document.querySelector("#number-cpus").addEventListener("input",run),document.querySelector("#speed").addEventListener("input",run),document.querySelector("#timer-interrupt").addEventListener("input",run),document.querySelector("#deadline").addEventListener("input",run)});
</script>

> A sneak peek to what's coming!

I remember when I first learned that you can write a server handling millions of clients running on just a single thread, my mind was simply blown away 🤯

I used Node.js while knowing it is single threaded, I used `async` / `await` in Python, and I used threads, but never asked myself *"How is any of this possible?"*.

This post is written to spread the genius of concurrency and hopefully getting you excited about it too.

My goal is for you to want to send a link to this post to an engineer in your team asking out loud *"Wait, but how does async even work?"*.

Questions I'm going to answer:
* Why not create a thread per client?
* How to sleep when waiting on I/O?
* How does Node.js achieve concurrency?
* What's concurrency? What's parallelism?
* What are coroutines?
  * With an implementation we'll build piece by piece.
* What are preemptive and non-preemptive schedulers?
* How does Go and Rust implement concurrency in the language (stackful vs stackless)?
* What scheduling algorithms are used by linux, Go and Rust's tokio?
  * With animations 🙃

I assume proficiency in reading code and OS internals at an intermediate level, but don't stress over details you don't understand, try to get the bigger picture!

With all of that out of the way, let us begin.

# Just create a thread, bro

Let's try to write a simple echo server (whatever we receive, we send back) in C code, we'll call it `echod`:

```c
// Assume server_fd is already initialized to start accepting clients.
void serve(int server_fd) {
    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);

        char buffer[2048];

        while (true) {
            ssize_t len = read(client_fd, buffer, sizeof(buffer));
            if (len == -1)
                break;

            write(client_fd, buffer, len);
        }

        close(client_fd);
    }
}
```

Cool, now what should we do if want to handle multiple clients concurrently? While one client is being handled, another tries to `connect` to our server, without ever succeeding, as our server reaches the `accept` call only once it is done handling the current client.

How can we fix that?

The first thing most people will think is *"Can't you just create a thread for each client?"*, something that looks like this:

```c
void serve_client(int client_fd) {
    char buffer[2048];

    while (true) {
        ssize_t len = read(client_fd, buffer, sizeof(buffer));
        if (len == -1)
            break;

        write(client_fd, buffer, len);
    }

    close(client_fd);
}

void serve(int server_fd) {
    while (true) {
        int client_fd = accept(server_fd, NULL, NULL);
        run_thread(serve_client, client_fd);
    }
}
```

The first problem with threads is how the OS allocates a stack for a new thread. The stack is allocated virtual memory (10mb on linux by default), and physical pages are only commited once the pages are actually written to. This is really nice as it means that you don't really reserve 10mb of RAM for each thread right out of the gate, **but** it does mean the granularity of allocation is at least that of a page (run `getconf PAGESIZE`, my machine is 4kb). Using `pthread_attr_setstacksize` won't fix the problem, you still must provide a value that is a multiple of a page size. A page might be a lot more that what you actually use, depending on the application.

> I also think that relying on overcommitment of memory is pretty annoying. We are getting killed by the OOM killer instead of having an opportunity cleaning up resources when an allocation fails indicating we are out of memory.

The second problem we need to fix when creating a bunch of OS threads is to change all the relevant limits:

```sh
$ cat /proc/sys/kernel/threads-max
63704

# Threads in linux are light weight processes (LWP).
$ cat /proc/sys/kernel/pid_max
131072

# Maximum number of VMAs a process can own.
$ cat /proc/sys/vm/max_map_count
65530

# Each of these can be set by simply writing to the file:
$ echo 2000000 > /proc/sys/kernel/threads-max
$ echo 2000000 > /proc/sys/kernel/pid_max
$ echo 2000000 > /proc/sys/vm/max_map_count
```

Just the files I showed you might not be enough for your system, for example `systemd` also sets maximums.

The third problem is performance. Context switching between kernel and user mode is expensive in terms of CPU cycles. A single context switch isn't that expensive on its own, but doing a lot of them adds up.

The fourth problem is that the stack allocation is static, we can't modify the stack size (grow) or free up commited physical pages in the stack once they are unused (shrink).

Because of all these problems, threads should not be your go-to solution for running a lot of tasks concurrently (especially for I/O bound tasks like in `echod`).

How else can we make `echod` serve millions of clients concurrently?

# Async I/O

Why block an entire thread from running, when calling `read` / `write` / `accept`? If you think about it, we waste a precious resource (CPU) from doing anything while the application waits for I/O.

When calling `read` for example, the kernel waits for a network packet to be received from the network interface card or `NIC`. The CPU is free to run something else meanwhile.

In linux, you can mark a socket as non-blocking by either using `ioctl(fd, FIONBIO)` or `fcntl & O_NONBLOCK` (posix). A `read` call on that same socket will return immediately. If there's a packet written by the `NIC` we haven't read yet, `read` will copy the buffer like usual, otherwise it will return an error, with `errno` equal to `EWOULDBLOCK`.

Let's patch `echod` to be single threaded again, but this time, supporting multiple concurrent clients using non-blocking sockets:

```c
struct client {
    int fd;
    char buffer[2048]; // Not allocated dynamically for brevity.
    ssize_t offset; // -1 when in reading state, otherwise the offset in buffer to write.
    ssize_t length; // The length left to write (only useful when in writing state).
};

void set_nonblock(int fd) {
    // Ignore errors for brevity.
    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK);
}

void serve(int server_fd) {
    set_nonblock(server_fd);

    struct client clients[64]; // Maximum 64 concurrent clients.
    int num_clients = 0;

    while (true) {
        if (num_clients < ARRAY_SIZE(clients)) {
            int client_fd = accept(server_fd, NULL, NULL);
            if (client_fd != -1) {
                set_nonblock(client_fd);
                clients[num_clients].fd = client_fd;
                clients[num_clients].offset = -1;
                num_clients++;
            }
        }

        for (int i = 0; i < num_clients; i++) {
            struct client* client = &clients[i];
            bool is_reading = client->offset == -1;

            ssize_t result;
            if (is_reading) {
                result = read(client->fd, client->buffer, sizeof(client->buffer));
            } else {
                result = write(client->fd, client->buffer + client->offset, client->length);
            }

            if (result != -1) {
                if (is_reading) {
                    client->offset = 0; // Move to writing state.
                    client->length = result;
                } else {
                    client->length -= result;

                    if (client->length == 0) {
                        client->offset = -1; // Move to reading state.
                    } else {
                        client->offset += result;
                    }
                }
            } else if (errno != EWOULDBLOCK) {
                close(client->fd);
                num_clients--;
                memcpy(client, &clients[num_clients], sizeof(*client));
                i--; // Don't skip the moved client.
            }
        }
    }
}
```

> A bit lengthy, don't try to understand everything, just that we are dealing with a lot of different tasks "at once". For a compilable version, click <a href="https://github.com/tontinton/echod-hog/blob/master/main.c">here</a>.

The main problem with this solution is that we are now always busy doing something, the CPU runs at 100%, even when most loop iterations will result in `EWOULDBLOCK`.

> Another problem is code complexity, we are now prohibited from running code that will block, to not block our entire server application.

What we really want is to sleep when we have nothing *useful* to do. I.e. When there is no client waiting to connect, no client has sent any packet and we can't yet send a packet to the client for whatever reason (maybe the client is busy doing something of its own).

The reasons we want this are:

* To be good neighbours to other applications running on the same machine, and not take CPU cycles they might want to utilize.
* The more the CPU runs, the more energy it takes:
  * Worse battery life.
  * More expensive.
  * Less environmental friendly 🌲🌳🌿

Good news though, most operating systems provide an API to do just that. Maybe even too many APIs:

* **select(2)** - A posix API. The man page is excellent, so let's copy the important bits:

```
$ man 2 select

...

select() allows a program to monitor multiple file descriptors, waiting until one or more of the
file descriptors become "ready" for some class of I/O operation (e.g., input possible). A file
descriptor is considered ready if it is possible to perform a corresponding I/O operation (e.g.,
read(2), or a sufficiently small write(2)) without blocking.

select() can monitor only file descriptors numbers that are less than FD_SETSIZE; poll(2) and
epoll(7) do not have this limitation. See BUGS.

...
```
> Main takeaway is that select is limited to `FD_SETSIZE` number of fds to monitor, which is usually 1024 (glibc). Another thing to note is that when a FD becomes ready, it scans all its registered FDs (`O(n)`), so when you have a lot of FDs, you can spend a lot of time just on this.
* **poll(2)** - A posix API. Not limited to `FD_SETSIZE` but still `O(n)` like `select`.
* **epoll(7)** - A linux API. A non portable `poll` but at least it scales better as it's `O(1)`.
* **aio(7)** - A linux API. Unlike previous APIs, it supports both sockets and files, but with some major disadvantages:
  * Supports only files opened with `O_DIRECT`, which are complex to work with.
  * Blocks if file metadata isn't available until it becomes available.
  * Blocks when the storage device is out of request slots (each storage device has a fixed number of slots).
  * Each IO submission copies 72 bytes and each completion copies 32 bytes. 104 bytes copied for each IO operation using 2 syscalls.
* **io_uring(7)** - A linux API (since 5.1). Like `aio`, it unifies disk and network operations under a single API, but without `aio`'s shortcomings. It is designed to be fast, creating 2 queues that live in shared memory (between user and kernel space), one for submission of I/O operations, the other is populated with the results of the I/O operations once they are ready. For more info head over to <a href="https://unixism.net/loti/what_is_io_uring.html">"What is io_uring?"</a>.

> `ScyllaDB` have successfully implemented their database using `aio` in <a href="https://seastar.io/">seastar</a>, you can read more on async disk I/O on <a href="https://scylladb.com/2017/10/05/io-access-methods-scylla/">their blog</a>.
>
> If you're interested about platforms other than linux, windows has <a href="https://learn.microsoft.com/en-us/windows/win32/fileio/i-o-completion-ports">I/O Completion Ports</a>, with FreeBSD and MacOS both using <a href="https://man.freebsd.org/cgi/man.cgi?kqueue">kqueue</a>.

Prior to `io_uring`, async I/O abstraction libraries used a thread pool to run disk I/O in a non-blocking manner.

There are libraries like <a href="https://libuv.org/">libuv</a> (what powers Node.js) that you can use to run highly concurrent servers while using just a single thread (they finally changed it to <a href="https://github.com/libuv/libuv/pull/3952">use io_uring</a>). These kind of libraries are often called `Event Loops`, let's talk about them a bit.

## Event Loop

At its essence an event loop (also sometimes called <a href="https://en.wikipedia.org/wiki/Reactor_pattern">reactor pattern</a>) is basically this:

```python
while should_continue_running():
    ready_fds = poll_fds()  # Implemented using any of the async APIs we talked about.
    events = fds_to_events(ready_fds)
    while event := events.pop():
        event.callback()
```

Yeah, that's it, just look at `libuv`'s `uv_run`:

```c
int uv_run(uv_loop_t* loop, uv_run_mode mode) {
  int r;

// ...

  while (r != 0 && loop->stop_flag == 0) {

// ...

    uv__run_pending(loop);
    uv__run_idle(loop);
    uv__run_prepare(loop);

// ...

    uv__io_poll(loop, timeout);

// ...

    r = uv__loop_alive(loop);
  }

// ...

  return r;
}
```

And here's `uv__run_pending` without omitting any details:

```c
static void uv__run_pending(uv_loop_t* loop) {
  struct uv__queue* q;
  struct uv__queue pq;
  uv__io_t* w;

  uv__queue_move(&loop->pending_queue, &pq);

  while (!uv__queue_empty(&pq)) {
    q = uv__queue_head(&pq);
    uv__queue_remove(q);
    uv__queue_init(q);
    w = uv__queue_data(q, uv__io_t, pending_queue);
    w->cb(loop, w, POLLOUT);
  }
}
```

Pretty awesome huh? This is what all Node.js applications are running on.

What if you need to call a blocking 3rd party library function? For that, most event loop libraries have a thread pool you can run arbitrary code on, for example in `libuv`, you can use <a href="https://docs.libuv.org/en/v1.x/threadpool.html">uv_queue_work()</a>.

> Pop quiz: how would something like `setTimeout` be implemented in an event loop? If nothing comes to mind, try cloning `libuv` and reading the implementation of `uv__run_timers` in `src/timer.c`.

### Event Driven Development

The programming model when using an event loop is inherently event driven, with each registered event having a callback to execute once it is ready.

Let's see how `echod` would look like using an imaginary event loop library instead (start with `serve` from the bottom):

```c
struct context {
    char buffer[2048];
    size_t offset;
    size_t length;
};

void on_write(loop_t* loop, struct context* ctx, int client_fd, ssize_t written) {
    if (written == -1) {
        // Error, stop.
        free(ctx);
        return;
    }

    ctx->offset += written;

    if (ctx->offset < ctx->length) {
        char* buf = ctx->buffer + ctx->offset;
        size_t len = ctx->length - ctx->offset;
        register_write(loop, ctx, client_fd, buf, len, on_write);
    } else {
        register_read(loop, ctx, client_fd, on_read);
    }
}

void on_read(loop_t* loop, struct context* ctx, int client_fd, ssize_t read) {
    if (read == -1) {
        // Error, stop.
        free(ctx);
        return;
    }

    ctx->offset = 0;
    ctx->length = read;

    register_write(loop, ctx, client_fd, ctx->buffer, read, on_write);
}

void on_accept(loop_t* loop, void* unused, int server_fd, int client_fd) {
    struct context* ctx = malloc(sizeof(*ctx));
    register_read(loop, ctx, client_fd, ctx->buffer, sizeof(ctx->buffer), on_read);
    register_accept(loop, NULL, server_fd, on_accept);
}

void serve(loop_t* loop, int server_fd) {
    register_accept(loop, NULL, server_fd, on_accept);
    run_event_loop(loop);
}
```

If you worked with javascript before, this should look familiar to you.

The code will be very lightweight in terms of performance, and highly concurrent, but is often criticized for being:

* **Not intuitive** - Complex for most programmers who are used to reading and writing synchronous code, see <a href="http://callbackhell.com">"Callback Hell"</a>.
* **Hard to debug** - The call stack is very short and will not show you the flow of how you got to a specific breakpoint. The caller of each callback will always be `uv_run` in `libuv`, or `run_event_loop` in our example.

A lot of modern programming languages and runtimes try to solve these problems by letting you write code that looks synchronous while being fully asynchronous. In the next chapter, we're gonna learn how.

# Preemption

Have you ever wondered how is it that you can run more than 1 thread on a computer with just a single CPU core?

In this section, we'll go over the secret technique that enables this magic, called **preemption**.

Let's say we have the following two tasks we would like to execute concurrently:

```python
def task_0():
    while True:
        print('0')

def task_1():
    while True:
        print('1')

run_all([task_0, task_1])
```

What should `run_all` do to make sure that both tasks run **concurrently**?

If we had 2 CPU cores, we could have simply run 1 task on 1 core, which would mean we would run the two tasks **parallelly**, or in other words the two tasks run at the same time in the *real* world (at least the one we base physics on).

A **concurrent** program deals with running multiple things at once, just not at the same time, thus they may seem **parallel** even if they're really not.

One way `run_all` can achieve **concurrency** is by running 1 task for some amount of time, pause, and then resume running the next task, forever in a loop until all tasks exit for example. To magically make it appear as if it's **parallel**, you simply need to configure the amount of time before pausing to be really small relative to the human experience (e.g. 100μs?).

```python
from itertools import cycle  # cycle([1, 2, 3]) -> (1, 2, 3, 1, 2, 3, ...)

def run_all(tasks):
    for task in cycle(tasks):
        run_task_for_a_little(task)
```

But how do you pause and resume execution of code?

The answer lies in programs being deterministic state machines, as long as you give a program's executor (e.g. CPU for native code) the same inputs (e.g. registers, memory, etc...), it doesn't matter if it executes today or in a few years, the output will be the same.

Basically, pausing a task can be implemented as copying the current state of the program, and resuming a task can be implemented by loading that saved state.

> It doesn't matter if the program runs on a real CPU or a virtual one like in `python`'s bytecode or on the `JVM` for example, they are all deterministic state machines. As long as you copy all the necessary state, the task will resume as if it was never even paused.

To make it easy to understand how you might implement preemption (saving and loading of program state), let's look at `setjmp.h`, which implements saving and loading program state in a lot of different CPU architectures, and is part of `libc`.

See the following example (copied directly from <a href="https://en.wikipedia.org/wiki/Setjmp.h">wikipedia</a>):

```c
#include <stdio.h>
#include <setjmp.h>

static jmp_buf buf;

void second() {
    printf("second\n");         // prints
    longjmp(buf,1);             // jumps back to where setjmp was called - making setjmp now return 1
}

void first() {
    second();
    printf("first\n");          // does not print
}

int main() {
    if (!setjmp(buf))
        first();                // when executed, setjmp returned 0
    else                        // when longjmp jumps back, setjmp returns 1
        printf("main\n");       // prints

    return 0;
}
```

Running it will output:

```sh
$ gcc example.c -o example && ./example
second
main
```

`setjmp` saves the program state (in `buf`), and `longjmp` loads whatever is in `buf` to the CPU.

Let's look behind the curtains, the following is the `x86_64` assembly code for `setjmp` and `longjmp` in <a href="https://musl.libc.org/">musl</a> (a popular `libc` implementation):

```asm
setjmp:
    mov %rbx,(%rdi)         ; rdi is jmp_buf, move registers onto it
    mov %rbp,8(%rdi)
    mov %r12,16(%rdi)
    mov %r13,24(%rdi)
    mov %r14,32(%rdi)
    mov %r15,40(%rdi)
    lea 8(%rsp),%rdx        ; this is our rsp WITHOUT current ret addr
    mov %rdx,48(%rdi)
    mov (%rsp),%rdx         ; save return addr ptr for new rip
    mov %rdx,56(%rdi)
    xor %eax,%eax           ; always return 0
    ret

longjmp:
    xor %eax,%eax
    cmp $1,%esi             ; CF = val ? 0 : 1
    adc %esi,%eax           ; eax = val + !val
    mov (%rdi),%rbx         ; rdi is the jmp_buf, restore regs from it
    mov 8(%rdi),%rbp
    mov 16(%rdi),%r12
    mov 24(%rdi),%r13
    mov 32(%rdi),%r14
    mov 40(%rdi),%r15
    mov 48(%rdi),%rsp
    jmp *56(%rdi)           ; goto saved address without altering rsp
```

> Don't stress it if you don't understand assembly. The point is that saving and loading program state is pretty short and simple.

`setjmp` saves all callee-saved registers into `jmp_buf`. Callee-saved registers are registers used to hold long-lived values that should be preserved across function calls. `longjmp` restores the callee-saved registers stored inside a `jmp_buf` directly to the CPU registers.

> To the curious, the reason caller-saved registers (like `rcx` for example) are not saved, is because to the compiler `setjmp` is just another function call, meaning it will not use caller-saved registers to hold state. It assumes just like with any function call, that these registers might be changed.

## Non-Preemptive Schedulers

Already, we have a solid foundation to start running multiple tasks concurrently.

Instead of relying on time to pause execution of a running task, we can instead assume the programmer manually inserts calls to `longjmp`, see example (this time in C for `setjmp.h`):

```c
#include <stdbool.h>
#include <stdio.h>
#include <setjmp.h>

jmp_buf* current_buffer;
jmp_buf main_buffer;

#define ARRAY_SIZE(arr) (sizeof(arr) / sizeof(arr[0]))
#define YIELD() { if (!setjmp(*current_buffer)) longjmp(main_buffer, 1); }

void task_0() {
    while (true) {
        printf("0\n");
        YIELD();
    }
}

void task_1() {
    while (true) {
        printf("1\n");
        YIELD();
    }
}

int main() {
    void(*tasks[])(void) = {task_0, task_1};
    jmp_buf buffers[ARRAY_SIZE(tasks)];
    bool started = false;

    while (true) {
        for (int i = 0; i < ARRAY_SIZE(tasks); i++) {
            if (setjmp(main_buffer)) {
                continue;
            }

            current_buffer = &buffers[i];
            if (!started) {
                tasks[i]();
            } else {
                longjmp(buffers[i], 1);
            }
        }

        started = true;
    }

    return 0;
}
```

Let's run it:

```sh
$ gcc example.c -o example && ./example
0
1
0
1
...
^C
```

Cool, but... There's actually a hidden bug (can you find it?).

Let's change `task_0` to hold some state on the stack:

```c
void task_0() {
    int i = 0;
    while (true) {
        printf("0: %d\n", i++);
        YIELD();
    }
}
```

Run it again:

```sh
$ gcc example.c -o example && ./example
0: 0
1
0: 32765
1
0: 32765
1
...
^C
```

Whoops... Because all our tasks share the same stack, each task (including our `main` function) may overwrite whatever is in the stack. See the following illustration:

```
----------------
| main's stack |
----------------
               ^
First, a call to setjmp in main saves the stack address here.
```

```
---------------------------------
| main's stack | task_0's stack |
---------------------------------
                                ^
Then, a call to setjmp in task_0 saves the stack address here.
```

```
---------------------------------
| main's stack | task_0's stack |
---------------------------------
               ^
Once we longjmp back to main, we reset the stack register (rsp in x86_64) back here.
```

```
Then any pushing to the stack, will overwrite any data saved in task_0's stack.
So once we longjmp back to task_0, this is how our stack will look like:

---------------------------------
| main's stack | "random" stuff |
---------------------------------
                                ^
No wonder we get a random looking value when we print something inside the stack.
```

The fix is to create a stack for each task, and switch to it right before calling the task function:

```diff
@@ -25,6 +26,7 @@ void task_1() {
 int main() {
     void(*tasks[])(void) = {task_0, task_1};
     jmp_buf buffers[ARRAY_SIZE(tasks)];
+    char stacks[ARRAY_SIZE(tasks)][1024];  // Stack size of 1kb.
     bool started = false;

     while (true) {
@@ -35,7 +37,12 @@ int main() {

             current_buffer = &buffers[i];
             if (!started) {
-                tasks[i]();
+                // Stack goes down on push, up on pop.
+                char* stack = stacks[i] + sizeof(stacks[i]);
+                asm("movq %0, %%rax;"
+                    "movq %1, %%rsp;"
+                    "call *%%rax"
+                    :: "rm" (tasks[i]), "rm" (stack) : "rax");
             } else {
                 longjmp(buffers[i], 1);
             }
```

> The reason for saving the task function in the register `rax`, was to not lookup `tasks[i]` inside the stack, as we just changed the stack to some other memory location. The `asm` syntax is fully documented <a href="https://gcc.gnu.org/onlinedocs/gcc/extensions-to-the-c-language-family/how-to-use-inline-assembly-language-in-c-code.html">here</a>.

Run it one last time:

```sh
$ gcc example.c -o example && ./example
0: 0
1
0: 1
1
0: 2
1
...
^C
```

We have successfully implemented a user mode non-preemptive scheduler!

In real non-preemptive (also called cooperative) systems, the runtime should yield when it knows that the CPU has nothing useful to do anymore in the current task, for example waiting on I/O. They do that by registering for I/O and move the task to a different queue that holds blocked tasks (which the scheduler skips from running). Once there's I/O, they move the task from the blocked queue back to the regular queue for execution. This can be done for example by integrating with an event loop.

Here are some examples of non-preemptive schedulers in popular mainstream runtimes:

* **Rust's <a href="https://tokio.rs/">tokio</a>** - To yield, you either call `tokio::task::yield_now()`, or run until blocking (e.g. waiting on I/O or `tokio::time::sleep()`). In version 0.3.1 they introduced an <a href="https://tokio.rs/blog/2020-04-preemption">automatic yield</a>.
* **Go (prior to 1.14)** - At release (version 1.0), to yield, you would either call `runtime.Gosched()`, or run until blocking. In version 1.2 the scheduler is also invoked occasionally upon entry to a function.
* **Erlang** - In <a href="https://blog.stenmans.org/theBeamBook/">BEAM</a> (erlang's awesome runtime), the scheduler is invoked at function calls. Since there are no other loop constructs than recursion and list comprehensions, there is no way to loop forever without doing a function call. You can cheat though by running native C code using a `NIF` (native implemented function).

Non-preemptive schedulers are risky, as we assume developers remember to put `yield` calls when doing long computations:

```go
// In Go (prior to 1.14), this code would not yield until done.
sum := 0
for i := 0; i < 1e8; i++ {
    sum++
}
```

## Preemptive Schedulers

A preemptive scheduler context switches (yields) once in a while, even without a developer inserting yield calls.

Most modern operating systems utilize timer interrupts. The CPU receives an interrupt once every X amount of time is passed. The interrupt stops execution of whatever is currently running, and the interrupt handler calls the scheduler which decides whether to context switch.

That's cool and all, but user mode applications can't register to interrupts, so what can we do if we want to implement a preemptive scheduler in user mode?

One simple solution would be to utilize the kernel's preemptive scheduler. Create a thread that periodically sends a signal to threads running our scheduler.

This is exactly how Go made their scheduler preemptive in version 1.14. By periodically sending signals from their monitoring thread (<a href="https://sobyte.net/post/2021-12/golang-sysmon/">runtime.sysmon</a>) to the scheduler threads running goroutines.

> For more info on their solution, I recommend you watch <a href="https://youtube.com/watch?v=1I1WmeSjRSw">"Pardon the Interruption: Loop Preemption in Go 1.14"</a>.

## Stackful vs Stackless

Up until now, I have been calling them tasks to not confuse you, but they have many different names like fibers, greenlets, user mode threads, green threads, virtual threads, coroutines and goroutines.

> When people say threads, they usually mean OS threads (managed by the kernel scheduler).

A coroutine is simply a program that can be paused and resumed. There are mainly two ways to implement them: either you allocate a stack for each coroutine (stackful), or you make each function marked as `async` return an object that can hold all the state needed to pause and resume that function (stackless).

Stackful and stackless impact the API greatly, each with its own advantages and disadvantages. Here's an overview:

* **Stackful** - Coroutines have the exact same API and semantics as OS threads, which makes sense, as they both allocate a stack at runtime. Our example scheduler using `setjmp` is stackful. Go is another example of a stackful implementation. Just like Go needs to periodically context switch, it also needs to periodically check whether there is enough free stack space to continue running, if not, it reallocates the stack to have more memory, copies what it had before and fixes all pointers that pointed to the old stack to now point to the new stack. Just like the stack can grow dynamically, it can also shrink if needed. The real beauty is that you can choose to run any function either synchronously or asynchronously in the background, without affecting the code around it:
```go
go fmt.Println("world")
fmt.Println("hello")
```
* **Stackless** - If you have ever used a language with `async` & `await`, you used a stackless implementation. Examples include Rust and Python's `asyncio`. Rust's `async` transforms a block of code into a state machine that is not run until you `await` it. The biggest advantage of this approach is how <a href="https://pkolaczk.github.io/memory-consumption-of-async/">lightweight it is at runtime</a>, memory is allocated exactly as needed, which served well for Rust's embedded use case as well. The main problem with this approach is "function coloring". An `async` function can only be called inside another `async` function:
```rs
async fn say() {
    println!("hello world");
}

fn main() {
    // Can't call say(), as main() is not async.

    let mut rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let future = say(); // Calling does not execute.
        future.await; // Starts executing.
    })
}
```

> Rust started with stackful prior to release, but ultimately ended up switching to stackless: <a href="https://without.boats/blog/why-async-rust/">"Why async rust?"</a>.

# Scheduler Algorithms

A scheduler is also responsible for deciding which task it should run next once one finishes.

One of the simplest methods is one we have already seen before in the event loop section, and that is to run tasks in the order that they are added to the task queue.

Linux's `SCHED_FIFO` scheduler does exactly this:

<div class="block small-block" style="height: 500px">
  <div id="app_sched_fifo" style="height: 100%"></div>
</div>

> Each circle is a task. The white progress circle around tasks is the time left to run until the task is blocked.<br>
> <span style="color: #BD93F9"><b>Purple box</b></span> - The queue holding tasks ready to run.<br>
> <span style="color: #50FA7B"><b>Green box</b></span> - The CPU.<br>
> <span style="color: #7282c4"><b>Gray box</b></span> - Tasks blocked on something (e.g. I/O).

Taking `SCHED_FIFO` and adding a task runtime limit is what `SCHED_RR` does, allowing the CPU to be shared in a more uniform manner:

<div class="block small-block" style="height: 500px">
  <div id="app_sched_rr" style="height: 100%"></div>
</div>

What if you have a task that *must* run once every 5ms, even if for a really short amount of time? For example in audio programming, you have a buffer to fill with a signal in time (e.g. `sin(x)`) that the audio device reads from at some interval. Missing out on filling this buffer, will result in a random signal which sounds like crackling noise, potentially ruining a recording of an entire orchestra.

These kind of programs are usually called soft real time programs. Hard real time means missing a deadline will result in the whole system failing, for example autopilot and spacecrafts.

Linux has a nice answer for soft real time systems called `SCHED_DEADLINE`, where each thread sets the amount of time until their deadline, and the scheduler always runs the task that is closest to reaching the deadline:

<div class="block small-block" style="height: 500px">
  <div id="app_sched_deadline" style="height: 100%"></div>
</div>

> The <span style="color: #a7fb78"><b>green</b></span> progress circle is how much time is left until the deadline.<br>
> Follow the <span style="color: #FF79C6"><b>pink</b></span> circle, it has a short deadline, making it run a lot more than others.
>
> `SCHED_FIFO` and `SCHED_RR` can also be used in soft real time systems because of their deterministic nature, depending on the problem you need to solve.

To guarantee all tasks are able to run according to their configured deadline, `SCHED_DEADLINE` calculates and rejects threads with a configuration that will steal too much run time. You can learn more about it on lwn's <a href="https://lwn.net/Articles/743740/">"Deadline scheduling"</a>.

For general purpose workloads, like a laptop running arbitrary processes, you usually want fairness. Fairness can be achieved by continuously tracking which processes have gotten less CPU time than others, and always run the task with the lowest tracked runtime. Linux's default scheduler `SCHED_OTHER`, also known as `CFS` (Completely Fair Scheduler), does exactly this. You can also configure priorities to processes by setting a `nice` value, where processes with a lower `nice` value will be scheduled more.

> `CFS` has served well for the last 26 years, but in v6.6, the new default scheduling algorithm is <a href="https://lwn.net/Articles/925371/">EEVDF</a>.

## Multi-Core

So far, I have pretty much ignored the fact that modern machines have more than 1 CPU core.

The simplest way to achieve multi-core scheduling, is to do exactly as before. Having a global queue of tasks that are ready to run, and run them once a core is ready:

<div class="block small-block" style="height: 500px">
  <div id="app_sched_multicore" style="height: 100%"></div>
</div>

You just need to ensure that the task queue is thread-safe for `MPMC` operations (multi-producer multi-consumer), by using atomics or locks.

`MPMC` queues are a lot slower than the more restrictive `SPMC` (single-producer multi-consumer) queues, which is why Go decided to have a fixed size `SPMC` queue for each scheduler (Go runs a scheduler per core configured by `GOMAXPROCS`), with a global `MPMC` queue to push to when the `SPMC` queue is full.

To ensure all cores are fully utilized, when a core is free to run but has nothing in its local queue and there are no tasks in the global queue, it **steals** tasks from other local queues (which is why they are multi-consumer).

> Go's solution is so good, tokio borrowed a lot from it. I highly recommend reading it on their blog: <a href="https://tokio.rs/blog/2019-10-scheduler">"Making the Tokio scheduler 10x faster"</a>.

# Conclusion

Congratulations 🥳! You are a real hero reaching the end, hopefully you have learned a thing or two.

The topic has a lot more to cover, the links left throughout this post are a great place to start exploring the endless rabbit hole of concurrency and parallelism.

If you want to play around with the animations yourself, here's a link to the <a href="https://github.com/tontinton/sched_animation">code</a>.

<a onclick="window.scrollTo(0,0);" style="cursor: pointer;">Click here</a> to scroll back to the animation at the top.

<script>applySize(getSize())</script>
