import { computed, state } from '@markless/core';

const weeksFor = (shift: number) => [0, 1, 2].map((i) => ({ key: `w${i}`, days: [0, 1].map((d) => ({ key: `${i}_${d}`, text: String(i * 10 + d + shift) })) }));

export default function Weeks(props: { id: string }) @{
	let view = state<{ v: number | null }>({ v: null });
	const model = computed(() => weeksFor(view.v ?? 0));
	<div id={props.id} hidden onIdle={() => { view = { v: 1 }; }}>
		<table><tbody>@for (const week of model; key week.key) { <tr>@for (const day of week.days; key day.key) { <td>{day.text}</td> }</tr> }</tbody></table>
	</div>
}
