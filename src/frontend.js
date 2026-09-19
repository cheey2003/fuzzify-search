/**
 * Static Search front end: dropdown on every standard search field, plus the results page.
 *
 * Everything runs in the browser against one static JSON file, so it behaves the same on
 * the live WordPress site and in a static HTML export.
 */
import { createEngine, format, resultsHref, snippet } from './core.js';

( function () {
	'use strict';

	const cfg = window.StaticSearchConfig;
	if ( ! cfg || ! cfg.indexUrl ) {
		return;
	}
	const i18n = cfg.i18n || {};
	const FLAG = 'staticSearch';

	let enginePromise = null;
	let uid = 0;

	/** Fetch the index once, on first use. */
	function loadEngine() {
		if ( ! enginePromise ) {
			enginePromise = fetch( cfg.indexUrl, { credentials: 'same-origin', cache: 'no-cache' } )
				.then( ( res ) => {
					if ( ! res.ok ) {
						throw new Error( 'HTTP ' + res.status );
					}
					return res.json();
				} )
				.then( ( data ) => createEngine( data.items || [], cfg ) );
			// Allow a retry on the next use if the fetch failed.
			enginePromise.catch( () => {
				enginePromise = null;
			} );
		}
		return enginePromise;
	}

	function go( url ) {
		if ( typeof cfg.navigate === 'function' ) {
			cfg.navigate( url );
			return;
		}
		window.location.assign( url );
	}

	function el( tag, className, text ) {
		const node = document.createElement( tag );
		if ( className ) {
			node.className = className;
		}
		if ( text !== undefined ) {
			node.textContent = text;
		}
		return node;
	}

	function thumb( item, size ) {
		const img = el( 'img' );
		img.src = item.thumb;
		img.alt = '';
		img.width = size;
		img.height = size;
		img.loading = 'lazy';
		// A missing file should leave no broken-image icon behind.
		img.addEventListener( 'error', () => img.remove() );
		return img;
	}

	class Dropdown {
		constructor( input ) {
			this.input = input;
			this.form = input.closest( 'form' ) || input.parentElement;
			this.id = 'static-search-' + ++uid;
			this.type = this.formType();
			this.results = [];
			this.active = -1;
			this.timer = 0;
			this.seq = 0;
			this.isOpen = false;
			this.escaped = false;
			this.build();
			this.bind();
		}

		/** WooCommerce-style forms carry a hidden post_type: keep results to that type. */
		formType() {
			const hidden = this.form.querySelector( 'input[type="hidden"][name="post_type"]' );
			return hidden ? hidden.value : '';
		}

		build() {
			this.form.classList.add( 'static-search-form' );

			this.panel = el( 'div', 'static-search-results' );
			this.panel.hidden = true;
			this.list = el( 'ul', 'static-search-list' );
			this.list.id = this.id;
			this.list.setAttribute( 'role', 'listbox' );
			this.empty = el( 'p', 'static-search-empty' );
			this.empty.hidden = true;
			this.panel.append( this.list, this.empty );

			this.status = el( 'span', 'static-search-sr' );
			this.status.setAttribute( 'role', 'status' );
			this.status.setAttribute( 'aria-live', 'polite' );

			this.form.append( this.panel, this.status );

			const input = this.input;
			input.setAttribute( 'autocomplete', 'off' );
			input.setAttribute( 'role', 'combobox' );
			input.setAttribute( 'aria-autocomplete', 'list' );
			input.setAttribute( 'aria-haspopup', 'listbox' );
			input.setAttribute( 'aria-expanded', 'false' );
			input.setAttribute( 'aria-controls', this.id );
		}

		bind() {
			const input = this.input;

			// While an input method (pinyin, kana...) is composing, the field holds unfinished text:
			// wait until the visitor has picked the characters.
			input.addEventListener( 'input', ( e ) => {
				if ( ! e.isComposing ) {
					this.onInput();
				}
			} );
			input.addEventListener( 'compositionend', () => this.onInput() );
			input.addEventListener( 'focus', () => loadEngine().catch( () => {} ) );
			input.addEventListener( 'keydown', ( e ) => this.onKeydown( e ) );
			// The theme closes its fullscreen search on Escape keyup; when Escape only closed
			// the dropdown, keep that key press from also closing the whole overlay.
			input.addEventListener( 'keyup', ( e ) => {
				if ( e.key === 'Escape' && this.escaped ) {
					this.escaped = false;
					e.stopPropagation();
				}
			} );

			this.form.addEventListener( 'submit', ( e ) => this.onSubmit( e ) );
			this.form.addEventListener( 'focusout', ( e ) => {
				if ( ! e.relatedTarget || ! this.form.contains( e.relatedTarget ) ) {
					this.close();
				}
			} );
			document.addEventListener( 'pointerdown', ( e ) => {
				if ( ! this.form.contains( e.target ) ) {
					this.close();
				}
			} );
		}

		query() {
			return this.input.value.trim();
		}

		onInput() {
			clearTimeout( this.timer );
			if ( this.query().length < cfg.minChars ) {
				this.seq++;
				this.close();
				return;
			}
			this.timer = setTimeout( () => this.run(), cfg.delay );
		}

		run() {
			const query = this.query();
			const seq = ++this.seq;
			loadEngine()
				.then( ( engine ) => {
					if ( seq === this.seq ) {
						this.render( query, engine.search( query, { type: this.type } ) );
					}
				} )
				.catch( () => {
					if ( seq === this.seq ) {
						this.message( i18n.unavailable );
					}
				} );
		}

		render( query, hits ) {
			const shown = hits.slice( 0, cfg.maxResults );
			this.results = hits;
			this.active = -1;
			this.list.textContent = '';
			this.input.removeAttribute( 'aria-activedescendant' );

			shown.forEach( ( hit, index ) => this.list.append( this.option( hit.item, index ) ) );

			if ( hits.length > shown.length && cfg.resultsUrl ) {
				const li = el( 'li', 'static-search-result static-search-more' );
				li.id = this.id + '-opt-' + shown.length;
				li.setAttribute( 'role', 'option' );
				li.setAttribute( 'aria-selected', 'false' );
				const a = el( 'a', '', format( i18n.viewAll, hits.length ) );
				a.href = resultsHref( cfg.resultsUrl, query, this.type );
				a.tabIndex = -1;
				li.append( a );
				this.list.append( li );
			}

			this.list.hidden = ! hits.length;
			this.empty.hidden = hits.length > 0;
			this.empty.textContent = hits.length ? '' : i18n.none;
			this.announce( hits.length ? format( hits.length === 1 ? i18n.one : i18n.many, hits.length ) : i18n.none );
			this.open();
		}

		message( text ) {
			this.results = [];
			this.list.textContent = '';
			this.list.hidden = true;
			this.empty.hidden = false;
			this.empty.textContent = text;
			this.announce( text );
			this.open();
		}

		option( item, index ) {
			const li = el( 'li', 'static-search-result' );
			li.id = this.id + '-opt-' + index;
			li.setAttribute( 'role', 'option' );
			li.setAttribute( 'aria-selected', 'false' );

			const a = el( 'a' );
			a.href = item.url;
			// Focus stays in the input; arrow keys move the highlight instead.
			a.tabIndex = -1;
			if ( cfg.thumbs && item.thumb ) {
				a.append( thumb( item, 48 ) );
			}
			const body = el( 'span', 'static-search-result__body' );
			body.append( el( 'span', 'static-search-result__title', item.title ) );
			a.append( body );
			if ( item.type ) {
				a.append( el( 'small', 'static-search-result__type', item.type ) );
			}
			li.append( a );
			return li;
		}

		options() {
			return this.list.children;
		}

		onKeydown( e ) {
			// Enter/Escape/arrows during composition choose or cancel characters; leave them alone.
			if ( e.isComposing || e.keyCode === 229 ) {
				return;
			}
			switch ( e.key ) {
				case 'ArrowDown':
					if ( this.isOpen ) {
						e.preventDefault();
						this.move( 1 );
					} else if ( this.query().length >= cfg.minChars ) {
						e.preventDefault();
						this.run();
					}
					break;
				case 'ArrowUp':
					if ( this.isOpen ) {
						e.preventDefault();
						this.move( -1 );
					}
					break;
				case 'Enter':
					// With a highlighted result, open it; otherwise the form submit handler runs.
					if ( this.isOpen && this.active > -1 ) {
						e.preventDefault();
						const link = this.options()[ this.active ].querySelector( 'a' );
						if ( link ) {
							go( link.getAttribute( 'href' ) );
						}
					}
					break;
				case 'Escape':
					if ( this.isOpen ) {
						e.preventDefault();
						this.escaped = true;
						this.close();
					}
					break;
				case 'Tab':
					this.close();
					break;
				default:
			}
		}

		move( step ) {
			const count = this.options().length;
			if ( ! count ) {
				return;
			}
			let next = this.active + step;
			if ( next >= count ) {
				next = 0;
			} else if ( next < 0 ) {
				next = count - 1;
			}
			this.setActive( next );
		}

		setActive( index ) {
			const options = this.options();
			if ( options[ this.active ] ) {
				options[ this.active ].setAttribute( 'aria-selected', 'false' );
			}
			this.active = index;
			const current = options[ index ];
			if ( current ) {
				current.setAttribute( 'aria-selected', 'true' );
				this.input.setAttribute( 'aria-activedescendant', current.id );
				if ( current.scrollIntoView ) {
					current.scrollIntoView( { block: 'nearest' } );
				}
			}
		}

		onSubmit( e ) {
			// The results page is switched off in the settings: submitting the field (Enter or a Search button) does nothing.
			if ( cfg.enter === 'none' ) {
				e.preventDefault();
				return;
			}
			const query = this.query();
			if ( ! cfg.resultsUrl || ! query ) {
				return;
			}
			e.preventDefault();
			go( resultsHref( cfg.resultsUrl, query, this.type ) );
		}

		open() {
			this.isOpen = true;
			this.panel.hidden = false;
			this.input.setAttribute( 'aria-expanded', 'true' );
		}

		close() {
			this.isOpen = false;
			this.active = -1;
			this.panel.hidden = true;
			this.input.setAttribute( 'aria-expanded', 'false' );
			this.input.removeAttribute( 'aria-activedescendant' );
		}

		announce( text ) {
			this.status.textContent = '';
			// Re-set on the next tick so identical consecutive messages are read again.
			setTimeout( () => {
				this.status.textContent = text;
			}, 20 );
		}
	}

	/** Results page: shows every match for ?q=, a page at a time. */
	function initResultsPage( root ) {
		const params = new URLSearchParams( window.location.search );
		const query = ( params.get( 'q' ) || '' ).trim();
		const type = params.get( 'type' ) || '';
		const title = root.querySelector( '[data-static-search-title]' );
		const status = root.querySelector( '[data-static-search-status]' );
		const list = root.querySelector( '[data-static-search-list]' );
		const more = root.querySelector( '[data-static-search-more]' );

		if ( ! query ) {
			title.textContent = i18n.searchTitle;
			status.textContent = i18n.prompt;
			return;
		}

		title.textContent = format( i18n.resultsFor, query );
		status.textContent = i18n.loading;
		document.querySelectorAll( cfg.selector ).forEach( ( input ) => {
			if ( ! input.value ) {
				input.value = query;
			}
		} );

		loadEngine()
			.then( ( engine ) => {
				const hits = engine.search( query, { type } );
				let shown = 0;

				const item = ( entry ) => {
					const li = el( 'li', 'static-search-page__item' );
					if ( cfg.thumbs && entry.thumb ) {
						const media = el( 'a', 'static-search-page__thumb' );
						media.href = entry.url;
						media.tabIndex = -1;
						media.setAttribute( 'aria-hidden', 'true' );
						media.append( thumb( entry, 96 ) );
						li.append( media );
					}
					const body = el( 'div', 'static-search-page__body' );
					const heading = el( 'h3', 'static-search-page__heading' );
					const link = el( 'a', '', entry.title );
					link.href = entry.url;
					heading.append( link );
					body.append( heading );
					if ( entry.type ) {
						body.append( el( 'p', 'static-search-page__type', entry.type ) );
					}
					const text = snippet( entry );
					if ( text ) {
						body.append( el( 'p', 'static-search-page__snippet', text ) );
					}
					li.append( body );
					return li;
				};

				const showMore = () => {
					hits.slice( shown, shown + cfg.perPage ).forEach( ( hit ) => list.append( item( hit.item ) ) );
					shown = Math.min( hits.length, shown + cfg.perPage );
					more.hidden = shown >= hits.length;
				};

				status.textContent = hits.length
					? format( hits.length === 1 ? i18n.one : i18n.many, hits.length )
					: i18n.none;
				more.textContent = i18n.more;
				more.addEventListener( 'click', showMore );
				showMore();
			} )
			.catch( () => {
				status.textContent = i18n.unavailable;
			} );
	}

	/** Attach the dropdown to every standard search field not already handled. */
	function scan() {
		document.querySelectorAll( cfg.selector ).forEach( ( input ) => {
			// Leave fields another live-search plugin has already taken over.
			if ( input.dataset[ FLAG ] || input.getAttribute( 'data-swplive' ) === 'true' ) {
				return;
			}
			input.dataset[ FLAG ] = '1';
			new Dropdown( input );
		} );
	}

	function init() {
		scan();
		const page = document.querySelector( '[data-static-search-page]' );
		if ( page ) {
			initResultsPage( page );
		}
		// Search forms added later (popups, modals) get the dropdown too.
		if ( window.MutationObserver ) {
			let queued = false;
			const addsSearchField = ( mutations ) =>
				mutations.some( ( mutation ) =>
					Array.prototype.some.call(
						mutation.addedNodes,
						( node ) => node.nodeType === 1 && ( node.matches( cfg.selector ) || node.querySelector( cfg.selector ) )
					)
				);
			new MutationObserver( ( mutations ) => {
				if ( ! queued && addsSearchField( mutations ) ) {
					queued = true;
					window.requestAnimationFrame( () => {
						queued = false;
						scan();
					} );
				}
			} ).observe( document.body, { childList: true, subtree: true } );
		}
	}

	window.StaticSearch = {
		search: ( query, options ) => loadEngine().then( ( engine ) => engine.search( query, options ) ),
		rescan: scan,
	};

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
