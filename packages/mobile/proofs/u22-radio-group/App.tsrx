import { state } from '@markless/core';
import { radiogroup } from '@markless/ui';

export default function App() @{
	let plan = state('none');
	let size = state('small');
	<main>
		<h1>Billing</h1>
		<radiogroup.root onChange={(next) => (plan = next)}>
			<radiogroup.label>Billing period</radiogroup.label>
			<radiogroup.item value="monthly">
				<radiogroup.itemfield />
				<radiogroup.itemtrigger>Pick monthly</radiogroup.itemtrigger>
				<radiogroup.itemlabel>Monthly plan</radiogroup.itemlabel>
				<radiogroup.itemindicator>Monthly chosen</radiogroup.itemindicator>
			</radiogroup.item>
			<radiogroup.item value="annual">
				<radiogroup.itemfield />
				<radiogroup.itemtrigger>Pick annual</radiogroup.itemtrigger>
				<radiogroup.itemlabel>Annual plan</radiogroup.itemlabel>
				<radiogroup.itemindicator>Annual chosen</radiogroup.itemindicator>
			</radiogroup.item>
			<radiogroup.item value="lifetime" disabled>
				<radiogroup.itemfield />
				<radiogroup.itemtrigger>Pick lifetime</radiogroup.itemtrigger>
				<radiogroup.itemindicator>Lifetime chosen</radiogroup.itemindicator>
			</radiogroup.item>
		</radiogroup.root>
		<radiogroup.root value="small" onChange={(next) => (size = next)}>
			<radiogroup.label>Size</radiogroup.label>
			<radiogroup.item value="small">
				<radiogroup.itemfield />
				<radiogroup.itemtrigger>Pick small</radiogroup.itemtrigger>
				<radiogroup.itemindicator>Small chosen</radiogroup.itemindicator>
			</radiogroup.item>
			<radiogroup.item value="large">
				<radiogroup.itemfield />
				<radiogroup.itemtrigger>Pick large</radiogroup.itemtrigger>
				<radiogroup.itemindicator>Large chosen</radiogroup.itemindicator>
			</radiogroup.item>
		</radiogroup.root>
		<p>{`Plan: ${plan}`}</p>
		<p>{`Size: ${size}`}</p>
	</main>
}
