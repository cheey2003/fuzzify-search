import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, createEngine, snippet, highlightRanges, contextSnippet, resultsHref, format } from '../src/core.js';

const items = [
	{ title: 'Why Not? Cradle Carrot Puree, 130g', url: '/p/carrot/', type: 'Product', pt: 'product', excerpt: '', terms: [ 'Baby food' ] },
	{ title: 'Why Not? Cradle Pear Puree, 130g', url: '/p/pear/', type: 'Product', pt: 'product', terms: [ 'Baby food' ] },
	{ title: 'How to get rid of cradle cap?', url: '/cradle-cap/', type: 'Post', pt: 'post', content: 'Use a soft brush and a little baby oil.' },
	{ title: 'Florame Organic Lavender Floral Water, 200ml', url: '/p/lavender/', type: 'Product', pt: 'product', sku: 'FL-200' },
	{ title: 'Essential Oils During Pregnancy', url: '/oils/', type: 'Post', pt: 'post', content: 'Lavender oil is generally considered safe.' },
	{ title: '孩子发烧了，爸妈别慌！', url: '/fever-cn/', type: 'Post', pt: 'post', content: '孩子发烧时不要慌张。' },
];

const engine = createEngine( items, {
	threshold: 0.3,
	fields: [ 'title', 'terms', 'sku', 'excerpt', 'content' ],
} );
const titles = ( hits ) => hits.map( ( hit ) => hit.item.title );

test( 'tokenize splits, dedupes, and drops one-letter Latin words', () => {
	assert.deepEqual( tokenize( '  baby   oil ' ), [ 'baby', 'oil' ] );
	assert.deepEqual( tokenize( 'oil Oil OIL' ), [ 'oil' ] );
	assert.deepEqual( tokenize( 'vitamin a d' ), [ 'vitamin' ] );
	assert.deepEqual( tokenize( 'a' ), [ 'a' ], 'a lone one-letter query is still searched' );
	assert.deepEqual( tokenize( '发 烧' ), [ '发', '烧' ], 'one-character CJK words are kept' );
	assert.deepEqual( tokenize( '' ), [] );
	assert.equal( tokenize( 'a b c d e f g hh ii jj kk ll mm nn' ).length <= 6, true );
} );

test( 'finds exact matches, title hits first', () => {
	const hits = engine.search( 'cradle' );
	assert.equal( hits.length, 3 );
	assert.match( titles( hits )[ 0 ], /cradle/i );
} );

test( 'tolerates typos that WordPress search misses', () => {
	assert.ok( titles( engine.search( 'cradel' ) ).some( ( t ) => /Cradle/.test( t ) ) );
	assert.ok( titles( engine.search( 'lavendar' ) ).some( ( t ) => /Lavender/.test( t ) ) );
} );

test( 'multi-word queries need every word, in any field', () => {
	const hits = titles( engine.search( 'cradle puree' ) );
	assert.deepEqual( hits.sort(), [ 'Why Not? Cradle Carrot Puree, 130g', 'Why Not? Cradle Pear Puree, 130g' ].sort() );
	// "baby" is only in a taxonomy term / content, "oil" only in content: still one result.
	assert.deepEqual( titles( engine.search( 'baby oil' ) ), [ 'How to get rid of cradle cap?' ] );
} );

test( 'matches other indexed fields (SKU, terms, content)', () => {
	assert.deepEqual( titles( engine.search( 'FL-200' ) ), [ 'Florame Organic Lavender Floral Water, 200ml' ] );
	assert.equal( engine.search( 'baby food' ).length, 2 );
	assert.ok( titles( engine.search( 'soft brush' ) ).includes( 'How to get rid of cradle cap?' ) );
} );

test( 'typos are forgiven in titles; body text must match verbatim and ranks lower', () => {
	const local = createEngine(
		[
			{ title: 'Natural remedies for a fever', url: '/a/', pt: 'post', content: 'Keep your child cool.' },
			{ title: 'Sleep tips', url: '/b/', pt: 'post', content: 'We never skip the bedtime story.' },
			{ title: 'Herbal teas', url: '/c/', pt: 'post', content: 'A fever is best treated with rest.' },
		],
		{ threshold: 0.3, fields: [ 'title', 'content' ] }
	);
	assert.deepEqual( local.search( 'fever' ).map( ( hit ) => hit.item.url ), [ '/a/', '/c/' ], 'title hit first, verbatim body hit second; "never" is not a match' );
	assert.deepEqual( local.search( 'fevr' ).map( ( hit ) => hit.item.url ), [ '/a/' ], 'a typo is forgiven in the title but not in body text' );
} );

