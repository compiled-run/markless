import { state } from '@markless/core';

const VALUES: Record<string, { readonly id: string; readonly title: string }> = {
	'/a': { id: 'alpha', title: 'Alpha page' },
	'/b': { id: 'beta', title: 'Beta page' },
};

function Disclosure({ path }: { path: string }) @{
	const values = VALUES[path];
	const label = 'Open ' + values.title;
	let open = state(false);

	<div data-disclosure={path}>
		<button type="button" data-toggle onClick={() => (open = !open)}>{label}</button>
		@if (open) {
			const hint = values.title + ' details';
			<>
				<p id={values.id} data-panel title={hint}>{values.title}</p>
			</>
		}
	</div>
}

export default function ArmBodyConsts() @{
	<main>
		<Disclosure path="/a" />
		<Disclosure path="/b" />
	</main>
}
