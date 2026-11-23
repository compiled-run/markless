/// One box's look in points, ready for a host to assign: the only arithmetic between Dragon's export and the views.
public struct ResolvedStyle: Equatable, Sendable {
	public var frame: Frame?
	public var background: RGBA?
	public var borderWidth: Double = 0
	public var borderColor: RGBA?
	public var cornerRadius: Double = 0
	/// Solid sides that differ (top, right, bottom, left; width in points, 0 for none); on a rounded box they share one colour. Nil when uniform.
	public var sides: [Side]?
	public var font: (family: String, size: Double)?
	public var textColor: RGBA?
	/// A text node's lines as Dragon laid them out, in points from its frame, and the text they draw.
	public var lines: [TextLine]?
	public var linesText: String?
	/// A dashed or dotted border: Dragon's operations, the four side colours and the device scale they are drawn at.
	public var dashedBorder: DashedBorder?
	/// Overflow other than visible: the children are clipped to the box, or to `childClip` when it has borders.
	public var clipsChildren = false
	/// Overflow clipping on a box with borders: the padding box its children are clipped to.
	public var childClip: PaddingBox?
	/// clip-path: inset(): the rect in points, relative to the box, the box and everything in it are clipped to; empty when nothing shows.
	public var clipRect: Frame?
	/// Painted in a stacking context's layer order (a positioned or z-index box): its bucket (-1 below the flow, 1 auto or 0, 2 above)
	/// and its rank there; the host orders it among its view's siblings, after (or, for -1, before) the boxes in flow.
	public var paintOrder: (bucket: Int, rank: Int)?
	/// Set on a box whose stacking context paints it past ancestors with later siblings: the payload node whose view it is placed
	/// in, among that view's children in `paintOrder`, with `frame` relative to that node's box.
	public var stackingParent: String?
	/// Set on a scroll container: the axes CSS lets scroll, its offset range in points, and its scroll view's look.
	public var scroll: ResolvedScroll?
	/// box-shadow, rastered by Dragon's translated painter after every layout.
	public var shadow: BoxShadow?
	/// `visibility` other than visible (a text takes its element's): the view keeps its place, but paints nothing of its own.
	public var hidden = false
	/// A select's drop-down arrow, once Dragon's plan has laid the page out.
	public var selectArrow: SelectArrowPaint?
	/// A themed checkbox's marks and colours, once Dragon's plan has laid the page out.
	public var checkbox: CheckboxPaint?
	/// A select's label: the box Dragon lays out inside it for its text, and that text's font and colour.
	public var selectLabel: SelectLabel?
	/// `outline`, drawn with Dragon's translated painters in the view of `OutlinePaint.host`.
	public var outline: OutlinePaint?

	public static func == (a: ResolvedStyle, b: ResolvedStyle) -> Bool {
		a.frame == b.frame && a.background == b.background && a.borderWidth == b.borderWidth && a.borderColor == b.borderColor
			&& a.cornerRadius == b.cornerRadius && a.font?.family == b.font?.family && a.font?.size == b.font?.size
			&& a.textColor == b.textColor && a.lines == b.lines && a.linesText == b.linesText && a.sides == b.sides && a.dashedBorder == b.dashedBorder && a.scroll == b.scroll && a.hidden == b.hidden
			&& a.clipsChildren == b.clipsChildren && a.childClip == b.childClip && a.clipRect == b.clipRect
			&& a.paintOrder?.bucket == b.paintOrder?.bucket && a.paintOrder?.rank == b.paintOrder?.rank && a.stackingParent == b.stackingParent && a.shadow == b.shadow
			&& a.selectArrow == b.selectArrow && a.selectLabel == b.selectLabel && a.checkbox == b.checkbox && a.outline == b.outline
	}

	public struct SelectArrowPaint: Equatable, Sendable {
		public let arrow: SelectArrow
		public let color: RGBA
		/// Device px per point: the arrow's geometry is in device px.
		public let scale: Double
	}

	public struct CheckboxPaint: Equatable, Sendable {
		public let marks: CheckboxMarks
		public let colors: CheckboxColors
		/// Device px per point: the marks are in device px.
		public let scale: Double
	}

