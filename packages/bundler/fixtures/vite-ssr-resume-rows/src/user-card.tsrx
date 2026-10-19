import { computed } from '@markless/core';
import type { User } from './table.ts';

export type UserCardProps = {
	readonly user: User;
	readonly selected: readonly string[];
	readonly onPick: () => void;
};

export function UserCard({ user, selected, onPick }: UserCardProps) @{
	const label = computed(() => `${user.name} <${user.email}>`);
	const picked = computed(() => (selected.includes(user.id) ? 'picked' : 'idle'));

	<li data-state={picked}>
		<span>{label}</span>
		<button type="button" onClick={() => onPick()}>
			pick
		</button>
	</li>;
}
