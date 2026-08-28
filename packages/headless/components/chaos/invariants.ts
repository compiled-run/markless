// Checks answer with plain lines rather than asserting, so one failure can print
// every problem it found next to the seed and the gestures that produced them.

export type FailureWatch = {
	/** Everything the page reported since the watch started. */
	readonly reports: readonly string[];
	stop(): void;
};

function describeValue(value: unknown): string {
	if (value instanceof Error) return `${value.name}: ${value.message}`;
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/** Uncaught errors, unhandled rejections and `console.error`, while the watch is open. */
export function watchForFailures(): FailureWatch {
	const reports: string[] = [];
	const onError = (event: ErrorEvent) => {
		reports.push(`uncaught error: ${event.message || describeValue(event.error)}`);
	};
	const onRejection = (event: PromiseRejectionEvent) => {
		reports.push(`unhandled rejection: ${describeValue(event.reason)}`);
	};
	const realConsoleError = console.error;
	// Re-emits what it captured, so the run's own output still shows the message.
	console.error = (...args: unknown[]) => {
		reports.push(`console.error: ${args.map(describeValue).join(' ')}`);
		realConsoleError(...args);
	};
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	return {
		reports,
		stop() {
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onRejection);
			console.error = realConsoleError;
		},
	};
}

function isVisible(node: Element): boolean {
	if (!node.isConnected) return false;
	if (node instanceof HTMLElement && node.hidden) return false;
	if (node.getClientRects().length === 0) return false;
	const style = window.getComputedStyle(node);
	return style.display !== 'none' && style.visibility !== 'hidden';
}

function isFocusable(node: Element): boolean {
	if (!(node instanceof HTMLElement)) return false;
	if (node.tabIndex >= 0) return true;
	// tabindex="-1" is how these families hold a roving focus, so it counts.
	return node.hasAttribute('tabindex') || node.isContentEditable;
}

/**
 * Where focus ended up after a keyboard-only storm. Falling back to `<body>` is
 * the failure: a keyboard user is stranded with no way back into the widget.
 */
export function lostFocusReports(): string[] {
	const active = document.activeElement;
	if (!active || !active.isConnected) {
		return ['focus is on nothing that is still in the document'];
	}
	if (active === document.body || active === document.documentElement) {
		return [
			`focus fell back to <${active.localName}>: the storm dropped it and nobody caught it`,
		];
	}
	if (!isFocusable(active)) {
		return [
			`focus is on <${active.localName}>, which nothing can focus deliberately ` +
				'(no tabindex, not natively focusable)',
		];
	}
	return [];
}

/**
 * Triggers that say their content is collapsed while that content is on screen.
 * A missing `aria-controls` target is skipped rather than reported: a storm can
 * be read mid-move, and a v1 lane should not spend its first run on that.
 */
export function ariaStateMismatches(root: HTMLElement): string[] {
	const problems: string[] = [];
	const triggers = [root, ...root.querySelectorAll<HTMLElement>('[aria-expanded]')];
	for (const trigger of triggers) {
		const controls = trigger.getAttribute('aria-controls');
		if (!controls || trigger.getAttribute('aria-expanded') !== 'false') continue;
		const surface = document.getElementById(controls);
		if (!surface || !isVisible(surface)) continue;
		problems.push(
			`${describe(trigger)} says aria-expanded="false" while ${describe(surface)}, ` +
				'the element it controls, is still showing',
		);
	}
	return problems;
}

function describe(node: Element): string {
	const testid = node.getAttribute('data-testid');
	if (testid) return `[data-testid="${testid}"]`;
	return node.id ? `#${node.id}` : node.localName;
}
