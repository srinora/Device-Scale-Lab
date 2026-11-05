# DeviceScale Lab

**Version 0.01.261105.01 · GPL-3.0-only**

A local-first workspace for comparing UI mockups across device sizes. Create one shared rectangle layout, add description text, and compare its appearance on phones, tablets, and custom displays.

## Download and go

1. Download this project as a ZIP (on GitHub: **Code → Download ZIP**).
2. Extract it into a folder you want to keep.
3. Double-click **index.html**, or open it with **Safari** or Chrome.

No installation, account, build step, package manager, or server is required. You do **not** need `npm ci`, `npm start`, or localhost to use the app. Keep `LICENSE` with the app when sharing it. The app and monitor catalog work offline; website previews and manufacturer links need an internet connection.

For a quick first layout, choose **Rectangles**, click a box on a device to edit its name and description, then choose **Physical 1:1** and adjust the ruler slider. Use **Export project** to share an editable `.dslab` file. Your latest rectangle workspace and ruler visibility also save locally.

## Interactive website previews

1. Choose **URL** under **02 / Mockup content**.
2. Enter an HTTP or HTTPS website address and click **Preview website**.
3. Click, type, submit forms, and scroll **directly inside each device preview**, where the website supports embedding. Each device has its own page view.

This restores the original inline preview workflow. There is no separate Chrome session, capture refresh step, or browser companion to run. The live calibration slider, Hide/Show ruler toggle, rectangle descriptions, autosave, and `.dslab` sharing remain available.

### Safari cookies and sign-in

The previews run in the browser where you opened the app. External websites keep their own origin and can request storage access through the browser. DeviceScale Lab does not read, copy, or import your Safari cookies.

An existing Safari sign-in is **not guaranteed** inside a preview. Safari blocks third-party cookies by default; a website may need to implement the Storage Access API and ask you for access. Cookie attributes and the site's authentication flow can also prevent embedded sign-in. See [WebKit's explanation of third-party cookies and authenticated embeds](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/).

### When a website cannot load

