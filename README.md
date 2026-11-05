# DeviceScale Lab

**Version 0.01.261105.01 · GPL-3.0-only**

A local-first workspace for comparing UI mockups across device sizes. Create one shared rectangle layout, add description text, and compare its appearance on phones, tablets, and custom displays.

## Choose how to run

| What you want to do | Start here |
| --- | --- |
| Design rectangles, compare images or HTML, calibrate physical size, save and share layouts | Open `index.html` directly; no installation needed. |
| Preview websites that block embedding, or sign in to a website | Run the optional browser companion, then open `http://127.0.0.1:8765`. |

For a quick first layout, choose **Rectangles**, click a box on a device to edit its name and description, then choose **Physical 1:1** and adjust the ruler slider. Use **Export project** to share an editable `.dslab` file. Your latest rectangle workspace and ruler visibility also save locally.

## Download and go

1. Download this project as a ZIP (on GitHub: **Code → Download ZIP**).
2. Extract the ZIP into a folder you want to keep.
3. Double-click **index.html**, or open it with Safari or Chrome.

The standalone app needs no installation, account, build step, package manager, or server. Keep `LICENSE` with the app when sharing it. The app and monitor catalog work offline; website previews and manufacturer links need an internet connection. The optional browser companion below requires Node.js and Chrome.

## Live websites and login: optional browser companion

Apple, Google, and many other sites prevent embedding inside another page. Choose **Browser companion** to open websites as top-level Chrome pages and display their viewport captures in DeviceScale Lab.

1. Install **Node.js 22 or newer** and **Google Chrome**.
2. Open Terminal in the extracted project folder and run:

   ```sh
   npm ci
   npm start
   ```

3. Open **http://127.0.0.1:8765** in Safari or Chrome. Keep Terminal running. If port 8765 is occupied, stop the other server before starting the companion.
4. Choose **URL → Browser companion**, enter the website address, and click **Preview website**.
5. Use **Interact / sign in** beneath a device to select its Chrome tab. Enter credentials and use the website directly in that window.
6. Return to DeviceScale Lab and choose **Refresh captures**. Use **Reload pages** when other device tabs need to pick up a changed login session. Optional **Auto-capture every 2 seconds** updates captures while the app is visible; it starts off.

The companion creates a tab for each device's logical viewport. It shares a dedicated login profile between those tabs and preserves that profile across restarts. Calibration, Fit All, and reordering preserve the tabs and their current URLs. Rotation resizes a tab; removing a device closes its tab. Preview website navigates all selected devices to the entered URL again. These are desktop Chrome pages at different viewport sizes, not native iOS browsers or touch-device emulation.

Captures are images; interact in Chrome using the per-device button. Some authentication providers may still reject automation-controlled browsers or require additional verification. The companion does not bypass those checks. It supports up to 12 devices, 8192 CSS pixels per side, 16 megapixels per viewport, and 48 megapixels combined. Reduce custom logical resolutions if these limits are exceeded.

**Stop browser** closes the companion's Chrome session while keeping its login profile. Ctrl+C in Terminal also stops the helper and its browser. Profile data lives in `.devicescale-browser/`, is excluded from Git, and is never included in `.dslab` exports. Captures stay in memory. To remove login data, stop the companion and delete that profile folder. Keep it out of shared ZIPs.

The helper listens only on `127.0.0.1`; API requests require the local app origin and a session token. The standalone `file://` app cannot connect directly. File and localhost pages have separate browser storage: **Export project** from your existing file-based workspace, then **Open project** in the companion app. Recalibrate in that view. Existing named copies remain in the original browser storage.

**Embedded preview** stays available for sites that allow framing. Its status reports a preview request, because it cannot reliably verify that a cross-origin website rendered successfully. If the helper stops, captures are marked disconnected; restart it and click **Connect**, then **Preview website**.

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

The slider normally covers 25–400 CSS px/in and expands for existing values outside that range. Numeric calibration supports 1–5000 CSS px/in. Slider changes preserve logical browser viewport sizes and website sessions.

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

The standalone runtime is contained in `index.html`, including styles, catalog data, and JavaScript, and has no external runtime libraries. The optional Node helper is in `companion/`, with a pinned Playwright dependency and lockfile. It uses a separate persistent Chrome context and captures viewport images through [Playwright](https://playwright.dev/docs/screenshots).

To maintain the catalog, edit `MONITOR_CATALOG`, verify the manufacturer's diagonal and native resolution, retain its source link, and update `MONITOR_CATALOG_CHECKED`. Catalog data never dictates the user's resolution or DPR.

Run the automated logic tests with Node.js (only needed for development):

```sh
node --test tests/project.test.cjs
```

After `npm ci`, run the helper/API tests and isolated Chrome integration tests:

```sh
npm test
npm run test:browser
```

Browser tests use temporary Chrome profiles and a local test login website; no personal credentials are required. They cover captures, session persistence, calibration, tab reuse, rotation/removal, disconnect recovery, and narrow layouts. API tests cover origin/token checks, navigation validation, and private-file isolation.

The current implementation passed 19 logic/API tests and 2 Chrome integration tests. Apple and Google homepages were also checked in the companion, along with helper startup, occupied-port reporting, and shutdown. These checks do not guarantee that a particular site's sign-in flow accepts automated Chrome. Safari has not been verified for this update.

Before pushing changes, run the tests above and `git diff --check`. Commit `package-lock.json` with dependency changes. Keep `node_modules/` and `.devicescale-browser/` out of commits and shared folders; the latter contains the companion's local login data.

For browser checks, open `index.html` directly. Check autosave/reopen, named workspace save/load/update/export, description rendering and PNG output, project import, monitor filtering and manual resolution overrides, and ruler calibration. A physical ruler is required to judge real-world accuracy.

`.gitignore` excludes OS metadata, temporary editor files, local environment files, the companion's private browser profile, dependencies/build output, and generated comparison PNGs. Project `.dslab` files and reference images can be versioned intentionally.

## License

DeviceScale Lab is licensed under the **GNU General Public License, version 3 only** (`GPL-3.0-only`). See [LICENSE](LICENSE) for the complete terms. The software is provided without warranty. Product names identify compatible/reference devices; they do not imply manufacturer endorsement.
