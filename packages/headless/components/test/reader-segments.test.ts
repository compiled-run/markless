import { describe, expect, it } from 'vitest';
import { nvdaSegments, voiceOverSegments } from '../test-support/page-driver.ts';

// Phrases as guidepup captured them from VoiceOver on a macos-26 runner.
describe('voiceOverSegments', () => {
	it('finds role, state and name in a phrase VoiceOver speaks without commas', () => {
		const spoken = voiceOverSegments('Checkbox Label unchecked checkbox');
		expect(spoken).toContain('checkbox');
		expect(spoken).toContain('unchecked');
		expect(spoken).toContain('Checkbox Label');
	});

	it('never lets a word stand in for a longer word that contains it', () => {
		expect(voiceOverSegments('Checkbox Label unchecked checkbox')).not.toContain('checked');
	});

	it('never lets a negated state stand in for the state', () => {
		const spoken = voiceOverSegments('Lettuce not selected row');
		expect(spoken).not.toContain('selected');
		expect(spoken).toContain('not selected');
	});

	it('keeps a fact from running across the commas VoiceOver does speak', () => {
		const spoken = voiceOverSegments('Monthly radio button, 1 of 3');
		expect(spoken).toContain('radio button');
		expect(spoken).toContain('1 of 3');
		expect(spoken).not.toContain('button 1');
	});

	it('keeps a name that holds commas whole', () => {
		const spoken = voiceOverSegments('Monday, August 3, 2026 toggle button');
		expect(spoken).toContain('Monday, August 3, 2026');
		expect(spoken).toContain('button');
		expect(spoken).not.toContain('button,');
	});

	it('reads a heading text as a name, never as the role words inside it', () => {
		const spoken = voiceOverSegments('heading level 2 Radio group');
		expect(spoken).toContain('Radio group');
		expect(spoken).toContain('heading');
		expect(spoken).not.toContain('group');
	});

	it('hears leaving a container as no announcement of it', () => {
		const spoken = voiceOverSegments('end of Topics group');
		expect(spoken).not.toContain('group');
		expect(spoken).not.toContain('Topics');
	});
});

// Phrases as guidepup captured them from NVDA on a windows-latest runner.
describe('nvdaSegments', () => {
	it('finds a role at the tail of a longer role word, and each item on a browse-mode line', () => {
		const spoken = nvdaSegments(
			'grouping, Text alignment, toggle button, pressed, Left, toggle button, not pressed, Center',
		);
		expect(spoken).toContain('button');
		expect(spoken).toContain('Left');
		expect(spoken).toContain('Center');
		expect(spoken).toContain('grouping');
	});

	it('keeps a name that holds commas whole', () => {
		expect(nvdaSegments('toggle button, Monday, August 3, 2026')).toContain(
			'Monday, August 3, 2026',
		);
	});

	it('never lets a negated state stand in for the state', () => {
		expect(nvdaSegments('check box, not checked, , Lettuce')).not.toContain('checked');
	});

	it('hears leaving a grouping as no announcement of one', () => {
		expect(nvdaSegments('out of grouping, heading, level 2, Rating')).not.toContain('grouping');
	});
});
