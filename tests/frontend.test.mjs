// Runs the built bundle (assets/js/static-search.js) in jsdom. Run `npm run build` first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const bundle = readFileSync( new URL( '../assets/js/static-search.js', import.meta.url ), 'utf8' );

const INDEX = {
	v: 1,
	items: [
		...[ 'Carrot', 'Pear', 'Apple', 'Banana', 'Peach', 'Prune', 'Corn', 'Quince', 'Mango' ].map( ( f, i ) => ( {
			id: i + 1, title: `Why Not? Cradle ${ f } Puree, 130g`, url: `/product/${ f.toLowerCase() }/`, type: 'Product', pt: 'product', thumb: `/wp-content/uploads/${ f }.jpg`,
		} ) ),
		{ id: 20, title: 'How to get rid of cradle cap?', url: '/cradle-cap/', type: 'Post', pt: 'post', content: 'Use a soft brush and a little baby oil.' },
		{ id: 21, title: '孩子发烧了', url: '/fever/', type: 'Post', pt: 'post', content: '孩子发烧时不要慌张。' },
	],
};

const baseConfig = () => ( {
	indexUrl: '/wp-content/uploads/static-search/index.json?ver=1',
	resultsUrl: '/search/',
	selector: 'input[type="search"][name="s"]',
	fields: [ 'title', 'content' ],
	threshold: 0.3, minChars: 2, delay: 5, maxResults: 7, perPage: 4, thumbs: true,
	i18n: {
		searchTitle: 'Search', prompt: 'Type something.', resultsFor: 'Search results for “%s”', loading: 'Searching…',
		one: '1 result', many: '%d results', none: 'No results found.', more: 'Show more', viewAll: 'View all %d results', unavailable: 'Search is unavailable.',
	},
} );

const FORM = `
	<div id="search"><form role="search" method="get" action="/" class="search-form">
		<input type="search" name="s" required>
		<button type="submit">Search</button>
	</form></div>`;

/** Load a page, run the bundle, return helpers. */
async function page( { html = FORM, url = 'https://example.test/', config = {}, fetchImpl } = {} ) {
	const dom = new JSDOM( `<!doctype html><body>${ html }</body>`, { url, runScripts: 'outside-only', pretendToBeVisual: true } );
	const { window } = dom;
	const requests = [];
	window.fetch = fetchImpl || ( ( u ) => {
		requests.push( u );
		return Promise.resolve( { ok: true, json: () => Promise.resolve( INDEX ) } );
	} );
	const navigations = [];
	window.StaticSearchConfig = { ...baseConfig(), ...config, navigate: ( u ) => navigations.push( u ) };
	window.eval( bundle );
	const wait = ( ms = 60 ) => new Promise( ( r ) => setTimeout( r, ms ) );
	const input = window.document.querySelector( 'input[type="search"]' );
	const type = async ( text ) => {
		input.value = text;
		input.dispatchEvent( new window.Event( 'input', { bubbles: true } ) );
		await wait();
	};
	const key = ( name, target = input ) => {
		const e = new window.KeyboardEvent( 'keydown', { key: name, bubbles: true, cancelable: true } );
		target.dispatchEvent( e );
		return e;
	};
	return { window, document: window.document, input, requests, navigations, wait, type, key };
}

test( 'enhances a standard search field with combobox semantics', async () => {
	const { input, document, requests } = await page();
	assert.equal( input.getAttribute( 'role' ), 'combobox' );
	assert.equal( input.getAttribute( 'aria-expanded' ), 'false' );
	assert.equal( input.getAttribute( 'autocomplete' ), 'off' );
	const listbox = document.getElementById( input.getAttribute( 'aria-controls' ) );
	assert.equal( listbox.getAttribute( 'role' ), 'listbox' );
	assert.equal( requests.length, 0, 'nothing is downloaded until the visitor interacts' );
} );

test( 'leaves a field alone when SearchWP Live has already taken it over', async () => {
	const { input } = await page( { html: FORM.replace( '<input ', '<input data-swplive="true" ' ) } );
	assert.equal( input.getAttribute( 'role' ), null );
} );

test( 'typing shows results, capped, with a "view all" link; the index is fetched once', async () => {
	const { input, document, type, requests } = await page();
	await type( 'cradle' );
	const options = document.querySelectorAll( '.static-search-list [role="option"]' );
	assert.equal( options.length, 8, '7 results + view-all' );
	assert.equal( input.getAttribute( 'aria-expanded' ), 'true' );
	assert.match( options[ 0 ].textContent, /Cradle|cradle/ );
	const viewAll = document.querySelector( '.static-search-more a' );
	assert.equal( viewAll.getAttribute( 'href' ), '/search/?q=cradle' );
	assert.match( viewAll.textContent, /View all 10 results/ );
	await type( 'cradle pear' );
	assert.equal( requests.length, 1, 'index fetched once' );
	// Typo tolerance lets "pear" also catch "Peach"; the exact match must still rank first.
	const titles = [ ...document.querySelectorAll( '.static-search-result__title' ) ].map( ( n ) => n.textContent );
	assert.match( titles[ 0 ], /Cradle Pear Puree/ );
	assert.ok( titles.length <= 2 );
} );

