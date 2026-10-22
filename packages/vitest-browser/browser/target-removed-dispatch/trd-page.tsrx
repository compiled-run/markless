import { state } from '@markless/core';

export default function TargetRemovedPage() @{
	let focused = state(0);
	let hovered = state(0);
	let left = state(0);
	let likes = state(0);
	let menu = state(false);
	<section>
		<button type="button" data-menu onClick={() => (menu = !menu)}>menu</button>
		@if (menu) {
			<div data-drawer>
				<nav data-drawer-nav onFocusin={() => (focused = focused + 10)}>
					<a href="#combobox" data-drawer-link>combobox</a>
				</nav>
			</div>
		}
		<button type="button" data-like onClick={() => (likes = likes + 1)}>{likes}</button>
		<div data-sidebar>
			<nav data-nav onFocusin={() => (focused = focused + 1)}>
				<a href="#select" data-link>select</a>
			</nav>
		</div>
		<div data-player>
			<div data-facade onPointerover={() => (hovered = hovered + 1)}>
				<span data-play>play</span>
			</div>
		</div>
		<form data-search-form>
			<input data-search onFocusout={() => (left = left + 1)} />
		</form>
		<output data-focused>{focused}</output>
		<output data-hovered>{hovered}</output>
		<output data-left>{left}</output>
	</section>
}
