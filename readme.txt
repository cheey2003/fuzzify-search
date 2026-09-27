=== Fuzzify Search – Add Instant Search Results for Static Sites ===
Contributors: cheey2003
Tags: search, fuzzy search, instant search, static site, typo tolerant
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Instant, typo-tolerant search that runs in the browser. Works in static site exports and on live sites, with no external service.

== Description ==

**Search for static WordPress sites, and typo-tolerant instant search for live ones.**

Fuzzify Search writes one JSON index of your content and searches it in the visitor's browser with [Fuse.js](https://www.fusejs.io/), an established open-source fuzzy-search library. Nothing runs on your server at search time, so it keeps working in a static HTML export, where WordPress' own search, `admin-ajax.php` and live-search plugins that ask the server for results have nothing to talk to.

It suits live dynamic sites too: an instant results dropdown on your existing search boxes, typos forgiven, results you rank yourself, and no external service or account.

**Free, with nothing to sell.** There is no Pro version and no upsell. Nothing a visitor types is sent to your server or to anyone else. The browser downloads the index file from your own site once, and searches it locally.

**Built for static exports**

* Tested with the free Simply Static plugin. The index is rebuilt at the start of each export and included in it, together with the results page and the plugin's scripts. Simply Static Pro is not needed. If you want extended search operators or pattern-based URL exclusion, Simply Static Pro's own Fuse.js integration covers those.
* After an export, search works with PHP switched off: the dropdown, the results page, and old `/?s=term` addresses, which are forwarded to the results page.
* Addresses are relative to the site root, so links still work when the static export is published on a different domain than WordPress itself runs on, which is the normal case for a static-site workflow.
* Only Simply Static hooks in automatically. With another exporter, add the index file to the export yourself; its address is shown on the settings screen.

**Search**

* Enhances the default WordPress search and the core Search block directly, the moment it's active: an instant results dropdown on the search box already there, no new widget or shortcode needed.
* An instant results dropdown on every standard WordPress search field.
* Typos are forgiven in titles, categories and tags, and SKUs. Every word typed must match.
* Words that matched are highlighted, and a short piece of text around the match is shown when the words were found in the excerpt or body. When they matched a category or tag instead, that category or tag is shown ("Filed under: …"), so no result appears without a reason.
* Chinese and other languages written without spaces work, including input-method composition. Keyboard and screen reader support is built in.

**Index**

* Choose the post types and fields: excerpt, content, categories, tags and other terms, and product SKU. The title is always searched.
* Cap the body text kept per item to keep the index small on large sites.
* Hide a single item from search with a box on its edit screen. Password-protected posts are indexed by title only.
* WooCommerce: Cart, Checkout and My account are left out, and so are products set to hidden or "shop only".
* The index is rebuilt shortly after content is published, changed or removed, when settings are saved, from the settings screen, and with `wp static-search rebuild`.

**Ranking**

* Sort rows to set which field counts most (title, categories and tags, SKU, excerpt, body text), and which post type counts most when several are searched.
* A "Try it" box on the settings screen shows the ranked results, and which field each matched in, using the values in the form as you change them.

**Results page**

* A Search page is created when you activate the plugin. Pressing Enter in a search box opens it. It can be switched off, or pointed at another page that contains the `[static_search_results]` shortcode.
* The results page is set to `noindex`.

**For developers**

* Filters: `static_search_settings`, `static_search_include_post`, `static_search_item`, `static_search_config` and `static_search_selector` (PHP only; there is no field for it on the settings screen). Action: `static_search_index_built`.
* A script API: `window.StaticSearch.search( 'query', { type: 'product' } )` returns a promise of results.
* WP-CLI: `wp static-search rebuild` and `wp static-search status`.
* Colours come from CSS custom properties, with a dark variant.

= Bundled libraries =

* Fuse.js 7.5.0, Apache-2.0, https://github.com/krisk/Fuse. Bundled into the search scripts.
* SortableJS 1.15.7, MIT, https://github.com/SortableJS/Sortable. Bundled into the settings screen script only.
* Select2 4.1.0, MIT, https://github.com/select2/select2. The unmodified release files in `assets/vendor/select2/`, used on the settings screen only.

