# Installation

## Prerequisites

- [Bun](https://bun.sh) >= 1.3.9
- [Rust](https://rustup.rs) (for the native CLI proxy)

## Install

::: code-group

```bash [bun]
git clone https://github.com/max-hq/max.git
cd max
bun install
```

:::

Add Max to your path:

```bash
# Add to your shell profile
export PATH="$PATH:/path/to/max"
```

## Shell completions

Max can generate shell completions:

::: code-group

```bash [zsh]
max completion zsh > ~/.max-completions.zsh
echo 'source ~/.max-completions.zsh' >> ~/.zshrc
```

```bash [bash]
max completion bash > ~/.max-completions.bash
echo 'source ~/.max-completions.bash' >> ~/.bashrc
```

```bash [fish]
max completion fish > ~/.config/fish/completions/max.fish
```

:::
