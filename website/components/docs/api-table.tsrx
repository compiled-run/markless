import ApiTableView from './api-table-view.tsrx';
import Collapsible from './collapsible.tsrx';
import { paintApiSections } from './api-derive/model.ts';
import { apiRows, apiSections, type ApiRow } from './api-derive/index.ts';
import { metaIfAny } from './ui-meta/index.ts';

export default function ApiTable({
	family,
	part,
	rows,
	summary,
}: {
	readonly family?: string;
	readonly part?: string;
	readonly rows?: readonly ApiRow[];
	/** Folds the table into a closed note with this line on it. */
	readonly summary?: string;
}) @{
	const name = family ?? '';
	const sections =
		rows === undefined && part === undefined
			? apiSections(name, metaIfAny(name)?.partOrder)
			: [{ name: '', id: '', rows: rows ?? apiRows(name, part ?? '') }];

	const painted = paintApiSections(sections);
	@if (summary) {
		<Collapsible summary={summary}>
			<ApiTableView painted={painted} />
		</Collapsible>
	} @else {
		<ApiTableView painted={painted} />
	}
}
