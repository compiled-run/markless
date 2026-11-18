/// One box's look in points, ready for a host to assign: the only arithmetic between Dragon's export and the views.
public struct ResolvedStyle: Equatable, Sendable {
	public var frame: Frame?
	public var background: RGBA?
	public var borderWidth: Double = 0
	public var borderColor: RGBA?
	public var cornerRadius: Double = 0
	public var font: (family: String, size: Double)?
	public var textColor: RGBA?
	/// Set on a scroll container: the axes CSS lets scroll, its offset range in points, and its scroll view's look.
	public var scroll: ResolvedScroll?

	public static func == (a: ResolvedStyle, b: ResolvedStyle) -> Bool {
		a.frame == b.frame && a.background == b.background && a.borderWidth == b.borderWidth && a.borderColor == b.borderColor
			&& a.cornerRadius == b.cornerRadius && a.font?.family == b.font?.family && a.font?.size == b.font?.size
			&& a.textColor == b.textColor && a.scroll == b.scroll
	}
}

public struct ResolvedScroll: Equatable, Sendable {
	public var x: Bool
	public var y: Bool
	/// Points; a scroll view's content is its padding box grown by `maxX` and `maxY`.
	public var range: ScrollOffsetRange
	/// The padding box inside the border box, in points: top, left, bottom, right border widths.
	public var inset: (top: Double, left: Double, bottom: Double, right: Double)
	public var indicators = true
	public var bounceX = true
	public var bounceY = true

	public static func == (a: ResolvedScroll, b: ResolvedScroll) -> Bool {
		a.x == b.x && a.y == b.y && a.range == b.range && a.inset == b.inset && a.indicators == b.indicators
			&& a.bounceX == b.bounceX && a.bounceY == b.bounceY
	}
}

public struct StyleLayout: Sendable {
	/// Each assignment's look per payload node.
	public let assignments: [[String: ResolvedStyle]]
	/// The assignment matching the cells' values at mount.
	public let start: Int
	/// For each export state, the payload cell it follows.
	public let stateCells: [String]
	public let domains: [[NativeValue]]
	public let next: [[[Int]]]
	public var styles: [String: ResolvedStyle] { assignments[start] }
	public let viewport: (width: Double, height: Double)
	/// Each assignment's page scroll range in points; nil when Dragon left it undecided.
	public let pageScrolls: [ScrollOffsetRange?]
	/// Why Dragon left the page scroll range undecided, when it says.
	public let pageScrollUndecided: String?
	/// Device pixels per point the frames were laid out for; a screen with another scale is refused.
	public let dpr: Double
	public let fontFiles: [(id: String, file: String)]
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
	/// `value` reads a cell's value at mount, so the starting assignment matches stored values too.
	public func resolve(
		for payload: NativeViewPayload, initialTexts: [(node: String, text: String)], value: (String) throws -> NativeValue
	) throws -> StyleLayout {
		let styledCells = payload.cells.filter(\.styled).map(\.id)
		let stateCells = try states.map { state in
			let named = styledCells.filter(state.names)
			guard named.count == 1 else { throw styleError("style state \(state.key) names \(named.count) styled cells of the payload") }
			return named[0]
		}
		if let unstyled = styledCells.first(where: { !stateCells.contains($0) }) {
			throw styleError("the payload's styled cell \(unstyled) has no state in the style export")
		}
		let current = try stateCells.map(value)
		let matches = { (index: Int) in zip(self.states, current).allSatisfy { state, value in self.assignments[index].values[state.key].map { $0.strictlyEquals(value) } ?? false } }
		guard let start = matches(initial) ? initial : assignments.indices.first(where: matches) else {
			throw styleError("no assignment of the style export matches the cells' values \(current.map(\.jsonText))")
		}
		return StyleLayout(
			assignments: try assignments.indices.map { index in
				try resolveNodes(assignments[index].nodes, for: payload, initialTexts: index == start ? initialTexts : nil)
			},
			start: start, stateCells: stateCells, domains: states.map(\.domain), next: next,
			viewport: viewport, pageScrolls: try pageScrolls.map { try $0.map(points) }, pageScrollUndecided: pageScrollUndecided,
			dpr: dpr, fontFiles: fonts)
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
			guard let styled = byId[node.id] else { throw styleError("no style export node for \(node.id)") }
			switch node.kind {
			case .element:
				guard !styled.isText, !styled.isAnonymous else { throw styleError("\(node.id) is an element in the payload but not in the style export") }
			case .branch, .repeat: break
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



	/// A device px range in points; a range that starts before 0 (right to left, a reversed flex box) is not implemented.
	private func points(_ range: ScrollOffsetRange) throws -> ScrollOffsetRange {
		guard range.minX == 0, range.minY == 0 else { throw styleError("a scroll range starting before 0 (\(range.minX), \(range.minY)) is not implemented on iOS") }
		return ScrollOffsetRange(minX: 0, maxX: range.maxX / dpr, minY: 0, maxY: range.maxY / dpr)
	}

	private func resolve(_ node: StyleNode, _ writes: [StyleWrite]) throws -> ResolvedStyle {
		var style = ResolvedStyle()
		var scrollAxes: (x: Bool, y: Bool)?
		var indicators = true
		var bounce = (x: true, y: true)
		var clips = false
		style.frame = node.frame.map { Frame(x: $0.x / dpr, y: $0.y / dpr, width: $0.width / dpr, height: $0.height / dpr) }
		var borderStyles: [String] = []
		var borderColors: [RGBA] = []
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
			case let .scrollContainer(x, y): scrollAxes = (x, y)
			case .scrollIndicatorsHidden: indicators = false
			case .paddingBoxClip: clips = true
			case let .scrollBounce(x, y): bounce = (x, y)
			}
		}
		if clips, scrollAxes == nil {
			throw styleError("\(node.id): a padding-box clip without scrolling (overflow hidden or clip) is not implemented on iOS")
		}
		if let axes = scrollAxes {
			guard let range = node.scrollRange else { throw styleError("\(node.id) is a scroll container with no scroll range") }
			guard let widths = node.borderWidths else { throw styleError("\(node.id) is a scroll container with no border widths") }
			style.scroll = ResolvedScroll(
				x: axes.x, y: axes.y, range: try points(range),
				inset: (widths.top / dpr, widths.left / dpr, widths.bottom / dpr, widths.right / dpr),
				indicators: indicators, bounceX: bounce.x, bounceY: bounce.y)
		} else if node.scrollRange != nil || !indicators || bounce != (true, true) {
			throw styleError("\(node.id) has scroll view writes but no scroll-container write")
		}
		if let widths = node.borderWidths {
			let all = [widths.top, widths.right, widths.bottom, widths.left]
			if all.contains(where: { $0 != 0 }) {
				guard borderStyles == ["solid", "solid", "solid", "solid"] else {
					throw styleError("\(node.id): border styles \(borderStyles) are not implemented on iOS, only four solid sides")
				}
				guard all.allSatisfy({ $0 == all[0] }), borderColors.count == 4, borderColors.allSatisfy({ $0 == borderColors[0] }) else {
					throw styleError("\(node.id): only a border with one width and one colour on every side is implemented on iOS")
				}
				style.borderWidth = all[0] / dpr
				style.borderColor = borderColors[0]
			}
		}
		return style
	}
}

private func styleError(_ reason: String) -> PayloadError { PayloadError(path: "style", reason: reason) }
