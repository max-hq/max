#!/bin/sh
set -e

REPO="${MAX_REPO:-https://github.com/max-hq/max.git}"
INSTALL_DIR="${MAX_HOME:-$HOME/.max/repo}"
BIN_DIR="$HOME/.local/bin"

main() {
    echo "Installing max..."

    if ! command -v git >/dev/null 2>&1; then
        echo "error: git is required" >&2
        exit 1
    fi

    # Ensure bun is available
    if ! command -v bun >/dev/null 2>&1; then
        if [ -x "$HOME/.bun/bin/bun" ]; then
            export PATH="$HOME/.bun/bin:$PATH"
        else
            echo "bun not found - installing..."
            curl -fsSL https://bun.sh/install | bash
            export PATH="$HOME/.bun/bin:$PATH"
        fi
        export MAX_SETUP_BUN_INSTALLED=1
    fi

    # Clone max
    if [ ! -d "$INSTALL_DIR" ]; then
        git clone --depth 1 "$REPO" "$INSTALL_DIR"
    fi

    cd "$INSTALL_DIR"
    bun install

    # Wrapper calls the repo's max script (which handles rust proxy)
    mkdir -p "$BIN_DIR"
    cat > "$BIN_DIR/max" <<EOF
#!/usr/bin/env bash
exec "$INSTALL_DIR/max" "\$@"
EOF
    chmod +x "$BIN_DIR/max"

    # Ensure BIN_DIR is on PATH for the setup step
    case ":$PATH:" in
        *":$BIN_DIR:"*) ;;
        *) export PATH="$BIN_DIR:$PATH" ;;
    esac

    echo ""
    max --direct setup </dev/tty
}

main
