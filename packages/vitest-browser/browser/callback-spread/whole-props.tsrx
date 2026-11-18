import { state } from '@markless/core';

function Whole(props: { readonly 'data-whole': string; readonly onClick: () => void }) @{
	<button {...props} type="button">w</button>
}

export default function WholePropsPage() @{
	const seen = state({ text: '' });
	<div>
		<Whole data-whole="one" onClick={() => (seen.text = 'whole:one')} />
		<Whole data-whole="two" onClick={() => (seen.text = 'whole:two')} />
		<span data-seen>{seen.text}</span>
	</div>
}
