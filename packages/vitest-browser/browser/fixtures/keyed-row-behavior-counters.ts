type RowSnapshot = {
	readonly attachments: number;
	readonly cleanupCounts: Readonly<Record<string, number>>;
	readonly hostsByKey: ReadonlyMap<string, HTMLTableRowElement>;
};

let attachments = 0;
const cleanupCounts = new Map<string, number>();
const hostsByKey = new Map<string, HTMLTableRowElement>();

export function resetRowBehaviorCounters(): void {
	attachments = 0;
	cleanupCounts.clear();
	hostsByKey.clear();
}

export function installRowBehavior(key: string) {
	return (host: HTMLTableRowElement) => {
		attachments++;
		hostsByKey.set(key, host);
		// Dynamic keyed-row attributes are outside the proven authoring shape
		// (they render empty), so the behavior stamps its key onto the host -
		// which doubles as proof that attach ran per row with the right key.
		host.dataset.rowKey = key;
		return () => {
			cleanupCounts.set(key, (cleanupCounts.get(key) ?? 0) + 1);
			hostsByKey.delete(key);
		};
	};
}

export function rowsForOperation(operation: string | undefined) {
	if (operation === 'reuse') {
		return [
			{ id: 'a', label: 'Alpha next' },
			{ id: 'b', label: 'Beta next' },
			{ id: 'c', label: 'Gamma next' },
			{ id: 'd', label: 'Delta next' },
		];
	}
	if (operation === 'reorder') {
		return [
			{ id: 'd', label: 'Delta next' },
			{ id: 'c', label: 'Gamma next' },
			{ id: 'b', label: 'Beta next' },
			{ id: 'a', label: 'Alpha next' },
		];
	}
	if (operation === 'remove') {
		return [
			{ id: 'd', label: 'Delta next' },
			{ id: 'a', label: 'Alpha next' },
		];
	}
	if (operation === 'clear') return [];
	return [
		{ id: 'a', label: 'Alpha fresh' },
		{ id: 'b', label: 'Beta fresh' },
		{ id: 'c', label: 'Gamma fresh' },
		{ id: 'd', label: 'Delta fresh' },
	];
}

export function rowBehaviorSnapshot(): RowSnapshot {
	return {
		attachments,
		cleanupCounts: Object.fromEntries(cleanupCounts),
		hostsByKey: new Map(hostsByKey),
	};
}
