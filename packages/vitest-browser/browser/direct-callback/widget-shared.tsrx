import { shared, state } from '@markless/core';
import Press from './press.tsrx';

export const total = shared(
	() => {
		const box = state({ sold: 0 });
		return { ...box };
	},
	{ scope: 'page' },
);
export const stall = shared(
	() => {
		const box = state({ sold: 0 });
		return { ...box };
	},
	{ scope: 'widget' },
);

function Stall({ name }: { readonly name: string }) @{
	const s = stall();
	const t = total();

	<div>
		<b data-sold={name}>{s.sold}</b>
		<Press
			label={name}
			onPress={() => {
				s.sold++;
				t.sold++;
			}}
		>
			{'Sell ' + name}
		</Press>
	</div>
}

export default function WidgetShared() @{
	const t = total();

	<section>
		<output data-total="">{t.sold}</output>
		<Stall name="lemonade" />
		<Stall name="cookies" />
	</section>
}
