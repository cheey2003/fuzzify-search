/**
 * Fuzzify Search core: matching and formatting helpers. No DOM access, so it can be
 * tested in Node and reused by the dropdown and the results page.
 */
import Fuse from 'fuse.js';

/** Hiragana/Katakana, CJK ideographs, Hangul: a single character is a meaningful word. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

export const MAX_TOKENS = 6;

/**
 * Split a query into search words.
 *
 * Duplicates and one-letter Latin words are dropped ("a", "5") unless that would leave
 * nothing to search for. One-character CJK words are kept.
 *
 * @param {string} query Raw query.
 * @return {string[]} Words.
 */
export function tokenize( query ) {
	const seen = new Set();
	const words = [];
	String( query || '' )
		.trim()
		.split( /\s+/ )
		.forEach( ( word ) => {
			const key = word.toLowerCase();
			if ( word && ! seen.has( key ) ) {
				seen.add( key );
				words.push( word );
			}
		} );
	const kept = words.filter( ( word ) => word.length > 1 || CJK.test( word ) );
	return ( kept.length ? kept : words ).slice( 0, MAX_TOKENS );
}

/** A letter or number: what makes a match "inside a word" rather than at the start of one. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Whether `needle` occurs in `text` at the start of a word. Chinese, Japanese and Korean have
 * no word boundaries, so any match there counts.
 *
 * @param {string} text   Lower-cased text.
 * @param {string} needle Lower-cased word.
 * @return {boolean} True at a word start.
 */
function startsWord( text, needle ) {
	if ( CJK.test( needle ) ) {
		return true;
	}
	for ( let at = text.indexOf( needle ); at !== -1; at = text.indexOf( needle, at + 1 ) ) {
		if ( at === 0 || ! WORD_CHAR.test( text[ at - 1 ] ) ) {
			return true;
		}
	}
	return false;
}

/** Fields that can be ranked, with their default priority (1 ranks first; equal numbers rank together). */
export const DEFAULT_RANK = { title: 1, terms: 2, sku: 2, excerpt: 3, content: 4 };

/** Fields where a typo is forgiven. Excerpts and body text must match as typed. */
const FUZZY_FIELDS = [ 'title', 'terms', 'sku' ];

/**
 * Distance between ranking groups. It is larger than any penalty inside a group (0 for a match
 * at the start of a word, 1 inside a word, 2 plus a 0-1 score for a typo), so a lower group
 * can never overtake the one above it.
 */
const STEP = 3;

/**
 * Create a search engine over the index items.
 *
 * Every word of the query must match. Where it matches decides the ranking: fields are ranked by
 * their priority (opts.rank), best first. Within a priority, whole-word matches come before
 * matches inside a word, and exact matches before typos. Equal matches can be ordered by post
 * type (opts.typeRank) and otherwise keep the index order, which is newest first.
 *
 * @param {Object[]} items Index items.
 * @param {Object}   opts  {
 *   fields:    which optional fields are searched ('terms', 'sku', 'excerpt', 'content'); the title always is,
 *   threshold: typo tolerance, 0.2 (strict) to 0.4 (loose),
 *   rank:      { title, terms, sku, excerpt, content } priorities, 1 = first,
 *   typeRank:  { postTypeSlug: priority }, 1 = first; unlisted types count as 1,
 *   typeMode:  'tie' (default) orders types only between equal matches, 'first' before everything else.
 * }
 * @return {{ size: number, search: Function }} Engine.
 */
