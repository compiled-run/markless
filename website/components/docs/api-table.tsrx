import ApiTableView from './api-table-view.tsrx';
import { paintApiSections } from './api-derive/model.ts';
import { apiRows, apiSections, type ApiRow } from './api-derive/index.ts';
import { metaIfAny } from './ui-meta/index.ts';

export default function ApiTable({
	family,
	part,
	rows,
}: {
	readonly family?: string;
	readonly part?: string;
	readonly rows?: readonly ApiRow[];
}) @{
	const name = family ?? '';
	const sections =
		rows === undefined && part === undefined
			? apiSections(name, metaIfAny(name)?.partOrder)
			: [{ name: '', id: '', rows: rows ?? apiRows(name, part ?? '') }];

	const painted = paintApiSections(sections);
	<ApiTableView painted={painted} />;
}