test( 'ranks title matches first, then categories, then body text; newest first within a tier', () => {
	const ranked = createEngine(
		[
			{ title: 'Heat waves', url: '/category-only/', pt: 'post', terms: [ 'Pregnancy' ] },
			{ title: 'Pre-Pregnancy Nutrition: From Micro to Macro', url: '/title-a/', pt: 'post', content: 'Eat well.' },
			{ title: 'Coconut oils', url: '/body-only/', pt: 'post', content: 'Considered safe during pregnancy.' },
			{ title: 'Essential Oils During Pregnancy', url: '/title-b/', pt: 'post', terms: [ 'Pregnancy' ], content: 'Be careful.' },
			{ title: 'Prepregnancy checklist', url: '/inside-word/', pt: 'post' },
		],
		{ threshold: 0.3, fields: [ 'title', 'terms', 'content' ] }
	);
	assert.deepEqual(
		ranked.search( 'pregnancy' ).map( ( hit ) => hit.item.url ),
		[ '/title-a/', '/title-b/', '/inside-word/', '/category-only/', '/body-only/' ],
		'a word in the title beats a category, which beats body text; whole-word title matches beat mid-word ones'
	);
} );

test( 'a whole-word match ranks above the same letters inside another word', () => {
	const words = createEngine(
		[ { title: 'Steam cleaning tips', url: '/steam/', pt: 'post' }, { title: 'Organic Calendula Tea, 50g', url: '/tea/', pt: 'post' } ],
		{ threshold: 0.3, fields: [ 'title' ] }
	);
	assert.deepEqual( words.search( 'tea' ).map( ( hit ) => hit.item.url ), [ '/tea/', '/steam/' ] );
} );

test( 'a typo still finds title matches, ahead of category-only ones', () => {
	const typo = createEngine(
		[
			{ title: 'Heat waves', url: '/category-only/', pt: 'post', terms: [ 'Pregnancy' ] },
			{ title: 'Essential Oils During Pregnancy', url: '/title/', pt: 'post' },
		],
		{ threshold: 0.3, fields: [ 'title', 'terms' ] }
	);
	assert.equal( typo.search( 'pregnncy' )[ 0 ].item.url, '/title/' );
} );

const FIELDS = [ 'title', 'terms', 'sku', 'excerpt', 'content' ];
const rankable = [
	{ title: 'Alpha guide', url: '/title-only/', pt: 'post', terms: [ 'Tips' ] },
	{ title: 'Beta notes', url: '/category-only/', pt: 'post', terms: [ 'Zebra care' ] },
	{ title: 'Gamma', url: '/body-only/', pt: 'post', content: 'All about zebra habits.' },
	{ title: 'Zebra basics', url: '/title-newest-last/', pt: 'post' },
];
const urls = ( hits ) => hits.map( ( hit ) => hit.item.url );

test( 'field priorities can be rearranged', () => {
	const by = ( rank ) => urls( createEngine( rankable, { threshold: 0.3, fields: FIELDS, rank } ).search( 'zebra' ) );
	assert.deepEqual( by( undefined ), [ '/title-newest-last/', '/category-only/', '/body-only/' ], 'defaults: title, then category, then body' );
	assert.deepEqual( by( { content: 1, terms: 2, title: 3 } ), [ '/body-only/', '/category-only/', '/title-newest-last/' ], 'body first, title last' );
	assert.deepEqual( by( { terms: 1, title: 2, content: 3 } ), [ '/category-only/', '/title-newest-last/', '/body-only/' ], 'category first' );
} );

test( 'fields with the same priority rank together, newest first', () => {
	const tied = createEngine( rankable, { threshold: 0.3, fields: FIELDS, rank: { title: 1, terms: 1, content: 2 } } );
	assert.deepEqual( urls( tied.search( 'zebra' ) ), [ '/category-only/', '/title-newest-last/', '/body-only/' ], 'category and title tie, so index order decides' );
} );

