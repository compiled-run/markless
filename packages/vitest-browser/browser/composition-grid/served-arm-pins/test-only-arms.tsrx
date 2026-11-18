import { computed } from '@markless/core';
import ConstTag from './const-tag.tsrx';

export default function TestOnlyArms() @{
	const value = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return { odd: false };
	});
	<main>
		@try {
			@if (value.odd) {
				<ConstTag kind="odd" />
			} @else {
				<ConstTag kind="even" />
			}
		} @pending {
			<p>loading</p>
		}
	</main>
}
