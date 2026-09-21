export default function MugArt({
	variant,
	mood,
	face,
	glaze,
	pour,
	coaster,
	companion,
	paused,
	interacted,
	reaction,
}: {
	variant: string;
	mood: string;
	face: string;
	glaze: string;
	pour: string;
	coaster: string;
	companion: string;
	paused: string;
	interacted: string;
	reaction: string;
}) @{
	<svg
		class="mug"
		viewBox="20 -28 220 270"
		data-variant={variant}
		data-docs-mug={variant === 'toc' ? 'true' : undefined}
		data-state={mood}
		data-expression={face}
		data-glaze={glaze}
		data-pour={pour}
		data-coaster={coaster}
		data-companion={companion}
		data-paused={paused}
		data-interacted={interacted}
		data-reaction={reaction}
		role="img"
		aria-label="The Markless mug"
	>
		<defs>
			<clipPath id={variant + '-cork-top'}>
				<path d="M193.09 206.18Q194.82 207.00 193.09 207.82Q191.36 208.64 191.48 209.48Q191.60 210.32 191.34 211.17Q191.09 212.02 188.42 212.68Q185.76 213.34 185.64 214.25Q185.52 215.16 183.11 215.80Q180.70 216.44 178.06 217.02Q175.43 217.59 174.17 218.46Q172.91 219.32 169.20 219.62Q165.49 219.91 163.02 220.52Q160.56 221.13 157.79 221.70Q155.02 222.26 151.13 222.29Q147.24 222.31 144.40 222.93Q141.57 223.56 137.90 223.61Q134.24 223.67 130.64 223.65Q127.03 223.62 123.51 224.02Q120.00 224.43 116.49 224.02Q112.97 223.62 109.36 223.65Q105.76 223.67 102.10 223.61Q98.43 223.56 95.60 222.93Q92.76 222.31 88.87 222.29Q84.98 222.26 82.21 221.70Q79.44 221.13 76.98 220.52Q74.51 219.91 70.80 219.62Q67.09 219.32 65.83 218.46Q64.57 217.59 61.94 217.02Q59.30 216.44 56.89 215.80Q54.48 215.16 54.36 214.25Q54.24 213.34 51.58 212.68Q48.91 212.02 48.66 211.17Q48.40 210.32 48.52 209.48Q48.64 208.64 46.91 207.82Q45.18 207.00 46.91 206.18Q48.64 205.36 48.52 204.52Q48.40 203.68 48.66 202.83Q48.91 201.98 51.58 201.32Q54.24 200.66 54.36 199.75Q54.48 198.84 56.89 198.20Q59.30 197.56 61.94 196.98Q64.57 196.41 65.83 195.54Q67.09 194.68 70.80 194.38Q74.51 194.09 76.98 193.48Q79.44 192.87 82.21 192.30Q84.98 191.74 88.87 191.71Q92.76 191.69 95.60 191.07Q98.43 190.44 102.10 190.39Q105.76 190.33 109.36 190.35Q112.97 190.38 116.49 189.98Q120.00 189.57 123.51 189.98Q127.03 190.38 130.64 190.35Q134.24 190.33 137.90 190.39Q141.57 190.44 144.40 191.07Q147.24 191.69 151.13 191.71Q155.02 191.74 157.79 192.30Q160.56 192.87 163.02 193.48Q165.49 194.09 169.20 194.38Q172.91 194.68 174.17 195.54Q175.43 196.41 178.06 196.98Q180.70 197.56 183.11 198.20Q185.52 198.84 185.64 199.75Q185.76 200.66 188.42 201.32Q191.09 201.98 191.34 202.83Q191.60 203.68 191.48 204.52Q191.36 205.36 193.09 206.18Z" />
			</clipPath>
		</defs>
		<g class="coaster-art" data-coaster-art="cork">
			<ellipse cx="120" cy="229" rx="72" ry="5" fill="#493628" opacity=".15" />
			<path
				d="M193.09 206.18Q194.82 207.00 193.09 207.82Q191.36 208.64 191.48 209.48Q191.60 210.32 191.34 211.17Q191.09 212.02 188.42 212.68Q185.76 213.34 185.64 214.25Q185.52 215.16 183.11 215.80Q180.70 216.44 178.06 217.02Q175.43 217.59 174.17 218.46Q172.91 219.32 169.20 219.62Q165.49 219.91 163.02 220.52Q160.56 221.13 157.79 221.70Q155.02 222.26 151.13 222.29Q147.24 222.31 144.40 222.93Q141.57 223.56 137.90 223.61Q134.24 223.67 130.64 223.65Q127.03 223.62 123.51 224.02Q120.00 224.43 116.49 224.02Q112.97 223.62 109.36 223.65Q105.76 223.67 102.10 223.61Q98.43 223.56 95.60 222.93Q92.76 222.31 88.87 222.29Q84.98 222.26 82.21 221.70Q79.44 221.13 76.98 220.52Q74.51 219.91 70.80 219.62Q67.09 219.32 65.83 218.46Q64.57 217.59 61.94 217.02Q59.30 216.44 56.89 215.80Q54.48 215.16 54.36 214.25Q54.24 213.34 51.58 212.68Q48.91 212.02 48.66 211.17Q48.40 210.32 48.52 209.48Q48.64 208.64 46.91 207.82Q45.18 207.00 46.91 206.18Q48.64 205.36 48.52 204.52Q48.40 203.68 48.66 202.83Q48.91 201.98 51.58 201.32Q54.24 200.66 54.36 199.75Q54.48 198.84 56.89 198.20Q59.30 197.56 61.94 196.98Q64.57 196.41 65.83 195.54Q67.09 194.68 70.80 194.38Q74.51 194.09 76.98 193.48Q79.44 192.87 82.21 192.30Q84.98 191.74 88.87 191.71Q92.76 191.69 95.60 191.07Q98.43 190.44 102.10 190.39Q105.76 190.33 109.36 190.35Q112.97 190.38 116.49 189.98Q120.00 189.57 123.51 189.98Q127.03 190.38 130.64 190.35Q134.24 190.33 137.90 190.39Q141.57 190.44 144.40 191.07Q147.24 191.69 151.13 191.71Q155.02 191.74 157.79 192.30Q160.56 192.87 163.02 193.48Q165.49 194.09 169.20 194.38Q172.91 194.68 174.17 195.54Q175.43 196.41 178.06 196.98Q180.70 197.56 183.11 198.20Q185.52 198.84 185.64 199.75Q185.76 200.66 188.42 201.32Q191.09 201.98 191.34 202.83Q191.60 203.68 191.48 204.52Q191.36 205.36 193.09 206.18Z"
				transform="translate(0 7)"
				fill="#9b683a"
				stroke="#66472f"
				stroke-width="1.4"
			/>
			<path
				d="M193.09 206.18Q194.82 207.00 193.09 207.82Q191.36 208.64 191.48 209.48Q191.60 210.32 191.34 211.17Q191.09 212.02 188.42 212.68Q185.76 213.34 185.64 214.25Q185.52 215.16 183.11 215.80Q180.70 216.44 178.06 217.02Q175.43 217.59 174.17 218.46Q172.91 219.32 169.20 219.62Q165.49 219.91 163.02 220.52Q160.56 221.13 157.79 221.70Q155.02 222.26 151.13 222.29Q147.24 222.31 144.40 222.93Q141.57 223.56 137.90 223.61Q134.24 223.67 130.64 223.65Q127.03 223.62 123.51 224.02Q120.00 224.43 116.49 224.02Q112.97 223.62 109.36 223.65Q105.76 223.67 102.10 223.61Q98.43 223.56 95.60 222.93Q92.76 222.31 88.87 222.29Q84.98 222.26 82.21 221.70Q79.44 221.13 76.98 220.52Q74.51 219.91 70.80 219.62Q67.09 219.32 65.83 218.46Q64.57 217.59 61.94 217.02Q59.30 216.44 56.89 215.80Q54.48 215.16 54.36 214.25Q54.24 213.34 51.58 212.68Q48.91 212.02 48.66 211.17Q48.40 210.32 48.52 209.48Q48.64 208.64 46.91 207.82Q45.18 207.00 46.91 206.18Q48.64 205.36 48.52 204.52Q48.40 203.68 48.66 202.83Q48.91 201.98 51.58 201.32Q54.24 200.66 54.36 199.75Q54.48 198.84 56.89 198.20Q59.30 197.56 61.94 196.98Q64.57 196.41 65.83 195.54Q67.09 194.68 70.80 194.38Q74.51 194.09 76.98 193.48Q79.44 192.87 82.21 192.30Q84.98 191.74 88.87 191.71Q92.76 191.69 95.60 191.07Q98.43 190.44 102.10 190.39Q105.76 190.33 109.36 190.35Q112.97 190.38 116.49 189.98Q120.00 189.57 123.51 189.98Q127.03 190.38 130.64 190.35Q134.24 190.33 137.90 190.39Q141.57 190.44 144.40 191.07Q147.24 191.69 151.13 191.71Q155.02 191.74 157.79 192.30Q160.56 192.87 163.02 193.48Q165.49 194.09 169.20 194.38Q172.91 194.68 174.17 195.54Q175.43 196.41 178.06 196.98Q180.70 197.56 183.11 198.20Q185.52 198.84 185.64 199.75Q185.76 200.66 188.42 201.32Q191.09 201.98 191.34 202.83Q191.60 203.68 191.48 204.52Q191.36 205.36 193.09 206.18Z"
				fill="#d1a16a"
				stroke="#765135"
				stroke-width="1.2"
			/>
			<g clip-path={'url(#' + variant + '-cork-top)'}>
				<path d="M45 190l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M92 209l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M139 191l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M186 210l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M84 192l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M131 211l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M178 193l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M76 212l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M123 194l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M170 213l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M68 195l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M115 214l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M162 196l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M60 215l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M107 197l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M154 216l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M52 198l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M99 217l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M146 199l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M193 218l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M91 200l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M138 219l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M185 201l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M83 220l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M130 202l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M177 221l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M75 203l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M122 222l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M169 204l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M67 223l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M114 205l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M161 224l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M59 206l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M106 225l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M153 207l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M51 226l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M98 208l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M145 190l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M192 209l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M90 191l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M137 210l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M184 192l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M82 211l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M129 193l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M176 212l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M74 194l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M121 213l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M168 195l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M66 214l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M113 196l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M160 215l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M58 197l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M105 216l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M152 198l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M50 217l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M97 199l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M144 218l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M191 200l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M89 219l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M136 201l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M183 220l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M81 202l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M128 221l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M175 203l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M73 222l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M120 204l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M167 223l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M65 205l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M112 224l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M159 206l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M57 225l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M104 207l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M151 226l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M49 208l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M96 190l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M143 209l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M190 191l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M88 210l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M135 192l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M182 211l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M80 193l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M127 212l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M174 194l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M72 213l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M119 195l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M166 214l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M64 196l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M111 215l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M158 197l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M56 216l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M103 198l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M150 217l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M48 199l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M95 218l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M142 200l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M189 219l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M87 201l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M134 220l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M181 202l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M79 221l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M126 203l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M173 222l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M71 204l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M118 223l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M165 205l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M63 224l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M110 206l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M157 225l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M55 207l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M102 226l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M149 208l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M47 190l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M94 209l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M141 191l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M188 210l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M86 192l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M133 211l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M180 193l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M78 212l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M125 194l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M172 213l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
				<path d="M70 195l1.34 -.5 .7 0.67-1.14 .8Z" fill="#edc995" />
				<path d="M117 214l1.78 -.5 .7 0.89-1.51 .8Z" fill="#aa7948" />
				<path d="M164 196l2.22 -.5 .7 1.11-1.89 .8Z" fill="#f0d3a8" />
				<path d="M62 215l0.90 -.5 .7 0.45-0.77 .8Z" fill="#704b30" />
			</g>
			<ellipse cx="49.0" cy="214.0" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="54.8" cy="215.4" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="60.6" cy="216.8" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="66.4" cy="218.2" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="72.2" cy="219.5" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="78.0" cy="220.7" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="83.8" cy="221.8" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="89.6" cy="222.7" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="95.4" cy="223.5" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="101.2" cy="224.2" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="107.0" cy="224.6" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="112.8" cy="224.9" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="118.6" cy="225.0" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="124.4" cy="224.9" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="130.2" cy="224.6" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="136.0" cy="224.2" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="141.8" cy="223.5" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="147.6" cy="222.7" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="153.4" cy="221.8" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="159.2" cy="220.7" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="165.0" cy="219.5" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="170.8" cy="218.2" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="176.6" cy="216.8" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="182.4" cy="215.4" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
			<ellipse cx="188.2" cy="214.0" rx=".8" ry="1.6" fill="#714b2f" opacity=".65" />
		</g>

		<ellipse class="shadow" cx="127" cy="214" rx="62" ry="7" />
		<g class="pose pop">
			<g class="gesture">
				<g class="breath breathe">
					<g class="handle-motion">
						<path class="handle-halo" d="M 172 100 C 214 92 216 160 172 158" />
						<path class="handle-ink" d="M 172 100 C 214 92 216 160 172 158" />
						<path class="handle-glaze" d="M 172 100 C 214 92 216 160 172 158" />
					</g>
					<g class="halo">
						<path d="M 66 74 C 62 104 66 146 70 176 C 72 194 78 204 96 206 C 112 208 132 208 148 206 C 166 204 170 192 172 176 C 176 146 178 104 174 74 A 55 16 0 0 1 66 74 Z" />
						<ellipse class="rim-sticker" cx="120" cy="72" rx="55" ry="16" />
					</g>

					<path
						class="body-shape"
						d="M 66 74 C 62 104 66 146 70 176 C 72 194 78 204 96 206 C 112 208 132 208 148 206 C 166 204 170 192 172 176 C 176 146 178 104 174 74 A 55 16 0 0 1 66 74 Z"
					/>

					<path class="shine" d="M 76 100 Q 75 143 81 173" />
					<ellipse class="rim" cx="120" cy="72" rx="55" ry="16" />
					<ellipse class="coffee" cx="120" cy="73" rx="46" ry="11" />
					<g class="coffee-plane" transform="translate(120 73) scale(1 .24)">
						<g class="latte-art">
							<g class="pour-art" data-art="rosetta">
								<path d="M0 29 C-8 21-24 20-27 10 C-17 10-8 15-3 18 C-12 9-28 6-27-4 C-17-4-8 4-3 8 C-11-2-23-8-19-17 C-10-13-5-6-2-1 C-8-14-10-23 0-30 C10-23 8-14 2-1 C5-6 10-13 19-17 C23-8 11-2 3 8 C8 4 17-4 27-4 C28 6 12 9 3 18 C8 15 17 10 27 10 C24 20 8 21 0 29Z" />
								<path class="coffee-cut" d="M0-20 Q-3 3 0 28" />
							</g>
							<g class="pour-art" data-art="heart">
								<path d="M0 29 C-7 20-29 6-29-9 C-29-29-7-31 0-15 C7-31 29-29 29-9 C29 6 7 20 0 29Z" />
							</g>
							<g class="pour-art" data-art="tulip">
								<path d="M0-4 C-20-10-20-27-9-28 C-3-29 0-24 0-20 C0-24 3-29 9-28 C20-27 20-10 0-4Z M0 13 C-27 3-28-13-17-14 C-9-15-5-7 0-4 C5-7 9-15 17-14 C28-13 27 3 0 13Z M0 30 C-31 17-30 1-22 1 C-13 1-7 12 0 15 C7 12 13 1 22 1 C30 1 31 17 0 30Z" />
							</g>
							<g
								class="pour-art markless-pour"
								data-art="markless"
								transform="scale(1.5) translate(-31.5 -30)"
							>
								<circle cx="26" cy="32" r="8" />
								<path d="M34 24v14c0 3.6 2.6 5.6 5.6 5.6 3.4 0 5.4-2.4 5.4-6.4" />
								<path d="M45 20c-3 -2.6 -7 -4 -11 -4" />
							</g>
						</g>
					</g>

					<g class="gaze">
						<g class="blink">
							<g class="greeting-eyes">
								<g class="eye-l" transform="translate(100 149)">
									<g class="eye-bean">
										<path
											class="bean-eye"
											d="M0-9 C8-10 10-1 7 6 C3 13-7 11-8 4 C-11-3-7-9 0-9Z"
										/>
										<path class="bean-slit" d="M2-6 C-4-2 4 2-2 7" />
									</g>
								</g>
								<g class="eye-r" transform="translate(136 149)">
									<g class="eye-bean">
										<path
											class="bean-eye"
											d="M0-9 C8-10 10-1 7 6 C3 13-7 11-8 4 C-11-3-7-9 0-9Z"
										/>
										<path class="bean-slit" d="M2-6 C-4-2 4 2-2 7" />
									</g>
								</g>
							</g>
						</g>
					</g>
					<g class="sleep-signs">
						<text class="sleep-z" x="132" y="46">
							z
						</text>
						<text class="sleep-z" x="151" y="27">
							z
						</text>
						<text class="sleep-z" x="174" y="8">
							Z
						</text>
					</g>
					<g class="steam">
						<path class="wisp" d="M 96 49 c -8 -9 8 -15 0 -26 c -4 -6 -2 -10 2 -14" />
						<path class="wisp" d="M 120 44 c -9 -10 9 -17 0 -29 c -4 -6 -2 -11 3 -15" />
						<path class="wisp" d="M 144 49 c -8 -9 8 -15 0 -26 c -4 -6 -2 -10 2 -14" />
					</g>
					<path
						class="sigh-wisp"
						d="M 118 55 C 96 40 143 34 131 20 C 121 7 104 14 115 24 C 126 34 154 21 140 3"
					/>
					<g class="thoughts">
						<circle cx="98" cy="20" r="7.5" />
						<circle cx="120" cy="14" r="7.5" />
						<circle cx="142" cy="20" r="7.5" />
					</g>
					<g class="badge">
						<circle cx="173" cy="89" r="12" />
					</g>
				</g>
			</g>
		</g>
		<g class="companion-art" data-companion-art="beans">
			<g class="desk-bean" transform="translate(38 217) rotate(-18)">
				<ellipse
					cy="2"
					rx="8.5"
					ry="5.6"
					fill="#4b3124"
					stroke="#493326"
					stroke-width=".8"
				/>
				<ellipse rx="8.5" ry="5.4" fill="#8e6139" stroke="#4f3828" stroke-width="1" />
				<path d="M-7-1C-2-5 2 4 7 0" fill="none" stroke="#3f2a20" stroke-width="1.8" />
				<path d="M-6-2C-2-5 2 2 6-1" fill="none" stroke="#c6955c" stroke-width=".7" />
				<path d="M-5 2l1 .8m5-4 1 .5m-1 3 1 .5" stroke="#c18b54" stroke-width=".7" />
			</g>
			<g class="desk-bean" transform="translate(53 224) rotate(24)">
				<ellipse
					cy="2"
					rx="8.5"
					ry="5.6"
					fill="#4b3124"
					stroke="#493326"
					stroke-width=".8"
				/>
				<ellipse rx="8.5" ry="5.4" fill="#8e6139" stroke="#4f3828" stroke-width="1" />
				<path d="M-7-1C-2-5 2 4 7 0" fill="none" stroke="#3f2a20" stroke-width="1.8" />
				<path d="M-6-2C-2-5 2 2 6-1" fill="none" stroke="#c6955c" stroke-width=".7" />
				<path d="M-5 2l1 .8m5-4 1 .5m-1 3 1 .5" stroke="#c18b54" stroke-width=".7" />
			</g>
			<g class="desk-bean" transform="translate(52 207) rotate(12)">
				<ellipse
					cy="2"
					rx="8.5"
					ry="5.6"
					fill="#4b3124"
					stroke="#493326"
					stroke-width=".8"
				/>
				<ellipse rx="8.5" ry="5.4" fill="#8e6139" stroke="#4f3828" stroke-width="1" />
				<path d="M-7-1C-2-5 2 4 7 0" fill="none" stroke="#3f2a20" stroke-width="1.8" />
				<path d="M-6-2C-2-5 2 2 6-1" fill="none" stroke="#c6955c" stroke-width=".7" />
				<path d="M-5 2l1 .8m5-4 1 .5m-1 3 1 .5" stroke="#c18b54" stroke-width=".7" />
			</g>
		</g>
		<g class="companion-art" data-companion-art="sugar">
			<g class="desk-sugar" transform="translate(207 206)">
				<path
					d="M-8-7 0-11 8-7 8 5 0 10-8 5Z"
					fill="#ecd9b9"
					stroke="#99866d"
					stroke-width=".9"
				/>
				<path d="M-8-7 0-11 8-7 0-2Z" fill="#fff5df" />
				<path d="M-8-7 0-2V10L-8 5Z" fill="#f8ecd3" />
				<path d="M0-2V10M-8-7 0-2 8-7" fill="none" stroke="#d4bea0" stroke-width=".6" />
				<path
					d="M-5-7h1m5-1h1m-7 8h.5m2 4h1m5-6h1m-1 5h1"
					stroke="#cfb68e"
					stroke-width="1"
					stroke-linecap="round"
				/>
			</g>
			<g class="desk-sugar" transform="translate(193 218)">
				<path
					d="M-8-7 0-11 8-7 8 5 0 10-8 5Z"
					fill="#ecd9b9"
					stroke="#99866d"
					stroke-width=".9"
				/>
				<path d="M-8-7 0-11 8-7 0-2Z" fill="#fff5df" />
				<path d="M-8-7 0-2V10L-8 5Z" fill="#f8ecd3" />
				<path d="M0-2V10M-8-7 0-2 8-7" fill="none" stroke="#d4bea0" stroke-width=".6" />
				<path
					d="M-5-7h1m5-1h1m-7 8h.5m2 4h1m5-6h1m-1 5h1"
					stroke="#cfb68e"
					stroke-width="1"
					stroke-linecap="round"
				/>
			</g>
		</g>
		<g
			class="companion-art"
			data-companion-art="crane"
			transform="translate(192 215) scale(.7)"
		>
			<path
				d="M0 18-10 8-32-11-7-5 0-12 7-8 15 7 23-9 46-43 36 5 60 20 25 20 13 33Z"
				fill="#eee1c6"
				stroke="#625b4c"
				stroke-width="1.5"
				stroke-linejoin="round"
			/>
			<path d="M13 33 23-9 36 5 60 20 25 17Z" fill="#fff5df" />
			<path d="M13 33 15 7 23-9 25 17Z" fill="#dbc9a9" />
			<path d="M0 18-3-8-13-1-7-5 0-12 7-8 15 7 13 33Z" fill="#fff3d8" />
			<path
				d="M-32-11 0 18-7-5m20 38 12-16 35 3M23-9 36 5 46-43M0 18-3-8m16 41L7-8"
				fill="none"
				stroke="#8c8067"
				stroke-width="1.1"
			/>
		</g>
		<g
			class="companion-art"
			data-companion-art="eucalyptus"
			transform="translate(44 215) scale(.62)"
		>
			<ellipse cy="8" rx="24" ry="4" fill="#5c6557" opacity=".14" />
			<path
				d="M-5-35v-12h10v12C7-24 26-17 24 1 22 16-23 18-25 0-27-18-8-24-5-35Z"
				fill="#d9e3d5"
				fill-opacity=".52"
				stroke="#596b60"
				stroke-width="2"
			/>
			<ellipse cy="-47" rx="9" ry="3" fill="#f8eed6" stroke="#596b60" stroke-width="1.7" />
			<path
				d="M-21-5Q0 3 21-5M-15-19Q-23-8-17 3m30 6q7-3 8-12"
				fill="none"
				stroke="#fff9e6"
				stroke-width="2.4"
			/>
			<ellipse cy="-5" rx="21" ry="5" fill="none" stroke="#879c8b" stroke-width="1.1" />
			<path d="M2 10Q-5-31 1-54T22-109" fill="none" stroke="#736342" stroke-width="2.3" />
			<path
				d="M0-47-15-58m18-3 20-10M7-74-13-87m26-1 22-9M14-91 5-110"
				fill="none"
				stroke="#697455"
				stroke-width="1.5"
			/>
			<g transform="translate(-15 -58) rotate(-25)">
				<ellipse rx="10" ry="12" fill="#8fa58b" stroke="#526f5b" stroke-width="1.1" />
				<path
					d="M0 11V-10m0 10L-7-5M0 4 7-3"
					fill="none"
					stroke="#b8c4a8"
					stroke-width=".7"
				/>
			</g>
			<g transform="translate(23 -71) rotate(65)">
				<ellipse rx="10" ry="12" fill="#8fa58b" stroke="#526f5b" stroke-width="1.1" />
				<path
					d="M0 11V-10m0 10L-7-5M0 4 7-3"
					fill="none"
					stroke="#b8c4a8"
					stroke-width=".7"
				/>
			</g>
			<g transform="translate(-13 -87) rotate(-40)">
				<ellipse rx="10" ry="12" fill="#8fa58b" stroke="#526f5b" stroke-width="1.1" />
				<path
					d="M0 11V-10m0 10L-7-5M0 4 7-3"
					fill="none"
					stroke="#b8c4a8"
					stroke-width=".7"
				/>
			</g>
			<g transform="translate(35 -97) rotate(60)">
				<ellipse rx="10" ry="12" fill="#8fa58b" stroke="#526f5b" stroke-width="1.1" />
				<path
					d="M0 11V-10m0 10L-7-5M0 4 7-3"
					fill="none"
					stroke="#b8c4a8"
					stroke-width=".7"
				/>
			</g>
			<g transform="translate(5 -110) rotate(-28)">
				<ellipse rx="10" ry="12" fill="#8fa58b" stroke="#526f5b" stroke-width="1.1" />
				<path
					d="M0 11V-10m0 10L-7-5M0 4 7-3"
					fill="none"
					stroke="#b8c4a8"
					stroke-width=".7"
				/>
			</g>
			<g transform="translate(25 -119) rotate(40)">
				<ellipse rx="10" ry="12" fill="#8fa58b" stroke="#526f5b" stroke-width="1.1" />
				<path
					d="M0 11V-10m0 10L-7-5M0 4 7-3"
					fill="none"
					stroke="#b8c4a8"
					stroke-width=".7"
				/>
			</g>
		</g>
		<g
			class="companion-art"
			data-companion-art="notes"
			transform="translate(39 207) scale(.84)"
		>
			<path
				d="M-15-20 25-30q5-1 8 4l15 29q3 5-3 7L5 22q-9 2-13-5L-21-7q-4-8 6-13Z"
				fill="#75505f"
				stroke="#503d43"
				stroke-width="1.8"
			/>
			<path d="M-9-13 26-23 40 3 6 13Z" fill="#8b6174" stroke="#ba92a0" stroke-width=".9" />
			<path
				d="M4 13 42 4v10L7 24q-6 0-7-5Z"
				fill="#efe0bc"
				stroke="#694d50"
				stroke-width="1.2"
			/>
			<path d="M7 16 39 8M7 20 39 12" stroke="#c5ad86" stroke-width=".8" />
			<path d="M-15-17 3 16q-4 7 4 9" fill="none" stroke="#c294a4" stroke-width="1.6" />
			<path
				d="M7 15 13 14 20 35 13 31 10 35Z"
				fill="#d8ae55"
				stroke="#8c6630"
				stroke-width=".9"
			/>
			<g transform="translate(20 29) rotate(-13)">
				<path d="M-3 0 8-4H54V3H8Z" fill="#daa84e" stroke="#69523a" stroke-width="1" />
				<path d="M8-4V3M8-1H47" stroke="#f5ca77" stroke-width="1.3" />
				<path d="M-3 0 8-4V3Z" fill="#f1d6a0" />
				<path d="M-3 0 1-1 2 1Z" fill="#39372e" />
				<path d="M46-4h7v7h-7Z" fill="#999c98" />
				<path d="M53-4h5q4 3 0 7h-5Z" fill="#d78a92" />
				<path d="M48-4V3m3-7V3" stroke="#4f5451" stroke-width=".7" />
			</g>
		</g>
		<g
			class="companion-art"
			data-companion-art="moka"
			transform="translate(203 219) scale(.72)"
		>
			<ellipse cy="5" rx="24" ry="4" fill="#625d51" opacity=".14" />
			<path
				d="M20-62 32-64 39-53 34-27 27-24 24-29 29-32 32-52 28-57 21-54Z"
				fill="#393b39"
				stroke="#252724"
				stroke-width="2"
			/>
			<path
				d="M-19-37-26-64-30-68-17-73 0-85 20-73 23-65 17-36Z"
				fill="#a5bcc6"
				stroke="#4e5b60"
				stroke-width="1.8"
			/>
			<path d="M-19-37-25-65-8-63-5-36Z" fill="#c1d2d6" />
			<path d="M-5-36-8-63 8-64 8-36Z" fill="#a9c2cf" />
			<path d="M8-36 8-64 23-65 17-36Z" fill="#819cae" />
			<path
				d="M-30-68-8-63 23-65M-17-73 0-85 20-73M-8-63 0-85 8-64M-19-37Q0-30 17-36"
				fill="none"
				stroke="#5c6a70"
				stroke-width="1.2"
			/>
			<path d="M-17-35v8q17 7 33 0v-9" fill="#9fb3be" stroke="#53646c" stroke-width="1.7" />
			<path
				d="M-16-26-23 0Q0 13 23 0L16-26Q0-20-16-26Z"
				fill="#9eb8c7"
				stroke="#4e5b60"
				stroke-width="1.8"
			/>
			<path d="M-16-25-21-1-9 4-7-22Z" fill="#c7d7db" />
			<path d="M7-22 10 5 22 0 16-25Z" fill="#7f9cad" />
			<path
				d="M-19-60-13-40m-3 37 3-17"
				stroke="#edf1e9"
				stroke-width="2"
				stroke-linecap="round"
			/>
			<path
				d="M-4-83-6-94Q0-99 7-94L4-83Z"
				fill="#363b39"
				stroke="#292e2c"
				stroke-width="1.2"
			/>
			<ellipse
				cx="9"
				cy="-14"
				rx="3.5"
				ry="4"
				fill="#d2a449"
				stroke="#78622d"
				stroke-width="1.3"
			/>
			<ellipse cx="9" cy="-14" rx="1.2" ry="1.8" fill="#f5db82" />
		</g>
		<g class="partner-cup">
			<path
				class="partner-halo"
				d="M0 4 L4 54 Q6 66 24 66 Q43 66 45 54 L48 4 M47 16 C67 12 67 47 45 43"
			/>
			<path class="partner-handle" d="M47 16 C67 12 67 47 45 43" />
			<path class="partner-body" d="M0 4 L4 54 Q6 66 24 66 Q43 66 45 54 L48 4 Z" />
			<ellipse class="partner-rim" cx="24" cy="4" rx="24" ry="7" />
			<ellipse class="partner-coffee" cx="24" cy="4" rx="19" ry="4" />
			<path class="partner-shine" d="M7 17 L10 48" />
		</g>
		<g class="clink-marks">
			<path d="M171 48 L167 40 M180 47 L183 38 M188 54 L196 49" />
		</g>

		<style>
.mug { --spring: linear(0, 0.027 1.1%, 0.103 2.3%, 0.583 7.5%, 0.792 10.4%, 0.932 13.6%, 0.977 15.4%, 1.006 17.4%, 1.02 19.4%, 1.024 21.7%, 1 38.4%, 1); --snap: linear(0, 0.029 0.8%, 0.13 1.8%, 0.908 7.2%, 1.051 9.1%, 1.112 11.2%, 1.116 12.2%, 1.106 13.4%, 1.007 19.5%, 0.987 23.1%, 1.001 35%, 1); display:block; width:var(--mug-width, min(100%,275px)); height:var(--mug-height,320px); overflow:visible; }
 .halo { fill: none; stroke: #fffdf7; stroke-width: 14; stroke-linejoin: round; stroke-linecap: round; }
 .handle-motion { transform-origin: 172px 129px; }
 .handle-halo { fill: none; stroke: #fffdf6; stroke-width: 27; stroke-linecap: round; }
 .handle-ink { fill: none; stroke: #2d2b2a; stroke-width: 19; stroke-linecap: round; }
 .handle-glaze { fill: none; stroke: var(--glaze); stroke-width: 11; stroke-linecap: round; }
 .body-shape, .rim { fill: var(--glaze); stroke: #2d2b2a; stroke-width: 3; }
 .shine { fill: none; stroke: #fffdf6; stroke-width: 4; stroke-linecap: round; opacity: .5; }
 .coffee { fill: #74492f; stroke: #2d2b2a; stroke-width: 2; }
 .latte-art { fill: #f7e7bd; transform-origin: 0px 0px; }
 .pour-art { display: none; }
.mug [data-art='rosetta'] { html[data-mascot-pour='rosetta'] & {  display: inline; } }
.mug [data-art='heart'] { html[data-mascot-pour='heart'] & {  display: inline; } }
.mug [data-art='tulip'] { html[data-mascot-pour='tulip'] & {  display: inline; } }
.mug [data-art='markless']  { html[data-mascot-pour='markless'] & {  display: inline; } }
 .coffee-cut { fill: none; stroke: #74492f; stroke-width: 2; stroke-linecap: round; }
 .markless-pour { fill: none; stroke: #f7e7bd; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
 .shadow { fill: #786c83; opacity: .18; transform-origin: 127px 214px; }
 .mug[data-interacted="true"] .eye-l,.mug[data-interacted="true"] .eye-r { transition:transform 900ms var(--spring); }
 .eye-bean { transform-origin:0px 0px; }
 .pose, .gesture, .breath { transform-origin: 120px 207px; }
 .pose { transform: translateY(0) rotate(0) scale(1); transition: transform 900ms var(--spring); }
 .breath { animation: breathe 4s ease-in-out infinite; }
 .gaze { animation: glance 11s ease-in-out infinite; }
 .blink { transform-origin: 120px 149px; animation: blink 7s linear infinite; }
 .wisp { fill: none; stroke: #8d7b6a; stroke-width: 2.5; stroke-linecap: round; animation: steam 4s ease-in-out infinite; transform-origin: 120px 60px; }
 .wisp:nth-child(2) { animation-delay: -1.3s; }
 .wisp:nth-child(3) { animation-delay: -2.6s; }
 .badge { opacity: 0; transform-origin: 173px 89px; }
 .badge circle { fill: #ed8fb4; stroke: #fffdf6; stroke-width: 5; }
 .thoughts { opacity: 0; fill: var(--ink); }
 .mug[data-state='thinking'] .thoughts { opacity: 1; }
 .mug[data-state='thinking'] .steam { opacity: .15; }
 .mug[data-state='thinking'] .thoughts circle { animation: thought 2s ease-in-out infinite; }
 .thoughts circle:nth-child(2) { animation-delay: .2s !important; }
 .thoughts circle:nth-child(3) { animation-delay: .4s !important; }
 @keyframes thought { 0%, 70%, 100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-7px); opacity: 1; } }
.mug { html[data-mascot-glaze='cream'] & { --glaze: #f7e7bd; } }
.mug { html[data-mascot-glaze='yellow'] & { --glaze: #f3d567; } }
.mug { html[data-mascot-glaze='pink'] & { --glaze: #efa3bd; } }
.mug { html[data-mascot-glaze='purple'] & { --glaze: #baa1e2; } }
.mug { html[data-mascot-glaze='green'] & { --glaze: #a5ceb4; } }
.mug { html[data-mascot-glaze='ink'] & { --glaze: #343432; --eye: #faf7ed; } }
.mug { html[data-mascot-glaze='paper'] & { --glaze: #faf7ed; } }

 .mug:not([data-state='idle']) .gaze, .mug:not([data-state='idle']) .blink { animation: none; }
.mug:not([data-state='idle']) .eye-l { transform:translate(91px,140px); }
.mug:not([data-state='idle']) .eye-r { transform:translate(127px,140px); }
 .mug[data-state='thinking'] .pose { transform: rotate(4deg); }
 .mug[data-state='thinking'] .gesture { animation: ponder 4s var(--spring) infinite; }
 .mug[data-state='thinking'] .gaze { transform: translate(7px, -9px); }
 .mug[data-state='thinking'] .latte-art { animation: stir 4s ease-in-out infinite; }

 .bean-eye { fill:var(--eye, currentColor); }
 .bean-slit { fill:none; stroke:var(--glaze, var(--paper)); stroke-width:2; stroke-linecap:round; }
 .mug[data-interacted="true"] .eye-l,.mug[data-interacted="true"] .eye-r { transition:transform 900ms var(--spring); }
 .eye-bean { transform-origin:0px 0px; }
.mug[data-state='wide'] .eye-l { transform:translate(100px,147px) rotate(-3deg) scale(1.18,1.18); }
.mug[data-state='wide'] .eye-r { transform:translate(136px,147px) rotate(3deg) scale(1.18,1.18); }
.mug[data-state='sleep'] .eye-l { transform:translate(100px,156px) rotate(-8deg) scale(1,0.17); }
.mug[data-state='sleep'] .eye-r { transform:translate(136px,156px) rotate(8deg) scale(1,0.17); }
.mug[data-state='wiggle'] .eye-l { transform:translate(100px,143px) rotate(-27deg) scale(1.05,0.52); }
.mug[data-state='wiggle'] .eye-r { transform:translate(136px,143px) rotate(27deg) scale(1.05,0.52); }
.mug[data-state='cheers'] .eye-l { transform:translate(100px,143px) rotate(-27deg) scale(1.05,0.52); }
.mug[data-state='cheers'] .eye-r { transform:translate(136px,143px) rotate(27deg) scale(1.05,0.52); }
.mug[data-state='sigh'] .eye-l { transform:translate(100px,156px) rotate(-8deg) scale(1,0.17); }
.mug[data-state='sigh'] .eye-r { transform:translate(136px,156px) rotate(8deg) scale(1,0.17); }
.mug[data-state='bow'] .eye-l { transform:translate(96px,155px) rotate(-20deg) scale(0.6,0.65); }
.mug[data-state='bow'] .eye-r { transform:translate(132px,155px) rotate(20deg) scale(0.6,0.65); }
 .mug[data-state='wink'] .eye-r .eye-bean { animation:wink-eye 4s var(--spring) infinite; }
 .mug[data-state='wink'] .gesture { animation: wink-roll 4s var(--spring) infinite; }
 .mug[data-state='wide'] .gesture { animation: notice 4s var(--spring) infinite; }
 .mug[data-state='notify'] .gesture { animation: nudge 4s var(--spring) infinite; }
 .mug[data-state='notify'] .badge { animation: badge 4s var(--snap) infinite; }
 .mug[data-state='sleep'] .pose { transform: rotate(6deg) scaleY(.96); }
 .mug[data-state='sleep'] .gesture { animation: doze 4s ease-in-out infinite; }
 .mug[data-state='sleep'] .steam { opacity: .3; }
 .mug[data-state='hello'] .gesture { animation: hello 4s ease-in-out infinite; }
 .mug[data-state='hello'] .handle-motion { animation: handle-wave 4s var(--spring) infinite; }
 .mug[data-state='hello'] .gaze { transform: translate(5px, -4px); }
 .mug[data-state='wiggle'] .gesture { animation: wiggle 4s var(--spring) infinite; }
 .mug[data-state='sigh'] .gesture { animation: sigh 4s ease-in-out infinite; }
 .sigh-wisp { fill: none; stroke: #8b827a; stroke-width: 3; stroke-linecap: round; opacity: 0; transform-origin: 120px 60px; }
 .mug[data-state='sigh'] .steam { opacity: 0; }
 .mug[data-state='sigh'] .sigh-wisp { animation: exhale 4s ease-in-out infinite; }
 .mug[data-state='bow'] .gesture { animation: bow 4s var(--spring) infinite; }
 .mug[data-state='bow'] .gaze { animation: bow-gaze 4s ease-in-out infinite; }
 .mug[data-state='brew'] .latte-art { animation: fresh-stir 4s ease-in-out infinite; }
 .mug[data-state='brew'] .gaze { animation: brew-gaze 4s ease-in-out infinite; }
 .mug[data-state='brew'] .wisp { animation-name: fresh-steam; animation-duration: 2.8s; stroke-width: 3.3; }
 .mug[data-state='cheers'] .pose { transform: translate(-6px,-12px) rotate(3deg); }
 .mug[data-state='cheers'] .gesture { animation: cheers 4s var(--spring) infinite; }
 .mug[data-state='cheers'] .shadow { animation: toast-shadow 4s ease-in-out infinite; }
 .mug[data-paused='true'] * { animation-play-state: paused !important; }
 @keyframes breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.008, .993); } }
 @keyframes glance { 0%, 18%, 100% { transform: translate(0, 0); } 27%, 42% { transform: translate(3px, -2px); } 58%, 73% { transform: translate(-2px, 1px); } }
 @keyframes blink { 0%, 41%, 44%, 76%, 79%, 100% { transform: scaleY(1); } 42.5%, 77.5% { transform: scaleY(.08); } }
 @keyframes steam { 0% { opacity: 0; transform: translateY(7px) scale(.92); } 30% { opacity: .6; } 75% { opacity: .3; } 100% { opacity: 0; transform: translateY(-12px) scale(1.06); } }
 @keyframes ponder { 0%, 85%, 100% { transform: rotate(0); } 25%, 60% { transform: rotate(1deg); } }
 @keyframes stir { 0%, 85%, 100% { transform: rotate(0) scaleX(1); } 30% { transform: rotate(9deg) scaleX(.82); } 65% { transform: rotate(-7deg) scaleX(1.08); } }
 @keyframes wink-roll { 0%, 65%, 100% { transform: rotate(0); } 22%, 42% { transform: rotate(-6deg); } }
 @keyframes wink-eye { 0%,12%,55%,100% { transform:scaleY(1); } 22%,42% { transform:scaleY(.15); } }
 @keyframes notice { 0%, 75%, 100% { transform: none; } 18% { transform: translateY(3px) scale(1.02, .97); } 32%, 55% { transform: translateY(-4px) rotate(-3deg); } }
 @keyframes nudge { 0%, 65%, 100% { transform: none; } 15% { transform: rotate(-4deg); } 25% { transform: rotate(4deg); } 35% { transform: rotate(-2deg); } 45% { transform: rotate(1deg); } }
 @keyframes badge { 0%, 8%, 78%, 100% { opacity: 0; transform: scale(.7); } 20%, 60% { opacity: 1; transform: scale(1); } }
 @keyframes doze { 0%, 100% { transform: rotate(-1deg) scaleY(1.01); } 50% { transform: rotate(1deg) scaleY(.99); } }
 @keyframes hello { 0%, 85%, 100% { transform: none; } 20%, 55% { transform: translateX(1px) rotate(5deg); } }
 @keyframes handle-wave { 0%, 78%, 100% { transform: rotate(0); } 15% { transform: rotate(-18deg); } 29% { transform: rotate(12deg); } 42% { transform: rotate(-12deg); } 55% { transform: rotate(7deg); } 68% { transform: rotate(-3deg); } }
 @keyframes wiggle { 0%, 80%, 100% { transform: none; } 12% { transform: scale(1.03, .96); } 24% { transform: translateX(-5px) rotate(-6deg); } 35% { transform: translateX(5px) rotate(6deg); } 46% { transform: translateX(-4px) rotate(-4deg); } 57% { transform: translateX(3px) rotate(3deg); } 68% { transform: translateX(-1px) rotate(-1deg); } }
 @keyframes sigh { 0%, 100% { transform: none; } 20% { transform: scale(.99, 1.02); } 55%, 75% { transform: translateY(2px) scale(1.02, .96); } }
 @keyframes exhale { 0%, 100% { opacity: 0; transform: translateY(5px) scale(.8); } 20% { opacity: .35; transform: translateY(2px) scale(.9); } 55%, 68% { opacity: .65; transform: translateY(-8px) scale(1.35); } 90% { opacity: 0; transform: translateY(-16px) scale(1.45); } }
 @keyframes bow { 0%, 85%, 100% { transform: none; } 30%, 52% { transform: translateY(4px) rotate(-8deg) scale(1.03, .92); } 70% { transform: rotate(1deg); } }
 @keyframes bow-gaze { 0%, 85%, 100% { transform: none; } 30%, 52% { transform: translateY(12px); } }
 @keyframes fresh-stir { 0%, 8% { transform: rotate(0); } 72%, 100% { transform: rotate(360deg); } }
 @keyframes fresh-steam { 0% { opacity: 0; transform: translateY(8px) scale(.85); } 25% { opacity: .75; } 70% { opacity: .4; } 100% { opacity: 0; transform: translateY(-18px) scale(1.15); } }
 @keyframes brew-gaze { 0%, 85%, 100% { transform: none; } 30%, 60% { transform: translate(2px, -10px); } }
 @keyframes cheers { 0%,24%,42%,75%,100% { transform:none; } 55% { transform:translateX(-2px) rotate(-1deg); } }
 @keyframes toast-shadow { 0%, 80%, 100% { transform: scaleX(1); opacity: .18; } 32%, 52% { transform: scaleX(.8); opacity: .11; } }
 .partner-cup { opacity:0; transform-origin:0px 4px; }
 .partner-halo { fill:none; stroke:#fffdf6; stroke-width:10; stroke-linecap:round; stroke-linejoin:round; }
 .partner-handle { fill:none; stroke:#2d2b2a; stroke-width:4; }
 .partner-body,.partner-rim { fill:#c9b8e3; stroke:#2d2b2a; stroke-width:2.5; }
 .partner-coffee { fill:#74492f; }
 .partner-shine { fill:none; stroke:#fffdf6; stroke-width:3; stroke-linecap:round; opacity:.6; }
 .clink-marks { fill:none; stroke:var(--ink); stroke-width:2.5; stroke-linecap:round; opacity:0; }
 .mug[data-state='cheers'] .partner-cup { animation:clink 4s var(--spring) infinite; }
 .mug[data-state='cheers'] .clink-marks { animation:contact 4s linear infinite; }
 @keyframes clink { 0%,8%,100% { opacity:0; transform:translate(255px,85px) rotate(6deg); } 24%,42% { opacity:1; transform:translate(174px,60px) rotate(-10deg); } 57% { opacity:1; transform:translate(189px,69px) rotate(1deg); } 78% { opacity:0; transform:translate(240px,85px) rotate(6deg); } }
 @keyframes contact { 0%,23%,45%,100% { opacity:0; } 25%,40% { opacity:1; } }
 .sleep-signs { opacity:0; fill:var(--ink); font-family:Georgia,serif; font-style:italic; font-weight:600; font-size:16px; }
 .mug[data-state='sleep'] .sleep-signs { opacity:1; }
 .mug[data-state='sleep'] .sleep-z { animation:sleep-rise 3.6s ease-out infinite; }
 .sleep-z:nth-child(2) { animation-delay:-1.2s; font-size:19px; }
 .sleep-z:nth-child(3) { animation-delay:-2.4s; font-size:22px; }
 @keyframes sleep-rise { 0% { opacity:0; transform:translate(-5px,12px) scale(.8); } 25%,55% { opacity:.8; } 100% { opacity:0; transform:translate(6px,-10px) scale(1.08); } }
 @media (prefers-reduced-motion: reduce) { .mug .pose, .mug .eye-l, .mug .eye-r, .mug .bean-eye { transition: none; } .mug * { animation-play-state: paused !important; animation-delay: -1.3s !important; } .mug .blink { animation: none; } }
 .coaster-art,.companion-art { display:none; }
 .mug .shadow { html[data-mascot-coaster='cork'] & { visibility:hidden; } }
.mug [data-coaster-art='cork']  { html[data-mascot-coaster='cork'] & {  display:inline; } }
.mug [data-companion-art='beans']  { html[data-mascot-companion='beans'] & {  display:inline; } }
.mug [data-companion-art='sugar']  { html[data-mascot-companion='sugar'] & {  display:inline; } }
.mug [data-companion-art='crane']  { html[data-mascot-companion='crane'] & {  display:inline; } }
.mug [data-companion-art='eucalyptus']  { html[data-mascot-companion='eucalyptus'] & {  display:inline; } }
.mug [data-companion-art='notes']  { html[data-mascot-companion='notes'] & {  display:inline; } }
.mug [data-companion-art='moka']  { html[data-mascot-companion='moka'] & {  display:inline; } }
.mug { --glaze:#f7e7bd; --eye:#2d2b2a; }
.mug [data-art='rosetta'] { display:inline; html:is([data-mascot-pour='heart'],[data-mascot-pour='tulip'],[data-mascot-pour='markless']) & { display:none; } }
.mug .eye-l { transform:translate(100px,149px) rotate(-12deg) scale(0.85,0.85); }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='neutral'] & { transform:translate(100px,149px) rotate(-12deg) scale(0.85,0.85); } }
.mug .eye-r { transform:translate(136px,149px) rotate(12deg) scale(0.85,0.85); }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='neutral'] & { transform:translate(136px,149px) rotate(12deg) scale(0.85,0.85); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='attentive'] & { transform:translate(100px,144px) rotate(-5deg) scale(0.9,1); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='attentive'] & { transform:translate(136px,144px) rotate(5deg) scale(0.9,1); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='surprised'] & { transform:translate(100px,147px) rotate(-3deg) scale(1.18,1.18); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='surprised'] & { transform:translate(136px,147px) rotate(3deg) scale(1.18,1.18); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='excited'] & { transform:translate(100px,151px) rotate(-22deg) scale(1,1.25); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='excited'] & { transform:translate(136px,151px) rotate(22deg) scale(1,1.25); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='happy'] & { transform:translate(100px,143px) rotate(-27deg) scale(1.05,0.52); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='happy'] & { transform:translate(136px,143px) rotate(27deg) scale(1.05,0.52); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='laughing'] & { transform:translate(100px,140px) rotate(-36deg) scale(1.2,0.32); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='laughing'] & { transform:translate(136px,140px) rotate(36deg) scale(1.2,0.32); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='angry'] & { transform:translate(100px,146px) rotate(30deg) scale(1.05,0.58); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='angry'] & { transform:translate(136px,146px) rotate(-30deg) scale(1.05,0.58); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='sad'] & { transform:translate(100px,153px) rotate(-32deg) scale(0.8,0.65); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='sad'] & { transform:translate(136px,153px) rotate(32deg) scale(0.8,0.65); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='scared'] & { transform:translate(96px,155px) rotate(-7deg) scale(1.15,1.4); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='scared'] & { transform:translate(140px,155px) rotate(7deg) scale(1.15,1.4); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='suspicious'] & { transform:translate(100px,148px) rotate(12deg) scale(0.82,0.72); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='suspicious'] & { transform:translate(136px,150px) rotate(-10deg) scale(1,0.3); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='confused'] & { transform:translate(100px,141px) rotate(-28deg) scale(0.88,0.95); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='confused'] & { transform:translate(136px,154px) rotate(22deg) scale(0.88,0.6); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='curious'] & { transform:translate(103px,142px) rotate(-18deg) scale(1,1.1); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='curious'] & { transform:translate(139px,147px) rotate(-18deg) scale(0.7,0.78); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='proud'] & { transform:translate(100px,138px) rotate(-14deg) scale(1,0.3); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='proud'] & { transform:translate(136px,138px) rotate(14deg) scale(1,0.3); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='shy'] & { transform:translate(96px,155px) rotate(-20deg) scale(0.6,0.65); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='shy'] & { transform:translate(132px,155px) rotate(20deg) scale(0.6,0.65); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='unimpressed'] & { transform:translate(100px,152px) rotate(3deg) scale(1.1,0.24); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='unimpressed'] & { transform:translate(136px,152px) rotate(-3deg) scale(1.1,0.24); } }
.mug[data-state='idle'] .eye-l { html[data-mascot-expression='sleepy'] & { transform:translate(100px,156px) rotate(-8deg) scale(1,0.17); } }
.mug[data-state='idle'] .eye-r { html[data-mascot-expression='sleepy'] & { transform:translate(136px,156px) rotate(8deg) scale(1,0.17); } }

.mug[data-variant='toc'] { width:10rem; height:10rem; }
.mug[data-variant='toc'] .gaze { animation:none; transform:translate(var(--gaze-x,0px),var(--gaze-y,0px)); }
.mug[data-reaction='odd'] .steam { animation:tip-steam-odd 1800ms linear; }
.mug[data-reaction='even'] .steam { animation:tip-steam-even 1800ms linear; }
@keyframes tip-steam-odd { 0%,100% { opacity:1; } 5%,90% { opacity:0; } }
@keyframes tip-steam-even { 0%,100% { opacity:1; } 5%,90% { opacity:0; } }
.greeting-eyes { transform-origin:118px 149px; }
.mug[data-reaction='odd'] .pop { animation:tip-odd 1800ms var(--spring); }
.mug[data-reaction='even'] .pop { animation:tip-even 1800ms var(--spring); }
.mug[data-reaction='odd'] .greeting-eyes { animation:eyes-odd 900ms var(--spring); }
.mug[data-reaction='even'] .greeting-eyes { animation:eyes-even 900ms var(--spring); }
@keyframes tip-odd { 0%,100% { transform:none; } 35%,60% { transform:translate(-65px,-83px) rotate(90deg); } }
@keyframes tip-even { 0%,100% { transform:none; } 35%,60% { transform:translate(-65px,-83px) rotate(90deg); } }
@keyframes eyes-odd { from { transform:scaleY(.1); } to { transform:none; } }
@keyframes eyes-even { from { transform:scaleY(.1); } to { transform:none; } }
@media(prefers-reduced-motion:reduce) {
.mug .eye-l,.mug .eye-r,.mug .pose { transition:none!important; }
.mug .pop,.mug .breath,.mug .greeting-eyes,.mug .steam { animation:none!important; }
.mug[data-variant='toc'] .gaze { transform:none; }
.mug[data-reaction='odd'] .greeting-eyes { transform:scaleY(.65); }
.mug[data-reaction='even'] .greeting-eyes { transform:scaleY(.8); }
}

</style>
	</svg>;
}

export function FacePreview({ expression }: { expression: string }) @{
	<svg
		class="face-preview"
		data-expression={expression}
		viewBox="78 118 80 60"
		aria-hidden="true"
	>
		<g class="eye-l" transform="translate(100 149)">
			<g class="eye-bean">
				<path class="bean-eye" d="M0-9 C8-10 10-1 7 6 C3 13-7 11-8 4 C-11-3-7-9 0-9Z" />
				<path class="bean-slit" d="M2-6 C-4-2 4 2-2 7" />
			</g>
		</g>
		<g class="eye-r" transform="translate(136 149)">
			<g class="eye-bean">
				<path class="bean-eye" d="M0-9 C8-10 10-1 7 6 C3 13-7 11-8 4 C-11-3-7-9 0-9Z" />
				<path class="bean-slit" d="M2-6 C-4-2 4 2-2 7" />
			</g>
		</g>
		<style>
.face-preview { width:66px; max-width:100%; height:44px; fill:currentColor; }
.face-preview[data-expression='neutral'] .eye-l { transform:translate(100px,149px) rotate(-12deg) scale(0.85,0.85); }
.face-preview[data-expression='neutral'] .eye-r { transform:translate(136px,149px) rotate(12deg) scale(0.85,0.85); }
.face-preview[data-expression='attentive'] .eye-l { transform:translate(100px,144px) rotate(-5deg) scale(0.9,1); }
.face-preview[data-expression='attentive'] .eye-r { transform:translate(136px,144px) rotate(5deg) scale(0.9,1); }
.face-preview[data-expression='surprised'] .eye-l { transform:translate(100px,147px) rotate(-3deg) scale(1.18,1.18); }
.face-preview[data-expression='surprised'] .eye-r { transform:translate(136px,147px) rotate(3deg) scale(1.18,1.18); }
.face-preview[data-expression='excited'] .eye-l { transform:translate(100px,151px) rotate(-22deg) scale(1,1.25); }
.face-preview[data-expression='excited'] .eye-r { transform:translate(136px,151px) rotate(22deg) scale(1,1.25); }
.face-preview[data-expression='happy'] .eye-l { transform:translate(100px,143px) rotate(-27deg) scale(1.05,0.52); }
.face-preview[data-expression='happy'] .eye-r { transform:translate(136px,143px) rotate(27deg) scale(1.05,0.52); }
.face-preview[data-expression='laughing'] .eye-l { transform:translate(100px,140px) rotate(-36deg) scale(1.2,0.32); }
.face-preview[data-expression='laughing'] .eye-r { transform:translate(136px,140px) rotate(36deg) scale(1.2,0.32); }
.face-preview[data-expression='angry'] .eye-l { transform:translate(100px,146px) rotate(30deg) scale(1.05,0.58); }
.face-preview[data-expression='angry'] .eye-r { transform:translate(136px,146px) rotate(-30deg) scale(1.05,0.58); }
.face-preview[data-expression='sad'] .eye-l { transform:translate(100px,153px) rotate(-32deg) scale(0.8,0.65); }
.face-preview[data-expression='sad'] .eye-r { transform:translate(136px,153px) rotate(32deg) scale(0.8,0.65); }
.face-preview[data-expression='scared'] .eye-l { transform:translate(96px,155px) rotate(-7deg) scale(1.15,1.4); }
.face-preview[data-expression='scared'] .eye-r { transform:translate(140px,155px) rotate(7deg) scale(1.15,1.4); }
.face-preview[data-expression='suspicious'] .eye-l { transform:translate(100px,148px) rotate(12deg) scale(0.82,0.72); }
.face-preview[data-expression='suspicious'] .eye-r { transform:translate(136px,150px) rotate(-10deg) scale(1,0.3); }
.face-preview[data-expression='confused'] .eye-l { transform:translate(100px,141px) rotate(-28deg) scale(0.88,0.95); }
.face-preview[data-expression='confused'] .eye-r { transform:translate(136px,154px) rotate(22deg) scale(0.88,0.6); }
.face-preview[data-expression='curious'] .eye-l { transform:translate(103px,142px) rotate(-18deg) scale(1,1.1); }
.face-preview[data-expression='curious'] .eye-r { transform:translate(139px,147px) rotate(-18deg) scale(0.7,0.78); }
.face-preview[data-expression='proud'] .eye-l { transform:translate(100px,138px) rotate(-14deg) scale(1,0.3); }
.face-preview[data-expression='proud'] .eye-r { transform:translate(136px,138px) rotate(14deg) scale(1,0.3); }
.face-preview[data-expression='shy'] .eye-l { transform:translate(96px,155px) rotate(-20deg) scale(0.6,0.65); }
.face-preview[data-expression='shy'] .eye-r { transform:translate(132px,155px) rotate(20deg) scale(0.6,0.65); }
.face-preview[data-expression='unimpressed'] .eye-l { transform:translate(100px,152px) rotate(3deg) scale(1.1,0.24); }
.face-preview[data-expression='unimpressed'] .eye-r { transform:translate(136px,152px) rotate(-3deg) scale(1.1,0.24); }
.face-preview[data-expression='sleepy'] .eye-l { transform:translate(100px,156px) rotate(-8deg) scale(1,0.17); }
.face-preview[data-expression='sleepy'] .eye-r { transform:translate(136px,156px) rotate(8deg) scale(1,0.17); }
.face-preview .bean-eye { fill:currentColor; }
.face-preview .bean-slit { fill:none; stroke:var(--paper); stroke-width:2; stroke-linecap:round; }
.face-preview .eye-bean { transform-origin:0px 0px; }
</style>
	</svg>;
}
