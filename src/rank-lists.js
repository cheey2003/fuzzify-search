/**
 * Drag-and-drop ordering for the ranking lists on the settings screen.
 *
 * Each row carries its rank number in a hidden input, which is what gets saved (no number is shown: the
 * order on screen is the ranking). The top row is rank 1; a row ticked "Same priority as above" shares the
 * rank of the row above it. Rows can be dragged
 * (SortableJS) or moved with the arrow buttons, which is what keyboard and screen-reader users use.
 */
import Sortable from 'sortablejs';
import { format } from './core.js';

/**
 * @param {ParentNode} root      Container holding one or more `[data-rank-list]` lists.
 * @param {Object}     options   { onChange: called after any change, i18n: { moved } }.
 */
export function initRankLists( root, options ) {
	const onChange = ( options && options.onChange ) || ( () => {} );
	const i18n = ( options && options.i18n ) || {};

	root.querySelectorAll( '[data-rank-list]' ).forEach( ( list ) => {
		const status = list.parentElement.querySelector( '[data-rank-status]' );
		const rows = () => Array.from( list.children );
		const part = ( row, selector ) => row.querySelector( selector );

		/** Recompute every rank number from the order and the "same priority" ticks. */
		function renumber() {
			const all = rows();
			let rank = 0;
			all.forEach( ( row, index ) => {
				const tie = part( row, '[data-tie]' );
				tie.disabled = index === 0;
				if ( index === 0 ) {
					tie.checked = false;
				}
				if ( index === 0 || ! tie.checked ) {
					rank += 1;
				}
				part( row, '[data-rank-value]' ).value = String( rank );
				row.classList.toggle( 'is-tied', tie.checked );
				part( row, '[data-move="up"]' ).disabled = index === 0;
				part( row, '[data-move="down"]' ).disabled = index === all.length - 1;
			} );
		}

		function announce( row ) {
			if ( status && i18n.moved ) {
				status.textContent = format( i18n.moved, part( row, '[data-rank-label]' ).textContent, rows().indexOf( row ) + 1, rows().length );
			}
		}

		/**
		 * A row was moved. A "same priority as above" tick describes a pair of neighbours, so the ones
		 * around the moved row (where it was and where it landed) are cleared rather than left to
		 * mean something else.
		 */
		function moved( row, formerNext ) {
			[ row, formerNext, row.nextElementSibling ].forEach( ( neighbour ) => {
				const tie = neighbour && part( neighbour, '[data-tie]' );
				if ( tie ) {
					tie.checked = false;
				}
			} );
			renumber();
			announce( row );
			onChange();
		}

		let formerNext = null;
		Sortable.create( list, {
			handle: '[data-handle]',
			animation: 150,
			ghostClass: 'static-search-sortable__ghost',
			chosenClass: 'static-search-sortable__chosen',
			onStart: ( event ) => {
				formerNext = event.item.nextElementSibling;
			},
			onEnd: ( event ) => {
				if ( event.oldIndex !== event.newIndex ) {
					moved( event.item, formerNext );
				}
			},
		} );

		list.addEventListener( 'click', ( event ) => {
			const button = event.target.closest( '[data-move]' );
			if ( ! button || button.disabled ) {
				return;
			}
			const row = button.closest( 'li' );
			const next = row.nextElementSibling;
			if ( button.dataset.move === 'up' && row.previousElementSibling ) {
				list.insertBefore( row, row.previousElementSibling );
			} else if ( button.dataset.move === 'down' && next ) {
				list.insertBefore( next, row );
			} else {
				return;
			}
			moved( row, next );
			// Keep the keyboard focus on a working arrow for this row (the pressed one is disabled at an end).
			const same = part( row, `[data-move="${ button.dataset.move }"]` );
			( same.disabled ? part( row, `[data-move="${ button.dataset.move === 'up' ? 'down' : 'up' }"]` ) : same ).focus();
		} );

		list.addEventListener( 'change', ( event ) => {
			if ( event.target.matches( '[data-tie]' ) ) {
				renumber();
				onChange();
			}
		} );

		renumber();
	} );
}
