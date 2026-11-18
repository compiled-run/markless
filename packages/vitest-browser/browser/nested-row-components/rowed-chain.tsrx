import { state } from '@markless/core';

const GROUPS = [{ name: 'a' }, { name: 'b' }];

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

function Group({ group }: { readonly group: { readonly name: string } }) @{
	<section>
		<Leaf group={group.name} name="x" />
		<Leaf group={group.name} name="y" />
	</section>
}

export default function RowedChainPage() @{
	<div>
		@for (const group of GROUPS; key group.name) {
			<Group group={group} />
		}
	</div>
}
