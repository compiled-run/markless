import { state } from '@markless/core';

function Press({ label, onPress }: { readonly label: string; readonly onPress: () => void }) @{
	<button data-press={label} onClick={() => onPress()}>p</button>
}

function Forward({ ...rest }: { readonly label: string; readonly onPress: () => void }) @{
	<Press {...rest} />
}

export default function ComponentSpreadPage() @{
	const seen = state({ text: '' });
	<div>
		<Forward label="one" onPress={() => (seen.text = 'press:one')} />
		<Forward label="two" onPress={() => (seen.text = 'press:two')} />
		<span data-seen>{seen.text}</span>
	</div>
}