export function createEngine( items, opts ) {
	const fields = ( opts && opts.fields ) || [ 'title' ];
	const threshold = opts && typeof opts.threshold === 'number' ? opts.threshold : 0.3;
	const rank = { ...DEFAULT_RANK, ...( opts && opts.rank ) };
	const typeRank = ( opts && opts.typeRank ) || {};
	const typeFirst = !! ( opts && opts.typeMode === 'first' );

	// The fields in play, and the ranking group each belongs to.
	const active = Object.keys( DEFAULT_RANK ).filter( ( name ) => name === 'title' || fields.includes( name ) );
	const priorities = Array.from( new Set( active.map( ( name ) => rank[ name ] ) ) ).sort( ( a, b ) => a - b );
	const base = {};
	active.forEach( ( name ) => {
		base[ name ] = priorities.indexOf( rank[ name ] ) * STEP;
	} );

	const lower = ( value ) => ( Array.isArray( value ) ? value.join( ' ' ) : String( value || '' ) ).toLowerCase();
	const text = {};
	active.forEach( ( name ) => {
		text[ name ] = items.map( ( item ) => lower( item[ name ] ) );
	} );

	const fuzzyOptions = { threshold, includeScore: true, ignoreLocation: true, ignoreFieldNorm: true, minMatchCharLength: 1 };
	const fuzzy = {};
	FUZZY_FIELDS.filter( ( name ) => active.includes( name ) ).forEach( ( name ) => {
		fuzzy[ name ] = new Fuse( items, { ...fuzzyOptions, keys: [ name ] } );
	} );

	/** How well one word matches each item: { cost, field } per item index, lower cost is better. */
	function costs( token ) {
		const needle = token.toLowerCase();
		const found = new Map();
		const put = ( index, cost, field ) => {
			const best = found.get( index );
			if ( ! best || cost < best.cost ) {
				found.set( index, { cost, field } );
			}
		};
		active.forEach( ( name ) => {
			text[ name ].forEach( ( value, index ) => {
				if ( value.includes( needle ) ) {
					put( index, base[ name ] + ( startsWord( value, needle ) ? 0 : 1 ), name );
				}
			} );
			if ( fuzzy[ name ] ) {
				fuzzy[ name ].search( token ).forEach( ( hit ) => put( hit.refIndex, base[ name ] + 2 + Math.min( hit.score, 0.99 ), name ) );
			}
		} );
		return found;
	}

	const typeOf = ( index ) => typeRank[ items[ index ].pt ] || 1;

	return {
		size: items.length,
		/**
		 * @param {string} query Raw query.
		 * @param {Object} [options] { type: post type slug to restrict to }.
		 * @return {{ item: Object, score: number, refIndex: number, matched: string[] }[]} Best matches first;
		 *         `matched` lists the fields the words were found in.
		 */
		search( query, options ) {
			const type = options && options.type;
			let total = null;
			for ( const token of tokenize( query ) ) {
				const found = costs( token );
				const next = new Map();
				if ( total === null ) {
					found.forEach( ( hit, index ) => next.set( index, { cost: hit.cost, matched: [ hit.field ] } ) );
				} else {
					total.forEach( ( entry, index ) => {
						const hit = found.get( index );
						if ( hit ) {
							next.set( index, { cost: entry.cost + hit.cost, matched: entry.matched.concat( hit.field ) } );
						}
					} );
				}
				total = next;
				if ( ! total.size ) {
					return [];
				}
			}
			return Array.from( total || [] )
				.filter( ( [ index ] ) => ! type || items[ index ].pt === type )
				.sort(
					( [ ai, a ], [ bi, b ] ) =>
						( typeFirst ? typeOf( ai ) - typeOf( bi ) : 0 ) ||
						a.cost - b.cost ||
						( typeFirst ? 0 : typeOf( ai ) - typeOf( bi ) ) ||
						ai - bi
				)
				.map( ( [ index, entry ] ) => ( {
					item: items[ index ],
					score: entry.cost,
					refIndex: index,
					matched: Array.from( new Set( entry.matched ) ),
				} ) );
		},
	};
}

/**
 * Short plain-text preview of an item: the excerpt, else the start of the content.
 *
 * @param {Object} item Index item.
 * @param {number} max  Maximum characters.
 * @return {string} Preview.
 */
export function snippet( item, max = 160 ) {
	const text = String( item.excerpt || item.content || '' ).replace( /\s+/g, ' ' ).trim();
	if ( text.length <= max ) {
		return text;
	}
	const cut = text.slice( 0, max );
	const space = cut.lastIndexOf( ' ' );
	return ( space > max * 0.6 ? cut.slice( 0, space ) : cut ).replace( /[\s,.;:!?\-]+$/, '' ) + '\u2026';
}

/**
 * Lower-case a text without changing its length, so a position in the result is a position in the
 * original. (The Turkish dotted capital İ would otherwise lower to two code units.)
 *
 * @param {string} text Text.
 * @return {string} Folded text.
 */
const fold = ( text ) => String( text || '' ).replace( /İ/g, 'i' ).toLowerCase();

/**
 * Where the query words occur in a text: sorted, non-overlapping [start, end) pairs. Matching is
 * exact and ignores case, like the search itself, so a word matched with a typo is not marked.
 *
 * @param {string}   text   Text to look in.
 * @param {string[]} tokens Query words (see tokenize()).
 * @return {number[][]} Ranges to highlight.
 */
export function highlightRanges( text, tokens ) {
	const haystack = fold( text );
	const found = [];
	( tokens || [] ).forEach( ( token ) => {
		const needle = fold( token );
		if ( ! needle ) {
			return;
		}
		for ( let at = haystack.indexOf( needle ); at !== -1; at = haystack.indexOf( needle, at + needle.length ) ) {
			found.push( [ at, at + needle.length ] );
		}
	} );
	found.sort( ( a, b ) => a[ 0 ] - b[ 0 ] || b[ 1 ] - a[ 1 ] );
	const merged = [];
	found.forEach( ( range ) => {
		const last = merged[ merged.length - 1 ];
		if ( last && range[ 0 ] <= last[ 1 ] ) {
			last[ 1 ] = Math.max( last[ 1 ], range[ 1 ] );
		} else {
			merged.push( [ range[ 0 ], range[ 1 ] ] );
		}
	} );
	return merged;
}

