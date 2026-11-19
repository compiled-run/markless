import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Writing through a keyed @for row item (`row.done = true`) writes the element of
// the repeated state list that row renders. The element is found at dispatch, so
// the graph path stops at the list and the write carries the row it came from.

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Rows.tsrx', source, symbols: [] });
}

function eventHandlerSources(result: Awaited<ReturnType<typeof compile>>): string[] {
	return result.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source);
}

function errors(result: Awaited<ReturnType<typeof compile>>) {
	return [
		...result.semanticGraph.diagnostics,
		...result.stateLowering.diagnostics,
		...result.symbolModules.diagnostics,
	].filter((diagnostic) => diagnostic.severity === 'error');
}

const taskList = `
import { state } from '@markless/core';

export function Tasks() @{
	let tasks = state([
		{ slug: 'a', done: false, hits: 0 },
		{ slug: 'b', done: false, hits: 0 },
	]);

	<ul>
		@for (const task of tasks; key task.slug) {
			<li>
				<button onClick={() => (task.done = true)}>{task.slug}</button>
			</li>
		}
	</ul>
}
`;

test('an assignment through a row item lowers to a write of that element of the state list', async () => {
	const result = await compile(taskList);

	expect(errors(result)).toEqual([]);
	expect(result.stateLowering.writes).toEqual([
		expect.objectContaining({
			source: 'task.done',
			graphNodeId: 'state:tasks',
			path: [],
			operation: 'assign',
			row: { itemName: 'task', keyPath: ['slug'], itemPath: ['done'] },
		}),
	]);
	const [handler] = eventHandlerSources(result);
	expect(handler).toContain(
		'import { marklessRowItemPath } from "@markless/web/fns/row-item-path";',
	);
	expect(handler).toContain(
		'path: marklessRowItemPath(context, "state:tasks", [], "task", ["slug"], ["done"])',
	);
	// A literal write to one cell is otherwise a scalar leaf; a row write never is.
	expect(handler).not.toContain('marklessWriteScalar');
});

test('update, compound, and collection-method writes through a nested row item path lower alike', async () => {
	const result = await compile(`
import { state } from '@markless/core';

export function Board() @{
	const board = state({
		cards: [{ meta: { ref: 1, votes: 0, tags: [] as string[] } }],
	});

	<section>
		@for (const card of board.cards; key card.meta.ref) {
			<article>
				<button onClick={() => {
					card.meta.votes++;
					card.meta.votes += 2;
					card.meta.tags.push('hot');
				}}>vote</button>
			</article>
		}
	</section>
}
`);

	expect(errors(result)).toEqual([]);
	const rows = result.stateLowering.writes.map((write) => [
		write.operation,
		write.graphNodeId,
		write.path,
		write.row,
	]);
	const row = (itemPath: string[]) => ({ itemName: 'card', keyPath: ['meta', 'ref'], itemPath });
	expect(rows).toEqual([
		['update', 'state:board', ['cards'], row(['meta', 'votes'])],
		['assign', 'state:board', ['cards'], row(['meta', 'votes'])],
		['call', 'state:board', ['cards'], row(['meta', 'tags'])],
	]);
	const [handler] = eventHandlerSources(result);
	expect(handler).toContain('context.graph.update({');
	expect(handler).toContain('context.graph.call({');
	expect(handler).toContain(
		'marklessRowItemPath(context, "state:board", ["cards"], "card", ["meta", "ref"], ["meta", "tags"])',
	);
	expect(handler).not.toMatch(/\bcard\.meta/);
});

test('a handler local that shadows the row item name is not a row write', async () => {
	const result = await compile(`
import { state } from '@markless/core';

export function Tasks() @{
	let tasks = state([{ slug: 'a', done: false }]);

	<ul>
		@for (const task of tasks; key task.slug) {
			<li>
				<button onClick={() => {
					const task = { done: false };
					task.done = true;
				}}>x</button>
			</li>
		}
	</ul>
}
`);

	expect(result.stateLowering.writes.filter((write) => write.row)).toEqual([]);
	const [handler] = eventHandlerSources(result);
	expect(handler).toContain('task.done = true');
	expect(handler).not.toContain('marklessRowItemPath');
});

test('a dynamic property of the row item is refused as a dynamic path write', async () => {
	const result = await compile(`
import { state } from '@markless/core';

export function Tasks() @{
	let tasks = state([{ slug: 'a', done: false }]);
	let field = state('done');

	<ul>
		@for (const task of tasks; key task.slug) {
			<li>
				<button onClick={() => (task[field] = true)}>{field}</button>
			</li>
		}
	</ul>
}
`);

	expect(result.stateLowering.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		'MARKLESS_STATE_DYNAMIC_PATH_WRITE',
	);
});