	/// `frame` in points from the select's border box; `fontSize` in points.
	public struct SelectLabel: Equatable, Sendable {
		public let frame: Frame
		public let fontFamily: String
		public let fontSize: Double
		public let color: RGBA?
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

/// The border box inset by each side's border width, in points, each corner's radii the outer radius less the adjacent border
/// widths, never below 0, as CSS shapes inner corners.
public struct PaddingBox: Equatable, Sendable {
	public let top: Double
	public let right: Double
	public let bottom: Double
	public let left: Double
	/// Each corner's horizontal and vertical radius, from the top left, clockwise.
	public let corners: [Corner]

	public struct Corner: Equatable, Sendable {
		public let x: Double
		public let y: Double
		public init(x: Double, y: Double) {
			self.x = x
			self.y = y
		}
	}

	public init(radius: Double, top: Double, right: Double, bottom: Double, left: Double) {
		self.top = top
		self.right = right
		self.bottom = bottom
		self.left = left
		corners = [(left, top), (right, top), (right, bottom), (left, bottom)].map { Corner(x: max(0, radius - $0.0), y: max(0, radius - $0.1)) }
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
	/// Each system face the export names, by id.
	public let systemFaces: [String: SystemFace]
	public let bands: StyleBands?
	/// Each assignment's document height in points: how far the laid-out content reaches down.
	public let extents: [Double]
	/// Per assignment, its interaction states, whose entries follow the assignments in every per-entry list here.
	public let interaction: [StyleInteractionLevel]
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
		arm: (String) throws -> NativeValue? = { _ in nil }, dark: Bool = false
	) throws -> StyleLayout {
		let roots = sheetRoots(of: payload)
		for node in payload.nodes where roots[node.id] == node.id && !sheets.contains(where: { $0.node == node.id }) {
			throw styleError("\(node.id): the style export has no styles for this system sheet's content")
		}
		return try layout(
			for: payload, nodes: payload.nodes.filter { roots[$0.id] == nil }, root: nil, everyStyledCell: true,
			initialTexts: initialTexts, value: value, arm: arm, dark: dark)
	}

