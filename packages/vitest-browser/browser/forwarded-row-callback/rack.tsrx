import { Tray } from './tray.tsrx';

export function Rack({ onTaken }: { onTaken: (code: string) => void }) @{
	<article>
		<Tray codes={['k7', 'm2', 'q9']} onTake={onTaken} />
	</article>
}
