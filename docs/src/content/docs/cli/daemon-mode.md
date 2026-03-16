---
title: Daemon Mode
sidebar:
  order: 3
---

Max can run commands in two ways: directly (as a one-shot process) or through a background daemon. Understanding the difference helps when troubleshooting or running long operations.

## Two execution modes

### Direct mode

The default. When you run a command, Max starts a process, executes the command, and exits:

```bash
max search linear-1 LinearIssue --limit 5
# Process starts, runs query, prints results, exits
```

Direct mode is simple and predictable. Each command starts fresh - it boots the Max runtime, connects to your workspace, runs the operation, and tears down.

### Daemon mode

A background process that stays running and serves commands over a Unix socket. The daemon keeps the Max runtime warm, so commands don't pay the startup cost on each invocation.

<!-- TODO: verify current daemon status - is it actively used or infrastructure-only? -->

The daemon listens at `~/.max/daemon.sock` and maintains a PID file at `~/.max/daemon.pid`. When active, the CLI connects to the daemon instead of starting a fresh runtime.

## Managing the daemon

```bash
# Check daemon status
max daemon status

# Start the daemon
max daemon start

# Stop the daemon
max daemon stop

# Restart
max daemon restart
```

<!-- TODO: verify daemon subcommands - enable/disable/list also available? -->

## When each mode applies

**Direct mode** is used for most day-to-day commands. It's the default and requires no setup.

**Daemon mode** is beneficial when you're running many commands in quick succession. The daemon keeps your workspace runtime warm, so subsequent commands skip the initialization step.

The CLI automatically routes to the daemon when one is running. If no daemon is active, commands run in direct mode.

## Troubleshooting

### Daemon not responding

If commands hang or fail to connect:

```bash
# Check if the daemon is running
max daemon status

# Restart it
max daemon restart
```

### Port or socket conflicts

The daemon uses a Unix socket at `~/.max/daemon.sock`. If this file exists but no daemon is running (e.g., after a crash), the stale socket can block a new daemon from starting:

<!-- TODO: verify - does Max handle stale sockets automatically? -->

```bash
# Stop any existing daemon
max daemon stop

# If that doesn't work, restart
max daemon restart
```

### Checking logs

Daemon logs are written to `~/.max/daemon.log`:

```bash
tail -f ~/.max/daemon.log
```

## What's next

- [CLI Overview](/cli/overview/) - the full command set
- [Targeting](/cli/targeting/) - how commands find their target node
