import { computed, state } from '@markless/core';
import { loadMugs, saveMug } from './mugs.ts';

export default function OneSave() @{
	let saving = state(false);
	const mugs = computed(async () => await loadMugs());

	<section>
		@try {
			<p>Mugs: {mugs.length}</p>
		} @pending {
			<p>Counting mugs</p>
		}
		<button
			aria-disabled={saving}
			onClick={async () => {
				if (saving) return;
				saving = true;
				try {
					await saveMug('Tall mug');
				} finally {
					saving = false;
				}
			}}
		>
			Add a tall mug
		</button>
	</section>
}