The licence texts are in `assets/js/` and `assets/vendor/select2/`. The scripts in `assets/js/` are minified builds; the source is in the [public repository](https://github.com/cheey2003/fuzzify-search).

== Installation ==

1. Upload the `fuzzify-search` folder to `/wp-content/plugins/`, or install the plugin from Plugins → Add New.
2. Activate it. Activation creates a **Search** page (the results page) and builds the first index. Pretty permalinks need to be on for the results page to work in a static export.
3. Open Settings → Fuzzify Search to choose what is indexed and how results are ranked. The Index box at the top shows the index file and when it was built.
4. Use any standard search box: the Search block, a search widget or your theme's own. It is enhanced automatically.
5. For a static site, run your Simply Static export as usual. The index is rebuilt at the start of the export and included in it. Serve the output from any static host, then try a search.
6. If SearchWP Live Ajax Search is active, deactivate it. Fuzzify Search leaves any search field that plugin has taken over alone.
7. Clear any page cache so pages pick up the new script.

== Frequently Asked Questions ==

= How is it different from other search plugins? =

Most search plugins, including fast, typo-tolerant ones, still need something running on your server: a database query, a REST endpoint, or an AJAX request answered on every keystroke. None of that works once a site is exported to static HTML, because there is no PHP left to ask. Fuzzify Search moves the work into the visitor's browser instead: it downloads one index file once, and searches it locally from then on. That is what makes it work in a static export, and on a live site it means no server request per search either. The trade-off is that every visitor downloads the whole index the first time they search, so it suits small and medium sites best (see "Will it work on a large site?" below).

= Does it work in a static HTML export? =

Yes, that is what it is for. It has been tested with the free Simply Static plugin: after an export, search works with no PHP at all. The dropdown, the results page and old `/?s=term` addresses all run in the browser, from one index file that is part of the export.

= Which static site tools does it work with? =

It is built for the free Simply Static plugin, which it hooks into so that the index is rebuilt and included automatically. With another exporter, add the index file to the export yourself: its address is shown on the settings screen. The index is loaded by a script rather than linked from a page, so an exporter may not find it on its own.

= Is there a Pro version? =

No. There is no Pro version and no upsell: everything the plugin does is available to everyone.

= Does it send data anywhere, or use cookies? =

No. It makes no requests to other sites, sets no cookies and uses no browser storage. The only request it adds is the visitor's browser downloading the index file from your own site's uploads folder.

= Will it work on a large site? =

Every visitor downloads the whole index the first time they search, so it suits small and medium sites best. Use the content length limit, and search fewer fields, to keep the file small. The settings screen warns you when the index passes 2 MB.

= Does it work with WooCommerce? =

Yes, in two ways. WooCommerce's own Product Search widget and block are enhanced too: that form marks itself with a hidden `post_type` field, which Fuzzify Search detects and uses to keep results to products only, in the dropdown and on the results page. And products themselves are searched by title, description, categories, tags and SKU, with the title and a thumbnail shown in results. Cart, Checkout and My account, and products set to hidden or "shop only", are left out. It is a search box, not a product filter: there are no prices or attribute filters in the results.

= Does it work with my theme's search box, the default WordPress search, or the Search block? =

It enhances every standard search field (`input[type="search"][name="s"]`), including the Search block, widgets and most theme headers, and adds no search box of its own. To enhance a different field, change the selector with the `static_search_selector` filter (PHP, in a theme or site plugin; there is no setting for it). The colours come from CSS custom properties, with a dark variant.

= Is there a shortcode to add a search box? =

No. The one shortcode this plugin registers, `[static_search_results]`, builds the results page: the title, status line and the list the script fills in. It does not place a search box. A search box has to already be on the page, such as the Search block, a search widget or your theme's own, for the plugin to enhance it.

= Can I keep one page or product out of search? =

Yes. Tick "Hide this item from search" in the Fuzzify Search box on its edit screen. Hidden items are listed on the settings screen.

= Where is the index stored? =

In one JSON file in `wp-content/uploads/static-search/`. Uninstalling the plugin removes it, along with the settings. The results page it created is left in place.


== Changelog ==

= 0.1.0 =
* First release on WordPress.org.
