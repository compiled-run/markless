export type EarlyEventRoot = HTMLElement & {
	__marklessEarlyEvents?: Event[] | 0;
};

export function createEarlyEventCaptureSource(eventNames: readonly string[]): string {
	return `(${captureEarlyEvents.toString()})(${JSON.stringify(eventNames)});`;
}

function captureEarlyEvents(eventNames: readonly string[]): void {
	if (document.readyState !== 'loading') return;
	const current = document as Document & {
		__marklessEarlyCapture?: { names: Set<string>; capture: (event: Event) => void };
	};
	if (!current.__marklessEarlyCapture) {
		const roots = new Set<EarlyEventRoot>();
		const capture = (event: Event) => {
			const target =
				event.target instanceof Element
					? event.target
					: (event.target as Node)?.parentElement;
			const root = target?.closest<EarlyEventRoot>('[data-async-container]');
			if (!root || root.__marklessEarlyEvents === 0) return;
			(root.__marklessEarlyEvents ||= []).push(event);
			roots.add(root);
		};
		const names = new Set<string>();
		current.__marklessEarlyCapture = { names, capture };
		current.addEventListener(
			'DOMContentLoaded',
			() => {
				for (const name of names) current.removeEventListener(name, capture, true);
				for (const root of roots)
					if (root.__marklessEarlyEvents !== 0) delete root.__marklessEarlyEvents;
				delete current.__marklessEarlyCapture;
			},
			{ once: true },
		);
	}
	const { names, capture } = current.__marklessEarlyCapture;
	for (const name of eventNames) {
		if (names.has(name)) continue;
		names.add(name);
		current.addEventListener(name, capture, true);
	}
}
