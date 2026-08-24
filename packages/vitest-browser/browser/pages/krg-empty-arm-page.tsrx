import { state } from '@markless/core';

// Two lists over two sources, both served with rows so neither arm is painted at
// boot. The first list HAS an `@empty` arm and the second does not, which is what
// separates "the arm was raised" from "the rows went away".
//
// Both lists carry a static sibling in front of the rows, the combobox's shape:
// the arm has to land in the row span, not at the head of the parent.
export default function KrgEmptyArmPage() @{
	let armed = state([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
	]);
	let bare = state([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
	]);

	<section data-krg-empty-arm-page>
		<button type="button" data-krg-none onClick={() => {
			armed = [];
			bare = [];
		}}>none</button>
		<button type="button" data-krg-restore onClick={() => {
			armed = [
				{ id: 'a', label: 'alpha' },
				{ id: 'b', label: 'bravo' },
			];
			bare = [
				{ id: 'a', label: 'alpha' },
				{ id: 'b', label: 'bravo' },
			];
		}}>restore</button>
		<button type="button" data-krg-drop-first onClick={() => {
			armed = [{ id: 'b', label: 'bravo' }];
		}}>drop first</button>
		<ul data-krg-armed-list>
			<li data-krg-armed-header>header</li>
			@for (const item of armed; key item.id) {
				<li data-krg-armed-row data-krg-value={item.label}>{item.label}</li>
			} @empty {
				<li data-krg-armed-empty>nothing matches</li>
			}
		</ul>
		<ul data-krg-bare-list>
			<li data-krg-bare-header>header</li>
			@for (const item of bare; key item.id) {
				<li data-krg-bare-row data-krg-value={item.label}>{item.label}</li>
			}
		</ul>
		<p data-krg-tail>tail</p>
	</section>
}