	/// The layout of each resting height of the sheet `node`, in its `heights` order.
	public func resolveSheet(
		_ node: String, for payload: NativeViewPayload, initialTexts: [(node: String, text: String)],
		value: (String) throws -> NativeValue, arm: (String) throws -> NativeValue? = { _ in nil }, dark: Bool = false
	) throws -> [(snapPoint: Double, layout: StyleLayout)] {
		guard let sheet = sheets.first(where: { $0.node == node }) else { throw styleError("\(node): the style export has no styles for this system sheet") }
		let roots = sheetRoots(of: payload)
		let content = payload.nodes.filter { roots[$0.id] == node && $0.id != node }
		return try sheet.heights.map { height in
			(height.snapPoint, try height.style.layout(
				for: payload, nodes: content, root: node, everyStyledCell: false, initialTexts: initialTexts, value: value, arm: arm, dark: dark))
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
		initialTexts: [(node: String, text: String)], value: (String) throws -> NativeValue,
		arm: (String) throws -> NativeValue?, dark: Bool
	) throws -> StyleLayout {
		// A style case is a state of the export as a styled cell is; the runtime answers its value.
		let styledCells = payload.cells.filter(\.styled).map(\.id) + payload.styleCases.map(\.id)
		// An @if or @try outside list rows: its style state is the arm it shows.
		let branches = Set(payload.nodes.compactMap { node -> String? in
			guard case .branch = node.kind, node.row == nil else { return nil }
			return node.id
		})
		// A row's class or ui-* values (`<node>#<attribute>`) and each @if or @try inside a row style only the rows, which take their own.
		let inRows = Set(payload.nodes.compactMap { $0.row == nil ? nil : $0.id })
		let rowStates = Set(states.map(\.key).filter { key in
			inRows.contains(key) || key.lastIndex(of: "#").map { inRows.contains(String(key[..<$0])) } == true
		})
		let stateCells = try states.map { state in
			if state.key == StyleBands.state || rowStates.contains(state.key) { return state.key }
			let named = (styledCells + branches.sorted()).filter(state.names)
			guard named.count == 1 else { throw styleError("style state \(state.key) names \(named.count) styled cells or branches of the payload") }
			return named[0]
		}
		if everyStyledCell, let unstyled = styledCells.first(where: { !stateCells.contains($0) }) {
			throw styleError("the payload's styled cell \(unstyled) has no state in the style export")
		}
		let current = try stateCells.enumerated().map { index, cell in
			// The page keeps the template's value for a state of each row.
			if rowStates.contains(cell) { return assignments[initial].values[cell] ?? states[index].domain[0] }
			// A branch no arm around it shows keeps a value no box reads: its first.
			if branches.contains(cell) { return try arm(cell) ?? states[index].domain[0] }
			guard cell == StyleBands.state else { return try value(cell) }
			guard let bands else { throw styleError("\(cell) is a state, but there are no bands") }
			return NativeValue.number(Double(try bands.band(dark: dark, widthPx: viewport.width * dpr, heightPx: viewport.height * dpr, scale: dpr)))
		}
		let matches = { (index: Int) in zip(self.states, current).allSatisfy { state, value in self.assignments[index].values[state.key].map { $0.strictlyEquals(value) } ?? false } }
		// Interaction states come after the assignments and share their values; a page starts in an assignment.
		guard let start = matches(initial) ? initial : next.indices.first(where: matches) else {
			throw styleError("no assignment of the style export matches the cells' values \(current.map(\.jsonText))")
		}
		let picker = payload.pickerContent
		return StyleLayout(
			assignments: try assignments.indices.map { index in
				try resolveNodes(
					assignments[index].nodes, for: nodes, picker: picker, root: root, initialTexts: index == start ? initialTexts : nil,
					canvas: assignments[index].canvas, body: assignments[index].body,
					inline: index < inlineBoxes.count
						? Set(inlineBoxes[index].map { (index < planNames.count ? planNames[index][$0] : nil) ?? $0 }) : [])
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
			dpr: dpr, fontFiles: fonts, systemFaces: systemFaces, bands: bands,
			extents: assignments.map { assignment in
				let byId = Dictionary(uniqueKeysWithValues: assignment.nodes.map { ($0.id, $0) })
				func top(_ id: String?) -> Double {
					guard let id, let node = byId[id] else { return 0 }
					return (node.frame?.y ?? 0) + top(node.parent)
				}
				return (assignment.nodes.compactMap { node in node.frame.map { top(node.parent) + $0.y + $0.height } }.max() ?? 0) / dpr
			},
			interaction: interaction)
	}

	private func resolveNodes(
		_ nodes: [StyleNode], for payloadNodes: [NativeNode], picker: Set<String>, root: String?, initialTexts: [(node: String, text: String)]?,
		canvas: RGBA?, body: RGBA?, inline: Set<String>
	) throws -> [String: ResolvedStyle] {
		let byId = Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, $0) })
		// Boxes whose visibility is not visible: their text, which Dragon writes no visibility for, is hidden with them.
		let hiddenBoxes = Set(nodes.filter { node in
			node.writes.contains { if case let .visibility(value) = $0 { return value != "visible" }; return false }
		}.map(\.id))
		let payloadIds = Set(payloadNodes.map(\.id))
		let texts = initialTexts.map { Dictionary(uniqueKeysWithValues: $0.map { ($0.node, $0.text) }) }
		let payloadById = Dictionary(uniqueKeysWithValues: payloadNodes.map { ($0.id, $0) })
		let isSelect = { (id: String) -> Bool in
			if case .element("select", _, _)? = payloadById[id]?.kind { return true }
			return false
		}
		let postOrder = StyleExport.postOrder(nodes)
		let base = { (id: String) -> String in id.firstIndex(of: "@").map { String(id[..<$0]) } ?? id }
		let isView = { (id: String) in payloadIds.contains(id) || (id.contains("@") && payloadIds.contains(base(id))) }
		var styles: [String: ResolvedStyle] = [:]
		for node in payloadNodes {
			// Dragon lays out no box for what shows only in a select's picker.
			if picker.contains(node.id), byId[node.id] == nil { continue }
			if case .branch = node.kind { continue }
			if case .repeat = node.kind { continue }
			if case .sheet = node.kind { throw styleError("\(node.id): a system sheet inside another sheet's content is not styled on iOS") }
			guard let styled = byId[node.id] else { throw styleError("no style export node for \(node.id)") }
			switch node.kind {
			case .element:
				guard !styled.isText, !styled.isAnonymous else { throw styleError("\(node.id) is an element in the payload but not in the style export") }
			case .branch, .repeat, .sheet: break
			case .text:
				guard styled.isText else { throw styleError("\(node.id) is text in the payload and an element in the style export") }
				// A text in an arm not shown at mount is read when its arm opens; one with no box here is laid out where it shows.
				if let texts, let shown = texts[node.id], styled.frame != nil, styled.text != shown {
					throw styleError("\(node.id) reads \"\(shown)\" but the style export laid out \(styled.text.map { "\"\($0)\"" } ?? "nothing")")
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
			let payloadParent = node.parent == root ? nil : node.parent
			if cursor != payloadParent {
				guard let parent = payloadParent, let container = cursor,
					let inside = try flattenedInline(
						node.id, in: parent, container: container, byId: byId, inline: inline, isView: payloadIds.contains,
						payloadParent: { payloadById[$0]?.parent })
				else {
					throw styleError("\(node.id)'s parent is \(node.parent ?? "none") in the payload, \(cursor ?? "none") in the style export")
				}
				offset.x -= inside.x
				offset.y -= inside.y
				cursor = parent
			}
			var style = try resolve(styled, styled.writes)
			style.shadow = try BoxShadow.of(styled, byId: byId, canvas: canvas, body: body, dpr: dpr)
			style.outline = try outline(of: styled, byId: byId, nodes: nodes, isView: isView, postOrder: postOrder)
			if styled.isText, let parent = styled.parent, hiddenBoxes.contains(parent) { style.hidden = true }
			// A box that paints nothing (an empty clip) has no order to keep.
			if style.clipRect.map({ $0.width == 0 || $0.height == 0 }) ?? false { style.paintOrder = nil }
			if style.paintOrder != nil, let host = reHostOf(styled.writes),
				let lifted = try stackingParent(styled, host: host, payloadParent: cursor, byId: byId, payloadIds: payloadIds)
			{
				style.stackingParent = lifted.parent
				offset = lifted.offset
			}
			if let frame = style.frame {
				style.frame = Frame(x: frame.x + offset.x / dpr, y: frame.y + offset.y / dpr, width: frame.width, height: frame.height)
			}
			if isSelect(node.id), !style.hidden { style.selectLabel = try selectLabel(styled, nodes, isView: payloadIds.contains) }
			styles[node.id] = style
		}
		// Each row's copy of a payload node ("<id>@<key>"), placed in its own copies of the boxes around it.
		for styled in nodes where styled.id.contains("@") && payloadIds.contains(base(styled.id)) {
			var offset = (x: 0.0, y: 0.0)
			var cursor = styled.parent
			while let id = cursor, !isView(id) {
				guard let skipped = byId[id] else { throw styleError("\(styled.id)'s style parent \(id) is missing") }
				offset.x += skipped.frame?.x ?? 0
				offset.y += skipped.frame?.y ?? 0
				cursor = skipped.parent
			}
			// A copy's payload parent is that parent's copy in the same row, or in an outer row, or the parent itself.
			let rowParent = { (id: String) -> String? in
				guard let parent = payloadById[base(id)]?.parent else { return nil }
				var keys = String(id[id.firstIndex(of: "@")!...])
				while !keys.isEmpty {
					if byId[parent + keys] != nil { return parent + keys }
					keys = keys.lastIndex(of: "@").map { String(keys[..<$0]) } ?? ""
				}
				return parent
			}
			if let container = cursor, base(container) != payloadById[base(styled.id)]?.parent, let payloadParent = rowParent(styled.id) {
				guard let inside = try flattenedInline(
					styled.id, in: payloadParent, container: container, byId: byId, inline: inline, isView: isView, payloadParent: rowParent)
				else {
					throw styleError("\(styled.id)'s parent is \(payloadParent) in the payload, \(container) in the style export")
				}
				offset.x -= inside.x
				offset.y -= inside.y
			}
			var style = try resolve(styled, styled.writes)
			style.shadow = try BoxShadow.of(styled, byId: byId, canvas: canvas, body: body, dpr: dpr)
			style.outline = try outline(of: styled, byId: byId, nodes: nodes, isView: isView, postOrder: postOrder)
			if styled.isText, let parent = styled.parent, hiddenBoxes.contains(parent) { style.hidden = true }
			if let frame = style.frame {
				style.frame = Frame(x: frame.x + offset.x / dpr, y: frame.y + offset.y / dpr, width: frame.width, height: frame.height)
			}
			if isSelect(base(styled.id)), !style.hidden { style.selectLabel = try selectLabel(styled, nodes, isView: isView) }
			styles[styled.id] = style
		}
		return styles
	}

