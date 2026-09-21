=== Fuzzify Search ===
Contributors: cheey2003
Tags: search, fuzzy search, instant search, static site, typo tolerant
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Instant, typo-tolerant search that runs in the visitor's browser. Works on live sites and in static HTML exports.

== Description ==

Fuzzify Search adds instant, typo-tolerant search to WordPress that runs entirely in the visitor's browser. It writes one JSON index of your content and searches it with Fuse.js, so search behaves the same on the live site and in static HTML exports, where WordPress' own live search has no `admin-ajax.php` and no PHP results page to rely on.

Nothing a visitor types is sent to your server or to anyone else. The browser downloads the index file from your own site once, and searches it locally. You choose what is indexed, drag to set how results are ranked, and decide whether Enter opens a results page.

**Search**

* An instant results dropdown on every standard WordPress search field.
* Typos are forgiven in titles, categories and tags, and SKUs. Every word typed must match.
* Words that matched are highlighted, and a short piece of text around the match is shown when the words were found in the excerpt or body.
* Chinese and other languages written without spaces work, including input-method composition. Keyboard and screen reader support is built in.

**Index**

* Choose the post types and fields: excerpt, content, categories, tags and other terms, and product SKU. The title is always searched.
* Cap the body text kept per item to keep the index small on large sites.
* Hide a single item from search with a box on its edit screen. Password-protected posts are indexed by title only.
* WooCommerce: Cart, Checkout and My account are left out, and so are products set to hidden or "shop only".
* The index is rebuilt shortly after content is published, changed or removed, when settings are saved, from the settings screen, and with `wp static-search rebuild`.

**Ranking**

* Drag rows to set which field counts most (title, categories and tags, SKU, excerpt, body text), and which post type counts most when several are searched.
* A "Try it" box on the settings screen shows the ranked results, and which field each matched in, using the values in the form as you change them.

**Results page**

* A Search page is created when you activate the plugin. Pressing Enter in a search box opens it. It can be switched off, or pointed at another page that contains the `[static_search_results]` shortcode.
* Old `/?s=term` addresses can be forwarded to the results page. The results page is set to `noindex`.

**Static exports**

* The index and the results page are exported by the free Simply Static plugin. Simply Static Pro is not needed. All addresses are root-relative.

**For developers**

* Filters: `static_search_settings`, `static_search_include_post`, `static_search_item`, `static_search_config` and `static_search_selector`. Action: `static_search_index_built`.
* A script API: `window.StaticSearch.search( 'query', { type: 'product' } )` returns a promise of results.
* WP-CLI: `wp static-search rebuild` and `wp static-search status`.
* Colours come from CSS custom properties, with a dark variant.

= Source code =

The scripts in `assets/js/` are minified builds. The readable source (`src/`), the build script and the tests are in the public repository: https://github.com/cheey2003/fuzzify-search

To rebuild the scripts, run `npm install && npm run build` in a checkout of that repository.

= Bundled libraries =

* Fuse.js 7.5.0, Apache-2.0, https://github.com/krisk/Fuse. Bundled into the search scripts.
* SortableJS 1.15.7, MIT, https://github.com/SortableJS/Sortable. Bundled into the settings screen script only.
* Select2 4.0.13, MIT, https://github.com/select2/select2. The unmodified release files in `assets/vendor/select2/`, used on the settings screen only.

The licence texts are in `assets/js/` and `assets/vendor/select2/`.

== Installation ==

1. Upload the `fuzzify-search` folder to `/wp-content/plugins/`, or install the plugin from Plugins → Add New.
2. Activate it. Activation creates a **Search** page (the results page) and builds the first index.
3. Open Settings → Fuzzify Search to choose what is indexed and how results are ranked.
4. If SearchWP Live Ajax Search is active, deactivate it. Fuzzify Search leaves any search field that plugin has taken over alone.
5. Clear any page cache so pages pick up the new script.

== Frequently Asked Questions ==

= Does it work in a static HTML export? =

Yes, that is what it is for. The index and the results page are exported by the free Simply Static plugin, and search then runs in the browser with no PHP. Old `/?s=term` addresses are forwarded to the results page on the static host.

= Does it send data anywhere, or use cookies? =

No. It makes no requests to other sites, sets no cookies and uses no browser storage. The only request it adds is the visitor's browser downloading the index file from your own site's uploads folder.

= Will it work on a large site? =

Every visitor downloads the whole index the first time they search, so it suits small and medium sites best. Use the content length limit, and search fewer fields, to keep the file small. The settings screen warns you when the index passes 2 MB.

= Can I keep one page or product out of search? =

Yes. Tick "Hide this item from search" in the Fuzzify Search box on its edit screen. Hidden items are listed on the settings screen.

= Where is the index stored? =

In one JSON file in `wp-content/uploads/static-search/`. Uninstalling the plugin removes it, along with the settings. The results page it created is left in place.

= I used the earlier version, called Static Search. =

Fuzzify Search is the new name of Static Search (versions up to 0.2.0, published on GitHub), which lived in the folder `subsite-static-search`. Deactivate and delete that version before activating this one. Both read the same settings, so nothing needs setting up again.

== Changelog ==

= 0.1.0 =
* First release on WordPress.org. Fuzzify Search continues the plugin published on GitHub as Static Search (up to 0.2.0), so the version number starts again. The plugin folder and text domain are `fuzzify-search`. Settings, hooks, filters, the shortcode, `window.StaticSearch` and the `wp static-search` command keep their names.
