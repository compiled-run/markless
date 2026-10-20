import { describe, expect, it } from 'vitest';
import { voiceOverSegments } from '../test-support/page-driver.ts';

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
