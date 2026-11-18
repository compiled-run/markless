import { state } from '@markless/core';

function Press({ label, onPress }: { readonly label: string; readonly onPress: () => void }) @{
	<button data-press={label} onClick={() => onPress()}>p</button>
}

function Leaf({ group, name }: { readonly group: string; readonly name: string }) @{
	const seen = state({ text: '' });
	<div>
		<Press label={group + '-' + name} onPress={() => (seen.text = 'leaf:' + group + '-' + name)} />
		<span data-seen={group + '-' + name}>{seen.text}</span>
	</div>
}

function Group({ name }: { readonly name: string }) @{
	<section>
		<Leaf group={name} name="x" />
		<Leaf group={name} name="y" />
	</section>
}

export default function DeepChainPage() @{
	<div>
		<Group name="a" />
		<Group name="b" />
	</div>
}