/** How far a snippet edge may move to land on a word boundary. */
const SNAP = 24;

/**
 * A short piece of an item's text around where the query words were found, to show under a
 * result. Only text the search matched on is used (the excerpt, else the body), so a result that
 * matched on its title alone gets none.
 *
 * The window is placed to cover as many of the words as it can, starts and ends on whole words
 * (Chinese, Japanese and Korean have no spaces, so they are cut anywhere) and never cuts a match.
 * "…" marks a cut end.
 *
 * @param {Object}   item    Index item.
 * @param {string[]} tokens  Query words.
 * @param {string[]} matched Fields the words were found in (`matched` of a search result).
 * @param {number}   [max]   Characters of text to show, not counting the "…".
 * @return {{ text: string, ranges: number[][] }|null} The snippet and the spans to highlight in it.
 */
export function contextSnippet( item, tokens, matched, max = 110 ) {
	const field = [ 'excerpt', 'content' ].find( ( name ) => ( matched || [] ).includes( name ) && item[ name ] );
	if ( ! field ) {
		return null;
	}
	const flat = String( item[ field ] ).replace( /\s+/g, ' ' ).trim();
	const haystack = fold( flat );

	// The first few places each word occurs.
	const hits = [];
	( tokens || [] ).forEach( ( token, which ) => {
		const needle = fold( token );
		if ( ! needle ) {
			return;
		}
		let seen = 0;
		for ( let at = haystack.indexOf( needle ); at !== -1 && seen < 20; at = haystack.indexOf( needle, at + needle.length ) ) {
			hits.push( { at, end: at + needle.length, which } );
			seen++;
		}
	} );
	if ( ! hits.length ) {
		return null;
	}

	// Start the window a little before a hit; prefer the one that fits the most different words, then the earliest.
	const lead = Math.round( max * 0.3 );
	let best = null;
	hits.forEach( ( hit ) => {
		const from = Math.max( 0, hit.at - lead );
		const covered = new Set( hits.filter( ( other ) => other.at >= from && other.end <= from + max ).map( ( other ) => other.which ) ).size;
		if ( ! best || covered > best.covered || ( covered === best.covered && hit.at < best.hit.at ) ) {
			best = { hit, covered };
		}
	} );
	const match = best.hit;

	// Room for the match itself even when a word is longer than the window.
	let end = Math.min( flat.length, Math.max( Math.max( 0, match.at - lead ) + max, match.end ) );
	let start = Math.max( 0, Math.min( end - max, match.at ) );

	const wordy = ( index ) => index >= 0 && index < flat.length && flat[ index ] !== ' ' && ! CJK.test( flat[ index ] );
	// Start on a word: step back to where the word we landed in begins.
	if ( start > 0 && wordy( start - 1 ) && wordy( start ) ) {
		let back = start;
		while ( back > 0 && start - back < SNAP && wordy( back - 1 ) ) {
			back--;
		}
		if ( ! wordy( back - 1 ) ) {
			start = back;
		}
	}
	// End on a word: drop a half word, unless that would cut the match, in which case finish the word.
	if ( end < flat.length && wordy( end - 1 ) && wordy( end ) ) {
		const space = flat.lastIndexOf( ' ', end );
		if ( space >= match.end ) {
			end = space;
		} else {
			let forward = end;
			while ( forward < flat.length && forward - end < SNAP && wordy( forward ) ) {
				forward++;
			}
			end = forward;
		}
	}
	// Never split a character made of two code units (emoji and rarer ideographs).
	if ( start > 0 && flat.charCodeAt( start ) >= 0xdc00 && flat.charCodeAt( start ) <= 0xdfff ) {
		start--;
	}
	if ( end < flat.length && flat.charCodeAt( end ) >= 0xdc00 && flat.charCodeAt( end ) <= 0xdfff ) {
		end++;
	}

	const body = flat.slice( start, end ).trim();
	const before = start > 0 ? '…' : '';
	const after = end < flat.length ? '…' : '';
	return {
		text: before + body + after,
		ranges: highlightRanges( body, tokens ).map( ( [ from, to ] ) => [ from + before.length, to + before.length ] ),
	};
}

export { resultsHref } from './url.js';

/**
 * Minimal sprintf for translated strings: replaces %s and %d in order, or numbered ones
 * (%1$d, %2$s) by position, which is how translators may reorder them.
 *
 * @param {string} template Template.
 * @param {...*}   values   Values.
 * @return {string} Result.
 */
export function format( template, ...values ) {
	let next = 0;
	return String( template || '' ).replace( /%(?:(\d+)\$)?[sd]/g, ( match, position ) => String( values[ position ? position - 1 : next++ ] ) );
}
