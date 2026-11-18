import { computed, state } from '@markless/core';
import { loadNickname, saveNickname } from './nickname.ts';

export default function Nickname() @{
	let draft = state('');
	const nickname = computed(async () => await loadNickname());

	<section>
		@try {
			<div>
				<p>Nickname: {nickname}</p>
				<input
					value={draft}
					onInput={(event) => (draft = event.currentTarget.value)}
				/>
				<button onClick={async () => await saveNickname(draft)}>
					Save
				</button>
			</div>
		} @pending {
			<p>Loading</p>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</section>
}
