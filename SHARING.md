# Sharing and updating Langlock

Share https://github.com/not-modest/langlock — the README contains the download link and step-by-step installation instructions for Chrome and Comet.

The initial upload contains only the current version, 1.0.2. Older local ZIPs and browser-generated metadata are excluded by .gitignore.

For future versions:

1. Update the extension and increment the version in extension/manifest.json.
2. Run npm test and, for navigation/rule changes, npm run test:chrome.
3. Run python3 scripts/package.py to replace dist/langlock.zip with the latest build.
4. Commit and push the source and ZIP together. The README download link stays the same.

People who installed from GitHub must download the new ZIP, replace the files in their existing installation folder, and click Reload in their browser's extensions manager. See README.md.
