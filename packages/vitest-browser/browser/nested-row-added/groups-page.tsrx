import { state } from '@markless/core';

type Group = { readonly name: string; readonly items: ReadonlyArray<string> };

export default function GroupsPage() @{
	let groups = state<ReadonlyArray<Group>>([
		{ name: 'Fruit', items: ['Apple', 'Pear'] },
		{ name: 'Veg', items: ['Kale'] },
	]);
	<main>
		@for (const group of groups; key group.name) {
			<section>
				<h2>{group.name}</h2>
				@for (const item of group.items; key item) {
					<button
						onClick={() =>
							(groups = groups.map((each) =>
								each.name === group.name ? { ...each, items: each.items.filter((other) => other !== item) } : each,
							))
						}
					>
						{`Drop ${group.name} ${item}`}
					</button>
				}
				<button
					onClick={() =>
						(groups = groups.map((each) =>
							each.name === group.name ? { ...each, items: [...each.items, 'Plum'] } : each,
						))
					}
				>
					{`Add to ${group.name}`}
				</button>
			</section>
		}
		<button id="add" onClick={() => (groups = [...groups, { name: 'Nuts', items: ['Pecan'] }])}>Add group</button>
	</main>
}
