<p align="center"><img src="extension/icons/icon-128.png" width="96" alt="Langlock logo"></p>

# Langlock

**Keep Google Scholar in your language.** Langlock automatically fixes Scholar links that open in another interface language. English is the default, with 14 languages to choose from.

It changes menus and labels, not paper titles or author-written content. Works in Chrome and has been tested in Comet. No account, server, or analytics.

## Install — no coding required

1. **[Download the latest Langlock ZIP](https://github.com/not-modest/langlock/langlock.zip)** and unzip it.
2. Move the extracted folder to a permanent location, such as `Documents/Langlock`. Keep it there after installation.
3. Open your browser's extensions page by typing this into the address bar:
   - **Chrome:** `chrome://extensions`
   - **Comet:** `comet://extensions`
4. Turn on **Developer mode** using the switch near the top right.
5. Click **Load unpacked**. Select the extracted **folder containing `manifest.json`**, then confirm. Select the folder, not the ZIP or the manifest file itself.
6. Open or refresh Google Scholar. **English is enabled immediately.**

Open the browser's puzzle-piece Extensions menu and pin **Langlock** for quick access. Click its icon to choose another language or turn the override off. Changes save automatically; reload Scholar afterward.

**If you used GitHub's Code → Download ZIP instead:** unzip the repository and select its `extension` subfolder in step 5. The dedicated download above is simpler.

### Try it

[Open this German-language Scholar link](https://scholar.google.com/citations?user=NKrwIH8AAAAJ&hl=de). With Langlock enabled in English, the address changes to `hl=en` and the page shows English controls such as “Cited by”.

### Update or uninstall

GitHub installs do **not** update automatically. To update:

1. Download and unzip the latest ZIP using the same link above.
2. Replace the files inside your existing Langlock folder with the new files. Keep the folder path unchanged.
3. Open the extensions page and click **Reload** on Langlock's card, then refresh Scholar.

To uninstall, click **Remove** on Langlock's card. If you see “Manifest file is missing,” select the folder containing `manifest.json`, not its parent. Managed work/school browsers may restrict Developer mode.

## Languages

English, German, Spanish, French, Italian, Japanese, Korean, Dutch, Polish, Portuguese, Russian, Turkish, Simplified Chinese, and Traditional Chinese.

## Privacy and scope

Langlock uses local browser navigation rules. It has no content scripts, does not collect page content, and sends no data to an external service. Access is restricted to the 16 Google Scholar hosts listed in `extension/manifest.json`. It redirects top-level GET navigation only; other sites, embedded resources, and POST submissions are unaffected. Preferences stay in the browser and do not sync across devices.

The browser describes host access broadly as permission to read/change site data; Langlock uses that permission to change the `hl` language parameter. It is not affiliated with Google.

## Development

No build step or runtime dependencies. Load `extension/` directly to develop.

- `npm test` — unit tests for rules, host/request scope, and settings.
- `npm run test:chrome` — isolated browser integration checks; requires Node.js 22+, OpenSSL, and Chrome supporting the test extension-loading protocol. Set `CHROME_BIN` if needed. See `tests/chrome.mjs`.
- `python3 scripts/package.py` — rebuild `dist/langlock.zip` from current extension files, excluding browser-generated metadata.

Only version 1.0.2 was included in the initial publication. Future updates can be committed here; the download link stays the same.
