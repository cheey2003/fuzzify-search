import { resultsHref } from './url.js';

/**
 * Send an old-style search address to the results page.
 *
 * A live WordPress site answers /?s=term (and /shop/?s=tea&post_type=product) with its own results
 * page. A static host serves the plain page and ignores the query, so anything that still links to
 * such an address (bookmarks, other sites) would land on the homepage. On those pages this forwards
 * the visitor to the results page instead.
 *
 * The server only includes this script on pages WordPress did not render as a search page, so on a
 * live site the native results page is left alone.
 *
 * @param {string}   resultsUrl Path of the results page.
 * @param {Location} loc        The location to read from and redirect (window.location).
 * @return {boolean} Whether the visitor was forwarded.
 */
export function forward( resultsUrl, loc ) {
	if ( ! resultsUrl ) {
		return false;
	}
	const params = new URLSearchParams( loc.search );
	const term = ( params.get( 's' ) || '' ).trim();
	// Nothing to search for, or already an address the results page understands.
	if ( ! term || ( params.get( 'q' ) || '' ).trim() ) {
		return false;
	}
	// replace(), not assign(): the old address must not stay in history, or Back would bounce straight here again.
	loc.replace( resultsHref( resultsUrl, term, params.get( 'post_type' ) || '' ) );
	return true;
}
