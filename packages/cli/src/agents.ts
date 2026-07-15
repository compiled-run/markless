import { detectAgenticEnvironment } from 'am-i-vibing';
import { dirname, join } from 'pathe';
import type { Choice, ProgramRuntime } from './index.ts';

export type WritableAgentId = 'claude-code' | 'codex' | 'gemini-cli' | 'github-copilot';
export type AgentId = WritableAgentId | 'cursor';

export interface AgentRegistryEntry {
	readonly id: AgentId;
	readonly label: string;
	readonly homeDirectory: string;
	readonly skillPath?: string;
	readonly unavailableReason?: string;
}

export interface AgentWriteResult {
	readonly agent: WritableAgentId;
	readonly path: string;
	readonly status:
		| 'added'
		| 'updated'
		| 'already-configured'
		| 'removed'
		| 'not-configured'
		| 'collision';
}

const CURSOR_REASON =
	'Unavailable — Cursor has no documented conditional personal skill; User Rules apply to every project.';
const MARKER_PREFIX = '<!-- markless-managed-skill sha256:';

export const AGENT_REGISTRY = [
	{
		id: 'claude-code',
		label: 'Claude Code',
		homeDirectory: '.claude',
		skillPath: '.claude/skills/markless/SKILL.md',
	},
	{
		id: 'codex',
		label: 'Codex',
		homeDirectory: '.codex',
		skillPath: '.codex/skills/markless/SKILL.md',
	},
	{
		id: 'cursor',
		label: 'Cursor',
		homeDirectory: '.cursor',
		unavailableReason: CURSOR_REASON,
	},
	{
		id: 'gemini-cli',
		label: 'Gemini CLI',
		homeDirectory: '.gemini',
		skillPath: '.gemini/skills/markless/SKILL.md',
	},
	{
		id: 'github-copilot',
		label: 'GitHub Copilot',
		homeDirectory: '.copilot',
		skillPath: '.copilot/skills/markless/SKILL.md',
	},
] as const satisfies readonly AgentRegistryEntry[];

export const AGENT_NOTE_COPY = `Markless apps are built to be agent-debuggable.
Set this up and your agent knows Markless inside
and out: it can run the doctor, watch your app's
live state, and find and fix problems for you —
instead of guessing from stack traces.

This updates your agent's own config (e.g. ~/.claude),
so your project stays clean — no AI config files in
your repo. Remove anytime: npx markless agents remove`;

export function parseAgentList(value: string): WritableAgentId[] {
	const values = value.split(',').map((item) => item.trim());
	if (values.some((item) => item.length === 0)) {
		throw new Error('Invalid --agents value: agent names cannot be empty.');
	}
	if (values.includes('none')) {
		if (values.length > 1)
			throw new Error("Invalid --agents value: 'none' cannot be combined with agent names.");
		return [];
	}

	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) throw new Error(`Invalid --agents value: duplicate agent '${value}'.`);
		seen.add(value);
		if (value === 'cursor') throw new Error(`Unsupported agent 'cursor'. ${CURSOR_REASON}`);
		if (!isWritableAgentId(value)) {
			throw new Error(
				`Unsupported agent '${value}'. Use claude-code, codex, gemini-cli, github-copilot, or none.`,
			);
		}
	}
	return values as WritableAgentId[];
}

export function detectDrivingAgent(runtime: ProgramRuntime): AgentId | undefined {
	const result = detectAgenticEnvironment({ env: runtime.env, checkProcesses: false });
	if (result.id === 'claude-code' || result.name === 'Claude Code') return 'claude-code';
	if (result.id === 'codex' || result.name === 'OpenAI Codex') return 'codex';
	if (
		result.id === 'gemini-cli' ||
		result.id === 'gemini-agent' ||
		result.name === 'Gemini CLI'
	) {
		return 'gemini-cli';
	}
	if (result.id === 'vscode-copilot-agent' || result.name === 'GitHub Copilot in VS Code') {
		return 'github-copilot';
	}
	if (
		result.id === 'cursor' ||
		result.id === 'cursor-agent' ||
		result.name === 'Cursor' ||
		result.name === 'Cursor Agent'
	) {
		return 'cursor';
	}
	return undefined;
}

export async function findInstalledAgents(runtime: ProgramRuntime): Promise<AgentId[]> {
	const installed = await Promise.all(
		AGENT_REGISTRY.map(async (agent) => ({
			agent,
			found: Boolean(await runtime.fs.stat(join(runtime.homeDir, agent.homeDirectory))),
		})),
	);
	return installed.filter(({ found }) => found).map(({ agent }) => agent.id);
}

export function agentChoices(found: readonly AgentId[]): Array<Choice<AgentId>> {
	return AGENT_REGISTRY.map((agent) => {
		const prefix = found.includes(agent.id) ? 'found — ' : '';
		return {
			value: agent.id,
			label: agent.label,
			disabled: agent.id === 'cursor',
			hint: agent.unavailableReason
				? `${prefix}${agent.unavailableReason}`
				: `${prefix}updates ~/${agent.skillPath}`,
		};
	});
}

export function displaySkillPath(agentId: WritableAgentId): string {
	return `~/${registryEntry(agentId).skillPath}`;
}

