import Box from './box.tsrx';
import { mark } from './mark.ts';

const items = ['one', 'two'];
const TRIO = ['x', 'y', 'z'];

export function App() @{
	<main>
		<aside data-case="root-constant" attach={mark(TRIO)} onVisible={() => {}}>root</aside>
		<Box items={items} />
		<div style="height: 3000px">spacer</div>
		<Box items={items} />
	</main>
}
