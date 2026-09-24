import { state } from '@markless/core';
import type { MenuEntry } from './menu.ts';

export function Picker({ entry }: { readonly entry: MenuEntry }) @{
	let picks = state<MenuEntry[]>([]);
	let tag = state('pick');

	<section class="picker" data-entry={entry.id}>
		<ul class="choices">
			@for (const choice of entry.children!; key choice.id) {
				<li>
					<button class="choice" data-choice={choice.id} onClick={() => (picks = [...picks, choice])}>
						{choice.label}
					</button>
				</li>
			}
		</ul>
		<button class="pick-last" onClick={() => (picks = [...picks, entry.children![entry.children!.length - 1]!])}>
			last
		</button>
		<button class="retag" onClick={() => (tag = 'got')}>retag</button>
		<ol class="picks">
			@for (const pick of picks; key pick.id) {
				<li class="pick" data-id={pick.id}>{`${tag}/${pick.label}`}</li>
			}
		</ol>
	</section>
}
