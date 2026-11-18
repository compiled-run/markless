import { state } from '@markless/core';

function Toggle({ mode, owner }: { readonly mode: string; readonly owner: string }) @{
	let picked = state('');
	<li><button type="button" data-pick={owner + '-' + mode} onClick={() => (picked = mode)}>{owner + ' ' + mode + ' -> ' + picked}</button></li>
}

function Row({ group }: { readonly group: string }) @{
	<ul><Toggle mode="dark" owner={group} /><Toggle mode="light" owner={group} /></ul>
}

function Panel({ side }: { readonly side: string }) @{
	<section><Row group={side} /></section>
}

export default function Deep() @{
	<div><Panel side="one" /><Panel side="two" /></div>
}
