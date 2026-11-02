import { Summary } from './summary.tsrx';

export default function Direct() @{
	<main><Summary items={['a', 'b', 'c']} config={{ title: 'direct', tags: ['x', 'y'] }} /></main>
}