test( 'fields that are not searched take no part in ranking', () => {
	const titleAndBody = createEngine( rankable, { threshold: 0.3, fields: [ 'title', 'content' ], rank: { content: 1 } } );
	assert.deepEqual( urls( titleAndBody.search( 'zebra' ) ), [ '/body-only/', '/title-newest-last/' ], 'categories are not searched at all' );
} );

test( 'reports which fields each result matched in', () => {
	const engine = createEngine( rankable, { threshold: 0.3, fields: FIELDS } );
	const hits = engine.search( 'zebra' );
	assert.deepEqual( hits.map( ( hit ) => hit.matched ), [ [ 'title' ], [ 'terms' ], [ 'content' ] ] );
	assert.deepEqual( engine.search( 'zebra basics' )[ 0 ].matched, [ 'title' ], 'the same field for both words is listed once' );
	assert.deepEqual( engine.search( 'beta zebra' )[ 0 ].matched, [ 'title', 'terms' ], 'one entry per field the words were found in' );
} );

const mixed = [
	{ title: 'Oil massage guide', url: '/post-title/', pt: 'post' },
	{ title: 'Olive oil, 250ml', url: '/product-title/', pt: 'product' },
	{ title: 'Skin care', url: '/product-body/', pt: 'product', content: 'A gentle oil for skin.' },
];

test( 'post type priority orders equal matches only, by default', () => {
	const engine = createEngine( mixed, { threshold: 0.3, fields: FIELDS, typeRank: { product: 1, post: 2 } } );
	assert.deepEqual( urls( engine.search( 'oil' ) ), [ '/product-title/', '/post-title/', '/product-body/' ], 'products first among title matches; a body match still ranks below a title match' );
} );

test( 'post type priority can also come before everything else', () => {
	const engine = createEngine( mixed, { threshold: 0.3, fields: FIELDS, typeRank: { product: 1, post: 2 }, typeMode: 'first' } );
	assert.deepEqual( urls( engine.search( 'oil' ) ), [ '/product-title/', '/product-body/', '/post-title/' ], 'all products, then posts' );
} );

test( 'without a post type priority, index order decides between equal matches', () => {
	const engine = createEngine( mixed, { threshold: 0.3, fields: FIELDS } );
	assert.deepEqual( urls( engine.search( 'oil' ) ), [ '/post-title/', '/product-title/', '/product-body/' ] );
} );

test( 'works for Chinese, including a single character', () => {
	assert.equal( engine.search( '发烧' ).length, 1 );
	assert.equal( engine.search( '烧' ).length, 1 );
} );

test( 'can be restricted to one post type', () => {
	const all = engine.search( 'lavender' );
	assert.equal( all.length, 2 );
	const products = engine.search( 'lavender', { type: 'product' } );
	assert.deepEqual( titles( products ), [ 'Florame Organic Lavender Floral Water, 200ml' ] );
} );

test( 'returns nothing for empty or unmatched queries', () => {
	assert.deepEqual( engine.search( '   ' ), [] );
	assert.deepEqual( engine.search( 'zzzzqqqq' ), [] );
} );

test( 'snippet prefers the excerpt, cuts on a word, and adds an ellipsis', () => {
	assert.equal( snippet( { excerpt: 'Short.', content: 'ignored' } ), 'Short.' );
	assert.equal( snippet( { content: 'word '.repeat( 60 ) }, 50 ).endsWith( '…' ), true );
	assert.equal( snippet( { content: 'word '.repeat( 60 ) }, 50 ).includes( 'wor…' ), false );
	assert.equal( snippet( {} ), '' );
} );

/** The pieces of a text that a list of [start, end) ranges covers. */
const marked = ( text, ranges ) => ranges.map( ( [ a, b ] ) => text.slice( a, b ) );

