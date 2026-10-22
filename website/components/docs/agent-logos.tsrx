import InkLogo from './ink-logo.tsrx';

const AGENTS = [
	{ mark: 'claude', name: 'Claude Code' },
	{ mark: 'codex', name: 'Codex' },
	{ mark: 'cursor', name: 'Cursor' },
	{ mark: 'gemini', name: 'Gemini CLI' },
	{ mark: 'copilot', name: 'GitHub Copilot' },
	{ mark: 'opencode', name: 'OpenCode' },
] as const;

/** A paragraph naming the coding agents markless-migrate sets up, each name after an ink drawing of its mark. `lead` and `end` are the text before and after the list. */
export default function AgentLogos({ lead, end }: { readonly lead: string; readonly end: string }) @{
	<p class="agents">
		{lead + ' '}
		@for (const agent of AGENTS; index i; key agent.mark) {
			{i === 0 ? '' : i === AGENTS.length - 1 ? ' and ' : ', '}
			<span class="agent">
				<InkLogo mark={agent.mark} />
				{agent.name}
			</span>
		}
		{end}
		<style>
			.agent {
				white-space: nowrap;
			}
		</style>
	</p>
}
