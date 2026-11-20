import { state } from '@markless/core';

function elapsedRuns(): string {
	const start = performance.now();
	const later = performance.now();
	return typeof start === 'number' && later >= start ? 'steady' : 'stepped back';
}

function caught(name: string): string {
	try {
		throw new DOMException('no such pointer', name);
	} catch (error) {
		if (!(error instanceof DOMException) || error.name !== 'NotFoundError') return 'rethrown';
		return error instanceof Error ? `${error.name}: ${error.message}` : 'not an error';
	}
}

export default function ClockAndErrors() @{
	let report = state('');
	<main>
		<button onClick={() => (report = elapsedRuns())}>Clock</button>
		<button onClick={() => (report = caught('NotFoundError'))}>Missing</button>
		<button onClick={() => (report = caught('InvalidStateError'))}>Other</button>
		<p>{report}</p>
	</main>
}
