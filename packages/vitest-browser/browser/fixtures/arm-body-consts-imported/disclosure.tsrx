import { state } from '@markless/core';

const VALUES: Record<string, { readonly id: string; readonly title: string }> = {
	'/c': { id: 'gamma', title: 'Gamma page' },
	'/d': { id: 'delta', title: 'Delta page' },
};

export function Disclosure({ path }: { path: string }) @{
	const values = VALUES[path];
	let open = state(false);

	<div data-disclosure={path}>
		<button type="button" data-toggle onClick={() => (open = !open)}>Open</button>
		@if (open) {
			const hint = values.title + ' details';
			<>
				<p id={values.id} data-panel title={hint}>{values.title}</p>
			</>
		}
	</div>
}
