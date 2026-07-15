import { Nav } from './Nav.tsrx';

function LocalCard({ title, compact }: { title: string; compact?: boolean }) @{
	<article>{title}{compact}</article>
}

export function ComponentPropCompletions() @{
	const statementPosition = true;/*M9_STATEMENT*/
	<section>
		<Nav /*M9_IMPORTED*/ />
		<LocalCard /*M9_SAME_FILE*/ />
		<Nav label="paired">children/*M9_CHILDREN*/</Nav>
	</section>
}
