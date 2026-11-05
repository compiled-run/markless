import { state } from '@markless/core';
import { toggle } from '../../../headless/components/src/index.ts';

const ITEMS = [{ name: 'one' }, { name: 'two' }];

function Press({ label, onPress }: { readonly label: string; readonly onPress: () => void }) @{
	<button data-press={label} onClick={() => onPress()}>p</button>
}

function Spread({ children, ...rest }: { readonly children?: unknown; readonly 'data-spread': string; readonly onClick: () => void }) @{
	<button {...rest} type="button">{children}</button>
}

function Row({ item }: { readonly item: { readonly name: string } }) @{
	const seen = state({ text: '' });
	<div>
		<button data-direct={item.name} onClick={() => (seen.text = 'direct:' + item.name)}>d</button>
		<Press label={item.name} onPress={() => (seen.text = 'press:' + item.name)} />
		<Spread data-spread={item.name} onClick={() => (seen.text = 'spread:' + item.name)}>s</Spread>
		<toggle.root onChange={() => (seen.text = 'toggle:' + item.name)}>
			<toggle.trigger data-toggle={item.name}>t</toggle.trigger>
		</toggle.root>
		<span data-seen={item.name}>{seen.text}</span>
	</div>
}

export default function RowCallbackShapes() @{
	<div>
		@for (const item of ITEMS; key item.name) {
			<Row item={item} />
		}
	</div>
}
