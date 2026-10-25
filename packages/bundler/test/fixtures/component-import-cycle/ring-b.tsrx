import RingC from './ring-c.tsrx';

export default function RingB({ left }: { left: number }) @{
	<article data-ring-b>
		<RingC left={left} />
	</article>
}