export async function addAgentSkills(
	agents: readonly WritableAgentId[],
	runtime: ProgramRuntime,
): Promise<AgentWriteResult[]> {
	return Promise.all(
		agents.map((agent) => runAgentOperation(agent, runtime, writeAgentSkill)),
	);
}

export async function removeAgentSkills(
	agents: readonly WritableAgentId[],
	runtime: ProgramRuntime,
): Promise<AgentWriteResult[]> {
	return Promise.all(
		agents.map((agent) => runAgentOperation(agent, runtime, removeAgentSkill)),
	);
}

export const ALL_WRITABLE_AGENTS = AGENT_REGISTRY.flatMap((agent) =>
	agent.skillPath ? [agent.id as WritableAgentId] : [],
);

async function writeAgentSkill(
	agent: WritableAgentId,
	runtime: ProgramRuntime,
): Promise<AgentWriteResult> {
	const path = absoluteSkillPath(agent, runtime);
	const existing = await readIfPresent(path, runtime);
	if (existing === 'collision') return { agent, path, status: 'collision' };
	const current = await managedSkill(runtime);
	if (existing?.contents === current)
		return { agent, path, status: 'already-configured' };
	if (existing && !(await isValidManagedSkill(existing.contents, runtime))) {
		return { agent, path, status: 'collision' };
	}

	await runtime.fs.mkdir(dirname(path), { recursive: true });
	if (!existing) {
		if (await runtime.fs.atomicCreateFile(path, current)) {
			return { agent, path, status: 'added' };
		}

		const raced = await readIfPresent(path, runtime);
		if (!raced || raced === 'collision') return { agent, path, status: 'collision' };
		if (raced.contents === current)
			return { agent, path, status: 'already-configured' };
		if (!(await isValidManagedSkill(raced.contents, runtime))) {
			return { agent, path, status: 'collision' };
		}
	}

	// Concurrent user edits between validation and rename require OS-level locking; this CLI accepts that residual update race.
	await runtime.fs.atomicWriteFile(path, current);
	return { agent, path, status: 'updated' };
}

async function removeAgentSkill(
	agent: WritableAgentId,
	runtime: ProgramRuntime,
): Promise<AgentWriteResult> {
	const path = absoluteSkillPath(agent, runtime);
	const existing = await readIfPresent(path, runtime);
	if (!existing) return { agent, path, status: 'not-configured' };
	if (existing === 'collision') return { agent, path, status: 'collision' };
	if (!(await isValidManagedSkill(existing.contents, runtime)))
		return { agent, path, status: 'collision' };

	await runtime.fs.remove(path);
	await runtime.fs.rmdir(dirname(path));
	return { agent, path, status: 'removed' };
}

async function managedSkill(runtime: ProgramRuntime): Promise<string> {
	const payload = `---
name: markless
description: Use only when working in a Markless project, identified by an @markless/* dependency or .tsrx source, to load the project's versioned Markless guidance.
---

# Markless project guidance

1. Find the current project's manifest and confirm it has an \`@markless/*\` dependency or contains \`.tsrx\` source files.
2. Using the project-local runtime or module resolver, resolve the installed \`@markless/core\` entry from that project.
3. Walk upward from the resolved entry to the package root whose \`package.json\` has \`"name": "@markless/core"\`.
4. Read and follow \`agent/markless.md\` from that package root.
5. If project dependencies are not installed, or the package or knowledge file cannot be resolved, explain that and recommend installing the project's dependencies. Never substitute guidance from create-markless, another project, the network, or general memory.
`;
	const marker = `${MARKER_PREFIX}${await runtime.sha256(payload)} -->`;
	return payload.replace('---\n\n# Markless', `---\n${marker}\n\n# Markless`);
}

async function isValidManagedSkill(contents: string, runtime: ProgramRuntime): Promise<boolean> {
	const marker = contents.match(/^<!-- markless-managed-skill sha256:([a-f0-9]{64}) -->\n/m);
	if (!marker?.[1]) return false;
	const payload = contents.replace(marker[0], '');
	return (await runtime.sha256(payload)) === marker[1];
}

async function readIfPresent(
	path: string,
	runtime: ProgramRuntime,
): Promise<{ readonly contents: string } | 'collision' | undefined> {
	const entry = await runtime.fs.lstat(path);
	if (!entry) return undefined;
	if (!entry.isFile()) return 'collision';
	return { contents: await runtime.fs.readFile(path) };
}

async function runAgentOperation(
	agent: WritableAgentId,
	runtime: ProgramRuntime,
	operation: (
		agent: WritableAgentId,
		runtime: ProgramRuntime,
	) => Promise<AgentWriteResult>,
): Promise<AgentWriteResult> {
	try {
		return await operation(agent, runtime);
	} catch (error) {
		const path = absoluteSkillPath(agent, runtime);
		runtime.stderr?.write(
			`Agent configuration error at ${path}: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return { agent, path, status: 'collision' };
	}
}

function absoluteSkillPath(agentId: WritableAgentId, runtime: ProgramRuntime): string {
	return join(runtime.homeDir, registryEntry(agentId).skillPath!);
}

function registryEntry(agentId: AgentId): AgentRegistryEntry {
	return AGENT_REGISTRY.find((agent) => agent.id === agentId)!;
}

function isWritableAgentId(value: string): value is WritableAgentId {
	return AGENT_REGISTRY.some((agent) => agent.id === value && agent.skillPath !== undefined);
}
