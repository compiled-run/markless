/// One box's look in points, ready for a host to assign: the only arithmetic between Dragon's export and the views.
public struct ResolvedStyle: Equatable, Sendable {
	public var frame: Frame?
	public var background: RGBA?
	public var borderWidth: Double = 0
	public var borderColor: RGBA?
	public var cornerRadius: Double = 0
	/// Solid sides that differ (top, right, bottom, left; width in points, 0 for none), drawn on a square box; nil when uniform.
	public var sides: [Side]?
	public var font: (family: String, size: Double)?
	public var textColor: RGBA?
	/// Overflow other than visible: the children are clipped to the box (Dragon clips them to the padding box; without borders the same).
	public var clipsChildren = false
	/// clip-path: inset(): the rect in points, relative to the box, the box and everything in it are clipped to; empty when nothing shows.
	public var clipRect: Frame?

	public static func == (a: ResolvedStyle, b: ResolvedStyle) -> Bool {
		a.frame == b.frame && a.background == b.background && a.borderWidth == b.borderWidth && a.borderColor == b.borderColor
			&& a.cornerRadius == b.cornerRadius && a.font?.family == b.font?.family && a.font?.size == b.font?.size
			&& a.textColor == b.textColor && a.sides == b.sides && a.clipsChildren == b.clipsChildren && a.clipRect == b.clipRect
	}

	public struct Side: Equatable, Sendable {
		public let width: Double
		public let color: RGBA
	}
}

public struct StyleLayout: Sendable {
	/// Each assignment's look per payload node.
	public let assignments: [[String: ResolvedStyle]]
	/// Each assignment's canvas: the colour behind the page and the system bars; nil when the export names none (white).
	public let canvases: [RGBA?]
	/// The assignment matching the cells' values at mount.
	public let start: Int
	/// For each export state, the payload cell it follows, or `@env#band` for the `@media` band.
	public let stateCells: [String]
	public let domains: [[NativeValue]]
	public let next: [[[Int]]]
	public var styles: [String: ResolvedStyle] { assignments[start] }
	public let viewport: (width: Double, height: Double)
	/// Device pixels per point the frames were laid out for; a screen with another scale is refused.
	public let dpr: Double
	public let fontFiles: [(id: String, file: String)]
	public let bands: StyleBands?
}

extension StyleLayout {
	/// The assignment reached from `current` when `cell` takes `value`.
	public func next(from current: Int, cell: String, value: NativeValue) throws -> Int {
		guard let state = stateCells.firstIndex(of: cell) else { throw styleError("\(cell) changed but has no style state") }
		guard let column = domains[state].firstIndex(where: { $0.strictlyEquals(value) }) else {
			throw styleError("\(cell)'s style state has no value \(value.jsonText)")
		}
		let reached = next[current][state][column]
		guard reached >= 0 else { throw styleError("\(cell) = \(value.jsonText) is unreachable from style assignment \(current)") }
		return reached
	}
}

extension StyleExport {
	/// Pairs every payload node with its export node. Export nodes the payload does not name (Dragon's `html`, `body`) paint
	/// nothing and only offset their children; a payload node the export lacks, or a write this host cannot express, is an error.
	/// `value` reads a cell's value at mount, so the starting assignment matches stored values too; `dark` picks the band.
	public func resolve(
		for payload: NativeViewPayload, initialTexts: [(node: String, text: String)], value: (String) throws -> NativeValue,
		dark: Bool = false
	) throws -> StyleLayout {
		let styledCells = payload.cells.filter(\.styled).map(\.id)
		let stateCells = try states.map { state in
			if state.key == StyleBands.state { return state.key }
			let named = styledCells.filter(state.names)
			guard named.count == 1 else { throw styleError("style state \(state.key) names \(named.count) styled cells of the payload") }
			return named[0]
		}
		if let unstyled = styledCells.first(where: { !stateCells.contains($0) }) {
			throw styleError("the payload's styled cell \(unstyled) has no state in the style export")
		}
		let current = try stateCells.map { cell in
			guard cell == StyleBands.state else { return try value(cell) }
			guard let bands else { throw styleError("\(cell) is a state, but there are no bands") }
			return NativeValue.number(Double(try bands.band(dark: dark)))
		}
		let matches = { (index: Int) in zip(self.states, current).allSatisfy { state, value in self.assignments[index].values[state.key].map { $0.strictlyEquals(value) } ?? false } }
		guard let start = matches(initial) ? initial : assignments.indices.first(where: matches) else {
			throw styleError("no assignment of the style export matches the cells' values \(current.map(\.jsonText))")
		}
		return StyleLayout(
			assignments: try assignments.indices.map { index in
				try resolveNodes(assignments[index].nodes, for: payload, initialTexts: index == start ? initialTexts : nil)
			},
			canvases: assignments.map(\.canvas),
			start: start, stateCells: stateCells, domains: states.map(\.domain), next: next,
			viewport: viewport, dpr: dpr, fontFiles: fonts, bands: bands)
	}

