# Static Search

Static Search adds instant, typo-tolerant search to WordPress that runs entirely in the visitor's browser. It writes one JSON index of your content and searches it with Fuse.js, so search behaves the same on the live site and in static HTML exports, where WordPress's own live search has no `admin-ajax.php` and no PHP results page to rely on. There is no server call at search time and no need for Simply Static Pro. You choose what is indexed, drag to set how results are ranked, and decide whether Enter opens a results page.

- **Version:** 0.1.0
- **Author:** Tangency
- **Requires:** WordPress 6.0, PHP 7.4
- **Settings:** Settings → Static Search
- **License:** GPL-2.0-or-later (bundles [Fuse.js](https://www.fusejs.io/) 7.5.0, Apache-2.0, and, on the settings screen only, [SortableJS](https://sortablejs.github.io/Sortable/) 1.15.7 and [Select2](https://select2.org/) 4.0.13, both MIT)

## What visitors get

- A dropdown under every standard search field (`input[type="search"][name="s"]`): the theme's header search, the Search widget, the Search block, 404 and "no results" forms.
- Typo tolerance in titles, categories and SKUs ("cradel" finds "Cradle"). Excerpts and body text must match the word as typed, so results stay relevant.
- Results are ranked by field, and you choose the order (see *Result ranking* below). By default: the word in the title, then in a category, tag or SKU, then in the excerpt, then in the body text. Within a field, whole words come before parts of words, and equal matches are newest first. To leave categories and tags out of the search altogether, untick "Categories, tags and other taxonomy terms" in the settings.
- Every word must match, in any field ("baby oil" finds items with both).
- Chinese and other languages without spaces work; a single character is enough.
- Keyboard and screen-reader support (combobox pattern; arrow keys, Enter, Escape).
- Pressing Enter goes to a results page (`/search/?q=…`) built from the same index, unless you switch that off under *Results page → Activate*: then Enter does nothing and visitors use the dropdown.
- Old-style search addresses (`/?s=term`) that a static site can't answer are forwarded to that results page (see *Old search addresses* below).

## Install

1. Copy this folder to `wp-content/plugins/subsite-static-search/` (the built script `assets/js/static-search.js` is included, so Node is not needed).
2. Activate it. Activation creates a **Search** page (the results page) and builds the first index.
3. If SearchWP Live Ajax Search is active, deactivate it. Static Search leaves any field that plugin has taken over alone.
4. Clear any page cache so pages pick up the new script.

## Settings

| Setting | What it does |
|---|---|
| Post types | Which content is searched. Default: everything WordPress' own search covers. |
| Fields to search | Excerpt, content, categories/tags/other terms, product SKU. The title is always searched. |
| Content length limit | Caps the body text kept per item, to keep the index small on large sites. |
| WooCommerce | Leaves out Cart, Checkout and My account. Products set to hidden or "shop only" are always left out. |
| Result ranking | Drag-and-drop order of Title, Categories and tags, SKU, Excerpt and Body text, and, when several post types are searched, of the post types. See below. |
| Try it | Type a search on the settings screen and see the ranked results and which field each matched in, using the values in the form as you change them. |
| Search box | Minimum characters, delay, results in the dropdown, typo tolerance, thumbnails. |
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

To hide a single item, tick **Hide this item from search** in the *Static Search* box on its edit screen. Hidden items are labelled in the Posts / Pages / Products lists and listed on the settings screen. Password-protected posts are indexed by title only.

## How the index stays current

The index (`wp-content/uploads/static-search/index.json`) is rebuilt:

- shortly after content is published, changed, unpublished or deleted (debounced, via WP-Cron);
- when the settings are saved;
- at the start of every Simply Static export, if Simply Static is installed;
- on demand: **Rebuild index now**, or `wp static-search rebuild`.

## Static export

The index is an ordinary file in the uploads folder and the results page is an ordinary page, so an exporter that copies uploads and crawls pages carries both across. With the free Simply Static nothing needs configuring: its uploads crawler includes `.json` files, and the plugin also adds the file to Simply Static's extra-files list. All addresses in the index and in the script settings are root-relative, so they stay valid on whatever host the export is served from, as long as it is served at the same path as the site (the site root, normally).

With another exporter, make sure `wp-content/uploads/static-search/index.json` and the results page are included, and run `wp static-search rebuild` before exporting.

### Turning the results page off

With **Results page → Activate** unticked the plugin never sends anyone to a results page: Enter (and any Search button) does nothing, the "View all N results" link is not shown, and old `/?s=term` addresses are not forwarded (there is nowhere to send them). Search then works entirely through the dropdown, so consider raising *Results in the dropdown* under Search box. If it is ticked but no results page exists (deleted, unpublished, or "None" chosen), Enter is left to the browser and a warning is shown on the settings screen.

### Old search addresses

A live WordPress site answers `/?s=term` with its own results page. A static host can't: it serves the plain page and ignores the query, so a bookmark or another site's link to `/?s=term` would land on the homepage. With **Old search addresses** on (the default), the plugin prints a 362-byte script at the top of every page's `<head>` that forwards such an address to the results page, keeping a post type restriction (`/shop/?s=tea&post_type=product` goes to `/search/?q=tea&type=product`). It uses `location.replace`, so the old address doesn't stay in the Back button's history, and it works even if the main search script fails to load.

The script is left out of pages WordPress renders as search results, so on a live site WordPress' own results page for `/?s=term` is untouched. It only acts when `s` has a term and `q` is absent, so it can't loop. Not covered: WordPress' other pretty search address, `/search/term/`, which a static host answers with a 404.

Pretty permalinks must be on: the results page lives at `/search/`.

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

**Styling** — colours come from CSS custom properties (`--static-search-bg`, `--static-search-fg`, `--static-search-border`, `--static-search-hover`, `--static-search-muted`, `--static-search-shadow`); a `[data-scheme="dark"]` variant is included.

**SEO** — the results page is set to `noindex` through WordPress' robots filter and All in One SEO's. Other SEO plugins that print their own robots tag need the results page set to noindex in their settings.

## Development

```
npm install
npm run build   # bundles src/ + Fuse.js into assets/js/static-search.js
npm test        # unit tests (matching) and DOM tests (dropdown, results page)
wp eval-file wp-content/plugins/subsite-static-search/tests/smoke.php   # index builder against the real site
```

`src/core.js` holds the matching and ranking logic, `src/frontend.js` the dropdown and results page, `src/admin.js` the settings screen's "Try it" box, `src/rank-lists.js` its drag-and-drop lists, and `src/forward.js` (built into the tiny inline `assets/js/static-search-forward.js`) the old-address forwarding. Commit the rebuilt `assets/js/static-search.js` with any change to `src/`.

Select2 is vendored into `assets/vendor/select2/` by `npm run build` (WordPress core does not ship it) and loaded, with jQuery, on the settings screen only.

When copying the plugin to a server, leave out `node_modules`, `src`, `tests`, `package*.json` and `build.mjs`.

## Changelog

### 0.1.0 (2026-09-20)

First release.

- **Search.** An instant dropdown on every standard WordPress search field, powered by Fuse.js. Typos are forgiven in titles, categories and SKUs; every word must match; Chinese and other languages without spaces work, including input-method composition; keyboard and screen-reader support.
- **Index.** One JSON file in the uploads folder. Choose the post types and fields, cap the body text, hide single items, and skip WooCommerce cart, checkout and account pages and hidden products. Password-protected posts are indexed by title only. Rebuilt when content changes, when settings are saved, at the start of a Simply Static export, from the settings screen, and with `wp static-search rebuild`.
- **Results page.** A `/search/` page created on activation (set to `noindex`), with an *Activate* switch (off: Enter does nothing), a searchable page picker (Select2) and results per page.
- **Old addresses.** `/?s=term` addresses are forwarded to the results page on a static host; a live site's own results page is left alone.
- **Ranking.** Drag-and-drop field priority (with "Same priority as above"), post type priority, and a "Try it" box that ranks live from the unsaved form.
- **Static export.** The index and results page are exported by the free Simply Static; no Pro needed. All addresses are root-relative.
- **Developers.** Filters `static_search_settings`, `static_search_include_post`, `static_search_item`, `static_search_config` and `static_search_selector`; the `static_search_index_built` action; a `window.StaticSearch` script API; WP-CLI `rebuild` and `status`; uninstalling removes the settings, per-item flags and index file (the results page is left in place).
