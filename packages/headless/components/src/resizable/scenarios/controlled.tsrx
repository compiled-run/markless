import { state } from '@markless/core';
import { resizable } from '../../index.ts';

const START: Record<string, number> = { nav: 30, main: 70 };

// The sizes live in the page, not in the family: nothing moves until `onChange`
// hands the record back and it is written in again.
export default function Controlled() @{
	let held = state(START);
	let calls = state(0);

	<main>
		<resizable.root
			sizes={held}
			data-testid="root"
			style="inline-size: 400px; block-size: 120px"
			onChange={(next) => {
				held = next;
				calls = calls + 1;
			}}
		>
			<resizable.item value="nav" data-testid="nav">Navigation</resizable.item>
			<resizable.thumb
				value="nav"
				min={10}
				max={80}
				aria-label="Resize navigation"
				data-testid="thumb"
				style="inline-size: 8px; background: #ccc"
			/>
			<resizable.item value="main" data-testid="main">Content</resizable.item>
		</resizable.root>
		<button
			type="button"
			data-testid="reset"
			onClick={() => {
				held = START;
			}}
		>Reset</button>
		<output data-testid="calls">{calls}</output>
	</main>
}
