import { state } from '@markless/core';
import { otp } from '../../index.ts';

// Six boxes written once instead of six times. The loop is wrapped in a.
 <div>
// because a construct cannot open directly inside a component tag's children.
export default function ItemsFromData() @{
	let slots = state([0, 1, 2, 3, 4, 5]);

	<otp.root length={6} data-testid="root">
		<otp.field data-testid="field" aria-label="Verification code" />
		<div data-testid="boxes">
			@for (const slot of slots; key slot) {
				<div data-slot={slot}>
					<otp.item index={slot} data-testid="looped-item" />
				</div>
			}
		</div>
	</otp.root>
}
