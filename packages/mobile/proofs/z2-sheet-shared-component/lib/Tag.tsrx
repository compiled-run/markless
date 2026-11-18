export function Tag({ label }: { label: string }) @{
	<span class="tag">
		<style>
			.tag {
				display: block;
				margin-top: 12px;
				padding: 6px 10px;
				border: 2px solid #1b4332;
				border-radius: 8px;
				background: #d8f3dc;
				color: #1b4332;
				font-size: 15px;
				font-weight: 700;
			}
		</style>
		{label}
	</span>
}
