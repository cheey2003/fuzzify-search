// Runs the built settings-screen script (assets/js/static-search-admin.js) in jsdom. Run `npm run build` first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const bundle = readFileSync( new URL( '../assets/js/static-search-admin.js', import.meta.url ), 'utf8' );
const N = 'static_search_settings';

const INDEX = {
	v: 1,
	items: [
		{ id: 1, title: 'Alpha guide', url: '/title-only/', type: 'Post', pt: 'post', terms: [ 'Tips' ] },
		{ id: 2, title: 'Beta notes', url: '/category-only/', type: 'Post', pt: 'post', terms: [ 'Zebra care' ] },
		{ id: 3, title: 'Gamma', url: '/body-only/', type: 'Post', pt: 'post', content: 'All about zebra habits.' },
		{ id: 4, title: 'Zebra basics', url: '/title-post/', type: 'Post', pt: 'post' },
		{ id: 5, title: 'Zebra print bag', url: '/title-product/', type: 'Product', pt: 'product' },
	],
};

const CONFIG = {
	indexUrl: '/wp-content/uploads/static-search/index.json?ver=1',
	labels: { title: 'Title', terms: 'Categories and tags', sku: 'SKU', excerpt: 'Excerpt', content: 'Body text' },
	i18n: {
		prompt: 'Type a word or two.', loading: 'Loading the index…', unavailable: 'The index could not be loaded.', none: 'No results.', noPages: 'No pages match.', one: '1 result', many: '%d results',
		showing: 'Showing the first %1$d of %2$d results', moved: 'Moved %1$s to position %2$d of %3$d.',
	},
};

/** The same markup the PHP renders: [ slug, label, rank ] rows; a row whose rank equals the one above starts tied. */
const list = ( group, rows ) => {
	let previous = null;
	const items = rows.map( ( [ slug, label, rank ] ) => {
		const tied = previous === rank;
		previous = rank;
		return `<li class="static-search-sortable__item${ tied ? ' is-tied' : '' }"><span data-handle></span><span data-rank-label>${ label }</span>
			<label><input type="checkbox" data-tie${ tied ? ' checked' : '' }></label>
			<span><button type="button" data-move="up"></button><button type="button" data-move="down"></button></span>
			<input type="hidden" name="${ N }[${ group }][${ slug }]" value="${ rank }" data-rank-value></li>`;
	} );
	return `<div class="static-search-sortable"><ol data-rank-list>${ items.join( '' ) }</ol><p data-rank-status></p></div>`;
};

const buildForm = ( activate = true ) => `
<form id="settings">
	<input type="checkbox" name="${ N }[post_types][]" value="post" checked>
	<input type="checkbox" name="${ N }[post_types][]" value="product" checked>
	<input type="hidden" name="${ N }[fields][]" value="">
	${ [ 'terms', 'sku', 'excerpt', 'content' ].map( ( f ) => `<input type="checkbox" name="${ N }[fields][]" value="${ f }" checked>` ).join( '' ) }
	${ list( 'ranking', [ [ 'title', 'Title', 1 ], [ 'terms', 'Categories and tags', 2 ], [ 'sku', 'SKU', 2 ], [ 'excerpt', 'Excerpt', 3 ], [ 'content', 'Body text', 4 ] ] ) }
	${ list( 'type_priority', [ [ 'post', 'Posts', 1 ], [ 'product', 'Products', 1 ] ] ) }
	<input type="radio" name="${ N }[type_mode]" value="tie" checked><input type="radio" name="${ N }[type_mode]" value="first">
	<select name="${ N }[threshold]"><option value="0.3" selected>0.3</option></select>
	<input type="hidden" name="${ N }[results_enabled]" value="0"><input type="checkbox" name="${ N }[results_enabled]" value="1"${ activate ? ' checked' : '' }>
	<table><tr data-results-dependent><td><select id="static-search-results-page" name="${ N }[results_page]"><option value="0">None</option><option value="7" selected>Search</option></select></td></tr>
	<tr data-results-dependent><td><input type="hidden" name="${ N }[forward_old_search]" value="0"><input type="checkbox" name="${ N }[forward_old_search]" value="1" checked></td></tr></table>
	<div data-preview>
		<input type="search" data-preview-input><p data-preview-status></p>
		<table data-preview-table hidden><thead><tr><th>#</th><th>Result</th><th>Type</th><th>Matched in</th></tr></thead><tbody></tbody></table>
	</div>
</form>`;

