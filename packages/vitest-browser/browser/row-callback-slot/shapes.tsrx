import { state } from '@markless/core';
import { tabs, toggle } from '../../../headless/components/src/index.ts';

const SHELVES = [{ label: 'north', bins: ['a', 'b'] }, { label: 'south', bins: ['c', 'd'] }];

function Shelf({ label, bins }: { readonly label: string; readonly bins: ReadonlyArray<string> }) @{
	let picked = state('-');
	<section>
		<div>
			@for (const bin of bins; key bin) {
				<toggle.root onChange={(on) => (picked = label + '/' + bin + '=' + on)}>
					<toggle.trigger data-bin={bin}>{bin}</toggle.trigger>
				</toggle.root>
			}
		</div>
		<output data-picked={label}>{picked}</output>
	</section>
}

export default function RowCallbackSlotShapes() @{
	let flips = state([{ code: 'x1' }, { code: 'y2' }]);
	let flipped = state('-');
	let views = state([{ slug: 'left', panes: ['one', 'two'] }, { slug: 'right', panes: ['three', 'four'] }]);
	let shown = state('-');
	<div>
		<div>
			@for (const flip of flips; key flip.code) {
				<toggle.root onChange={(on) => (flipped = flip.code + ':' + on)}>
					<toggle.trigger data-flip={flip.code}>{flip.code}</toggle.trigger>
				</toggle.root>
			}
		</div>
		<span data-flipped>{flipped}</span>
		<div>
			@for (const view of views; key view.slug) {
				<tabs.root value={view.panes[0]} onChange={(pane) => (shown = view.slug + '>' + pane)}>
					<tabs.list>
						@for (const pane of view.panes; key pane) {
							<tabs.trigger value={pane} data-pane={pane}>{pane}</tabs.trigger>
						}
					</tabs.list>
				</tabs.root>
			}
		</div>
		<span data-shown>{shown}</span>
		<div>
			@for (const shelf of SHELVES; key shelf.label) {
				<Shelf label={shelf.label} bins={shelf.bins} />
			}
		</div>
	</div>
}
