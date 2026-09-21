import type { ManifestFamily, ManifestProp } from './manifest.ts';

export type ApiRow = {
	/** The prop, written as the consumer writes it. */
	readonly name: string;
	/** Its type, verbatim from the family's own types file. */
	readonly type: string;
	/** What it buys you. Text between backticks is drawn as inline code. */
	readonly does: string;
	/** Required props are drawn bold. */
	readonly required?: boolean;
	/** The default written as source text, e.g. `false`. Absent when it has none. */
	readonly default?: string;
};

export type ApiSection = {
	/** `accordion.item`, the name a consumer writes. */
	readonly name: string;
	/** The heading's anchor, `accordion-item`. */
	readonly id: string;
	readonly rows: readonly ApiRow[];
};

const oneLine = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function rowOf(prop: ManifestProp): ApiRow {
	return {
		name: prop.name,
		type: oneLine(prop.type),
		does: oneLine(prop.doc),
		required: prop.required === true ? true : undefined,
		default: prop.default,
	};
}

export function deriveApiRows(
	family: string,
	metadata: ManifestFamily,
	part: string,
): readonly ApiRow[] {
	const found = metadata.parts.find((entry) => entry.part === part);
	if (!found)
		throw new Error(
			`api-derive: '${family}' has no part '${part}'. Its parts are: ${metadata.parts.map((one) => one.part).join(', ')}.`,
		);
	return found.props.map(rowOf);
}

export function deriveApiSections(
	family: string,
	metadata: ManifestFamily,
	order?: readonly string[],
): readonly ApiSection[] {
	const names = order?.length
		? order
		: [...metadata.parts]
				.sort((a, b) =>
					a.part === 'root'
						? b.part === 'root'
							? 0
							: -1
						: b.part === 'root'
							? 1
							: a.part.localeCompare(b.part),
				)
				.map((p) => p.part);
	return names.map((part) => ({
		name: family + '.' + part,
		id: family + '-' + part,
		rows: deriveApiRows(family, metadata, part),
	}));
}

export function paintApiSections(sections: readonly ApiSection[]) {
	return sections.map((section) => ({
		id: section.id,
		name: section.name,
		headed: section.name !== '',
		empty: section.rows.length === 0,
		rows: section.rows.map((row) => ({
			name: row.name,
			type: row.type,
			label: row.name + ': ' + row.type,
			nameClass: row.required === true ? 'api-prop is-required' : 'api-prop',
			pieces: [
				...(row.required === true ? [{ text: 'Required. ', code: false }] : []),
				...row.does
					.split('`')
					.map((text, index) => ({ text, code: index % 2 === 1 }))
					.filter((piece) => piece.text !== ''),
				...(row.default === undefined
					? []
					: [
							{ text: ' Default ', code: false },
							{ text: row.default, code: true },
							{ text: '.', code: false },
						]),
			].map((piece, index) => ({
				text: piece.text,
				id: row.name + ':' + index,
				pieceClass: piece.code ? 'api-code' : 'api-text',
			})),
		})),
	}));
}
export type PaintedApiSections = ReturnType<typeof paintApiSections>;
