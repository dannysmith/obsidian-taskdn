#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

REPO_URL="https://github.com/dannysmith/obsidian-taskdn"

echo -e "${BLUE}=== Obsidian Taskdn Release Script ===${NC}\n"

# Step 1: Run checks
echo -e "${YELLOW}Running checks...${NC}"
if ! bun run check; then
    echo -e "\n${RED}Checks failed! Fix errors before releasing.${NC}"
    exit 1
fi
echo -e "${GREEN}All checks passed!${NC}\n"

# Step 2: Get current version
CURRENT_VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
echo -e "Current version: ${BLUE}${CURRENT_VERSION}${NC}"

# Step 3: Ask for new version
read -rp "Enter new version (e.g., 0.2.0): " NEW_VERSION

if [[ -z "$NEW_VERSION" ]]; then
    echo -e "${RED}No version entered. Aborting.${NC}"
    exit 1
fi

if [[ "$NEW_VERSION" == "$CURRENT_VERSION" ]]; then
    echo -e "${RED}New version is the same as current version. Aborting.${NC}"
    exit 1
fi

# Step 4: Update version in manifest.json and package.json
echo -e "\n${YELLOW}Updating versions...${NC}"

# Update manifest.json
sed -i '' "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" manifest.json
echo -e "  Updated manifest.json: ${CURRENT_VERSION} -> ${NEW_VERSION}"

# Update package.json
sed -i '' "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${NEW_VERSION}\"/" package.json
echo -e "  Updated package.json: ${CURRENT_VERSION} -> ${NEW_VERSION}"

echo -e "${GREEN}Version files updated!${NC}\n"

# Step 5: Show what will happen and ask for confirmation
echo -e "${YELLOW}The following git commands will be run:${NC}"
echo -e "  1. git add manifest.json package.json"
echo -e "  2. git commit -m \"Release ${NEW_VERSION}\""
echo -e "  3. git tag -s ${NEW_VERSION} -m \"${NEW_VERSION}\"  ${BLUE}(signed tag)${NC}"
echo -e "  4. git push"
echo -e "  5. git push origin ${NEW_VERSION}"
echo ""

read -rp "Run these git commands? (y/N): " CONFIRM

if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo -e "\n${YELLOW}Git commands skipped. Version files have been updated.${NC}"
    echo -e "You can manually run the git commands when ready."
    exit 0
fi

# Step 6: Run git commands
echo -e "\n${YELLOW}Running git commands...${NC}"

git add manifest.json package.json
echo -e "  ${GREEN}Staged files${NC}"

git commit -m "Release ${NEW_VERSION}"
echo -e "  ${GREEN}Created commit${NC}"

git tag -s "${NEW_VERSION}" -m "${NEW_VERSION}"
echo -e "  ${GREEN}Created signed tag${NC}"

git push
echo -e "  ${GREEN}Pushed to remote${NC}"

git push origin "${NEW_VERSION}"
echo -e "  ${GREEN}Pushed tag${NC}"

# Step 7: Print URLs
echo -e "\n${GREEN}=== Release ${NEW_VERSION} initiated! ===${NC}\n"
echo -e "${BLUE}Watch the build:${NC}"
echo -e "  ${REPO_URL}/actions\n"
echo -e "${BLUE}View/edit the release (after build completes):${NC}"
echo -e "  ${REPO_URL}/releases/tag/${NEW_VERSION}\n"
echo -e "${BLUE}All releases:${NC}"
echo -e "  ${REPO_URL}/releases"
