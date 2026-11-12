import { state } from '@markless/core';
import { saveTodo } from './save.ts';
import type { Profile } from './profile.ts';

export default function ProfileCard({ profile }: { profile: Profile }) @{
	let status = state('idle');

	<section>
		@if (status === 'busy') {
			<p data-saving>Renaming {profile.name}</p>
		} @else {
			<h2>{profile.name}</h2>
		}
		<button
			data-rename
			onClick={async () => {
				status = 'busy';
				await saveTodo(profile.name);
				status = 'idle';
			}}
		>
			Rename
		</button>
	</section>
}
