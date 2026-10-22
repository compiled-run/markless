import { art } from './agent-logos.art.ts';

const AGENTS = [
	{ key: 'claude', name: 'Claude Code' },
	{ key: 'codex', name: 'Codex' },
	{ key: 'cursor', name: 'Cursor' },
	{ key: 'gemini', name: 'Gemini CLI' },
	{ key: 'copilot', name: 'GitHub Copilot' },
	{ key: 'opencode', name: 'OpenCode' },
] as const;

/** A paragraph naming the coding agents markless-migrate sets up, each name after a small ink drawing of its mark. `lead` and `end` are the text before and after the list. */
export default function AgentLogos({ lead, end }: { readonly lead: string; readonly end: string }) @{
	<p class="agents">
		{lead + ' '}
		@for (const agent of AGENTS; index i; key agent.key) {
			{i === 0 ? '' : i === AGENTS.length - 1 ? ' and ' : ', '}
			<span class="agent">
				<svg class="logo" viewBox={'0 0 ' + art.size + ' ' + art.size} aria-hidden="true">
					<path class="tone" d={art.logos[agent.key].tone} />
					<path class="hatch" d={art.logos[agent.key].hatch} />
					<path class="ink" d={art.logos[agent.key].ink} />
				</svg>
				{agent.name}
			</span>
		}
		{end}
		<style>
			.agent {
				white-space: nowrap;
			}

			.logo {
				display: inline-block;
				width: 1.2em;
				height: 1.2em;
				margin-inline-end: 0.22em;
				vertical-align: -0.25em;
				overflow: visible;
			}

			.tone {
				fill: currentColor;
				fill-rule: evenodd;
				opacity: 0.25;
			}

			.hatch {
				fill: none;
				stroke: currentColor;
				stroke-width: 1.6;
				stroke-linecap: round;
				opacity: 0.8;
			}

			.ink {
				fill: currentColor;
			}
		</style>
	</p>
}
