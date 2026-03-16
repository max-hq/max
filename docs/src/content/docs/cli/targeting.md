---
title: Targeting
sidebar:
  order: 2
---

Every Max command operates on a target - a workspace, installation, or the global level. By default, Max figures out the target from your current directory. The `-t` flag lets you override that and address any node explicitly.

## What is a node?

Max organises data in a three-level hierarchy:

```
Global (@)
└── Workspace (e.g. "my-project")
    └── Installation (e.g. "linear-1", "github-prod")
```

Each level in this hierarchy is a **node**. Every node has an address called a Max URL:

```
max://@/my-project/linear-1
       │  │            │
       │  │            └── installation
       │  └── workspace
       └── host (@ = this machine)
```

## Default resolution

Without `-t`, Max resolves your target from the current working directory - similar to how npm finds the nearest `package.json`:

```bash
# Inside ~/projects/my-project/ (which has a .max/ folder)
max ls                    # workspace-level: lists installations
max search linear-1 ...  # workspace-level: searches within this workspace

# Inside ~/projects/my-project/.max/installations/linear-1/
max search LinearIssue    # installation-level: no need to name the installation

# Outside any workspace
max -g ls                 # global-level: lists workspaces
```

## The `-t` flag

Use `-t` to target a specific node regardless of where you are:

```bash
# Target a workspace
max -t my-project ls
max -t my-project status

# Target an installation (workspace/installation)
max -t my-project/linear-1 search LinearIssue
max -t my-project/linear-1 sync

# Target with a full Max URL
max -t max://@/my-project/linear-1 search LinearIssue
```

### Relative resolution

Target values are resolved relative to your current context:

```bash
# If you're already inside the my-project workspace:
max -t linear-1 search LinearIssue
# Resolves to: max://@/my-project/linear-1
```

When you're in a workspace, a bare name is treated as an installation within that workspace. When you're not in a workspace, a bare name is treated as a workspace.

### The `-g` flag

`-g` is shorthand for targeting the global level (`-t max://@`):

```bash
max -g ls          # List all workspaces
max -g status      # Global health overview
```

This is useful when you're inside a workspace but want to see the global view.

## Common patterns

```bash
# Check where you are
max status                              # Shows your resolved context

# List everything at your current level
max ls                                  # Installations (in workspace) or workspaces (global)

# Operate on a specific installation from anywhere
max -t my-project/linear-1 search LinearIssue --all
max -t my-project/linear-1 sync

# Compare installations
max -t my-project/linear-1 search LinearUser --limit 5
max -t my-project/linear-2 search LinearUser --limit 5

# Global operations
max -g ls                               # All workspaces on this machine
max -g status                           # Global health
```

## What's next

- [CLI Overview](/cli/overview/) - the full command set at each level
- [Daemon Mode](/cli/daemon-mode/) - how targeting interacts with execution
