#!/bin/bash

#################################################################
# LLM Tracker Uninstaller for macOS
#################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    LLM Tracker Uninstaller            ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Confirm uninstallation
echo -e "${RED}This will remove LLM Tracker from your system.${NC}"
read -p "Continue? (y/N): " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Uninstallation cancelled."
    exit 0
fi

echo ""
echo -e "${BLUE}→ Removing Native Messaging Host...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT/native-host"
node install.js uninstall

echo -e "${GREEN}✓ Native Messaging Host removed${NC}"
echo ""

# Remove desktop app
echo -e "${BLUE}→ Removing Desktop Application...${NC}"
INSTALL_DIR="/Applications/LLM Tracker.app"

if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}✓ Desktop app removed from Applications${NC}"
else
    echo -e "  Desktop app not found in Applications"
fi

echo ""

# Remove data (optional)
DATA_DIR="$HOME/.llm-tracker"
if [ -d "$DATA_DIR" ]; then
    read -p "Remove all data and database? (y/N): " REMOVE_DATA

    if [[ "$REMOVE_DATA" =~ ^[Yy]$ ]]; then
        rm -rf "$DATA_DIR"
        echo -e "${GREEN}✓ Data removed${NC}"
    else
        echo -e "  Data preserved at: $DATA_DIR"
    fi
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Uninstallation Complete!          ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}To remove the Chrome extension:${NC}"
echo -e "  1. Open chrome://extensions"
echo -e "  2. Find 'LLM Tracker'"
echo -e "  3. Click 'Remove'"
echo ""
