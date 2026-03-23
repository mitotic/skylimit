#!/bin/bash

# Copy Websky to skylimit-alpha, excluding documentation and git history
# Run from: /Users/sarava/ClaudeLocal/Websky

SOURCE_DIR="/Users/sarava/ClaudeLocal/Websky"
TARGET_DIR="/Users/sarava/ClaudeLocal/skylimit-alpha"

# Create target directory
mkdir -p "$TARGET_DIR"

# Copy everything except:
#   - .git (to start fresh git repo)
#   - *.md files in root directory only (documentation)
#   - node_modules (regenerate with npm install)
#   - dist (regenerate with npm run build)
#   - .DS_Store (macOS metadata)
#   - app-passwd.txt (credentials)
#   - *.png in root directory only (subdirectory images are copied)
#   - this script itself

rsync -av --progress \
    --exclude='.git' \
    --exclude='/*.md' \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.DS_Store' \
    --exclude='app-passwd.txt' \
    --exclude='/*.png' \
    --exclude='copy-to-skylimit-alpha.sh' \
    --exclude='.claude' \
    "$SOURCE_DIR/" "$TARGET_DIR/"

echo ""
echo "Done! Next steps:"
echo "  cd $TARGET_DIR"
echo "  git init"
echo "  npm install"
echo "  npm run dev"