	/// The box Dragon lays out inside a select for its label (Chrome's `::inner`, which no payload node names), with the font
	/// and colour of the text in it; nil when the select or that box shows nothing.
	private func selectLabel(_ select: StyleNode, _ nodes: [StyleNode], isView: (String) -> Bool) throws -> ResolvedStyle.SelectLabel? {
		guard select.frame != nil else { return nil }
		let inner = nodes.filter { $0.parent == select.id && !isView($0.id) }
		guard inner.count == 1, !inner[0].isText else {
			throw styleError("\(select.id): a select's style export holds one box for its label, not \(inner.count)")
		}
		guard let box = inner[0].frame, let text = nodes.first(where: { $0.parent == inner[0].id && $0.isText }) else { return nil }
		var font: (family: String, size: Double)?
		var color: RGBA?
		for write in text.writes {
			if case let .font(family, size) = write { font = (family, size) }
			if case let .textColor(c) = write { color = c }
		}
		guard let font else { throw styleError("\(select.id): its label's text has no font") }
		return ResolvedStyle.SelectLabel(
			frame: Frame(x: box.x / dpr, y: box.y / dpr, width: box.width / dpr, height: box.height / dpr),
			fontFamily: font.family, fontSize: font.size, color: color)
	}



	/// Dragon lays an inline formatting context out flat: each text and inline box in it is a child of its block container.
	/// When `parent`, `id`'s payload parent, is an inline box flattened into `container` (as is every inline box up to it), this
	/// is `parent`'s offset in `container` (device px), which `id`'s frame there less that is its frame in `parent`'s view; else nil.
	/// An inline box in the way that paints anything of its own or keeps a stacking order is refused by name.
	private func flattenedInline(
		_ id: String, in parent: String, container: String, byId: [String: StyleNode], inline: Set<String>, isView: (String) -> Bool,
		payloadParent: (String) -> String?
	) throws -> (x: Double, y: Double)? {
		func placed(_ box: StyleNode) -> (container: String?, x: Double, y: Double) {
			var at = (x: box.frame?.x ?? 0, y: box.frame?.y ?? 0)
			var cursor = box.parent
			while let up = cursor, !isView(up), let skipped = byId[up] {
				at.x += skipped.frame?.x ?? 0
				at.y += skipped.frame?.y ?? 0
				cursor = skipped.parent
			}
			return (cursor, at.x, at.y)
		}
		var offset: (x: Double, y: Double)?
		var cursor: String? = parent
		while let box = cursor, box != container {
			guard inline.contains(box.firstIndex(of: "@").map { String(box[..<$0]) } ?? box), let styled = byId[box], !styled.isText, !styled.isAnonymous else { return nil }
			let at = placed(styled)
			guard at.container == container else { return nil }
			if let paint = inlinePaint(styled) {
				throw styleError("\(id): its inline box \(box) \(paint), which iOS does not draw on a box Dragon lays out flat in \(container)")
			}
			if offset == nil { offset = (at.x, at.y) }
			cursor = payloadParent(box)
		}
		return cursor == container ? offset : nil
	}

