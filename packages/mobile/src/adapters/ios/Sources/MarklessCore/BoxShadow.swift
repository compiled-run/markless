/// A box's `box-shadow` and everything Dragon's translated painter (paint-shadow.ts) reads to raster it as Chrome does: the box,
/// and the backgrounds beneath it that each shadow is blitted onto.
public struct BoxShadow: Equatable, Sendable {
	/// One computed shadow: CSS px at zoom 1 and an sRGB RGBA8 colour.
	public struct Shadow: Equatable, Sendable {
		public let inset: Bool
		public let x: Double, y: Double, blur: Double, spread: Double
		public let color: RGBA
	}

	public struct RadiusLength: Equatable, Sendable {
		public let percent: Bool
		public let value: Double
	}

	/// A box in page device px: its snapped border box (left, top, right, bottom), its size before snapping, its border widths
	/// (top, right, bottom, left), its eight corner radius lengths (CSS px or percent) and its background.
	public struct Box: Equatable, Sendable {
		public let edges: [Double]
		public let size: [Double]
		public let borders: [Double]
		public let radii: [RadiusLength]
		public let background: RGBA
	}

	/// In list order; the first is drawn on top.
	public let shadows: [Shadow]
	public let box: Box
	/// The unsnapped page device px origin of the box's frame, which the host's view sits at.
	public let originX: Double, originY: Double
	/// The backgrounds beneath the box, outermost first, over the white root: the canvas, body's own and each ancestor's.
	public let backdrop: [Box]
	public let dpr: Double

	public var hasOuter: Bool { shadows.contains { !$0.inset } }
	public var hasInset: Bool { shadows.contains { $0.inset } }
}

extension BoxShadow {
	/// The shadow of `node` in an assignment's export nodes (frames in device px, relative to the parent box); nil without one.
	static func of(
		_ node: StyleNode, byId: [String: StyleNode], canvas: RGBA?, body: RGBA?, dpr: Double
	) throws -> BoxShadow? {
		guard let shadows = node.writes.lazy.compactMap({ write -> [Shadow]? in
			if case let .boxShadow(shadows) = write { return shadows }
			return nil
		}).first, !shadows.isEmpty else { return nil }
		guard node.frame != nil else { return nil }
		func origin(_ id: String?) -> (x: Double, y: Double) {
			guard let id, let n = byId[id] else { return (0, 0) }
			let p = origin(n.parent)
			return (p.x + (n.frame?.x ?? 0), p.y + (n.frame?.y ?? 0))
		}
		func box(_ n: StyleNode, _ background: RGBA) throws -> Box {
			guard let f = n.frame else { throw PayloadError(path: "style", reason: "\(n.id) paints beneath a shadow but has no box") }
			let at = origin(n.id)
			let w = n.borderWidths
			var radii = Array(repeating: RadiusLength(percent: false, value: 0), count: 8)
			for case let .borderRadius(lengths) in n.writes { radii = lengths.map { RadiusLength(percent: $0.percent, value: $0.value) } }
			return Box(
				edges: [at.x.rounded(), at.y.rounded(), (at.x + f.width).rounded(), (at.y + f.height).rounded()],
				size: [f.width, f.height], borders: w.map { [$0.top, $0.right, $0.bottom, $0.left] } ?? [0, 0, 0, 0],
				radii: radii, background: background)
		}
		func background(_ n: StyleNode) -> RGBA? {
			for case let .backgroundColor(color) in n.writes where color.alpha > 0 { return color }
			return nil
		}
		var backdrop: [Box] = []
		if let canvas {
			let page = 1e7
			backdrop.append(Box(
				edges: [-page, -page, page, page], size: [2 * page, 2 * page], borders: [0, 0, 0, 0],
				radii: Array(repeating: RadiusLength(percent: false, value: 0), count: 8), background: canvas))
		}
		// html's and body's backgrounds reach the page as the canvas and body's own; neither paints its box's write again.
		var chain: [StyleNode] = []
		var cursor = node.parent
		while let id = cursor, let n = byId[id] {
			chain.insert(n, at: 0)
			cursor = n.parent
		}
		for n in chain {
			if n.id == "html" { continue }
			if n.id == "body" {
				if let body { backdrop.append(try box(n, body)) }
				continue
			}
			if let color = background(n) { backdrop.append(try box(n, color)) }
		}
		let at = origin(node.id)
		return BoxShadow(
			shadows: shadows, box: try box(node, background(node) ?? RGBA(r: 0, g: 0, b: 0, alpha: 0)), originX: at.x, originY: at.y,
			backdrop: backdrop, dpr: dpr)
	}
}
