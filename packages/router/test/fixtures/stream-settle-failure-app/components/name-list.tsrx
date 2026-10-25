import { state } from '@markless/core';

export default function NameList({ title, names }: { readonly title: string; readonly names: readonly { id: number; name: string }[] }) @{
	let open = state(true);
	<section>
		<h2 onClick={() => (open = !open)}>{title}</h2>
		<ul hidden={!open}>
			@for (const n of names; key n.id) {
				<li>{n.name}</li>
			}
		</ul>
	</section>
}