async function screen( { fetchImpl, activate = true, jquery } = {} ) {
	const dom = new JSDOM( `<!doctype html><body>${ buildForm( activate ) }</body>`, { url: 'https://example.test/wp-admin/options-general.php', runScripts: 'outside-only', pretendToBeVisual: true } );
	const { window } = dom;
	const requests = [];
	window.fetch = fetchImpl || ( ( u ) => {
		requests.push( u );
		return Promise.resolve( { ok: true, json: () => Promise.resolve( INDEX ) } );
	} );
	window.StaticSearchAdmin = CONFIG;
	if ( jquery ) {
		window.jQuery = jquery;
	}
	window.eval( bundle );
	const wait = ( ms = 40 ) => new Promise( ( r ) => setTimeout( r, ms ) );
	const doc = window.document;
	const input = doc.querySelector( '[data-preview-input]' );
	const fire = ( el, type ) => el.dispatchEvent( new window.Event( type, { bubbles: true } ) );
	const search = async ( text ) => {
		input.value = text;
		fire( input, 'input' );
		await wait();
	};
	const row = ( group, slug ) => doc.querySelector( `input[name="${ N }[${ group }][${ slug }]"]` ).closest( 'li' );
	const move = async ( group, slug, direction ) => {
		row( group, slug ).querySelector( `[data-move="${ direction }"]` ).click();
		await wait();
	};
	const tie = async ( group, slug, on ) => {
		const box = row( group, slug ).querySelector( '[data-tie]' );
		box.checked = on;
		fire( box, 'change' );
		await wait();
	};
	const slugOf = ( el ) => el.name.slice( el.name.lastIndexOf( '[' ) + 1, -1 );
	const ranks = ( group ) => Object.fromEntries( [ ...doc.querySelectorAll( `input[name^="${ N }[${ group }]["]` ) ].map( ( el ) => [ slugOf( el ), Number( el.value ) ] ) );
	const listOrder = ( group ) => [ ...doc.querySelectorAll( `input[name^="${ N }[${ group }]["]` ) ].map( slugOf );
	const set = async ( name, value ) => {
		const el = doc.querySelector( `[name="${ N }${ name }"]` );
		el.value = String( value );
		fire( el, 'change' );
		await wait();
	};
	const rows = () => [ ...doc.querySelectorAll( '[data-preview-table] tbody tr' ) ].map( ( tr ) => [ ...tr.children ].map( ( td ) => td.textContent ) );
	const order = () => rows().map( ( r ) => r[ 1 ] );
	return { window, doc, input, requests, wait, search, set, rows, order, fire, row, move, tie, ranks, listOrder, status: () => doc.querySelector( '[data-preview-status]' ).textContent };
}

test( 'starts with a prompt and downloads nothing until something is typed', async () => {
	const { status, requests } = await screen();
	assert.equal( status(), 'Type a word or two.' );
	assert.equal( requests.length, 0 );
} );

test( 'the lists start from the saved ranks', async () => {
	const { ranks } = await screen();
	assert.deepEqual( ranks( 'ranking' ), { title: 1, terms: 2, sku: 2, excerpt: 3, content: 4 } );
	assert.deepEqual( ranks( 'type_priority' ), { post: 1, product: 1 } );
} );

test( 'shows ranked results with the fields each one matched in', async () => {
	const { search, rows, status, requests } = await screen();
	await search( 'zebra' );
	assert.equal( requests.length, 1 );
	assert.equal( status(), '4 results' );
	assert.deepEqual( rows().map( ( r ) => [ r[ 1 ], r[ 3 ] ] ), [
		[ 'Zebra basics', 'Title' ],
		[ 'Zebra print bag', 'Title' ],
		[ 'Beta notes', 'Categories and tags' ],
		[ 'Gamma', 'Body text' ],
	] );
} );

test( 'moving a row renumbers the list and keeps unaffected ties', async () => {
	const { move, ranks, listOrder } = await screen();
	await move( 'ranking', 'content', 'up' );
	assert.deepEqual( listOrder( 'ranking' ), [ 'title', 'terms', 'sku', 'content', 'excerpt' ] );
	assert.deepEqual( ranks( 'ranking' ), { title: 1, terms: 2, sku: 2, content: 3, excerpt: 4 }, 'Categories and SKU still tie' );
} );

