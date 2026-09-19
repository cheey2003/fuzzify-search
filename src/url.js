/**
 * Address of the results page for a query.
 *
 * @param {string} base  Results page path.
 * @param {string} query Query.
 * @param {string} [type] Post type slug to restrict to.
 * @return {string} URL.
 */
export function resultsHref( base, query, type ) {
	const glue = base.indexOf( '?' ) === -1 ? '?' : '&';
	return base + glue + 'q=' + encodeURIComponent( query ) + ( type ? '&type=' + encodeURIComponent( type ) : '' );
}