test( 'highlightRanges finds every occurrence, ignoring case', () => {
	assert.deepEqual( marked( 'Hello world! A World apart', highlightRanges( 'Hello world! A World apart', [ 'world' ] ) ), [ 'world', 'World' ] );
	assert.deepEqual( highlightRanges( 'Hello world!', [ 'world' ] ), [ [ 6, 11 ] ], 'the "!" is not part of the match' );
	assert.deepEqual( highlightRanges( 'Hello world!', [ 'zzz' ] ), [] );
	assert.deepEqual( highlightRanges( '', [ 'a' ] ), [] );
	assert.deepEqual( highlightRanges( 'text', [] ), [] );
} );

test( 'highlightRanges marks the letters typed, even inside a longer word', () => {
	assert.deepEqual( marked( 'Worldwide', highlightRanges( 'Worldwide', [ 'wor' ] ) ), [ 'Wor' ] );
} );

test( 'highlightRanges merges words that overlap or touch', () => {
	assert.deepEqual( highlightRanges( 'worldwide', [ 'world', 'ldwi' ] ), [ [ 0, 7 ] ] );
	assert.deepEqual( highlightRanges( 'worldwide', [ 'wor', 'ld' ] ), [ [ 0, 5 ] ] );
	assert.deepEqual( highlightRanges( 'a b a', [ 'a', 'b' ] ), [ [ 0, 1 ], [ 2, 3 ], [ 4, 5 ] ] );
} );

test( 'highlightRanges takes regular-expression characters literally', () => {
	assert.deepEqual( marked( 'costs $5 (approx.) [ok]', highlightRanges( 'costs $5 (approx.) [ok]', [ '$5', '(approx.)', '[ok]' ] ) ), [ '$5', '(approx.)', '[ok]' ] );
	assert.deepEqual( highlightRanges( 'abc', [ '.' ] ), [] );
} );

test( 'highlightRanges keeps positions right for the Turkish dotted capital I and for Chinese', () => {
	const turkish = 'İstanbul rehberi';
	assert.deepEqual( marked( turkish, highlightRanges( turkish, [ 'rehber' ] ) ), [ 'rehber' ] );
	assert.deepEqual( marked( turkish, highlightRanges( turkish, [ 'stanbul' ] ) ), [ 'stanbul' ] );
	assert.deepEqual( marked( '孩子发烧时不要慌张', highlightRanges( '孩子发烧时不要慌张', [ '发烧' ] ) ), [ '发烧' ] );
} );

const LONG = 'Babies grow fast in the first year and every family finds its own routine. ' +
	'To improve in order to create better world for the generations that follow, start small and be kind to yourself. ' +
	'Sleep, feeding and play all change week by week, so keep notes and ask for help when you need it.';

test( 'contextSnippet shows the text around a match in the body, with the match marked', () => {
	const found = contextSnippet( { content: LONG }, [ 'world' ], [ 'content' ], 60 );
	assert.ok( found );
	assert.ok( found.text.startsWith( '…' ) && found.text.endsWith( '…' ), 'both ends are cut' );
	assert.ok( found.text.length <= 60 + 2 + 24, 'about the requested size' );
	assert.deepEqual( marked( found.text, found.ranges ), [ 'world' ] );
	assert.match( found.text, /better world for/ );
} );

test( 'contextSnippet cuts on whole words', () => {
	const found = contextSnippet( { content: LONG }, [ 'world' ], [ 'content' ], 60 );
	const words = found.text.replace( /…/g, '' ).split( ' ' );
	words.forEach( ( word ) => assert.ok( LONG.split( /\s+/ ).some( ( w ) => w.includes( word ) && w === word.replace( /[.,]$/, '' ) + ( w.endsWith( ',' ) || w.endsWith( '.' ) ? w.slice( -1 ) : '' ) || w === word ), `"${ word }" is a whole word` ) );
} );

test( 'contextSnippet has no leading "…" at the start of the text and no trailing one at the end', () => {
	const start = contextSnippet( { content: 'World peace starts at home and it is worth the trouble to talk about it every single day of the year.' }, [ 'world' ], [ 'content' ], 40 );
	assert.ok( ! start.text.startsWith( '…' ) && start.text.endsWith( '…' ) );
	assert.deepEqual( start.ranges[ 0 ], [ 0, 5 ] );
	const end = contextSnippet( { content: 'Talking about it every single day is how the whole family learned to love the world' }, [ 'world' ], [ 'content' ], 40 );
	assert.ok( end.text.startsWith( '…' ) && ! end.text.endsWith( '…' ) );
	assert.equal( marked( end.text, end.ranges )[ 0 ], 'world' );
	const whole = contextSnippet( { content: 'A small world.' }, [ 'world' ], [ 'content' ] );
	assert.equal( whole.text, 'A small world.' );
} );

