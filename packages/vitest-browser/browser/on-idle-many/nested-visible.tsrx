import { count } from './idle-count.ts';

export function App() @{
	<main onVisible={() => count('outer')}>
		<section onVisible={() => count('inner')}>inner</section>
		<aside onVisible={() => count('aside')}>aside</aside>
	</main>;
}
