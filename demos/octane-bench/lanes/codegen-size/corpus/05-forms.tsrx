import { state } from '@markless/core';
export function Forms() @{
	let name = state('Ada'); let subscribed = state(true);
	<form onSubmit={(event) => event.preventDefault()}><label>Name<input value={name} onInput={(event) => name = event.currentTarget.value} /></label><label><input type="checkbox" checked={subscribed} onChange={() => subscribed = !subscribed} />Updates</label><output>{name}</output></form>
}
