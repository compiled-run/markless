import { state } from '@markless/core';

type GreetingProps = {
	readonly name: string;
	readonly onRename: (next: string) => void;
};

function Greeting({ name, onRename }: GreetingProps) @{
	<div>
		<p>Hello, {name}</p>
		<button onClick={() => onRename('Grace')}>Rename</button>
	</div>
}

export default function Profile() @{
	let name = state('Ada');

	<section>
		<Greeting name={name} onRename={(next) => (name = next)} />
		<p>Saved as {name}</p>
	</section>
}
