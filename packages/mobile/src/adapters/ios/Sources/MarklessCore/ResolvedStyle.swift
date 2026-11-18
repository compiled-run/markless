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
	/// A dashed or dotted border: Dragon's operations, the four side colours and the device scale they are drawn at.
	public var dashedBorder: DashedBorder?
	/// Overflow other than visible: the children are clipped to the box (Dragon clips them to the padding box; without borders the same).
	public var clipsChildren = false
	/// clip-path: inset(): the rect in points, relative to the box, the box and everything in it are clipped to; empty when nothing shows.
	public var clipRect: Frame?
	/// Painted in a stacking context's layer order (a positioned or z-index box): its bucket (-1 below the flow, 1 auto or 0, 2 above)
	/// and its rank there; the host orders it among its view's siblings, after (or, for -1, before) the boxes in flow.
	public var paintOrder: (bucket: Int, rank: Int)?
	/// Set on a scroll container: the axes CSS lets scroll, its offset range in points, and its scroll view's look.
	public var scroll: ResolvedScroll?

	public static func == (a: ResolvedStyle, b: ResolvedStyle) -> Bool {
		a.frame == b.frame && a.background == b.background && a.borderWidth == b.borderWidth && a.borderColor == b.borderColor
			&& a.cornerRadius == b.cornerRadius && a.font?.family == b.font?.family && a.font?.size == b.font?.size
			&& a.textColor == b.textColor && a.sides == b.sides && a.dashedBorder == b.dashedBorder && a.scroll == b.scroll
			&& a.clipsChildren == b.clipsChildren && a.clipRect == b.clipRect
			&& a.paintOrder?.bucket == b.paintOrder?.bucket && a.paintOrder?.rank == b.paintOrder?.rank
	}

	public struct DashedBorder: Equatable, Sendable {
		public let ops: BorderOps
		public let colors: [RGBA]
		public let scale: Double
	}

	public struct Side: Equatable, Sendable {
		public let width: Double
		public let color: RGBA
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
	/// Each assignment's canvas: the colour behind the page and the system bars; nil when the export names none (white).
	public let canvases: [RGBA?]
	/// Each assignment's body box in points, when body paints its own background there (under an html background).
	public let bodies: [(frame: Frame, color: RGBA)?]
	/// The assignment matching the cells' values at mount.
	public let start: Int
	/// For each export state, the payload cell it follows, or `@env#band` for the `@media` band.
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
	public let bands: StyleBands?
	/// Each assignment's document height in points: how far the laid-out content reaches down.
	public let extents: [Double]
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
		let roots = sheetRoots(of: payload)
		for node in payload.nodes where roots[node.id] == node.id && !sheets.contains(where: { $0.node == node.id }) {
			throw styleError("\(node.id): the style export has no styles for this system sheet's content")
		}
		return try layout(
			for: payload, nodes: payload.nodes.filter { roots[$0.id] == nil }, root: nil, everyStyledCell: true,
			initialTexts: initialTexts, value: value, dark: dark)
	}

	/// The layout of each resting height of the sheet `node`, in its `heights` order.
	public func resolveSheet(
		_ node: String, for payload: NativeViewPayload, initialTexts: [(node: String, text: String)],
		value: (String) throws -> NativeValue, dark: Bool = false
	) throws -> [(snapPoint: Double, layout: StyleLayout)] {
		guard let sheet = sheets.first(where: { $0.node == node }) else { throw styleError("\(node): the style export has no styles for this system sheet") }
		let roots = sheetRoots(of: payload)
		let content = payload.nodes.filter { roots[$0.id] == node && $0.id != node }
		return try sheet.heights.map { height in
			(height.snapPoint, try height.style.layout(
				for: payload, nodes: content, root: node, everyStyledCell: false, initialTexts: initialTexts, value: value, dark: dark))
		}
	}

	/// Each node inside a system sheet (and the sheet itself) names that sheet.
	private func sheetRoots(of payload: NativeViewPayload) -> [String: String] {
		var roots: [String: String] = [:]
		for node in payload.nodes {
			if case .sheet = node.kind { roots[node.id] = node.id } else if let parent = node.parent, let root = roots[parent] { roots[node.id] = root }
		}
		return roots
	}

	private func layout(
		for payload: NativeViewPayload, nodes: [NativeNode], root: String?, everyStyledCell: Bool,
		initialTexts: [(node: String, text: String)], value: (String) throws -> NativeValue, dark: Bool
	) throws -> StyleLayout {
		let styledCells = payload.cells.filter(\.styled).map(\.id)
		let stateCells = try states.map { state in
			if state.key == StyleBands.state { return state.key }
			let named = styledCells.filter(state.names)
			guard named.count == 1 else { throw styleError("style state \(state.key) names \(named.count) styled cells of the payload") }
			return named[0]
		}
		if everyStyledCell, let unstyled = styledCells.first(where: { !stateCells.contains($0) }) {
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
				try resolveNodes(assignments[index].nodes, for: nodes, root: root, initialTexts: index == start ? initialTexts : nil)
			},
			canvases: assignments.map(\.canvas),
			bodies: try assignments.map { assignment in
				guard let color = assignment.body else { return nil }
				let frame = { (id: String) throws -> Frame in
					guard let frame = assignment.nodes.first(where: { $0.id == id })?.frame else { throw styleError("body paints a background, but the export gives \(id) no box") }
					return frame
				}
				let html = try frame("html"), body = try frame("body")
				return (Frame(x: (html.x + body.x) / dpr, y: (html.y + body.y) / dpr, width: body.width / dpr, height: body.height / dpr), color)
			},
			start: start, stateCells: stateCells, domains: states.map(\.domain), next: next,
			viewport: viewport, pageScrolls: try pageScrolls.map { try $0.map(points) }, pageScrollUndecided: pageScrollUndecided,
			dpr: dpr, fontFiles: fonts, bands: bands,
			extents: assignments.map { assignment in
				let byId = Dictionary(uniqueKeysWithValues: assignment.nodes.map { ($0.id, $0) })
				func top(_ id: String?) -> Double {
					guard let id, let node = byId[id] else { return 0 }
					return (node.frame?.y ?? 0) + top(node.parent)
				}
				return (assignment.nodes.compactMap { node in node.frame.map { top(node.parent) + $0.y + $0.height } }.max() ?? 0) / dpr
			})
	}

	private func resolveNodes(
		_ nodes: [StyleNode], for payloadNodes: [NativeNode], root: String?, initialTexts: [(node: String, text: String)]?
	) throws -> [String: ResolvedStyle] {
		let byId = Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, $0) })
		let payloadIds = Set(payloadNodes.map(\.id))
		let texts = initialTexts.map { Dictionary(uniqueKeysWithValues: $0.map { ($0.node, $0.text) }) }
		var styles: [String: ResolvedStyle] = [:]
		for node in payloadNodes {
			if case .branch = node.kind { throw styleError("\(node.id): @if is not styled on iOS yet, the style export lays out one state") }
			if case .repeat = node.kind { throw styleError("\(node.id): @for is not styled on iOS yet, the style export lays out one state") }
			if case .sheet = node.kind { throw styleError("\(node.id): a system sheet inside another sheet's content is not styled on iOS") }
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
			guard cursor == (node.parent == root ? nil : node.parent) else {
				throw styleError("\(node.id)'s parent is \(node.parent ?? "none") in the payload, \(cursor ?? "none") in the style export")
			}
			var style = try resolve(styled, styled.writes)
			// A box that paints nothing (an empty clip) has no order to keep.
			if style.clipRect.map({ $0.width == 0 || $0.height == 0 }) ?? false { style.paintOrder = nil }
			if style.paintOrder != nil, let host = reHostOf(styled.writes) { try checkSiblingOrderSuffices(styled, host: host, byId: byId, nodes: nodes) }
			if let frame = style.frame {
				style.frame = Frame(x: frame.x + offset.x / dpr, y: frame.y + offset.y / dpr, width: frame.width, height: frame.height)
			}
			styles[node.id] = style
		}
		return styles
	}



	private func reHostOf(_ writes: [StyleWrite]) -> String? {
		for case let .paintOrder(host, _, _) in writes { return host }
		return nil
	}

	/// Ordering a box among its own siblings paints it where its stacking context does when the context is its parent, or when every
	/// box between them is the last painting child of its parent and clips nothing: then nothing of the context paints after it
	/// outside the parent. Anything else is refused by name.
	private func checkSiblingOrderSuffices(_ node: StyleNode, host: String, byId: [String: StyleNode], nodes: [StyleNode]) throws {
		var cursor = node.parent
		guard case let .paintOrder(_, bucket, _)? = node.writes.first(where: { if case .paintOrder = $0 { return true } else { return false } }) else { return }
		while let id = cursor, id != host {
			guard let between = byId[id] else { throw styleError("\(node.id)'s stacking context \(host) is not an ancestor") }
			let painting = nodes.filter { $0.parent == between.parent && $0.frame != nil }
			let clips = between.writes.contains { if case .paddingBoxClip = $0 { return true }; if case .clipPathInset = $0 { return true }; return false }
			guard bucket >= 0, painting.last?.id == between.id, !clips else {
				throw styleError("\(node.id): painting in \(host)'s stacking order past \(between.id), which has later siblings or clips, is not implemented on iOS")
			}
			cursor = between.parent
		}
		if cursor == nil { throw styleError("\(node.id)'s stacking context \(host) is not an ancestor") }
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
			case let .clipPathInset(edges):
				guard let frame = style.frame else { throw styleError("\(node.id): clip-path on a box with no frame") }
				let edge = { (k: Int, size: Double) in edges[k].percent ? edges[k].value / 100 * size : edges[k].value }
				let l = edge(3, frame.width), t = edge(0, frame.height)
				let r = frame.width - edge(1, frame.width), b = frame.height - edge(2, frame.height)
				style.clipRect = r <= l || b <= t ? Frame(x: 0, y: 0, width: 0, height: 0) : Frame(x: l, y: t, width: r - l, height: b - t)
			case .clipText: break
			case let .paintOrder(_, bucket, rank): style.paintOrder = (bucket, rank)
			}
		}
		// A scroll view clips its own content; any other box clips its children.
		style.clipsChildren = clips && scrollAxes == nil
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
		if let ops = node.borderOps {
			guard borderColors.count == 4, style.cornerRadius == 0, !style.clipsChildren else {
				throw styleError("\(node.id): a dashed or dotted border needs four side colours, square corners and no overflow clip")
			}
			style.dashedBorder = ResolvedStyle.DashedBorder(ops: ops, colors: borderColors, scale: dpr)
		} else if let widths = node.borderWidths {
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
