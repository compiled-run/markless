import { Slot } from './slot.tsrx';

export function Tray({ codes, onTake }: { codes: string[]; onTake: (code: string) => void }) @{
	<ul>
		@for (const code of codes; key code) {
			<li><Slot code={code} onPress={onTake} /></li>
		}
	</ul>
}
