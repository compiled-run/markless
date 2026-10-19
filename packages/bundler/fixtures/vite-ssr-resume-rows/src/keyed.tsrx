import { state } from '@markless/core';
import { makeUsers, toggle } from './table.ts';
import { UserCard } from './user-card.tsrx';

export type KeyedProps = { readonly count: number };

// The same N users twice: inline keyed rows, then keyed rows rendered by a component.
export default function Keyed({ count }: KeyedProps) @{
	let users = state(makeUsers(count));
	let selected = state<string[]>([]);

	<main>
		<ul>
			@for (const user of users; key user.id) {
				<li data-role={user.role}>
					<span>{user.name}</span>
					<button
						type="button"
						aria-pressed={selected.includes(user.id) ? 'true' : 'false'}
						onClick={() => {
							selected = toggle(selected, user.id);
						}}
					>
						pick
					</button>
				</li>;
			}
		</ul>
		<ol>
			@for (const user of users; key user.id) {
				<UserCard
					user={user}
					selected={selected}
					onPick={() => {
						selected = toggle(selected, user.id);
					}}
				/>;
			}
		</ol>
		<button
			type="button"
			onClick={() => {
				users = users.slice(1);
			}}
		>
			drop first
		</button>
	</main>;
}
