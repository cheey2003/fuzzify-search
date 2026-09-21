# Fuzzify Search

Fuzzify Search adds instant, typo-tolerant search to WordPress that runs entirely in the visitor's browser. It writes one JSON index of your content and searches it with Fuse.js, so search behaves the same on the live site and in static HTML exports, where WordPress's own live search has no `admin-ajax.php` and no PHP results page to rely on. There is no server call at search time and no need for Simply Static Pro. You choose what is indexed, drag to set how results are ranked, and decide whether Enter opens a results page.

- **Version:** 0.1.0
- **Author:** Tangency
- **Requires:** WordPress 6.0, PHP 7.4
- **Settings:** Settings → Fuzzify Search
- **License:** GPL-2.0-or-later (bundles [Fuse.js](https://www.fusejs.io/) 7.5.0, Apache-2.0, and, on the settings screen only, [SortableJS](https://sortablejs.github.io/Sortable/) 1.15.7 and [Select2](https://select2.org/) 4.0.13, both MIT)

## Install

1. Copy this folder to `wp-content/plugins/fuzzify-search/` (the built script `assets/js/static-search.js` is included, so Node is not needed).
2. Activate it. Activation creates a **Search** page (the results page) and builds the first index.
3. If SearchWP Live Ajax Search is active, deactivate it. Fuzzify Search leaves any field that plugin has taken over alone.
4. Clear any page cache so pages pick up the new script.

Fuzzify Search is the new name of **Static Search** (versions up to 0.2.0), which lived in `subsite-static-search/`. If you installed that version, deactivate and delete it before activating this one: both read the same settings, and they cannot be active together.

## Settings

| Setting | What it does |
|---|---|
| Post types | Which content is searched. Default: everything WordPress' own search covers. |
| Fields to search | Excerpt, content, categories/tags/other terms, product SKU. The title is always searched. |
| Content length limit | Caps the body text kept per item, to keep the index small on large sites. |
| WooCommerce | Leaves out Cart, Checkout and My account. Products set to hidden or "shop only" are always left out. |
| Result ranking | Drag-and-drop order of Title, Categories and tags, SKU, Excerpt and Body text, and, when several post types are searched, of the post types. See below. |
| Try it | Type a search on the settings screen and see the ranked results and which field each matched in, using the values in the form as you change them. |
| Search box | Minimum characters, delay, results in the dropdown, typo tolerance, thumbnails, highlighted matches with a colour you choose (WordPress' own colour picker), and a text snippet under results that matched in the text. |
| Results page: Activate | Send Enter to the results page. Unticked, pressing Enter (or a Search button) in a search box does nothing; the instant-results dropdown still works, a highlighted result still opens on Enter, and there is no "View all" link. The settings below then dim and are ignored (their saved values are kept). |
| Results page: Page | The page Enter goes to, chosen from a searchable list (Select2). Must contain `[static_search_results]`. |
| Old search addresses | Forward `/?s=term` addresses to the results page. On by default. |
| Automatic rebuild | Rebuild shortly after content is published, changed or removed. |

### Result ranking

Both lists are drag-and-drop (SortableJS). Each row is a tab: drag it by the six-dot grip on its left, or use the arrow buttons on its right, which also work from the keyboard and with screen readers. The top row ranks first; no numbers are shown, the order on screen is the ranking.

- **Field priority.** A match in a field higher in the list always ranks above a match in a field lower down. Tick **Same priority as above** on a row to rank it together with the row above (the tab is tinted and drawn attached to the one above it). The defaults are Title, then Categories and tags together with SKU, then Excerpt, then Body text. Fields you don't search are ignored. Moving a row clears the "same priority" ticks around it, so a tie never quietly changes meaning.
- **Within a priority**, whole-word matches come before matches inside a word, exact matches before typos (typos are forgiven only in titles, categories/tags and SKUs), and equal matches are newest first.
- **Post type priority** (shown when more than one post type is searched). By default all types share one priority, which means no preference. *Only between equally good matches* orders, say, a Product and a Post that match equally well; a body-text match on a Product still ranks below a title match on a Post. *Before everything else* puts every result of the top type ahead of the next type's, whatever the field.
- **Try it.** Ranking changes show in the box straight away, before you save. Changes to what is indexed (post types, fields) show after you save, because the index is rebuilt then.

Under the hood each row saves a rank number (`ranking[field]`, `type_priority[type]`), so the same settings can be set with the `static_search_settings` filter.

To hide a single item, tick **Hide this item from search** in the *Fuzzify Search* box on its edit screen. Hidden items are labelled in the Posts / Pages / Products lists and listed on the settings screen. Password-protected posts are indexed by title only.

## For developers

**Filters**

| Filter | Purpose |
|---|---|
| `static_search_settings` | Override any setting at runtime. |
| `static_search_include_post` | `( bool $include, WP_Post $post )` — keep a post out of (or in) the index. |
| `static_search_item` | `( array $item, WP_Post $post )` — add fields or change an index entry. |
| `static_search_config` | Change what is passed to the script. |
| `static_search_selector` | CSS selector of the fields to enhance (default `input[type="search"][name="s"]`). |

**Events** — `static_search_index_built` fires after each build.

**Script API** — `window.StaticSearch.search( 'query', { type: 'product' } )` returns a promise of `[ { item, score, matched } ]` (`matched` lists the fields the words were found in); `window.StaticSearch.rescan()` enhances search fields added after load.

**Styling** — colours come from CSS custom properties (`--static-search-bg`, `--static-search-fg`, `--static-search-border`, `--static-search-hover`, `--static-search-muted`, `--static-search-mark`, `--static-search-shadow`; the highlight colour setting prints `--static-search-mark` for you); a `[data-scheme="dark"]` variant is included.

**SEO** — the results page is set to `noindex` through WordPress' robots filter and All in One SEO's. Other SEO plugins that print their own robots tag need the results page set to noindex in their settings.

**Source** — the scripts in `assets/js/` are minified builds of `src/`, which lives in the [GitHub repo](https://github.com/cheey2003/fuzzify-search) (the downloadable zip leaves it out). Rebuild with `npm install && npm run build`; test with `npm test`. The Select2 files in `assets/vendor/select2/` are the unmodified upstream release.

## Changelog

### 0.1.0 (2026-09-22)

First release as Fuzzify Search, ready for the WordPress.org directory. It continues Static Search (published on GitHub as `subsite-static-search`, versions up to 0.2.0), so the version number starts again here.

- **Renamed.** The plugin folder and text domain are `fuzzify-search`. Settings, hooks, filters, the shortcode, `window.StaticSearch` and the `wp static-search` command keep their names, so nothing else needs changing.
- **Rebuild errors.** The notice after a failed *Rebuild index now* uses fixed wording; the reason is listed in the warnings below it, as before.
- **Old search addresses.** The forwarding script is printed with WordPress' own script function.
- **Translations.** The plugin no longer loads its own translation files; WordPress.org provides them.

### Before the rename (Static Search)

#### Static Search 0.2.0 (2026-09-20)

- **Highlighted matches.** The words searched for are marked in result titles, in the dropdown and on the results page; `--static-search-mark` sets the colour. Only exact matches are marked, a word matched with a typo is not.
- **Text snippets.** When the words were found in a result's excerpt or body text rather than its title, a short piece of the text around the match is shown under it, in the dropdown and on the results page (which otherwise shows the start of the text). Screen readers read it as the result's description.
- **Settings.** Two checkboxes under *Search box*, *Highlight the words that matched* and *Show a piece of the text around the match*, both on by default, and *Highlight colour*, which uses WordPress' own colour picker.

#### Static Search 0.1.0 (2026-09-20)

First release.

- **Search.** An instant dropdown on every standard WordPress search field, powered by Fuse.js. Typos are forgiven in titles, categories and SKUs; every word must match; Chinese and other languages without spaces work, including input-method composition; keyboard and screen-reader support.
- **Index.** One JSON file in the uploads folder. Choose the post types and fields, cap the body text, hide single items, and skip WooCommerce cart, checkout and account pages and hidden products. Password-protected posts are indexed by title only. Rebuilt when content changes, when settings are saved, at the start of a Simply Static export, from the settings screen, and with `wp static-search rebuild`.
- **Results page.** A `/search/` page created on activation (set to `noindex`), with an *Activate* switch (off: Enter does nothing), a searchable page picker (Select2) and results per page.
- **Old addresses.** `/?s=term` addresses are forwarded to the results page on a static host; a live site's own results page is left alone.
- **Ranking.** Drag-and-drop field priority (with "Same priority as above"), post type priority, and a "Try it" box that ranks live from the unsaved form.
- **Static export.** The index and results page are exported by the free Simply Static; no Pro needed. All addresses are root-relative.
- **Developers.** Filters `static_search_settings`, `static_search_include_post`, `static_search_item`, `static_search_config` and `static_search_selector`; the `static_search_index_built` action; a `window.StaticSearch` script API; WP-CLI `rebuild` and `status`; uninstalling removes the settings, per-item flags and index file (the results page is left in place).
