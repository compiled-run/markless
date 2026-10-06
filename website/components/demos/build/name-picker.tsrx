import { state } from '@markless/core';

function Picker({ name, onPick }: { name: string; onPick: (name: string) => void }) @{
	<button onClick={() => onPick(name)}>Pick {name}</button>
}

export default function NamePicker() @{
	let picked = state('nobody');

	<section>
		<p>Picked: {picked}</p>
		<Picker name="Ada" onPick={(name) => (picked = name)} />
		<Picker name="Grace" onPick={(name) => (picked = name)} />
	</section>
}
