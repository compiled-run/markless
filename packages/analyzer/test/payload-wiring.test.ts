import { describe, expect, test } from 'vitest';
import { parsePayloadEventClaims, reconcilePayloadWiring } from '../src/payload-wiring.ts';

const view = (events: unknown[], asyncBoundaries: unknown[] = []) =>
	JSON.stringify({ version: 1, locators: [], events, asyncBoundaries });
const registration = (overrides: Record<string, unknown> = {}) => ({
	containerId: 'shell',
	hostNodeId: 'button:save',
	eventName: 'click',
	kind: 'resume-record',
	...overrides,
});

describe('MLA-S2 payload wiring', () => {
	test('passes a payload claim confirmed by the runtime channel', () => {
		const claims = parsePayloadEventClaims({
			containerId: 'shell',
			viewScript: view([
				{ hostNodeId: 'button:save', eventName: 'click', symbolIds: ['event:save'] },
			]),
		});

		expect(reconcilePayloadWiring(claims, [registration()]).invariant).toEqual({
			id: 'MLA-S2-PAYLOAD-WIRING',
			status: 'pass',
			details: [],
		});
	});

	test('fails a payload claim that the runtime silently skipped', () => {
		const claims = parsePayloadEventClaims({
			containerId: 'shell',
			viewScript: view([
				{ hostNodeId: 'button:save', eventName: 'click', symbolIds: ['event:save'] },
			]),
		});
		const evaluation = reconcilePayloadWiring(claims, []);

		expect(evaluation.invariant.status).toBe('fail');
		expect(evaluation.invariant.details).toEqual([
			'shell: payload claims click on button:save but the runtime channel did not confirm it',
		]);
	});

	test('passes runtime-only direct CSR and callback-prop registrations', () => {
		const evaluation = reconcilePayloadWiring(
			[],
			[
				registration({ kind: 'direct-csr', hostNodeId: undefined, source: 'static-event' }),
				registration({
					kind: 'direct-csr',
					hostNodeId: undefined,
					eventName: 'change',
					source: 'callback-prop',
				}),
			],
		);

		expect(evaluation.invariant.status).toBe('pass');
		expect(evaluation.runtimeOnly).toEqual([]);
	});

	test('merges streamed arm claims with initial view claims', () => {
		const claims = parsePayloadEventClaims({
			containerId: 'shell',
			viewScript: view([
				{ hostNodeId: 'nav:home', eventName: 'click', symbolIds: ['event:home'] },
			]),
			armScripts: [
				{
					boundaryId: 'boundary:profile',
					content: JSON.stringify({
						locators: [],
						events: [
							{
								hostNodeId: 'profile:retry',
								eventName: 'click',
								symbolIds: ['event:retry'],
							},
						],
					}),
				},
			],
		});

		expect(claims.map(({ hostNodeId, source }) => [hostNodeId, source])).toEqual([
			['nav:home', 'view'],
			['profile:retry', 'streamed-arm'],
		]);
		expect(
			reconcilePayloadWiring(claims, [
				registration({ hostNodeId: 'nav:home' }),
				registration({ hostNodeId: 'profile:retry' }),
			]).invariant.status,
		).toBe('pass');
	});
});
