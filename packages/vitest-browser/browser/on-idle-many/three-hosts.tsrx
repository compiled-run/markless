import { count } from './idle-count.ts';

export function App() @{
	<main onIdle={() => count('panel')}>
		<section onIdle={() => count('grid')}>grid</section>
		<aside onIdle={() => count('details')}>details</aside>
	</main>;
}
