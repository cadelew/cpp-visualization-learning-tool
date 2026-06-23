#!/bin/bash
# Download tree-sitter WASM files for C++ grammar support.
#
# This script downloads pre-built WASM binaries for tree-sitter-cpp
# from the official tree-sitter releases on GitHub.
#
# Usage: ./scripts/download-wasm.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WASM_DIR="$PROJECT_DIR/wasm"

mkdir -p "$WASM_DIR"

echo "Downloading tree-sitter WASM files..."

# tree-sitter.wasm from web-tree-sitter package
TS_WASM="$PROJECT_DIR/node_modules/web-tree-sitter/tree-sitter.wasm"
if [ -f "$TS_WASM" ]; then
  cp "$TS_WASM" "$WASM_DIR/tree-sitter.wasm"
  echo "  ✓ Copied tree-sitter.wasm from node_modules"
else
  echo "  ⚠ web-tree-sitter not installed. Run 'npm install' first."
  exit 1
fi

# tree-sitter-cpp.wasm from CDN
CPP_WASM_URL="https://tree-sitter.github.io/tree-sitter/assets/tree-sitter-cpp.wasm"
CPP_WASM="$WASM_DIR/tree-sitter-cpp.wasm"

if [ -f "$CPP_WASM" ]; then
  echo "  ✓ tree-sitter-cpp.wasm already exists"
else
  echo "  Downloading tree-sitter-cpp.wasm..."
  if command -v curl &> /dev/null; then
    curl -sL "$CPP_WASM_URL" -o "$CPP_WASM" || {
      echo "  ⚠ Failed to download tree-sitter-cpp.wasm (non-critical for regex parser)"
      echo "  The regex-based parser will be used as the primary analysis engine."
    }
  elif command -v wget &> /dev/null; then
    wget -q "$CPP_WASM_URL" -O "$CPP_WASM" || {
      echo "  ⚠ Failed to download tree-sitter-cpp.wasm (non-critical for regex parser)"
      echo "  The regex-based parser will be used as the primary analysis engine."
    }
  else
    echo "  ⚠ Neither curl nor wget available. Skipping WASM download."
    echo "  The regex-based parser will be used as the primary analysis engine."
  fi
fi

# tree-sitter-c.wasm from CDN
C_WASM_URL="https://tree-sitter.github.io/tree-sitter/assets/tree-sitter-c.wasm"
C_WASM="$WASM_DIR/tree-sitter-c.wasm"

if [ -f "$C_WASM" ]; then
  echo "  ✓ tree-sitter-c.wasm already exists"
else
  echo "  Downloading tree-sitter-c.wasm..."
  if command -v curl &> /dev/null; then
    curl -sL "$C_WASM_URL" -o "$C_WASM" || {
      echo "  ⚠ Failed to download tree-sitter-c.wasm (non-critical)"
    }
  elif command -v wget &> /dev/null; then
    wget -q "$C_WASM_URL" -O "$C_WASM" || {
      echo "  ⚠ Failed to download tree-sitter-c.wasm (non-critical)"
    }
  fi
fi

echo ""
echo "WASM setup complete!"
echo "Note: The regex-based parser is the primary analysis engine."
echo "      Tree-sitter WASM files are optional enhancements."
