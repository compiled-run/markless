import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface, type Interface } from 'node:readline';

export type ProtocolMessage = {
	readonly type: 'request' | 'response' | 'event';
	readonly command?: string;
	readonly event?: string;
	readonly request_seq?: number;
	readonly success?: boolean;
	readonly message?: string;
	readonly body?: any;
};

type PendingResponse = {
	readonly resolve: (message: ProtocolMessage) => void;
	readonly reject: (error: Error) => void;
	readonly timer: ReturnType<typeof setTimeout>;
};

type PendingEvent = {
	readonly event: string;
	readonly predicate: (body: any) => boolean;
	readonly resolve: (body: any) => void;
	readonly reject: (error: Error) => void;
	readonly timer: ReturnType<typeof setTimeout>;
};

export type TsserverHarnessOptions = {
	readonly project: string;
	readonly workspaceRoot?: string;
	readonly globalPlugins?: readonly string[];
	readonly pluginProbeLocations?: readonly string[];
	readonly requestTimeoutMs?: number;
};

export type SourcePosition = {
	readonly line: number;
	readonly offset: number;
};

export class TsserverHarness {
	readonly project: string;
	readonly logFile: string;
	/** The exact tsserver command line, so tests can assert how the server was started. */
	readonly serverArguments: readonly string[];

	private readonly server: ChildProcessWithoutNullStreams;
	private readonly lines: Interface;
	private readonly requestTimeoutMs: number;
	private readonly pending = new Map<number, PendingResponse>();
	private readonly waitingEvents = new Set<PendingEvent>();
	private readonly stderr: string[] = [];
	private sequence = 0;
	private stopped = false;

