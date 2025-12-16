#!/bin/bash

#################################################################
# LLM Tracker Installer for macOS
# Installs desktop app, native host, and sets up Chrome extension
#################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="/Applications/LLM Tracker.app"
NATIVE_HOST_DIR="$PROJECT_ROOT/native-host"

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    LLM Tracker Installer v1.0.0       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}✗ Error: This installer is for macOS only${NC}"
    exit 1
fi

# Check for required commands
command -v node >/dev/null 2>&1 || {
    echo -e "${RED}✗ Error: Node.js is not installed${NC}"
    echo -e "  Please install Node.js from https://nodejs.org/"
    exit 1
}

command -v npm >/dev/null 2>&1 || {
    echo -e "${RED}✗ Error: npm is not installed${NC}"
    exit 1
}

echo -e "${BLUE}→ Checking system requirements...${NC}"
echo -e "${GREEN}✓ macOS detected${NC}"
echo -e "${GREEN}✓ Node.js $(node -v) found${NC}"
echo -e "${GREEN}✓ npm $(npm -v) found${NC}"
echo ""

# Step 1: Install dependencies
echo -e "${BLUE}→ Installing dependencies...${NC}"

cd "$PROJECT_ROOT"
npm install --loglevel=error > /dev/null 2>&1

cd "$PROJECT_ROOT/desktop-app"
npm install --loglevel=error > /dev/null 2>&1

cd "$PROJECT_ROOT/native-host"
npm install --loglevel=error > /dev/null 2>&1

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 2: Package Electron app (if electron-builder is available)
echo -e "${BLUE}→ Building desktop application...${NC}"

cd "$PROJECT_ROOT/desktop-app"

if npm run package > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Desktop app packaged${NC}"

    # Find the generated .app
    if [ -d "dist/mac/LLM Tracker.app" ]; then
        APP_PATH="dist/mac/LLM Tracker.app"
    elif [ -d "dist/LLM Tracker.app" ]; then
        APP_PATH="dist/LLM Tracker.app"
    else
        echo -e "${YELLOW}⚠ Could not find packaged app, will run in development mode${NC}"
        APP_PATH=""
    fi

    # Copy to Applications if found
    if [ -n "$APP_PATH" ] && [ -d "$APP_PATH" ]; then
        echo -e "${BLUE}→ Installing to Applications folder...${NC}"

        # Remove old installation
        if [ -d "$INSTALL_DIR" ]; then
            rm -rf "$INSTALL_DIR"
        fi

        cp -R "$APP_PATH" "$INSTALL_DIR"
        echo -e "${GREEN}✓ Installed to $INSTALL_DIR${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Packaging skipped (electron-builder not configured)${NC}"
    echo -e "${YELLOW}  Desktop app can be run with 'npm start' from desktop-app directory${NC}"
fi

echo ""

# Step 3: Install Native Messaging Host
echo -e "${BLUE}→ Installing Native Messaging Host...${NC}"

# Prompt for Chrome extension ID
echo -e "${YELLOW}  Enter your Chrome extension ID:${NC}"
echo -e "  ${YELLOW}(You can find this at chrome://extensions after loading the extension)${NC}"
read -p "  Extension ID: " EXTENSION_ID

if [ -z "$EXTENSION_ID" ]; then
    echo -e "${RED}✗ Extension ID is required${NC}"
    exit 1
fi

cd "$NATIVE_HOST_DIR"
node install.js "$EXTENSION_ID"

echo ""

# Step 4: Chrome Extension setup instructions
echo -e "${BLUE}→ Chrome Extension Setup${NC}"
echo -e "${YELLOW}  To complete the installation:${NC}"
echo -e "  1. Open Chrome and navigate to chrome://extensions"
echo -e "  2. Enable 'Developer mode' (toggle in top right)"
echo -e "  3. Click 'Load unpacked'"
echo -e "  4. Select: ${PROJECT_ROOT}/chrome-extension"
echo -e "  5. Copy the extension ID and verify it matches: ${EXTENSION_ID}"
echo ""

# Step 5: Final instructions
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Installation Complete! 🎉          ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Load the Chrome extension (see instructions above)"
echo -e "  2. Open the desktop app from Applications or run:"
echo -e "     ${YELLOW}cd $PROJECT_ROOT/desktop-app && npm start${NC}"
echo -e "  3. Visit ChatGPT, Claude, or Gemini"
echo -e "  4. Start chatting - tracking begins automatically!"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo -e "  • Run tests:       ${YELLOW}npm test${NC}"
echo -e "  • Start desktop:   ${YELLOW}cd desktop-app && npm start${NC}"
echo -e "  • Uninstall:       ${YELLOW}./uninstall.sh${NC}"
echo ""
echo -e "${GREEN}For help and documentation, see README.md${NC}"
echo ""
