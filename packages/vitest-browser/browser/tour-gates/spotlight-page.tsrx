import { element, state } from '@markless/core';
import { nameAnchor } from './tour-anchor.ts';

// Gate 3. Intro.js's spotlight: the backdrop is not a layer with a hole, it IS
// the hole, and the dim is its 100vmax box-shadow. Only geometry is written; the
// colour, radius and spread stay ordinary CSS under `@layer markless`.
//
// `ui-hit` flips the backdrop's pointer-events so both sides of the
// "a box-shadow is not hit-testable" fact can be sampled from one page. The card
// carries the `overlay` attribute, which is where outside presses are heard.
export default function TourSpotlightPage() @{
	const target = element<HTMLButtonElement>();
	let hit = state(false);
	let open = state(false);
	let dismissals = state(0);
	let pressed = state('none');

	<section data-tg-spotlight-page>
		<style>
			@layer markless {
				[data-tg-behind] { position: fixed; inset: 0; background: rgb(255 255 255); }
				[data-tg-target] { position: fixed; top: 200px; left: 120px; width: 90px; height: 30px; }
				[data-tg-backdrop] {
					position: fixed;
					position-anchor: --tg-spot;
					top: anchor(top);
					left: anchor(left);
					width: anchor-size(width);
					height: anchor-size(height);
					box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.5);
					pointer-events: none;
				}
				[data-tg-backdrop][ui-hit] { pointer-events: auto; }
				[data-tg-card] { position: fixed; top: 0; left: 0; width: 40px; height: 20px; }
			}
		</style>

		<div data-tg-behind></div>
		<button type="button" data-tg-target el={target}>Save</button>
		<div data-tg-backdrop ui-hit={hit}></div>
		<div
			data-tg-card
			overlay
			role="dialog"
			hidden={open !== true}
			onDismiss={(event) => {
				const detail = event.detail;
				pressed = detail.pressTarget ? detail.pressTarget.tagName : 'none';
				dismissals = dismissals + 1;
			}}
		>card</div>

		<button
			type="button"
			data-tg-start
			onClick={() => {
				nameAnchor(target, '--tg-spot');
				open = true;
			}}
		>start</button>
		<button type="button" data-tg-hit onClick={() => { hit = true; }}>catch presses</button>
		<output data-tg-dismissals>{dismissals}</output>
		<output data-tg-pressed>{pressed}</output>
	</section>
}
