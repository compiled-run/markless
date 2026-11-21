import { state } from '@markless/core';

type Group = { readonly name: string; readonly items: ReadonlyArray<string> };

export default function App() @{
	let groups = state<Group[]>([
		{ name: 'Fruit', items: ['Apple', 'Pear'] },
		{ name: 'Veg', items: ['Kale'] },
	]);
	<main>
		<h1>Groups</h1>
		@for (const group of groups; key group.name) {
			<section>
				<h2>{group.name}</h2>
				@for (const item of group.items; key item) {
					<button
						onClick={() =>
							(groups = groups.map((other) => ({
								name: other.name,
								items: other.items.filter((kept) => kept !== item),
							})))
						}
					>
						{`Drop ${group.name} ${item}`}
					</button>
				}
				<button
					onClick={() =>
						(groups = groups.map((other) =>
							other.name === group.name
								? { name: other.name, items: [...other.items, 'Fig'] }
								: other,
						))
					}
				>
					{`Add to ${group.name}`}
				</button>
			</section>
		}
		<button onClick={() => (groups = [...groups, { name: 'Nuts', items: ['Pecan'] }])}>
			Add group
		</button>
	</main>
}
