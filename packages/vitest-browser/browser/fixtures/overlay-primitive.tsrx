import { state } from '@markless/core';

// The whole surface is the bare `overlay` attribute. Nothing is imported, no
// handles are passed, and every policy decision - what closes, where focus goes -
// is written here as an ordinary `onDismiss` handler.
export default function OverlayPrimitivePage() @{
	let background = state(0);
	let isModalOpen = state(false);
	let modalDismissals = state(0);
	let modalReason = state('none');
	let isMenuOpen = state(false);
	let menuDismissals = state(0);
	let menuReason = state('none');
	let isAlwaysShownDismissals = state(0);

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
				aria-haspopup="dialog"
				aria-expanded={isModalOpen ? 'true' : 'false'}
				onClick={() => {
					isModalOpen = true;
				}}
			>Open modal</button>
			<div
				data-modal-content
				overlay
				role="dialog"
				aria-modal="true"
				hidden={isModalOpen !== true}
				onDismiss={(event) => {
					modalReason = event.detail.reason;
					modalDismissals = modalDismissals + 1;
					// A modal ignores an outside press: Escape is the only reason it
					// answers to. The behaviour reported both; the policy is here.
					if (event.detail.reason === 'escape') isModalOpen = false;
				}}
			>
				<h2 data-modal-title>Delivery address</h2>
				<button
					type="button"
					data-modal-close
					onClick={() => {
						isModalOpen = false;
					}}
				>Close</button>
				<output data-modal-dismissals>{modalDismissals}</output>
				<output data-modal-reason>{modalReason}</output>
			</div>
		</div>

		<div data-menu-widget>
			<button
				type="button"
				data-menu-trigger
				aria-expanded={isMenuOpen ? 'true' : 'false'}
				onClick={() => {
					isMenuOpen = isMenuOpen !== true;
				}}
			>Open menu</button>
			<div data-menu-content overlay hidden={isMenuOpen !== true} onDismiss={(event) => {
				menuReason = event.detail.reason;
				menuDismissals = menuDismissals + 1;
				isMenuOpen = false;
			}}>
				<button type="button" data-menu-item>Item</button>
				<output data-menu-dismissals>{menuDismissals}</output>
				<output data-menu-reason>{menuReason}</output>
			</div>
		</div>

		<div data-always-shown overlay onDismiss={() => {
			isAlwaysShownDismissals = isAlwaysShownDismissals + 1;
		}}>
			<output data-always-shown-dismissals>{isAlwaysShownDismissals}</output>
		</div>
	</section>
}
