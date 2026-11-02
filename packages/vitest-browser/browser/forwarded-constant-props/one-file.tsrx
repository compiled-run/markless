import { computed, state } from '@markless/core';

function Strip({ heading }: { readonly heading: string }) @{
	<header><Chip mode="dark" heading={heading} /><Chip mode="light" heading={heading} /></header>
}

function Chip({ mode, heading }: { readonly mode: string; readonly heading: string }) @{
	const chosen = state({ last: '' });
	const caption = computed(() => heading + ' ' + mode + ' -> ' + chosen.last);
	<button type="button" data-pick={heading + '-' + mode} onClick={() => { chosen.last = heading + ':' + mode; }}>{caption}</button>
}

export default function OneFile() @{
	<div><Strip heading="inline" /></div>
}
