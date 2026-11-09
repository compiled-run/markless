import Detail from './detail.tsrx';

export default function PlainList({ reload }: { reload: number }) @{
	<ul>
		<Detail id="ada" reload={reload} />
	</ul>
}
