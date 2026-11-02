import { Wrap } from './wrap.tsrx';

export default function Forwarded() @{
	<main><Wrap items={['a', 'b', 'c']} config={{ title: 'forwarded', tags: ['x', 'y'] }} /></main>
}
