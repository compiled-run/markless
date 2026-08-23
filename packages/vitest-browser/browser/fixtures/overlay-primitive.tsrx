import { element, state } from '@markless/core';
import { closeOverlay, openOverlay } from '@markless/web/fns/overlay';

// The primitive is handed element() handles, never selectors: the page names the
// surface and the trigger, and the runtime does the rest.
export default function OverlayPrimitivePage() @{
	let background = state(0);
	let modalOpen = state(false);
	let modalDismissals = state(0);
	let modalHandled = state('idle');
	let menuOpen = state(false);
	let menuDismissals = state(0);

	let modalContent = element<HTMLDivElement>();
	let modalTrigger = element<HTMLButtonElement>();
	let menuContent = element<HTMLDivElement>();
	let menuTrigger = element<HTMLButtonElement>();

	<section data-overlay-page>
		<button
			type="button"
			data-background
			onClick={() => {
				background = background + 1;
			}}
		>Background</button>
		<output data-background-count>{background}</output>
		<div data-live aria-live="polite">live</div>

		<div data-modal-widget>
			<button
				type="button"
				data-modal-trigger
				el={modalTrigger}
				aria-haspopup="dialog"
				aria-expanded={modalOpen ? 'true' : 'false'}
				onClick={() => {
					modalOpen = true;
					// The call is its own statement, not the right-hand side of the
					// state assignment: a handle read inside a state-write's value
					// expression still lowers to a graph read rather than the live
					// node, so the primitive would be handed `undefined`.
					const opened = openOverlay(modalContent, {
						kind: 'modal',
						trigger: modalTrigger,
						onDismiss: () => {
							modalOpen = false;
							modalDismissals = modalDismissals + 1;
						},
					});
					modalHandled = opened ? 'opened' : 'refused';
				}}
			>Open modal</button>
			<div
				data-modal-content
				el={modalContent}
				role="dialog"
				hidden={modalOpen !== true}
				ui-open={modalOpen}
			>
				<h2 data-modal-title>Delivery address</h2>
				<button
					type="button"
					data-modal-close
					onClick={() => {
						modalOpen = false;
						closeOverlay(modalContent);
					}}
				>Close</button>
				<output data-modal-dismissals>{modalDismissals}</output>
				<output data-modal-handled>{modalHandled}</output>
			</div>
		</div>

		<div data-menu-widget>
			<button
				type="button"
				data-menu-trigger
				el={menuTrigger}
				aria-expanded={menuOpen ? 'true' : 'false'}
				onClick={() => {
					if (menuOpen === true) {
						menuOpen = false;
						closeOverlay(menuContent);
						return;
					}
					menuOpen = true;
					openOverlay(menuContent, {
						kind: 'disclosure',
						trigger: menuTrigger,
						onDismiss: () => {
							menuOpen = false;
							menuDismissals = menuDismissals + 1;
						},
					});
				}}
			>Open menu</button>
			<div
				data-menu-content
				el={menuContent}
				hidden={menuOpen !== true}
				ui-open={menuOpen}
			>
				<button type="button" data-menu-item>Item</button>
				<output data-menu-dismissals>{menuDismissals}</output>
			</div>
		</div>
	</section>
}
