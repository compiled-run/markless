import { element, state } from '@markless/core';
import { nameAnchor } from './tour-anchor.ts';

// Gate 2. The card is placed by CSS anchoring alone against a name written onto
// the consumer's own element. Nothing here measures a box, so scroll, resize and
// reflow are the engine's problem, not a listener's.
//
// The write is called from a handler in THIS module because gate 1 measured that
// the handle does not survive a component edge; who calls it does not change the
// CSS facts under test.
//
// Three targets, one per scoping question: A sits in plain flow, B inside a root
// that scopes popover's own name, C inside a root that scopes C's name.
export default function TourAnchorPage() @{
	const targetA = element<HTMLButtonElement>();
	const targetB = element<HTMLButtonElement>();
	const targetC = element<HTMLButtonElement>();
	const targetPre = element<HTMLButtonElement>();
	let named = state('none');

	<section data-tg-anchor-page>
		<style>
			@layer markless {
				[data-tg-spacer-top] { height: 240px; }
				[data-tg-spacer-bottom] { height: 2400px; }
				[data-tg-pop-root] { anchor-scope: --ui-popover; }
				[data-tg-scope-root] { anchor-scope: --tg-c; }
				[data-tg-card-a], [data-tg-card-b], [data-tg-card-c] {
					position: fixed;
					position-area: bottom span-right;
					width: 60px;
					height: 24px;
					background: rgb(200 200 255);
				}
				[data-tg-card-a] { position-anchor: --tg-a; }
				[data-tg-card-b] { position-anchor: --tg-b; }
				[data-tg-card-c] { position-anchor: --tg-c; }
			}
		</style>

		<div data-tg-spacer-top></div>
		<button type="button" data-tg-target-a el={targetA}>A</button>
		<div data-tg-pop-root>
			<button type="button" data-tg-target-b el={targetB}>B</button>
		</div>
		<div data-tg-scope-root>
			<button type="button" data-tg-target-c el={targetC}>C</button>
		</div>
		<button type="button" data-tg-target-pre el={targetPre} style="anchor-name: --tg-already">pre</button>

		<div data-tg-card-a>card a</div>
		<div data-tg-card-b>card b</div>
		<div data-tg-card-c>card c</div>

		<button
			type="button"
			data-tg-name
			onClick={() => {
				nameAnchor(targetA, '--tg-a');
				nameAnchor(targetB, '--tg-b');
				nameAnchor(targetC, '--tg-c');
				named = nameAnchor(targetPre, '--tg-pre');
			}}
		>name anchors</button>
		<output data-tg-named>{named}</output>
		<div data-tg-spacer-bottom></div>
	</section>
}
