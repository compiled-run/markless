import type { Row } from './grid-server.ts';

export function EntryLine({ entry, place }: { entry: Row; place: number }) @{
	<p data-g="row">{place}. {entry.label}</p>
}