test( 'moving a row clears the "same priority" ticks around it', async () => {
	const { move, ranks, row } = await screen();
	await move( 'ranking', 'terms', 'down' );
	assert.deepEqual( ranks( 'ranking' ), { title: 1, sku: 2, terms: 3, excerpt: 4, content: 5 }, 'no accidental ties left behind' );
	assert.equal( row( 'ranking', 'sku' ).classList.contains( 'is-tied' ), false );
} );

test( 'ticking "Same priority as above" ranks two rows together', async () => {
	const { tie, ranks, row } = await screen();
	await tie( 'ranking', 'excerpt', true );
	assert.deepEqual( ranks( 'ranking' ), { title: 1, terms: 2, sku: 2, excerpt: 2, content: 3 } );
	assert.equal( row( 'ranking', 'excerpt' ).classList.contains( 'is-tied' ), true, 'shown with the tied style' );
	await tie( 'ranking', 'excerpt', false );
	assert.deepEqual( ranks( 'ranking' ), { title: 1, terms: 2, sku: 2, excerpt: 3, content: 4 } );
} );

test( 'the first row cannot be tied and the end arrows are disabled', async () => {
	const { row } = await screen();
	const first = row( 'ranking', 'title' );
	const last = row( 'ranking', 'content' );
	assert.equal( first.querySelector( '[data-tie]' ).disabled, true );
	assert.equal( first.querySelector( '[data-move="up"]' ).disabled, true );
	assert.equal( last.querySelector( '[data-move="down"]' ).disabled, true );
	assert.equal( first.querySelector( '[data-move="down"]' ).disabled, false );
} );

test( 'moves are announced for screen readers', async () => {
	const { move, doc } = await screen();
	await move( 'ranking', 'content', 'up' );
	assert.equal( doc.querySelector( '[data-rank-status]' ).textContent, 'Moved Body text to position 4 of 5.' );
} );

test( 'reordering the fields re-ranks the preview at once, without saving', async () => {
	const { search, move, order } = await screen();
	await search( 'zebra' );
	for ( let i = 0; i < 4; i++ ) {
		await move( 'ranking', 'content', 'up' );
	}
	assert.deepEqual( order(), [ 'Gamma', 'Zebra basics', 'Zebra print bag', 'Beta notes' ], 'body text first, title second, categories third' );
} );

test( 'tying Title and Categories ranks their matches together, newest first', async () => {
	const { search, tie, order } = await screen();
	await search( 'zebra' );
	await tie( 'ranking', 'terms', true );
	assert.deepEqual( order().slice( 0, 3 ), [ 'Beta notes', 'Zebra basics', 'Zebra print bag' ] );
} );

test( 'post type order: equal matches by default, or everything first', async () => {
	const { search, move, set, order, ranks } = await screen();
	await search( 'zebra' );
	assert.deepEqual( order().slice( 0, 2 ), [ 'Zebra basics', 'Zebra print bag' ], 'no preference: newest first' );

	await move( 'type_priority', 'product', 'up' );
	assert.deepEqual( ranks( 'type_priority' ), { product: 1, post: 2 } );
	assert.deepEqual( order(), [ 'Zebra print bag', 'Zebra basics', 'Beta notes', 'Gamma' ], 'products first among equal title matches' );

	await set( '[type_mode]', 'first' );
	assert.equal( order()[ 0 ], 'Zebra print bag', 'still first' );
	assert.equal( order().length, 4, 'nothing is lost' );
} );

test( 'ticking a post type off removes its items from the preview', async () => {
	const { doc, search, fire, order } = await screen();
	await search( 'zebra' );
	const products = doc.querySelector( `input[name="${ N }[post_types][]"][value="product"]` );
	products.checked = false;
	fire( products, 'change' );
	await new Promise( ( r ) => setTimeout( r, 40 ) );
	assert.ok( ! order().includes( 'Zebra print bag' ) );
	assert.equal( order().length, 3 );
} );

test( 'unticking a field stops it being searched', async () => {
	const { doc, search, fire, order } = await screen();
	await search( 'zebra' );
	const terms = doc.querySelector( `input[name="${ N }[fields][]"][value="terms"]` );
	terms.checked = false;
	fire( terms, 'change' );
	await new Promise( ( r ) => setTimeout( r, 40 ) );
	assert.ok( ! order().includes( 'Beta notes' ), 'the category-only match is gone' );
} );