test( 'contextSnippet is only for text the search matched on', () => {
	assert.equal( contextSnippet( { title: 'Hello world!', content: LONG }, [ 'world' ], [ 'title' ] ), null, 'a title match gets none' );
	assert.equal( contextSnippet( { title: 'x' }, [ 'world' ], [ 'content' ] ), null, 'no body in the index' );
	assert.equal( contextSnippet( { content: 'nothing here' }, [ 'world' ], [ 'content' ] ), null, 'words not in the text' );
	assert.equal( contextSnippet( { content: LONG }, [ 'world' ], undefined ), null );
} );

test( 'contextSnippet prefers the excerpt when both matched, and falls back to the body', () => {
	assert.match( contextSnippet( { excerpt: 'A short world tour.', content: 'the world in the body' }, [ 'world' ], [ 'excerpt', 'content' ] ).text, /short world tour/ );
	assert.match( contextSnippet( { excerpt: '', content: 'the world in the body' }, [ 'world' ], [ 'excerpt', 'content' ] ).text, /world in the body/ );
} );

test( 'contextSnippet picks the window that holds the most of the words', () => {
	const text = 'Iron is mentioned here at the very start. ' + 'filler '.repeat( 30 ) + 'Later on, iron rich foods and vitamin C are described together in one sentence. ' + 'filler '.repeat( 30 );
	const found = contextSnippet( { content: text }, [ 'iron', 'vitamin' ], [ 'content' ], 90 );
	assert.deepEqual( marked( found.text, found.ranges ).map( ( w ) => w.toLowerCase() ), [ 'iron', 'vitamin' ] );
} );

test( 'contextSnippet works for Chinese, which has no spaces', () => {
	const text = '孩子发烧时不要慌张，先测量体温，多喝水，注意休息，如果持续三天以上请及时就医，并记录每天的体温变化情况。';
	const found = contextSnippet( { content: text }, [ '就医' ], [ 'content' ], 16 );
	assert.deepEqual( marked( found.text, found.ranges ), [ '就医' ] );
	assert.ok( found.text.startsWith( '…' ) && found.text.endsWith( '…' ) );
} );

test( 'contextSnippet does not split an emoji and never cuts a very long word', () => {
	const emoji = 'x '.repeat( 20 ) + '😀'.repeat( 10 ) + ' world ' + '😀'.repeat( 10 ) + ' y'.repeat( 20 );
	const found = contextSnippet( { content: emoji }, [ 'world' ], [ 'content' ], 24 );
	assert.ok( ! /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test( found.text ), 'no half of a surrogate pair' );
	const url = 'see https://example.test/' + 'a'.repeat( 90 ) + 'world' + 'b'.repeat( 90 ) + ' for more';
	const long = contextSnippet( { content: url }, [ 'world' ], [ 'content' ], 30 );
	assert.deepEqual( marked( long.text, long.ranges ), [ 'world' ] );
} );

test( 'resultsHref builds the results address', () => {
	assert.equal( resultsHref( '/search/', 'baby oil' ), '/search/?q=baby%20oil' );
	assert.equal( resultsHref( '/search/', 'tea', 'product' ), '/search/?q=tea&type=product' );
	assert.equal( resultsHref( '/?page_id=9', 'x' ), '/?page_id=9&q=x' );
} );

test( 'format fills %s and %d in order', () => {
	assert.equal( format( 'Showing %d of %s', 7, 'many' ), 'Showing 7 of many' );
	assert.equal( format( undefined ), '' );
	assert.equal( format( 'Showing the first %1$d of %2$d results', 20, 30 ), 'Showing the first 20 of 30 results', 'numbered placeholders' );
	assert.equal( format( '%2$s before %1$s', 'a', 'b' ), 'b before a', 'numbered placeholders can be reordered' );
} );