test('a write through a row of a computed() list is refused as read-only, naming the source state', async () => {
	const result = await compile(`
import { computed, state } from '@markless/core';

export function Inbox() @{
	let messages = state([{ uid: 'm1', read: false }]);
	const unread = computed(() => messages.filter((message) => !message.read));

	<ol>
		@for (const message of unread; key message.uid) {
			<li>
				<button onClick={() => (message.read = true)}>{message.uid}</button>
			</li>
		}
	</ol>
}
`);

	const found = errors(result);
	expect(found.map((diagnostic) => diagnostic.code)).toEqual(['MARKLESS_COMPUTED_ROW_WRITE']);
	const [diagnostic] = found;
	expect(diagnostic?.message).toContain('"message.read"');
	expect(diagnostic?.message).toContain('"unread"');
	expect(diagnostic?.suggestions?.[0]?.message).toContain('"messages"');
	expect(diagnostic?.primarySpan?.start).toBeGreaterThan(0);
});

function seatRow(handler: string) {
	return `
import { state } from '@markless/core';

export function Seats() @{
	let seats = state([
		{ id: 'a', picked: false },
		{ id: 'b', picked: false },
	]);
	let other = state([{ id: 'x', picked: false }]);
	let j = state(0);

	<ul>
		@for (const seat of seats; index i; key seat.id) {
			<li>
				<button onClick={() => (${handler})}>{seat.id}</button>
			</li>
		}
	</ul>
}
`;
}

test("a write through the list at the row's own index lowers exactly like a write through the row item", async () => {
	const byItem = await compile(seatRow('seat.picked = true'));
	const byIndex = await compile(seatRow('seats[i].picked = true'));

	expect(errors(byIndex)).toEqual([]);
	const [itemWrite] = byItem.stateLowering.writes;
	const [indexWrite] = byIndex.stateLowering.writes;
	expect(indexWrite).toEqual({
		...itemWrite,
		source: 'seats[i].picked',
		sourceSpan: expect.anything(),
	});
	expect(indexWrite?.row).toEqual({ itemName: 'seat', keyPath: ['id'], itemPath: ['picked'] });
	expect(eventHandlerSources(byIndex)).toEqual(eventHandlerSources(byItem));
});

test("a toggle through the list at the row's own index writes that row's element", async () => {
	const result = await compile(seatRow('seats[i].picked = !seats[i].picked'));

	expect(errors(result)).toEqual([]);
	const [handler] = eventHandlerSources(result);
	expect(handler).toContain(
		'path: marklessRowItemPath(context, "state:seats", [], "seat", ["id"], ["picked"])',
	);
});

test('an indexed write that is not the row at its own index stays a dynamic path write', async () => {
	const refused = [
		'seats[i + 1].picked = true',
		'seats[j].picked = true',
		'other[i].picked = true',
		'seats[i] = { id: "z", picked: true }',
		'(() => { const i = 0; seats[i].picked = true; })()',
	];
	for (const handler of refused) {
		const result = await compile(seatRow(handler));
		expect(
			result.stateLowering.diagnostics.map((diagnostic) => diagnostic.code),
			handler,
		).toContain('MARKLESS_STATE_DYNAMIC_PATH_WRITE');
	}
});

test("an outer row's index on an inner row's list stays a dynamic path write", async () => {
	const nested = (write: string) => `
import { state } from '@markless/core';

export function Rows() @{
	let rows = state([{ id: 'r', seats: [{ id: 's', picked: false }] }]);

	@for (const row of rows; index r; key row.id) {
		<ul>
			@for (const seat of row.seats; index i; key seat.id) {
				<li><button onClick={() => (${write})}>{seat.id}</button></li>
			}
		</ul>
	}
}
`;
	const outerIndex = await compile(nested('row.seats[r].picked = true'));
	expect(outerIndex.stateLowering.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		'MARKLESS_STATE_DYNAMIC_PATH_WRITE',
	);

	const byItem = await compile(nested('seat.picked = true'));
	const byIndex = await compile(nested('row.seats[i].picked = true'));
	expect(errors(byIndex)).toEqual([]);
	expect(eventHandlerSources(byIndex)).toEqual(eventHandlerSources(byItem));
});
