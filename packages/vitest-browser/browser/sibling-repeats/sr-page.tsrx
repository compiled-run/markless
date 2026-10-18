import { state } from '@markless/core';
import { ImportedEntry, type Entry } from './sr-leaf.tsrx';

function LocalEntry({ entry }: { readonly entry: Entry }) @{
	<section data-local-row>
		<b>{entry.id}</b>
		@if (entry.open) {
			<i>open</i>
		} @else {
			<i>shut</i>
		}
	</section>
}

export default function SiblingRepeats() @{
	let entries = state<Entry[]>([{ id: 'seed', open: true }]);
	let banner = state(false);
	let picks = state<Entry[]>([]);
	<div>
		<main data-lists>
			<button
				type="button"
				data-refill
				onClick={() => (entries = [{ id: 'k', open: true }, { id: 'm', open: false }])}
			>
				refill
			</button>
			<button type="button" data-shrink onClick={() => (entries = [{ id: 'm', open: true }])}>
				shrink
			</button>
			<h2>local</h2>
			@for (const e of entries; key e.id) {
				<LocalEntry entry={e} />
			}
			<h2>inline</h2>
			@for (const e of entries; key e.id) {
				<div data-inline-row>
					<b>{e.id}</b>
					@if (e.open) {
						<i>open</i>
					} @else {
						<i>shut</i>
					}
				</div>
			}
		</main>
		<aside data-after-branch>
			<button type="button" data-banner onClick={() => (banner = !banner)}>banner</button>
			@if (banner) {
				<p data-notice>notice</p>
			}
			@for (const e of entries; key e.id) {
				<ImportedEntry entry={e} />
			}
			<footer data-end>end</footer>
		</aside>
		<ol data-picks>
			<li>
				<button type="button" data-pick onClick={() => (picks = picks.length ? [] : [{ id: 'p', open: true }])}>
					pick
				</button>
			</li>
			@if (banner) {
				<li data-pick-notice>notice</li>
			}
			@for (const p of picks; key p.id) {
				<li data-pick-row>{p.id}</li>
			} @empty {
				<li data-pick-empty>none</li>
			}
			<li data-pick-tail>tail</li>
		</ol>
	</div>
}
