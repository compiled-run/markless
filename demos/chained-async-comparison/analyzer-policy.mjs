import assert from 'node:assert/strict';

export const START_EPSILON_MS = 25;
export const DELAY_TOLERANCE_MS = 12;
export const QUERY_RENDER_GAP_MS = 1;

export function assertTimeline(lane, timeline) {
	assert.equal(timeline.events.length, 4, `${lane} must issue exactly four data requests`);
	const events = Object.fromEntries(timeline.events.map((event) => [event.name, event]));
	assert.deepEqual(Object.keys(events).sort(), [
		'catalog',
		'recommendations',
		'reviews',
		'session',
	]);
	assert.equal(typeof timeline.pageStartMs, 'number', `${lane} must record page start`);

	if (lane === 'query') assertQueryTimeline(events, timeline.pageStartMs);
	else assertPrestartedTimeline(lane, events, timeline.pageStartMs);
	return events;
}

function assertPrestartedTimeline(lane, events, pageStartMs) {
	for (const name of ['session', 'catalog', 'reviews']) {
		assert.ok(
			events[name].startMs - pageStartMs < START_EPSILON_MS,
			`${lane} ${name} must start within ${START_EPSILON_MS}ms of page handling`,
		);
	}
	assert.ok(
		events.recommendations.startMs >= events.session.startMs + 60 - DELAY_TOLERANCE_MS,
		`${lane} recommendations must wait for the 60ms session dependency`,
	);
	assert.ok(
		events.recommendations.startMs >= events.session.settledMs - DELAY_TOLERANCE_MS,
		`${lane} recommendations must not prestart before session settles`,
	);
}

function assertQueryTimeline(events, pageStartMs) {
	assert.ok(
		events.session.startMs > pageStartMs,
		'query session must start after the first page render begins',
	);
	assert.ok(
		events.session.startMs - pageStartMs >= QUERY_RENDER_GAP_MS,
		`query session must preserve a measurable ${QUERY_RENDER_GAP_MS}ms render-to-effect gap`,
	);
	for (const name of ['recommendations', 'catalog', 'reviews']) {
		assert.ok(
			events[name].startMs > events.session.startMs,
			`query ${name} must start strictly after the parent session query`,
		);
		assert.ok(
			events[name].startMs >= events.session.settledMs - DELAY_TOLERANCE_MS,
			`query ${name} must wait until session data renders the nested component`,
		);
	}
	const nestedStarts = ['recommendations', 'catalog', 'reviews'].map(
		(name) => events[name].startMs,
	);
	assert.ok(
		Math.max(...nestedStarts) - Math.min(...nestedStarts) < START_EPSILON_MS,
		`query nested queries must retain their idiomatic parallel start within ${START_EPSILON_MS}ms`,
	);
}
