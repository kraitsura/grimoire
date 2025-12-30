#!/bin/bash
#
# Grimoire Installer
# https://github.com/aaryareddy/grimoire
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/aaryareddy/grimoire/main/install.sh | bash
#
# Options:
#   GRIMOIRE_INSTALL_DIR    - Installation directory (default: ~/.grimoire/bin)
#   GRIMOIRE_NO_MODIFY_PATH - Set to 1 to skip PATH modification
#   GRIMOIRE_SKIP_OPTIONAL  - Set to 1 to skip optional dependency suggestions

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Configuration
REPO="aaryareddy/grimoire"
INSTALL_DIR="${GRIMOIRE_INSTALL_DIR:-$HOME/.grimoire/bin}"

info() {
    echo -e "${BLUE}info${NC}: $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}warn${NC}: $1"
}

error() {
    echo -e "${RED}error${NC}: $1"
    exit 1
}

dim() {
    echo -e "${DIM}$1${NC}"
}

# Check if command exists
has() {
    command -v "$1" &> /dev/null
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)     OS="linux";;
        Darwin*)    OS="darwin";;
        MINGW*|MSYS*|CYGWIN*) OS="windows";;
        *)          error "Unsupported operating system: $(uname -s)";;
    esac
}

# Detect architecture
detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)   ARCH="x64";;
        arm64|aarch64)  ARCH="arm64";;
        *)              error "Unsupported architecture: $(uname -m)";;
    esac
}

# Check required dependencies
check_required_deps() {
    local missing=()

    if ! has git; then
        missing+=("git")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        error "Missing required dependencies: ${missing[*]}

Please install them first:
  macOS:   brew install ${missing[*]}
  Ubuntu:  sudo apt install ${missing[*]}
  Fedora:  sudo dnf install ${missing[*]}"
    fi

    success "git found"
}

# Check and report optional dependencies
check_optional_deps() {
    if [ "${GRIMOIRE_SKIP_OPTIONAL:-0}" = "1" ]; then
        return
    fi

    echo ""
    echo "Optional dependencies for full functionality:"
    echo ""

    # Claude Code CLI
    if has claude; then
        success "claude (Claude Code CLI) - spawn agents in worktrees"
    else
        echo -e "  ${DIM}○${NC} claude - spawn agents in worktrees"
        dim "    Install: npm install -g @anthropic-ai/claude-code"
    fi

    # Beads (issue tracking)
    if has bd; then
        success "bd (Beads) - issue tracking integration"
    else
        echo -e "  ${DIM}○${NC} bd (Beads) - issue tracking integration"
        dim "    Install: curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash"
    fi

    # GitHub CLI
    if has gh; then
        success "gh (GitHub CLI) - create PRs from worktrees"
    else
        echo -e "  ${DIM}○${NC} gh - create PRs from worktrees"
        dim "    Install: brew install gh  or  https://cli.github.com"
    fi

    # SRT (Sandbox Runtime)
    if has srt || npx srt --version &>/dev/null 2>&1; then
        success "srt (Sandbox Runtime) - sandboxed agent execution"
    else
        echo -e "  ${DIM}○${NC} srt - sandboxed agent execution"
        dim "    Install: npm install -g @anthropic-ai/sandbox-runtime"
    fi

    # Linux-specific: bubblewrap and socat for SRT
    if [ "$OS" = "linux" ]; then
        if has bwrap && has socat; then
            success "bubblewrap, socat - SRT dependencies (Linux)"
        else
            echo -e "  ${DIM}○${NC} bubblewrap, socat - required for SRT on Linux"
            dim "    Install: sudo apt install bubblewrap socat"
        fi
    fi

    echo ""
}

# Install via bun (preferred)
install_via_bun() {
    info "Installing via bun..."
    bun install -g grimoire
    success "Grimoire installed via bun!"
}

# Install via npm
install_via_npm() {
    info "Installing via npm..."
    npm install -g grimoire
    success "Grimoire installed via npm!"
}

# Install bun first, then grimoire
install_with_bun_first() {
    info "Installing bun..."
    curl -fsSL https://bun.sh/install | bash

    # Source bun
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    info "Installing grimoire via bun..."
    bun install -g grimoire
    success "Grimoire installed!"
}

# Add to shell profile
add_to_path() {
    if [ "${GRIMOIRE_NO_MODIFY_PATH:-0}" = "1" ]; then
        return
    fi

    local shell_profile=""
    local shell_name=$(basename "$SHELL")

    case "$shell_name" in
        bash)
            if [ -f "$HOME/.bashrc" ]; then
                shell_profile="$HOME/.bashrc"
            elif [ -f "$HOME/.bash_profile" ]; then
                shell_profile="$HOME/.bash_profile"
            fi
            ;;
        zsh)
            shell_profile="$HOME/.zshrc"
            ;;
        fish)
            shell_profile="$HOME/.config/fish/config.fish"
            ;;
    esac

    if [ -n "$shell_profile" ]; then
        local path_line="export PATH=\"$INSTALL_DIR:\$PATH\""

        if [ "$shell_name" = "fish" ]; then
            path_line="set -gx PATH $INSTALL_DIR \$PATH"
        fi

        if ! grep -q "grimoire" "$shell_profile" 2>/dev/null; then
            echo "" >> "$shell_profile"
            echo "# Grimoire" >> "$shell_profile"
            echo "$path_line" >> "$shell_profile"
            info "Added grimoire to PATH in $shell_profile"
        fi
    fi
}

# Main installation logic
main() {
    echo ""
    echo -e "${BLUE}Grimoire Installer${NC}"
    echo "=================="
    echo ""

    detect_os
    detect_arch

    info "Detected: $OS-$ARCH"
    echo ""

    # Check required dependencies
    echo "Checking dependencies..."
    check_required_deps

    # Check runtime availability
    if has bun; then
        success "bun found"
    elif has npm && has node; then
        success "node/npm found"
    else
        warn "No JavaScript runtime found (bun or node)"
    fi

    echo ""

    # Install grimoire
    if has bun; then
        install_via_bun
    elif has npm && has node; then
        install_via_npm
    else
        info "Neither bun nor npm found."
        echo ""
        echo "Choose installation method:"
        echo "  1) Install bun, then grimoire (recommended)"
        echo "  2) Cancel and install manually"
        echo ""
        read -p "Choice [1]: " choice
        choice="${choice:-1}"

        case "$choice" in
            1)
                install_with_bun_first
                ;;
            *)
                echo ""
                echo "Manual installation:"
                echo "  1. Install bun: curl -fsSL https://bun.sh/install | bash"
                echo "  2. Install grimoire: bun install -g grimoire"
                exit 0
                ;;
        esac
    fi

    # Show optional dependencies
    check_optional_deps

    # Verify installation
    if has grimoire; then
        echo "Installed version: $(grimoire --version 2>/dev/null || echo 'unknown')"
    fi

    echo ""
    success "Installation complete!"
    echo ""
    echo "Get started:"
    echo "  grimoire --help          # Show all commands"
    echo "  grimoire hello-world     # Create your first prompt"
    echo "  grimoire skills init     # Initialize skills in a project"
    echo "  grim wt --help           # Worktree management (requires git)"
    echo ""
}

main "$@"
