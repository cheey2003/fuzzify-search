// Bundles src/frontend.js and src/admin.js (each with Fuse.js) into the files WordPress loads.
// Run `npm run build` after changing anything in src/. The built file is committed,
// so the plugin works from a plain checkout without Node.
import { build } from 'esbuild';
import { readFileSync, copyFileSync, mkdirSync } from 'node:fs';

const version = ( name ) => JSON.parse( readFileSync( `node_modules/${ name }/package.json`, 'utf8' ) ).version;
const fuse = { version: version( 'fuse.js' ) };
const sortable = { version: version( 'sortablejs' ) };

const fuseCredit = `Fuse.js v${ fuse.version } (c) Kiro Risk, Apache-2.0, see LICENSE-fuse.txt`;
const sortableCredit = `SortableJS v${ sortable.version } (c) Lebedev Konstantin and contributors, MIT, see LICENSE-sortablejs.txt`;

// One bundle for visitors, one for the settings screen (search preview and drag-and-drop ranking).
for ( const [ entry, outfile, credits ] of [
	[ 'src/frontend.js', 'assets/js/static-search.js', fuseCredit ],
	[ 'src/admin.js', 'assets/js/static-search-admin.js', `${ fuseCredit }; ${ sortableCredit }` ],
] ) {
	await build( {
		entryPoints: [ entry ],
		bundle: true,
		minify: true,
		target: 'es2018',
		format: 'iife',
		outfile,
		banner: { js: `/*! Fuzzify Search | includes ${ credits } */` },
	} );
}

// A few hundred bytes, printed inline in the page head so an old /?s= address is forwarded before
// the page paints. It has no dependencies and needs no banner.
await build( {
	entryPoints: [ 'src/forward-entry.js' ],
	bundle: true,
	minify: true,
	target: 'es2018',
	format: 'iife',
	outfile: 'assets/js/static-search-forward.js',
} );

copyFileSync( 'node_modules/fuse.js/LICENSE', 'assets/js/LICENSE-fuse.txt' );
copyFileSync( 'node_modules/sortablejs/LICENSE', 'assets/js/LICENSE-sortablejs.txt' );

// Select2 is a jQuery plugin, loaded on the settings screen as its own script (WordPress core does not ship it).
mkdirSync( 'assets/vendor/select2', { recursive: true } );
copyFileSync( 'node_modules/select2/dist/js/select2.min.js', 'assets/vendor/select2/select2.min.js' );
copyFileSync( 'node_modules/select2/dist/css/select2.min.css', 'assets/vendor/select2/select2.min.css' );
copyFileSync( 'node_modules/select2/LICENSE.md', 'assets/vendor/select2/LICENSE-select2.txt' );
console.log( `built assets/js/static-search.js, static-search-admin.js and static-search-forward.js (Fuse.js ${ fuse.version }, SortableJS ${ sortable.version }; Select2 ${ version( 'select2' ) } vendored)` );
