import { state } from '@markless/core';
import { radiogroup } from '../../../headless/components/src/index.ts';

function Choice({ options, value }: { readonly options: readonly string[]; readonly value: string }) @{
	let picked = state(value);

	<div>
		<p data-testid="radio-picked">{picked}</p>
		<radiogroup.root value={value} onChange={(next: string) => { picked = next; }}>
			@for (const option of options; key option) {
				<radiogroup.item value={option}>
					<radiogroup.itemtrigger data-testid={`radio-${option}`}>{option}</radiogroup.itemtrigger>
				</radiogroup.item>
			}
		</radiogroup.root>
	</div>
}

export default function App() @{
	<Choice options={['small', 'medium', 'large']} value="small" />
}
