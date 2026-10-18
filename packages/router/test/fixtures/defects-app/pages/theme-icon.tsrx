import { state } from '@markless/core';
import { Moon, Sun } from '../src/icons.tsrx';

export default function ThemeIconPage() @{
	let dark = state(false);
	<main>
		<button type="button" data-theme onClick={() => (dark = !dark)}>
			@if (dark) {
				<Moon size={15} />;
			} @else {
				<Sun size={13} />;
			}
		</button>
	</main>;
}
