import { computed } from '@markless/core';
import ProfileCard from './profile-card.tsrx';
import { loadProfile } from './profile.ts';

export default function ProfilePage() @{
	const profile = computed(async () => loadProfile());

	<article>
		@try {
			<ProfileCard profile={profile} />
		} @pending {
			<p>Loading</p>
		}
	</article>
}
