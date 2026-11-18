import { state } from '@markless/core';

function Band({ member }: { readonly member: string }) @{
	<div><Seat place="dark" member={member} /><Seat place="light" member={member} /></div>
}

function Seat({ place, member }: { readonly place: string; readonly member: string }) @{
	const taken = state({ by: '' });
	<button type="button" data-pick={member + '-' + place} onClick={() => { taken.by = member + ':' + place; }}>{member + ' ' + place + ' -> ' + taken.by}</button>
}

export default function RowsGrowingInPage() @{
	const members = state(['one']);
	<main>
		<button type="button" data-add onClick={() => { members.push('two'); }}>add</button>
		@for (const member of members; key member) {
			<Band member={member} />
		}
	</main>
}