Sites such as Apple and Google may refuse embedding through `X-Frame-Options` or Content Security Policy. Existing cookies do not remove those restrictions. DeviceScale Lab reports **Preview requested**, because a cross-origin frame cannot reliably report successful rendering to the app. See [the browser's embedding rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options).

**Can DeviceScale Lab fix this?** No. A normal web app cannot override a website's `X-Frame-Options` or CSP `frame-ancestors` restrictions in Safari or Chrome. The website owner controls whether embedding is allowed.

- **A website you control:** configure its response headers to permit the intended preview origin, checking both `X-Frame-Options` and CSP `frame-ancestors`.
- **A website you do not control:** DeviceScale Lab cannot change its response headers. Interactive previews require the website to allow embedding.
- **Cookies and login:** signing in or reusing existing cookies does not bypass embedding restrictions.

For blocked websites, use **Image** mode with a screenshot to compare physical size, or **HTML** mode with a responsive mockup you control. Changing preview settings rebuilds embedded pages, so finish any form interaction before rotating or recalibrating. Login flows that require popups or top-level navigation may not work in the sandbox. Pasted/uploaded HTML keeps a separate, restricted origin.

### Moving back from the companion version

File pages and localhost have separate workspace storage. If the previous helper is still running, first export any layout you need from the old localhost page, then press **Ctrl+C** in its Terminal window. Open `index.html` directly in Safari and use **Open project** to import the exported layout. Named workspaces already saved in Safari at the same file location remain there.

The old `.devicescale-browser/` folder is no longer used. It remains ignored by Git because it may contain login data from the previous version; do not include it in shared ZIPs.

## Compare devices

1. Choose a device in **01 / Add a display**, then click **Add to comparison**. Custom displays accept a name, native resolution, diagonal, and DPR.
2. Choose **Rectangles**, **Live demo**, **Image**, **HTML**, or **URL** as your content source.
3. Rotate devices individually or together. Reorder them with the drag handle or arrow controls; use × to remove a preview.
4. Choose **Fit All** to fit the comparison into the workspace, or **Physical 1:1** for a calibrated physical-size view. Large comparisons can scroll.

Native resolution means hardware pixels. Rectangle dimensions in `px` use logical CSS pixels; `%` values use each preview's logical viewport. Device DPR converts between those two scales. Display dimensions are estimated from native aspect ratio and diagonal, so rounded corners and cutouts reduce the visible area.

## Set your viewing monitor and calibrate

In **03 / Your viewing monitor**, filter by **Brand** and **Size class**, then choose your monitor or MacBook model. Selecting a model fills **only the physical diagonal**. Its native resolution appears as reference information with a manufacturer link. Your resolution and DPR remain under your control.

Set the resolution and browser DPR for your display setup, or choose a common resolution preset. A resolution preset changes width and height only. Editing the diagonal yourself switches the model to **Custom**. Changing display inputs clears the old calibration.

The bundled catalog was checked on **2026-11-05** and contains:

| Brand / family | Coverage |
| --- | --- |
| Apple displays | Studio Display (2022 and 2026), Studio Display XDR, Pro Display XDR |
| AOC | Eight selected 27-, 32-, 34-, and 49-inch models |
| Dell | Eight UltraSharp models in 27-, 32-, 34-, 40-, 43-, and 49-inch classes |
| MacBook Air | M1 through M5; 13-inch and, from M2, 15-inch models |
| MacBook Pro | M1 onward: 13-, 14-, and 16-inch models where offered, including M6 and the 2026 PROLED XDR variants |

External monitor coverage starts at the 27-inch class. Size classes use marketed names; the applied diagonal uses the manufacturer's published measurement (for example, 31.5 inches for a 32-inch model). Pro and Max chip variants with the same display are grouped together. Announced models with a later availability date are identified in the model details. This is a curated offline reference, not a live product feed or an exhaustive AOC/Dell catalog.

Sources are linked on every catalog entry in the app. Apple model coverage follows its [MacBook Air identification guide](https://support.apple.com/en-us/102869), [MacBook Pro identification guide](https://support.apple.com/en-us/108052), and current [MacBook Pro display specifications](https://www.apple.com/macbook-pro/proled-xdr-display/specs/). Monitor examples use manufacturer specifications such as [AOC U27P3C](https://saas.aoc.com/product/U27P3C) and [Dell U4025QW](https://www.dell.com/en-us/shop/dell-ultrasharp-40-curved-thunderbolt-hub-monitor-u4025qw/apd/210-bmdp).

For live calibration, use the **Smaller ↔ Larger** slider below the previews. Adjust until the 0–10 cm line measures **100 mm** with a physical ruler. Physical 1:1 previews update immediately. The −/+ buttons change density by 0.25 CSS px/in, and the numeric field allows precise entry. Your adjustment saves when you finish, and again when leaving the page. **Hide ruler / Show ruler** collapses or restores the whole panel and remembers your preference without resetting calibration.

The slider normally covers 25–400 CSS px/in and expands for existing values outside that range. Numeric calibration supports 1–5000 CSS px/in. Slider changes preserve logical viewport sizes; embedded pages may reload when the previews redraw.

Alternatively, use measured-length calibration:

1. Click **Calibrate real-world size** (or **Calibrate** beside the reference ruler).
2. Measure the displayed 0–10 cm line with a physical ruler. Its target length is 100 mm.
3. Enter the length you actually measured in millimeters and apply the calibration.
4. Select **Physical 1:1** and check the ruler again. Repeat if necessary.

The reference ruler stays independent of Fit All scaling and device order. Calibration is local to this browser/display setup. Recheck after changing browser zoom, display scaling, or moving the window to another monitor. A curved screen or rounded display is only approximately represented by the rectangular size calculation.

## Edit rectangle objects

Choose **Rectangles**, then add or select an object. You can also click a rectangle directly on any device to open its properties popup. Keyboard users can focus a rectangle and press Enter or Space; Escape closes the popup.

- Give each object a **Name** for identification.
- Add **Description text** to show text inside the rectangle on every preview and in PNG exports.
- Set position and dimensions using logical pixels or percentages, plus fill color and opacity.
- Drag a rectangle to move it; drag its lower-right handle to resize it.
- Duplicate or delete objects, and move them forward or backward through the layers.

Description text is plain text, supports line breaks, and is limited to 1,000 characters. It wraps within the rectangle with 8 logical pixels of padding, a 14-pixel font, and an 18-pixel line height. Overflow is clipped. Text automatically uses black or white for contrast with the fill. The object's opacity also applies to its text.

## Autosave and named workspaces

The latest rectangle workspace is saved automatically as you edit, and again when the page is hidden or closed. Reopening the app restores its devices, rectangles, names, descriptions, display options, viewing-monitor settings, and calibration. Check the save status at the bottom of the sidebar.

The app uses **localStorage**, not cookies. Use the same browser/profile and the same file location to find your previous work. Browsers control storage for local files; moving or renaming the app, clearing browser data, private browsing, or storage limits can affect persistence. If saving fails, the app displays an error and you can export a file.

Use **Workspaces** to keep named copies:

- **Save new:** store the current layout under a unique name (up to 64 characters).
- **Update:** replace the selected saved copy with your current layout and name, after confirmation.
- **Load:** open a saved copy, replacing the current layout after confirmation.
- **Delete:** remove a saved copy after confirmation; the currently open layout stays available.
- **Export:** download the selected saved copy without loading it first.

Autosave preserves your latest edits separately from named copies. Use **Update** when you want to change a named copy. Loading or importing a layout keeps the receiving computer's viewing-monitor settings and calibration. Resetting the current workspace leaves named copies in the library.

Images, uploaded/pasted HTML, and website URLs are session-only. They are not included in autosave or named copies; reopening a non-rectangle session shows the demo. Exported rectangle projects still include the shared rectangle layout.

## Share and export

**Export project** downloads the current layout as a `.dslab` file. To hand it over, send that file with this app folder. The recipient opens `index.html`, clicks **Open project**, chooses the `.dslab` file, and confirms replacement. Use **Workspaces → Save new** to keep a named local copy of an imported project.

Project files include the workspace name, device configurations, rectangle objects and descriptions, canvas background, and view options. They exclude viewing-monitor calibration and session-only image/HTML/website content. Version 2 files include the app version; older version 1 files import with empty descriptions and the name “Imported workspace”. Unsupported or malformed files are rejected before replacing the current layout.

**Export PNG** downloads a comparison image in Rectangles or Image mode. Rectangle exports include description text. Demo, HTML, and Website modes cannot export PNGs. Websites may block iframe embedding, and some HTML dependencies need internet access.

## Development

The runtime is contained in `index.html`, including styles, catalog data, and JavaScript. There are no external runtime dependencies. `package.json` and the pinned Playwright development dependency are only for automated tests.

To maintain the catalog, edit `MONITOR_CATALOG`, verify the manufacturer's diagonal and native resolution, retain its source link, and update `MONITOR_CATALOG_CHECKED`. Catalog data never dictates the user's resolution or DPR.

Run the automated logic tests with Node.js (only needed for development):

```sh
node --test tests/project.test.cjs
```

For development browser checks, install Node.js 22+ and Google Chrome, then run:

```sh
npm ci
npm test
npm run test:browser
```

Browser tests use temporary Chrome profiles and a local fixture website. They check direct in-device interaction, blocked embedding, sandbox isolation, calibration, autosave, and narrow layouts. They do not access personal login data. These Chrome tests do not establish compatibility with Safari sign-in flows.

For manual Safari checks, open `index.html` directly. Check autosave/reopen, named workspace save/load/update/export, description rendering and PNG output, project import, monitor filtering and manual resolution overrides, and ruler calibration. A physical ruler is required to judge real-world accuracy.

Before pushing changes, run the tests above and `git diff --check`. Commit `package-lock.json` with dependency changes. `.gitignore` excludes OS metadata, temporary editor files, local environment files, dependencies/build output, generated comparison PNGs, and legacy browser profile data. Project `.dslab` files and reference images can be versioned intentionally.

## License

DeviceScale Lab is licensed under the **GNU General Public License, version 3 only** (`GPL-3.0-only`). See [LICENSE](LICENSE) for the complete terms. The software is provided without warranty. Product names identify compatible/reference devices; they do not imply manufacturer endorsement.
