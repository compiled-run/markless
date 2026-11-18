import { state } from '@markless/core';

function Press({ label, onPress }: { readonly label: string; readonly onPress?: () => void }) @{
	<button data-forward={label} onClick={() => onPress?.()}>p</button>
}

function Leaf({ label, onPress }: { readonly label: string; readonly onPress?: () => void }) @{
	<Press label={label} onPress={onPress} />
}

function Group({ name }: { readonly name: string }) @{
	const seen = state({ text: '' });
	<section>
		<Leaf label={name + '-x'} onPress={() => (seen.text = 'group:' + name + '-x')} />
		<Leaf label={name + '-y'} onPress={() => (seen.text = 'group:' + name + '-y')} />
		<span data-seen={name}>{seen.text}</span>
	</section>
}

export default function ForwardedChainPage() @{
	<div>
		<Group name="a" />
		<Group name="b" />
	</div>
}