	private func resolveNodes(
		_ nodes: [StyleNode], for payload: NativeViewPayload, initialTexts: [(node: String, text: String)]?
	) throws -> [String: ResolvedStyle] {
		let byId = Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, $0) })
		let payloadIds = Set(payload.nodes.map(\.id))
		let texts = initialTexts.map { Dictionary(uniqueKeysWithValues: $0.map { ($0.node, $0.text) }) }
		var styles: [String: ResolvedStyle] = [:]
		for node in payload.nodes {
			if case .branch = node.kind { throw styleError("\(node.id): @if is not styled on iOS yet, the style export lays out one state") }
			if case .repeat = node.kind { throw styleError("\(node.id): @for is not styled on iOS yet, the style export lays out one state") }
			if case .sheet = node.kind { throw styleError("\(node.id): a system sheet's content is not styled on iOS yet, the style export lays out one page") }
			guard let styled = byId[node.id] else { throw styleError("no style export node for \(node.id)") }
			switch node.kind {
			case .element:
				guard !styled.isText, !styled.isAnonymous else { throw styleError("\(node.id) is an element in the payload but not in the style export") }
			case .branch, .repeat, .sheet: break
			case .text:
				guard styled.isText else { throw styleError("\(node.id) is text in the payload and an element in the style export") }
				if let texts, styled.text != texts[node.id] {
					throw styleError("\(node.id) reads \(texts[node.id].map { "\"\($0)\"" } ?? "nothing") but the style export laid out \(styled.text.map { "\"\($0)\"" } ?? "nothing")")
				}
			}
			var offset = (x: 0.0, y: 0.0)
			var cursor = styled.parent
			while let id = cursor, !payloadIds.contains(id) {
				guard let skipped = byId[id] else { throw styleError("\(node.id)'s style parent \(id) is missing") }
				offset.x += skipped.frame?.x ?? 0
				offset.y += skipped.frame?.y ?? 0
				cursor = skipped.parent
			}
			guard cursor == node.parent else {
				throw styleError("\(node.id)'s parent is \(node.parent ?? "none") in the payload, \(cursor ?? "none") in the style export")
			}
			var style = try resolve(styled, styled.writes)
			if let frame = style.frame {
				style.frame = Frame(x: frame.x + offset.x / dpr, y: frame.y + offset.y / dpr, width: frame.width, height: frame.height)
			}
			styles[node.id] = style
		}
		return styles
	}



	private func resolve(_ node: StyleNode, _ writes: [StyleWrite]) throws -> ResolvedStyle {
		var style = ResolvedStyle()
		style.frame = node.frame.map { Frame(x: $0.x / dpr, y: $0.y / dpr, width: $0.width / dpr, height: $0.height / dpr) }
		var borderStyles: [String] = []
		var borderColors: [RGBA] = []
		var reHosted: String?
		for write in writes {
			switch write {
			case let .backgroundColor(color): style.background = color
			case .borderWidths: break
			case let .borderStyles(styles): borderStyles = styles
			case let .borderColors(colors): borderColors = colors
			case let .borderRadius(lengths):
				guard lengths.allSatisfy({ !$0.percent && $0.value == lengths[0].value }) else {
					throw styleError("\(node.id): only one uniform pixel corner radius is implemented on iOS")
				}
				style.cornerRadius = lengths[0].value
			case let .font(family, size): style.font = (family, size)
			case let .textColor(color): style.textColor = color
			case .syntheticBold: throw styleError("\(node.id): synthetic-bold is not implemented on iOS")
			case .paddingBoxClip: style.clipsChildren = true
			case let .clipPathInset(edges):
				guard let frame = style.frame else { throw styleError("\(node.id): clip-path on a box with no frame") }
				let edge = { (k: Int, size: Double) in edges[k].percent ? edges[k].value / 100 * size : edges[k].value }
				let l = edge(3, frame.width), t = edge(0, frame.height)
				let r = frame.width - edge(1, frame.width), b = frame.height - edge(2, frame.height)
				style.clipRect = r <= l || b <= t ? Frame(x: 0, y: 0, width: 0, height: 0) : Frame(x: l, y: t, width: r - l, height: b - t)
			case .clipText: break
			case let .paintOrder(host): reHosted = host
			}
		}
		// Re-hosting a box into another stacking context's order is not built here; a box that paints nothing has no order to keep.
		if let host = reHosted, !(style.clipRect.map { $0.width == 0 || $0.height == 0 } ?? false) {
			throw styleError("\(node.id): painting in \(host)'s stacking order (a positioned or z-index box) is not implemented on iOS")
		}
		if let widths = node.borderWidths {
			let all = [widths.top, widths.right, widths.bottom, widths.left]
			if style.clipsChildren, all.contains(where: { $0 != 0 }) {
				throw styleError("\(node.id): overflow clipping on a box with borders (to its padding box) is not implemented on iOS")
			}
			if all.contains(where: { $0 != 0 }) {
				guard borderStyles.count == 4, borderStyles.allSatisfy({ ["solid", "none", "hidden"].contains($0) }), borderColors.count == 4 else {
					throw styleError("\(node.id): border styles \(borderStyles) are not implemented on iOS, only solid sides")
				}
				let widths = zip(all, borderStyles).map { $1 == "solid" ? $0 : 0 }
				if widths.allSatisfy({ $0 == widths[0] }), borderColors.allSatisfy({ $0 == borderColors[0] }) {
					style.borderWidth = widths[0] / dpr
					style.borderColor = borderColors[0]
				} else {
					guard style.cornerRadius == 0 else {
						throw styleError("\(node.id): border sides that differ, with rounded corners, are not implemented on iOS")
					}
					style.sides = zip(widths, borderColors).map { ResolvedStyle.Side(width: $0 / dpr, color: $1) }
				}
			}
		}
		return style
	}
}

private func styleError(_ reason: String) -> PayloadError { PayloadError(path: "style", reason: reason) }
