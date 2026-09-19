import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forward } from '../src/forward.js';

/** A stand-in for window.location that records where the visitor is sent. */
const at = ( search ) => {
	const sent = [];
	return { search, replace: ( url ) => sent.push( url ), sent };
};

test( 'forwards an old-style search address to the results page', () => {
	const loc = at( '?s=pregnancy' );
	assert.equal( forward( '/search/', loc ), true );
	assert.deepEqual( loc.sent, [ '/search/?q=pregnancy' ] );
} );

test( 'decodes the term the way WordPress would, and encodes it again', () => {
	assert.deepEqual( ( ( l ) => ( forward( '/search/', l ), l.sent ) )( at( '?s=baby+oil' ) ), [ '/search/?q=baby%20oil' ] );
	assert.deepEqual( ( ( l ) => ( forward( '/search/', l ), l.sent ) )( at( '?s=%E5%8F%91%E7%83%A7' ) ), [ '/search/?q=%E5%8F%91%E7%83%A7' ], 'Chinese survives' );
	assert.deepEqual( ( ( l ) => ( forward( '/search/', l ), l.sent ) )( at( '?s=a%26b%3Dc' ) ), [ '/search/?q=a%26b%3Dc' ], 'reserved characters stay inside the term' );
} );

test( 'keeps a post type restriction (WooCommerce product search)', () => {
	const loc = at( '?s=tea&post_type=product' );
	forward( '/search/', loc );
	assert.deepEqual( loc.sent, [ '/search/?q=tea&type=product' ] );
} );

test( 'other query parameters do not get in the way', () => {
	const loc = at( '?utm_source=mail&s=honey&paged=2' );
	forward( '/search/', loc );
	assert.deepEqual( loc.sent, [ '/search/?q=honey' ] );
} );

test( 'works with a results page on a plain-permalink address', () => {
	const loc = at( '?s=oil' );
	forward( '/?page_id=9', loc );
	assert.deepEqual( loc.sent, [ '/?page_id=9&q=oil' ] );
} );

test( 'does nothing without a term, with a blank term, or without a results page', () => {
	for ( const search of [ '', '?s=', '?s=%20%20', '?utm_source=mail', '?q=pregnancy' ] ) {
		const loc = at( search );
		assert.equal( forward( '/search/', loc ), false, search || '(no query)' );
		assert.deepEqual( loc.sent, [] );
	}
	const noPage = at( '?s=pregnancy' );
	assert.equal( forward( '', noPage ), false );
	assert.equal( forward( undefined, noPage ), false );
	assert.deepEqual( noPage.sent, [] );
} );

test( 'never loops: an address the results page understands is left alone, and the target has no ?s=', () => {
	const both = at( '?s=a&q=b' );
	assert.equal( forward( '/search/', both ), false, 'q wins over s' );
	const loc = at( '?s=pregnancy' );
	forward( '/search/', loc );
	assert.equal( /[?&]s=/.test( loc.sent[ 0 ] ), false );
	const again = at( loc.sent[ 0 ].slice( loc.sent[ 0 ].indexOf( '?' ) ) );
	assert.equal( forward( '/search/', again ), false, 'following the forward does not forward again' );
} );

test( 'the built inline script does the same, and is tiny', () => {
	const code = readFileSync( new URL( '../assets/js/static-search-forward.js', import.meta.url ), 'utf8' );
	assert.ok( code.length < 600, `inline script is ${ code.length } bytes` );
	const loc = at( '?s=pregnancy&post_type=product' );
	new Function( 'window', code )( { StaticSearchForward: '/search/', location: loc } );
	assert.deepEqual( loc.sent, [ '/search/?q=pregnancy&type=product' ] );

	const quiet = at( '' );
	new Function( 'window', code )( { StaticSearchForward: '/search/', location: quiet } );
	assert.deepEqual( quiet.sent, [] );
} );