	/// What an inline box paints or keeps of its own, in words; nil when it is transparent, borderless and in the flow.
	private func inlinePaint(_ box: StyleNode) -> String? {
		if let widths = box.borderWidths, [widths.top, widths.right, widths.bottom, widths.left].contains(where: { $0 != 0 }) { return "has a border" }
		for write in box.writes {
			switch write {
			case let .borderStyles(styles) where styles.contains(where: { $0 != "none" && $0 != "hidden" }): return "has a border"
			case let .backgroundColor(color) where color.alpha != 0: return "paints a background"
			case .outline: return "draws an outline"
			case .boxShadow: return "casts a shadow"
			case .paintOrder: return "paints in a stacking order"
			default: continue
			}
		}
		return nil
	}

	private func reHostOf(_ writes: [StyleWrite]) -> String? {
		for case let .paintOrder(host, _, _) in writes { return host }
		return nil
	}

	/// Where a box Dragon paints in its stacking context's order (`host`) is placed so its view's siblings are that order: the host
	/// when it is a payload node, else the page's top node; nil when that is its parent already. Its frame there adds every box
	/// in between (device px). A box in between that clips, scrolls or keeps an order of its own would have to carry the box
	/// with it, and is refused by name, as is a box below the flow (a negative z-index) placed past its parent.
	private func stackingParent(
		_ node: StyleNode, host: String, payloadParent: String?, byId: [String: StyleNode], payloadIds: Set<String>
	) throws -> (parent: String, offset: (x: Double, y: Double))? {
		guard case let .paintOrder(_, bucket, _)? = node.writes.first(where: { if case .paintOrder = $0 { return true } else { return false } }) else { return nil }
		var chain: [StyleNode] = []
		var cursor = node.parent
		while let id = cursor, id != host {
			guard let between = byId[id] else { throw styleError("\(node.id)'s stacking context \(host) is not an ancestor") }
			chain.append(between)
			cursor = between.parent
		}
		if cursor == nil { throw styleError("\(node.id)'s stacking context \(host) is not an ancestor") }
		let target = payloadIds.contains(host) ? host : chain.last(where: { payloadIds.contains($0.id) })?.id
		let between = chain.prefix { $0.id != target }
		for box in between {
			let clips = box.writes.contains {
				switch $0 {
				case .paddingBoxClip, .clipPathInset, .scrollContainer: return true
				default: return false
				}
			}
			if clips { throw styleError("\(node.id): painting in \(host)'s stacking order past \(box.id), which clips or scrolls, is not implemented on iOS") }
			if box.writes.contains(where: { if case .paintOrder = $0 { return true } else { return false } }) {
				throw styleError("\(node.id): painting in \(host)'s stacking order past \(box.id), which keeps an order of its own, is not implemented on iOS")
			}
		}
		guard let target, target != payloadParent else { return nil }
		guard bucket >= 0 else { throw styleError("\(node.id): painting below the flow of \(host) past \(payloadParent ?? "the page") is not implemented on iOS") }
		return (target, between.reduce((x: 0.0, y: 0.0)) { ($0.x + ($1.frame?.x ?? 0), $0.y + ($1.frame?.y ?? 0)) })
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
		style.lines = node.lines?.map { line in
			TextLine(top: line.top / dpr, baseline: line.baseline / dpr, runs: line.runs.map { GlyphRun(face: $0.face, size: $0.size / dpr, glyphs: $0.glyphs, xs: $0.xs.map { $0 / dpr }) })
		}
		style.linesText = node.lines == nil ? nil : node.text
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
				// CSS shrinks radii that overlap until they fit; Core Animation draws no background at all past half the shorter side.
				style.cornerRadius = style.frame.map { min(lengths[0].value, $0.width / 2, $0.height / 2) } ?? lengths[0].value
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
			case .boxShadow: break
			case let .visibility(value): style.hidden = value != "visible"
			case let .selectArrow(color):
				if let arrow = node.selectArrow { style.selectArrow = ResolvedStyle.SelectArrowPaint(arrow: arrow, color: color, scale: dpr) }
			case let .checkbox(colors):
				if let marks = node.checkboxMarks { style.checkbox = ResolvedStyle.CheckboxPaint(marks: marks, colors: colors, scale: dpr) }
			case .outline: break
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
				style.childClip = PaddingBox(radius: style.cornerRadius, top: all[0] / dpr, right: all[1] / dpr, bottom: all[2] / dpr, left: all[3] / dpr)
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
					let drawn = zip(widths, borderColors).filter { $0.0 > 0 }.map(\.1)
					guard style.cornerRadius == 0 || drawn.allSatisfy({ $0 == drawn[0] }) else {
						throw styleError("\(node.id): border sides of different colours, with rounded corners, are not implemented on iOS")
					}
					style.sides = zip(widths, borderColors).map { ResolvedStyle.Side(width: $0 / dpr, color: $1) }
				}
			}
		}
		// A box that is not visible paints none of its own decorations; its children paint as their own visibility says.
		if style.hidden {
			style.background = nil
			style.borderWidth = 0
			style.borderColor = nil
			style.sides = nil
			style.dashedBorder = nil
			style.selectArrow = nil
		}
		return style
	}
}

func styleError(_ reason: String) -> PayloadError { PayloadError(path: "style", reason: reason) }