test( 'below the minimum length nothing is shown; no matches shows the message', async () => {
	const { input, document, type } = await page();
	await type( 'c' );
	assert.equal( input.getAttribute( 'aria-expanded' ), 'false' );
	await type( 'zzzzqqqq' );
	assert.equal( input.getAttribute( 'aria-expanded' ), 'true' );
	assert.equal( document.querySelector( '.static-search-empty' ).textContent, 'No results found.' );
} );

test( 'works for Chinese queries', async () => {
	const { document, type } = await page();
	await type( '发烧' );
	assert.equal( document.querySelectorAll( '.static-search-list .static-search-result' ).length, 1 );
} );

test( 'while an input method is composing, nothing is searched until the characters are chosen', async () => {
	const { window, document, input, wait, key } = await page();
	input.value = 'fashao';
	input.dispatchEvent( new window.InputEvent( 'input', { bubbles: true, isComposing: true } ) );
	await wait();
	assert.equal( input.getAttribute( 'aria-expanded' ), 'false', 'half-typed pinyin is not searched' );

	input.value = '发烧';
	input.dispatchEvent( new window.InputEvent( 'input', { bubbles: true, isComposing: true } ) );
	input.dispatchEvent( new window.CompositionEvent( 'compositionend', { bubbles: true, data: '发烧' } ) );
	await wait();
	assert.equal( document.querySelectorAll( '.static-search-list .static-search-result' ).length, 1, 'searched once composition ends' );

	const enter = new window.KeyboardEvent( 'keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true } );
	input.dispatchEvent( enter );
	assert.equal( enter.defaultPrevented, false, 'Enter that confirms a candidate is left to the input method' );
	key( 'ArrowDown' );
	assert.equal( input.getAttribute( 'aria-activedescendant' ) !== null, true, 'normal keys work again afterwards' );
} );

test( 'arrow keys move the highlight; Enter opens the highlighted result', async () => {
	const { input, document, type, key, navigations } = await page();
	await type( 'cradle' );
	key( 'ArrowDown' );
	key( 'ArrowDown' );
	const options = document.querySelectorAll( '.static-search-list [role="option"]' );
	assert.equal( options[ 1 ].getAttribute( 'aria-selected' ), 'true' );
	assert.equal( input.getAttribute( 'aria-activedescendant' ), options[ 1 ].id );
	key( 'ArrowUp' );
	key( 'ArrowUp' );
	assert.equal( input.getAttribute( 'aria-activedescendant' ), options[ 7 ].id, 'wraps to the last option' );
	key( 'ArrowDown' );
	const enter = key( 'Enter' );
	assert.equal( enter.defaultPrevented, true, 'Enter is claimed so the form does not also submit' );
	assert.equal( navigations.length, 1 );
	assert.match( navigations[ 0 ], /^\/product\// );
} );

test( 'Enter with nothing highlighted goes to the results page', async () => {
	const { window, document, input, type, key, navigations } = await page();
	await type( 'baby oil' );
	const enter = key( 'Enter' );
	assert.equal( enter.defaultPrevented, false, 'the key is left alone so the form submits' );
	const submit = new window.Event( 'submit', { bubbles: true, cancelable: true } );
	input.form.dispatchEvent( submit );
	assert.equal( submit.defaultPrevented, true );
	assert.deepEqual( navigations, [ '/search/?q=baby%20oil' ] );
	assert.ok( document.querySelector( '.static-search-list' ) );
} );

test( 'Escape closes only the dropdown; the theme overlay handler does not see that key press', async () => {
	const { window, document, input, type, key } = await page();
	let themeSawKeyup = 0;
	document.getElementById( 'search' ).addEventListener( 'keyup', () => themeSawKeyup++ );
	const keyup = () => input.dispatchEvent( new window.KeyboardEvent( 'keyup', { key: 'Escape', bubbles: true } ) );

	await type( 'cradle' );
	key( 'Escape' );
	keyup();
	assert.equal( input.getAttribute( 'aria-expanded' ), 'false' );
	assert.equal( themeSawKeyup, 0, 'first Escape only closed the dropdown' );

	key( 'Escape' );
	keyup();
	assert.equal( themeSawKeyup, 1, 'second Escape reaches the theme and closes the overlay' );
} );

test( 'a form with a hidden post_type only returns that type', async () => {
	const html = FORM.replace( '<button', '<input type="hidden" name="post_type" value="post"><button' );
	const { document, type } = await page( { html } );
	await type( 'cradle' );
	const titles = [ ...document.querySelectorAll( '.static-search-result__title' ) ].map( ( n ) => n.textContent );
	assert.deepEqual( titles, [ 'How to get rid of cradle cap?' ] );
} );

test( 'without a results page, submit is left to the browser', async () => {
	const { window, input, type, navigations } = await page( { config: { resultsUrl: '' } } );
	await type( 'cradle' );
	const submit = new window.Event( 'submit', { bubbles: true, cancelable: true } );
	input.form.dispatchEvent( submit );
	assert.equal( submit.defaultPrevented, false );
	assert.equal( navigations.length, 0 );
} );

test( 'with the results page switched off, submitting does nothing, but a highlighted result still opens', async () => {
	const { window, document, input, type, key, navigations } = await page( { config: { enter: 'none', resultsUrl: '' } } );
	await type( 'cradle' );
	assert.equal( document.querySelector( '.static-search-more' ), null, 'no "view all" link when there is no results page' );
	const submit = new window.Event( 'submit', { bubbles: true, cancelable: true } );
	input.form.dispatchEvent( submit );
	assert.equal( submit.defaultPrevented, true, 'the form does not submit' );
	assert.deepEqual( navigations, [], 'and nothing navigates' );
	key( 'ArrowDown' );
	const enter = key( 'Enter' );
	assert.equal( enter.defaultPrevented, true );
	assert.equal( navigations.length, 1, 'a highlighted result still opens' );
	assert.match( navigations[ 0 ], /^\/product\// );
} );

test( 'switched on but with no page to go to, submitting is left to the browser', async () => {
	const { window, input, type, navigations } = await page( { config: { enter: 'native', resultsUrl: '' } } );
	await type( 'cradle' );
	const submit = new window.Event( 'submit', { bubbles: true, cancelable: true } );
	input.form.dispatchEvent( submit );
	assert.equal( submit.defaultPrevented, false );
	assert.deepEqual( navigations, [] );
} );

test( 'switched on with a results page, Enter goes there (also with the explicit setting)', async () => {
	const { window, input, type, navigations } = await page( { config: { enter: 'results' } } );
	await type( 'baby oil' );
	const submit = new window.Event( 'submit', { bubbles: true, cancelable: true } );
	input.form.dispatchEvent( submit );
	assert.equal( submit.defaultPrevented, true );
	assert.deepEqual( navigations, [ '/search/?q=baby%20oil' ] );
} );

test( 'if the index cannot be loaded the visitor is told', async () => {
	const { document, type } = await page( { fetchImpl: () => Promise.resolve( { ok: false, status: 404 } ) } );
	await type( 'cradle' );
	assert.equal( document.querySelector( '.static-search-empty' ).textContent, 'Search is unavailable.' );
} );

const RESULTS = `${ FORM }
	<div data-static-search-page>
		<h2 data-static-search-title></h2><p data-static-search-status></p>
		<ol data-static-search-list></ol><button type="button" data-static-search-more hidden></button>
	</div>`;

test( 'results page: renders ?q= in pages, prefills the search box', async () => {
	const { document, input, wait } = await page( { html: RESULTS, url: 'https://example.test/search/?q=cradle' } );
	await wait( 100 );
	assert.equal( document.querySelector( '[data-static-search-title]' ).textContent, 'Search results for “cradle”' );
	assert.equal( document.querySelector( '[data-static-search-status]' ).textContent, '10 results' );
	assert.equal( document.querySelectorAll( '.static-search-page__item' ).length, 4, 'first page of 4' );
	assert.equal( input.value, 'cradle' );
	const more = document.querySelector( '[data-static-search-more]' );
	assert.equal( more.hidden, false );
	more.click();
	more.click();
	assert.equal( document.querySelectorAll( '.static-search-page__item' ).length, 10 );
	assert.equal( more.hidden, true );
	const first = document.querySelector( '.static-search-page__heading a' );
	assert.match( first.getAttribute( 'href' ), /^\/(product|cradle-cap)\// );
} );

test( 'results page: with no query it prompts; with an odd query it does not break', async () => {
	const empty = await page( { html: RESULTS, url: 'https://example.test/search/' } );
	assert.equal( empty.document.querySelector( '[data-static-search-status]' ).textContent, 'Type something.' );

	const odd = await page( { html: RESULTS, url: 'https://example.test/search/?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E' } );
	await odd.wait( 100 );
	assert.equal( odd.document.querySelector( '[data-static-search-title]' ).textContent, 'Search results for “<img src=x onerror=alert(1)>”' );
	assert.equal( odd.document.querySelectorAll( 'img[onerror]' ).length, 0, 'query is text, never markup' );
} );

test( 'a missing thumbnail leaves no broken image behind', async () => {
	const { window, document, type } = await page();
	await type( 'carrot' );
	const img = document.querySelector( '.static-search-result img' );
	assert.ok( img );
	img.dispatchEvent( new window.Event( 'error' ) );
	assert.equal( document.querySelector( '.static-search-result img' ), null );
} );
