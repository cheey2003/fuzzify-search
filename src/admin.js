/**
 * Static Search settings screen: drag-and-drop ranking lists and the "Try it" box.
 *
 * The "Try it" box runs the same matching the visitors get against the current index, using the
 * values now in the form (saved or not), so a change to the ranking shows its effect straight away.
 */
import { createEngine, DEFAULT_RANK, format } from './core.js';
import { initRankLists } from './rank-lists.js';

( function () {
	'use strict';

	const cfg = window.StaticSearchAdmin;
	const root = document.querySelector( '[data-preview]' );
	if ( ! cfg || ! root ) {
		return;
	}

	const i18n = cfg.i18n || {};
	const labels = cfg.labels || {};
	const form = root.closest( 'form' );
	const input = root.querySelector( '[data-preview-input]' );
	const status = root.querySelector( '[data-preview-status]' );
	const table = root.querySelector( '[data-preview-table]' );
	const body = table.querySelector( 'tbody' );
	const NAME = 'static_search_settings';
	const SHOWN = 20;

	let items = null;
	let failed = false;
	let engine = null;
	let engineKey = '';

	const control = ( ...path ) => form.querySelector( `[name="${ NAME }${ path.map( ( part ) => `[${ part }]` ).join( '' ) }"]` );
	const ticked = ( group ) =>
		Array.from( form.querySelectorAll( `input[name="${ NAME }[${ group }][]"]:checked` ) )
			.map( ( box ) => box.value )
			.filter( Boolean );

	/** Ranking options as currently set in the form. */
	function options() {
		const rank = {};
		Object.keys( DEFAULT_RANK ).forEach( ( field ) => {
			const select = control( 'ranking', field );
			rank[ field ] = select ? parseInt( select.value, 10 ) || DEFAULT_RANK[ field ] : DEFAULT_RANK[ field ];
		} );

		const typeRank = {};
		const prefix = `${ NAME }[type_priority][`;
		Array.from( form.elements )
			.filter( ( field ) => field.name && field.name.indexOf( prefix ) === 0 )
			.forEach( ( field ) => {
				const slug = field.name.slice( prefix.length, -1 );
				typeRank[ slug ] = parseInt( field.value, 10 ) || 1;
			} );

		const mode = form.querySelector( `input[name="${ NAME }[type_mode]"]:checked` );
		const threshold = control( 'threshold' );

		return {
			fields: [ 'title' ].concat( ticked( 'fields' ) ),
			threshold: threshold ? parseFloat( threshold.value ) || 0.3 : 0.3,
			rank,
			typeRank,
			typeMode: mode ? mode.value : 'tie',
		};
	}

	function clear() {
		body.textContent = '';
		table.hidden = true;
	}

	function say( text ) {
		status.textContent = text;
	}

	function load() {
		if ( items !== null || failed ) {
			return Promise.resolve();
		}
		say( i18n.loading );
		return fetch( cfg.indexUrl, { credentials: 'same-origin', cache: 'no-cache' } )
			.then( ( res ) => {
				if ( ! res.ok ) {
					throw new Error( 'HTTP ' + res.status );
				}
				return res.json();
			} )
			.then( ( data ) => {
				items = data.items || [];
			} )
			.catch( () => {
				failed = true;
				say( i18n.unavailable );
			} );
	}

	function cell( text, className ) {
		const td = document.createElement( 'td' );
		td.textContent = text;
		if ( className ) {
			td.className = className;
		}
		return td;
	}

	function run() {
		const query = input.value.trim();
		if ( ! query ) {
			clear();
			say( i18n.prompt );
			return;
		}
		load().then( () => {
			if ( items === null ) {
				return;
			}
			// Only the post types ticked in the form take part, as they will once saved.
			const types = ticked( 'post_types' );
			const opts = options();
			const key = JSON.stringify( [ opts, types ] );
			if ( key !== engineKey ) {
				engine = createEngine( items.filter( ( item ) => types.includes( item.pt ) ), opts );
				engineKey = key;
			}

			const hits = engine.search( query );
			body.textContent = '';
			hits.slice( 0, SHOWN ).forEach( ( hit, index ) => {
				const row = document.createElement( 'tr' );
				row.append( cell( String( index + 1 ), 'column-rank' ) );

				const title = document.createElement( 'td' );
				const link = document.createElement( 'a' );
				link.href = hit.item.url;
				link.target = '_blank';
				link.rel = 'noopener';
				link.textContent = hit.item.title;
				title.append( link );
				row.append( title, cell( hit.item.type || '' ), cell( hit.matched.map( ( field ) => labels[ field ] || field ).join( ', ' ) ) );
				body.append( row );
			} );

			table.hidden = ! hits.length;
			if ( ! hits.length ) {
				say( i18n.none );
			} else if ( hits.length > SHOWN ) {
				say( format( i18n.showing, SHOWN, hits.length ) );
			} else {
				say( format( hits.length === 1 ? i18n.one : i18n.many, hits.length ) );
			}
		} );
	}

	// Reordering a list refreshes the preview like any other setting.
	initRankLists( form, {
		i18n,
		onChange: () => form.dispatchEvent( new Event( 'change', { bubbles: true } ) ),
	} );

	// Results page: a searchable page picker, and the switch that turns the whole section on or off.
	const picker = document.getElementById( 'static-search-results-page' );
	const jq = window.jQuery;
	if ( picker && jq && jq.fn && jq.fn.select2 ) {
		jq( picker ).select2( {
			width: '24rem',
			minimumResultsForSearch: 0, // Always show the search box, however few pages there are.
			language: { noResults: () => i18n.noPages },
		} );
	}
	// Highlight colour: WordPress' own colour picker (Iris). Without it the field stays a plain text box.
	const swatch = document.getElementById( 'static-search-highlight-color' );
	if ( swatch && jq && jq.fn && jq.fn.wpColorPicker ) {
		jq( swatch ).wpColorPicker( {
			defaultColor: swatch.getAttribute( 'data-default-color' ) || false,
			// Colours that read well on a light background, to start from.
			palettes: [ '#1a7f37', '#0e7490', '#0b5cad', '#7c3aed', '#b42318', '#b54708' ],
		} );
	}
	const activate = form.querySelector( `input[type="checkbox"][name="${ NAME }[results_enabled]"]` );
	if ( activate ) {
		const dependent = Array.from( form.querySelectorAll( '[data-results-dependent]' ) );
		const syncActivate = () => {
			dependent.forEach( ( row ) => {
				row.classList.toggle( 'is-off', ! activate.checked );
				// Disabled fields are not submitted, so the saved page and options are kept while it is off.
				row.querySelectorAll( 'input, select, button' ).forEach( ( field ) => {
					field.disabled = ! activate.checked;
				} );
			} );
		};
		activate.addEventListener( 'change', syncActivate );
		syncActivate();
	}

	// Enter in the box must not save the settings form.
	input.addEventListener( 'keydown', ( event ) => {
		if ( event.key === 'Enter' ) {
			event.preventDefault();
		}
	} );
	// Typing in the box, or changing any setting, refreshes the preview.
	form.addEventListener( 'input', run );
	form.addEventListener( 'change', run );

	say( i18n.prompt );
}() );
