---
title: Daemon Mode
sidebar:
  order: 3
---

Max runs a background daemon to keep responses fast. The daemon holds the Max runtime in memory so commands like search, tab completion, and status return instantly instead of booting from scratch each time.

## How it works

When you run a Max command, the CLI connects to a daemon process over a Unix socket. The daemon executes the command and streams results back. Because the runtime is already warm - workspace loaded, connectors initialised, database connections open - there's no startup cost.

```
You type:     max search linear-1 LinearIssue --limit 5
              │
CLI binary    ├── Connects to daemon via Unix socket
              ├── Sends command as structured request
              ├── Receives streamed output
              └── Prints results

Daemon        ├── Already running (runtime warm)
              ├── Receives request
              ├── Executes against loaded workspace
              └── Streams results back
```

The daemon listens at `~/.max/daemon.sock` and writes its PID to `~/.max/daemon.pid`.

## Direct mode

If you need to bypass the daemon, use `--direct`:

```bash
max --direct search linear-1 LinearIssue --limit 5
```

In direct mode, Max starts a fresh runtime, executes the command, and exits. This is slower (startup cost on every invocation) but useful for troubleshooting or when the daemon is unhealthy.

## Troubleshooting

### Daemon seems stuck

If commands hang or return unexpected errors:

:::note
Daemon management commands (`max daemon start`, `max daemon stop`, etc.) haven't been added to the CLI yet. If you need to kill the daemon, use `pkill bun`. Dedicated daemon controls are coming soon.
:::

```bash
# Kill the daemon process
pkill bun

# Your next max command will start a fresh daemon automatically
max status
```

### Checking logs

Daemon logs are written to `~/.max/daemon.log`:

```bash
tail -f ~/.max/daemon.log
```

## What's next

- [CLI Overview](/cli/overview/) - the full command set
- [Targeting](/cli/targeting/) - how commands find their target node
