import { computed } from '@markless/core';

export default function List({
	title,
	names,
}: {
	readonly title: string;
	readonly names: ReadonlyArray<string>;
}) @{
	const items = computed(() => names.map((name) => ({ id: name, label: `row ${name}` })));
	<section>
		<h2 data-title>{title}</h2>
		<ul data-list>
			@for (const item of items; key item.id) {
				<li>{item.label}</li>;
			}
		</ul>
	</section>;
}
