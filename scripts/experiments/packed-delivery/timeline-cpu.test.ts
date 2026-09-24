import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';

function analyze(position: Record<string, number>) {
	const directory = mkdtempSync(join(tmpdir(), 'markless-trace-source-'));
	try {
		mkdirSync(join(directory, 'public/build'), { recursive: true });
		writeFileSync(join(directory, 'public/build/example.js'), 'function action() {}');
		const traceFile = join(directory, 'trace.json');
		writeFileSync(
			traceFile,
			JSON.stringify({
				traceEvents: [
					{
						name: 'Profile',
						id: 'profile',
						pid: 1,
						tid: 2,
						args: { data: { startTime: 0 } },
					},
					{
						name: 'ProfileChunk',
						id: 'profile',
						pid: 1,
						args: {
							data: {
								cpuProfile: {
									nodes: [
										{
											id: 1,
											callFrame: {
												functionName: 'action',
												url: 'http://localhost/markless/build/example.js',
												...position,
											},
										},
									],
									samples: [1, 1],
								},
								timeDeltas: [0, 30],
							},
						},
					},
					...Object.entries({ pointerover: 5, click: 10, mutation: 20 }).map(
						([name, ts]) => ({ name: 'markless-probe-' + name, ts, pid: 1, tid: 2 }),
					),
				],
			}),
		);
		const input = join(directory, 'input.json'),
			output = join(directory, 'output.json');
		writeFileSync(
			input,
			JSON.stringify({
				metadata: { output: directory },
				records: [
					{
						passed: true,
						test: 'sample',
						sample: 0,
						phases: [{ name: 'first-action', traceFile }],
					},
				],
			}),
		);
		execFileSync(
			process.execPath,
			[join(import.meta.dirname, 'timeline-cpu.mjs'), input, output],
			{ stdio: 'pipe' },
		);
		return JSON.parse(readFileSync(output, 'utf8')).records[1];
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

test.each([{}, { lineNumber: 0 }, { columnNumber: 0 }])(
	'keeps unattributed source frames when the trace omits position %j',
	(position) => {
		const result = analyze(position);
		expect(result.durationMs).toBe(0.01);
		expect(result.self[0]).toMatchObject({
			functionName: 'action',
			sampledMs: 0.01,
			sourceUnavailable: 'trace omits line or column',
		});
		expect(result.self[0].sourceSha256).toMatch(/^[a-f0-9]{64}$/);
		expect(result.self[0].source).toBeUndefined();
	},
);

test('attributes a valid source position', () => {
	expect(analyze({ lineNumber: 0, columnNumber: 0 }).self[0].source).toBe('function action() {}');
});

test.each([
	{ lineNumber: 4, columnNumber: 0 },
	{ lineNumber: 0, columnNumber: 50 },
	{ lineNumber: -1, columnNumber: 0 },
])('refuses an invalid source position %j', (position) => {
	expect(() => analyze(position)).toThrow();
});
