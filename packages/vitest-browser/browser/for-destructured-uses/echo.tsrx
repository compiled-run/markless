import { state } from '@markless/core';

export function Echo({ label }: { label: string }) @{
	let shown = state('');
	<button data-echo onClick={() => (shown = label)}>{shown}</button>
}
