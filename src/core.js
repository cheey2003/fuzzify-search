/**
 * Static Search core: matching and formatting helpers. No DOM access, so it can be
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
