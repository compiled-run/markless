import { state } from '@markless/core';
import { accordion } from '../../index.ts';

// The controlled shape a consumer writes: the page holds `multiple` and
// `value`, the root is bound to both, and the buttons write each cell AFTER
// mount so what the sections show is what the page last said.
export default function Controlled() @{
	const page = state({
		multiple: false,
		value: '' as string | readonly string[],
	});

	<section data-testid="frame">
		<accordion.root
			data-testid="root"
			multiple={page.multiple}
			value={page.value}
			onChange={(next: string | readonly string[]) => {
				page.value = next;
			}}
		>
			<accordion.item value="engine" data-testid="engine-item">
				<accordion.itemlabel data-testid="engine-label">
					<accordion.itemtrigger data-testid="engine-trigger">Engine</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="engine-content">
					Two litres, four cylinders.
				</accordion.itemcontent>
			</accordion.item>
			<accordion.item value="brakes" data-testid="brakes-item">
				<accordion.itemlabel data-testid="brakes-label">
					<accordion.itemtrigger data-testid="brakes-trigger">Brakes</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="brakes-content">
					Ventilated discs on every wheel.
				</accordion.itemcontent>
			</accordion.item>
		</accordion.root>
		<button
			type="button"
			data-testid="open-brakes"
			onClick={() => {
				page.value = 'brakes';
			}}
		>Open brakes</button>
		<button
			type="button"
			data-testid="open-both"
			onClick={() => {
				page.multiple = true;
				page.value = ['engine', 'brakes'];
			}}
		>Open both</button>
		<output data-testid="held" data-value={page.value} />
	</section>
}
