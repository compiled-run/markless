import { expect, test } from 'vitest';
import { roundTripRuntimeValueGraph } from '../src/index.ts';

class MoneyValue {
	amountCents: number;
	currency: string;

	constructor(amountCents: number, currency: string) {
		this.amountCents = amountCents;
		this.currency = currency;
	}

	format() {
		return `${this.currency} ${this.amountCents}`;
	}
}

test('runtime serializer edge cases preserve identity, cycles, classes, and diagnostics', () => {
	const shared = { id: 'shared-contact' };
	const cycleA: { name: string; next?: unknown } = { name: 'cycle-a' };
	const cycleB = { name: 'cycle-b', next: cycleA, parent: cycleA };
	cycleA.next = cycleB;
	const weakState = new WeakMap<object, string>();
	weakState.set(shared, 'hidden');

	const artifact = roundTripRuntimeValueGraph({
		primary: shared,
		secondary: shared,
		cycleA,
		money: new MoneyValue(4200, 'USD'),
		builtins: {
			createdAt: new Date('2026-06-14T00:00:00.000Z'),
			endpoint: new URL('https://example.com/poc'),
			tags: new Set(['runtime', 'serializer']),
			lookup: new Map([['primary', shared]]),
			amount: 123n,
			bytes: new Uint8Array([1, 2, 3]),
		},
		unsupported: {
			weakState,
			secretToken: 'sk_live_runtime_secret',
		},
	});

	expect(artifact.roundTrip.primary).toBe(artifact.roundTrip.secondary);
	expect(artifact.roundTrip.cycleA.next.next).toBe(artifact.roundTrip.cycleA);
	expect(artifact.roundTrip.cycleA.next.parent).toBe(artifact.roundTrip.cycleA);
	expect(artifact.roundTrip.money).toBeInstanceOf(MoneyValue);
	expect(artifact.roundTrip.money.format()).toBe('USD 4200');
	expect(artifact.roundTrip.builtins.createdAt).toBeInstanceOf(Date);
	expect(artifact.roundTrip.builtins.endpoint).toBeInstanceOf(URL);
	expect(artifact.roundTrip.builtins.tags).toBeInstanceOf(Set);
	expect(artifact.roundTrip.builtins.lookup.get('primary')).toBe(artifact.roundTrip.primary);
	expect(artifact.roundTrip.builtins.amount).toBe(123n);
	expect([...artifact.roundTrip.builtins.bytes]).toEqual([1, 2, 3]);

	expect(artifact.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_SERIALIZE_WEAK_COLLECTION',
				severity: 'error',
				statePath: 'unsupported.weakState',
			}),
			expect.objectContaining({
				code: 'MARKLESS_SERIALIZE_SECRET_LEAK',
				severity: 'warning',
				statePath: 'unsupported.secretToken',
			}),
		]),
	);
	expect(artifact.receipts).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				stage: 'serializer-roundtrip',
				inspectable: true,
			}),
			expect.objectContaining({
				stage: 'serializer-diagnostic',
				inspectable: true,
			}),
		]),
	);
});