test( 'Enter in the box does not submit the settings form', async () => {
	const { window, input } = await screen();
	const enter = new window.KeyboardEvent( 'keydown', { key: 'Enter', bubbles: true, cancelable: true } );
	input.dispatchEvent( enter );
	assert.equal( enter.defaultPrevented, true );
} );

test( 'no matches, and an index that cannot be loaded, are both explained', async () => {
	const none = await screen();
	await none.search( 'zzzzqqqq' );
	assert.equal( none.status(), 'No results.' );
	assert.deepEqual( none.rows(), [] );

	const broken = await screen( { fetchImpl: () => Promise.resolve( { ok: false, status: 404 } ) } );
	await broken.search( 'zebra' );
	assert.equal( broken.status(), 'The index could not be loaded.' );
} );

test( 'a long list is cut at 20 and says so', async () => {
	const many = { v: 1, items: Array.from( { length: 30 }, ( _, i ) => ( { id: i, title: `Zebra item ${ i }`, url: `/z${ i }/`, type: 'Post', pt: 'post' } ) ) };
	const { search, rows, status } = await screen( { fetchImpl: () => Promise.resolve( { ok: true, json: () => Promise.resolve( many ) } ) } );
	await search( 'zebra' );
	assert.equal( rows().length, 20 );
	assert.equal( status(), 'Showing the first 20 of 30 results' );
} );

test( 'while "Activate" is ticked, the results page settings are editable', async () => {
	const { doc } = await screen();
	const rows = [ ...doc.querySelectorAll( '[data-results-dependent]' ) ];
	assert.equal( rows.length, 2 );
	assert.ok( rows.every( ( row ) => ! row.classList.contains( 'is-off' ) && [ ...row.querySelectorAll( 'input, select' ) ].every( ( el ) => ! el.disabled ) ) );
} );

test( 'unticking "Activate" dims and disables what depends on it, and ticking restores it', async () => {
	const { window, doc, fire, wait } = await screen();
	const box = doc.querySelector( `input[type="checkbox"][name="${ N }[results_enabled]"]` );
	box.checked = false;
	fire( box, 'change' );
	await wait();
	const rows = [ ...doc.querySelectorAll( '[data-results-dependent]' ) ];
	assert.ok( rows.every( ( row ) => row.classList.contains( 'is-off' ) ), 'dimmed' );
	assert.ok( rows.every( ( row ) => [ ...row.querySelectorAll( 'input, select' ) ].every( ( el ) => el.disabled ) ), 'disabled, so they are not submitted and the saved values are kept' );
	assert.equal( box.disabled, false, 'the switch itself stays usable' );
	const sent = [ ...new window.FormData( doc.getElementById( 'settings' ) ).keys() ];
	assert.ok( ! sent.includes( `${ N }[results_page]` ), 'the saved page is not overwritten' );
	assert.ok( sent.includes( `${ N }[results_enabled]` ), 'but the switch is sent' );

	box.checked = true;
	fire( box, 'change' );
	await wait();
	assert.ok( rows.every( ( row ) => ! row.classList.contains( 'is-off' ) && [ ...row.querySelectorAll( 'input, select' ) ].every( ( el ) => ! el.disabled ) ), 'back to normal' );
} );

test( 'a results page saved as off starts dimmed and disabled', async () => {
	const { doc } = await screen( { activate: false } );
	const rows = [ ...doc.querySelectorAll( '[data-results-dependent]' ) ];
	assert.ok( rows.every( ( row ) => row.classList.contains( 'is-off' ) && [ ...row.querySelectorAll( 'input, select' ) ].every( ( el ) => el.disabled ) ) );
} );

test( 'the page dropdown becomes a searchable Select2 when it is available', async () => {
	const calls = [];
	const jquery = Object.assign( ( el ) => ( { select2: ( opts ) => calls.push( [ el.id, opts ] ) } ), { fn: { select2() {} } } );
	await screen( { jquery } );
	assert.equal( calls.length, 1 );
	assert.equal( calls[ 0 ][ 0 ], 'static-search-results-page' );
	assert.equal( calls[ 0 ][ 1 ].minimumResultsForSearch, 0, 'the search box is always shown' );
	assert.equal( calls[ 0 ][ 1 ].language.noResults(), 'No pages match.' );
} );

test( 'without Select2 the plain dropdown still works', async () => {
	const { doc } = await screen();
	assert.equal( doc.getElementById( 'static-search-results-page' ).value, '7' );
} );