	constructor(options: TsserverHarnessOptions) {
		this.project = options.project;
		this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
		this.logFile = join(options.project, 'tsserver.log');
		const workspaceRoot = options.workspaceRoot ?? process.cwd();
		const globalPlugins = options.globalPlugins ?? ['@markless/typescript-plugin'];
		const probeLocations = options.pluginProbeLocations ?? [
			join(workspaceRoot, 'node_modules'),
		];

		// An empty globalPlugins list omits the flag entirely instead of passing an empty
		// value. A caller asking for "no global plugins" then gets a server that was never
		// told about any, so the only remaining way a plugin can load is the project
		// tsconfig's compilerOptions.plugins - the path a scaffolded Markless app uses.
		this.serverArguments = [
			join(workspaceRoot, 'node_modules/typescript/lib/tsserver.js'),
			...(globalPlugins.length > 0 ? ['--globalPlugins', globalPlugins.join(',')] : []),
			'--pluginProbeLocations',
			probeLocations.join(','),
			'--allowLocalPluginLoads',
			'--logVerbosity',
			'verbose',
			'--logFile',
			this.logFile,
		];

		this.server = spawn(process.execPath, this.serverArguments, {
			cwd: options.project,
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		this.server.stderr.setEncoding('utf8');
		this.server.stderr.on('data', (chunk) => this.stderr.push(String(chunk)));
		this.server.once('exit', (code, signal) => {
			if (this.stopped) return;
			this.rejectAll(
				new Error(
					`tsserver exited before teardown (code ${String(code)}, signal ${String(signal)}).\n${this.stderr.join('')}`,
				),
			);
		});

		// tsserver's stdio transport writes one JSON protocol message per line. Ignore
		// Content-Length headers as well so the harness remains compatible with framed output.
		this.lines = createInterface({ input: this.server.stdout });
		this.lines.on('line', (line) => {
			const trimmed = line.trim();
			if (!trimmed || /^Content-Length:/i.test(trimmed)) return;
			try {
				this.receive(JSON.parse(trimmed) as ProtocolMessage);
			} catch {
				// Verbose server output is retained in the log; only protocol JSON is relevant here.
			}
		});
	}

	open(file: string, fileContent?: string): void {
		this.send('open', {
			file,
			fileContent,
			projectRootPath: this.project,
		});
	}

	change(file: string, start: SourcePosition, end: SourcePosition, insertString: string): void {
		this.send('change', {
			file,
			line: start.line,
			offset: start.offset,
			endLine: end.line,
			endOffset: end.offset,
			insertString,
		});
	}

	completionInfo(file: string, position: SourcePosition): Promise<any> {
		return this.requestBody('completionInfo', {
			file,
			...position,
			includeExternalModuleExports: true,
			includeInsertTextCompletions: true,
		}).catch((error: unknown) => {
			if (error instanceof Error && error.message.includes('No content available.')) {
				return undefined;
			}
			throw error;
		});
	}

	completionEntryDetails(
		file: string,
		position: SourcePosition,
		entries: ReadonlyArray<{
			readonly name: string;
			readonly source?: string;
			readonly data?: any;
		}>,
	): Promise<any> {
		this.send('configure', { preferences: { quotePreference: 'single' } });
		return this.requestBody('completionEntryDetails', {
			file,
			...position,
			entryNames: entries,
		});
	}

	quickinfo(file: string, position: SourcePosition): Promise<any> {
		return this.requestBody('quickinfo', { file, ...position });
	}

	definitionAndBoundSpan(file: string, position: SourcePosition): Promise<any> {
		return this.requestBody('definitionAndBoundSpan', { file, ...position });
	}

	jsxClosingTag(file: string, position: SourcePosition): Promise<any> {
		return this.requestBody('jsxClosingTag', { file, ...position });
	}

	linkedEditingRange(file: string, position: SourcePosition): Promise<any> {
		return this.requestBody('linkedEditingRange', { file, ...position });
	}

	syntacticDiagnosticsSync(file: string): Promise<any[]> {
		return this.requestBody('syntacticDiagnosticsSync', { file });
	}

	semanticDiagnosticsSync(file: string): Promise<any[]> {
		return this.requestBody('semanticDiagnosticsSync', { file });
	}

	waitForEvent(
		event: string,
		predicate: (body: any) => boolean = () => true,
		timeoutMs = this.requestTimeoutMs,
	): Promise<any> {
		return new Promise((resolve, reject) => {
			const waiting: PendingEvent = {
				event,
				predicate,
				resolve,
				reject,
				timer: setTimeout(() => {
					this.waitingEvents.delete(waiting);
					reject(new Error(`Timed out waiting for tsserver event ${event}.`));
				}, timeoutMs),
			};
			this.waitingEvents.add(waiting);
		});
	}

	readLog(): string {
		return existsSync(this.logFile) ? readFileSync(this.logFile, 'utf8') : '';
	}

	async close(): Promise<void> {
		if (this.stopped) return;
		this.stopped = true;
		this.rejectAll(new Error('tsserver harness closed.'));
		this.lines.close();
		this.server.stdin.end();
		if (this.server.exitCode === null && this.server.signalCode === null) {
			this.server.kill();
			await new Promise<void>((resolve) => {
				const timer = setTimeout(() => {
					if (this.server.exitCode === null && this.server.signalCode === null) {
						this.server.kill('SIGKILL');
					}
					resolve();
				}, 1_000);
				this.server.once('exit', () => {
					clearTimeout(timer);
					resolve();
				});
			});
		}
	}

	private send(command: string, args: object): number {
		const request = { seq: ++this.sequence, type: 'request', command, arguments: args };
		this.server.stdin.write(`${JSON.stringify(request)}\n`);
		return request.seq;
	}

	private requestBody(command: string, args: object): Promise<any> {
		return new Promise((resolve, reject) => {
			const requestSeq = this.send(command, args);
			const timer = setTimeout(() => {
				this.pending.delete(requestSeq);
				reject(
					new Error(
						`Timed out waiting for tsserver ${command}.\n${this.stderr.join('')}\n${this.readLog()}`,
					),
				);
			}, this.requestTimeoutMs);
			this.pending.set(requestSeq, {
				resolve: (message) => {
					if (!message.success) {
						reject(
							new Error(
								`tsserver ${command} failed: ${message.message ?? 'unknown error'}`,
							),
						);
						return;
					}
					resolve(message.body);
				},
				reject,
				timer,
			});
		});
	}

	private receive(message: ProtocolMessage): void {
		if (message.type === 'response' && message.request_seq !== undefined) {
			const pending = this.pending.get(message.request_seq);
			if (!pending) return;
			this.pending.delete(message.request_seq);
			clearTimeout(pending.timer);
			pending.resolve(message);
			return;
		}
		if (message.type === 'event' && message.event) {
			for (const waiting of this.waitingEvents) {
				if (waiting.event !== message.event || !waiting.predicate(message.body)) continue;
				this.waitingEvents.delete(waiting);
				clearTimeout(waiting.timer);
				waiting.resolve(message.body);
			}
		}
	}

	private rejectAll(error: Error): void {
		for (const response of this.pending.values()) {
			clearTimeout(response.timer);
			response.reject(error);
		}
		this.pending.clear();
		for (const event of this.waitingEvents) {
			clearTimeout(event.timer);
			event.reject(error);
		}
		this.waitingEvents.clear();
	}
}

export function copyFixtureProject(
	fixtureDirectory: string,
	workspaceRoot = process.cwd(),
): string {
	const project = mkdtempSync(join(tmpdir(), 'markless-completion-matrix-'));
	cpSync(fixtureDirectory, project, { recursive: true });
	linkWorkspacePackage(project, '@markless/core', join(workspaceRoot, 'packages/core'));
	// The nested upstream plugin resolves the tsconfig `tsrx.compiler` specifier from the
	// project directory, exactly as a real Markless app does.
	linkWorkspacePackage(
		project,
		'@markless/typescript-plugin',
		join(workspaceRoot, 'packages/typescript-plugin'),
	);
	return project;
}

export function removeFixtureProject(project: string): void {
	// tsserver flushes its verbose log asynchronously after kill; retry so teardown
	// does not race the final append and mask the test's real failure.
	rmSync(project, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

export function fixturePath(project: string, relativePath: string): string {
	return join(project, relativePath);
}

export function positionAfterMarker(source: string, marker: string): SourcePosition {
	const markerIndex = source.indexOf(marker);
	if (markerIndex < 0) throw new Error(`Missing source marker ${marker}.`);
	const sourceBeforeMarker = sourceWithoutMarkers(source.slice(0, markerIndex));
	return positionAtOffset(sourceBeforeMarker, sourceBeforeMarker.length);
}

export function positionAtSearch(source: string, search: string, insideOffset = 0): SourcePosition {
	const index = source.indexOf(search);
	if (index < 0) throw new Error(`Missing source anchor ${search}.`);
	return positionAtOffset(source, index + insideOffset);
}

export function sourceWithoutMarkers(source: string): string {
	return source.replace(/\/\*M\d+[A-Z0-9_]*\*\//g, '');
}

function positionAtOffset(source: string, offset: number): SourcePosition {
	const before = source.slice(0, offset);
	const lines = before.split('\n');
	return { line: lines.length, offset: (lines.at(-1)?.length ?? 0) + 1 };
}

function linkWorkspacePackage(project: string, packageName: string, target: string): void {
	const packagePath = join(project, 'node_modules', ...packageName.split('/'));
	mkdirSync(dirname(packagePath), { recursive: true });
	if (!existsSync(packagePath)) symlinkSync(target, packagePath, 'dir');
}
