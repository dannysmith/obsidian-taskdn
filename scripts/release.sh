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
CURRENT_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
echo -e "Current version: ${BLUE}${CURRENT_VERSION}${NC}\n"

# Step 3: Ask for bump type
echo -e "Select version bump type:"
echo -e "  ${BLUE}1)${NC} patch  (${CURRENT_VERSION} -> x.x.+1)"
echo -e "  ${BLUE}2)${NC} minor  (${CURRENT_VERSION} -> x.+1.0)"
echo -e "  ${BLUE}3)${NC} major  (${CURRENT_VERSION} -> +1.0.0)"
echo ""
read -rp "Enter choice (1/2/3): " BUMP_CHOICE

case "$BUMP_CHOICE" in
    1) BUMP_TYPE="patch" ;;
    2) BUMP_TYPE="minor" ;;
    3) BUMP_TYPE="major" ;;
    *)
        echo -e "${RED}Invalid choice. Aborting.${NC}"
        exit 1
        ;;
esac

# Step 4: Run version-bump script (updates package.json, manifest.json, versions.json)
echo -e "\n${YELLOW}Bumping version (${BUMP_TYPE})...${NC}"
node version-bump.mjs "$BUMP_TYPE"
NEW_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
echo -e "${GREEN}Version updated: ${CURRENT_VERSION} -> ${NEW_VERSION}${NC}\n"

# Step 5: Show what will happen and ask for confirmation
echo -e "${YELLOW}The following git commands will be run:${NC}"
echo -e "  1. git add package.json manifest.json versions.json"
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

git add package.json manifest.json versions.json
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
