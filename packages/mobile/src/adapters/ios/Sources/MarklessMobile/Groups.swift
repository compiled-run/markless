#if canImport(UIKit)
import MarklessCore
import UIKit

/// Dragon's translated paint math, set by a host that links Dragon (MarklessViewController); a transform or an opacity group needs it.
public enum DragonPaint {
	/// A transform at a border box of width x height points, as [a, b, c, d, tx, ty] about the box's centre.
	nonisolated(unsafe) public static var transformMatrix: ((StyleTransform, Double, Double) throws -> [Double])?
	nonisolated(unsafe) public static var opacityAlpha8: ((Double) throws -> Double)?
	/// A group's layer pixel over its backdrop pixel (premultiplied RGBA bytes) at an alpha byte, packed r | g << 8 | b << 16 | a << 24.
	nonisolated(unsafe) public static var groupComposite: ((Double, Double, Double, Double, Double, Double, Double, Double, Double) throws -> Double)?
	/// The same, when Chrome composites the group in a layer of its own.
	nonisolated(unsafe) public static var groupCompositeLayered: ((Double, Double, Double, Double, Double, Double, Double, Double, Double) throws -> Double)?
}

/// A box's transform at its current size, set about the layer's anchor point (the bounds centre) with antialiased edges.
@MainActor
func applyTransform(_ id: String, _ view: UIView, _ transform: StyleTransform?) throws {
	guard let transform, !transform.functions.isEmpty else {
		if !CATransform3DIsIdentity(view.layer.transform) { view.layer.setAffineTransform(.identity) }
		view.layer.allowsEdgeAntialiasing = false
		return
	}
	guard let matrix = DragonPaint.transformMatrix else { throw HostError("\(id): a transform needs Dragon's paint functions, which this host does not link") }
	let m = try matrix(transform, Double(view.bounds.width), Double(view.bounds.height))
	guard m.count == 6 else { throw HostError("\(id): Dragon's transform matrix has \(m.count) entries") }
	view.layer.allowsEdgeAntialiasing = true
	view.layer.setAffineTransform(CGAffineTransform(a: m[0], b: m[1], c: m[2], d: m[3], tx: m[4], ty: m[5]))
}

/// What a group overlay reads from the page it is in.
struct GroupContext {
	/// The page's root view: the backdrop is drawn from it when the group is inside it, else from the group's outermost ancestor.
	let pageRoot: UIView
	let canvas: () -> UIColor
	let scale: () -> Double
	/// Whether the page's boxes reach past the viewport, so Chrome's root scroller overflows.
	let rootOverflows: () -> Bool
	/// The overlay of an earlier group, by Dragon id, seen from the group with this instance id.
	let overlay: (_ painter: String, _ from: String) -> GroupOverlayView?
	/// The view of an element, by Dragon id, seen from the group with this instance id.
	let view: (_ id: String, _ from: String) -> UIView?
	/// Every live overlay, so the groups that show this one in their backdrop recompute after it.
	let overlays: () -> [GroupOverlayView]
}

/// A pre-composited opacity group's overlay: the last child of the group's view, showing in a bitmap at the group's extent the
/// platform's rendering of the group composited over what the platform paints before it, by Dragon's translated composite.
@MainActor
final class GroupOverlayView: UIView {
	let id: String
	let group: OpacityGroup
	let alpha8: Double
	private let context: GroupContext
	private let bitmap = CALayer()
	private var dirty = true
	/// Whether this group has warned that unstable earlier paint lies under it.
	private var warnedUnstable = false
	/// The box's own border: Core Animation draws a layer's border above its sublayers, so it stays off screen and is drawn into L.
	private var boxBorder: (width: CGFloat, color: CGColor?) = (0, nil)
	/// How deep a composite is running: a composite's own hiding and restoring marks nothing stale.
	private static var computing = 0

	init(id: String, group: OpacityGroup, alpha8: Double, context: GroupContext) {
		self.id = id
		self.group = group
		self.alpha8 = alpha8
		self.context = context
		super.init(frame: .zero)
		isOpaque = false
		backgroundColor = nil
		clipsToBounds = false
		isUserInteractionEnabled = false
		isAccessibilityElement = false
		accessibilityElementsHidden = true
		bitmap.magnificationFilter = .nearest
		bitmap.minificationFilter = .nearest
		bitmap.actions = ["bounds": NSNull(), "position": NSNull(), "frame": NSNull(), "contents": NSNull()]
		layer.addSublayer(bitmap)
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("built in code") }

	/// Takes the border the box was just painted with off screen.
	func takeBorder(from g: UIView) {
		boxBorder = (g.layer.borderWidth, g.layer.borderColor)
		g.layer.borderWidth = 0
	}

	func markDirty() {
		if Self.computing > 0 { return }
		dirty = true
		setNeedsLayout()
	}

	override func layoutSubviews() {
		super.layoutSubviews()
		computeIfNeeded()
	}

	/// Recomputes the composite when stale; an earlier group's is computed first when this one's backdrop shows it.
	func computeIfNeeded() {
		guard dirty, let g = superview else { return }
		dirty = false
		Self.computing += 1
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		do { try compute(g) } catch { fatalError("Markless iOS host: \(id)'s opacity group: \(error)") }
		CATransaction.commit()
		Self.computing -= 1
		for later in context.overlays() where later !== self && later.group.painters.contains(where: { context.overlay($0, later.id) === self }) {
			later.markDirty()
		}
	}

	private func compute(_ g: UIView) throws {
		if g.subviews.last !== self { g.bringSubviewToFront(self) }
		// Just above every sibling's paint-order zPosition: a far larger depth is clipped by the compositor.
		layer.zPosition = (g.layer.sublayers ?? []).filter { $0 !== layer }.map(\.zPosition).max().map { max($0 + 1, 0) } ?? 0
		frame = g.bounds
		let s = context.scale()
		let root = backdropRoot(of: g)
		let gr = layoutRect(g, in: root)
		// The extent: the group's box, every view inside it and every layer they draw (a label's glyph lines pass its frame), clamped to the root.
		var ext = outer(gr, s)
		func grow(_ v: UIView, _ r: CGRect) {
			for l in v.layer.sublayers ?? [] where l.delegate == nil && !l.isHidden {
				ext = union(ext, outer(l.frame.offsetBy(dx: r.minX, dy: r.minY), s))
			}
			for c in v.subviews where c !== self && !c.isHidden {
				let cr = layoutRect(c, in: root)
				ext = union(ext, outer(cr, s))
				grow(c, cr)
			}
		}
		grow(g, gr)
		let rootEdges = outer(root.bounds.offsetBy(dx: -root.bounds.minX, dy: -root.bounds.minY), s)
		ext = clamp(ext, rootEdges)
		let w = ext[2] - ext[0], h = ext[3] - ext[1]
		guard w > 0, h > 0 else {
			bitmap.contents = nil
			return
		}
		guard let composite = DragonPaint.groupComposite, let compositeLayered = DragonPaint.groupCompositeLayered else {
			throw HostError("an opacity group needs Dragon's composite, which this host does not link")
		}
		guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { throw HostError("no sRGB colour space") }
		// L: the platform's rendering of the group's view and everything in it at the device scale, this overlay hidden.
		// The group's layer is its untransformed drawing. render(in:) draws a rounded layer's own background and border with stray
		// edge columns on iOS, so those two are filled here as the screen shapes them: background, children, then border.
		isHidden = true
		let transform = g.layer.transform
		let background = g.layer.backgroundColor
		g.layer.transform = CATransform3DIdentity
		g.layer.backgroundColor = nil
		displayTree(g.layer)
		var lp = [UInt8](repeating: 0, count: w * h * 4)
		try renderPixels(into: &lp, w, h, space) { ctx in
			ctx.scaleBy(x: CGFloat(s), y: CGFloat(s))
			ctx.translateBy(x: gr.minX - CGFloat(Double(ext[0]) / s), y: gr.minY - CGFloat(Double(ext[1]) / s))
			let box = g.layer.bounds
			let radius = min(g.layer.cornerRadius, box.width / 2, box.height / 2)
			if let background {
				ctx.addPath(CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil))
				ctx.setFillColor(background)
				ctx.fillPath()
			}
			g.layer.render(in: ctx)
			if boxBorder.width > 0, let color = boxBorder.color {
				let inner = box.insetBy(dx: boxBorder.width, dy: boxBorder.width)
				ctx.addPath(CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil))
				if inner.width > 0, inner.height > 0 {
					let r = min(max(radius - boxBorder.width, 0), inner.width / 2, inner.height / 2)
					ctx.addPath(CGPath(roundedRect: inner, cornerWidth: r, cornerHeight: r, transform: nil))
				}
				ctx.setFillColor(color)
				ctx.fillPath(using: .evenOdd)
			}
		}
		g.layer.backgroundColor = background
		g.layer.transform = transform
		isHidden = false
		for painter in group.painters { context.overlay(painter, id)?.computeIfNeeded() }
		// The group's transform to the root, from the platform: the root point of each local layout point.
		let gl = g.layer
		let origin = gl.bounds.origin
		func toRoot(_ x: Double, _ y: Double) -> CGPoint {
			gl.convert(CGPoint(x: CGFloat(x) - gr.minX + origin.x, y: CGFloat(y) - gr.minY + origin.y), to: root.layer)
		}
		let transformed = !CATransform3DIsIdentity(gl.transform)
		var bext = ext
		if transformed {
			let corners = [(ext[0], ext[1]), (ext[2], ext[1]), (ext[2], ext[3]), (ext[0], ext[3])].map { toRoot(Double($0.0) / s, Double($0.1) / s) }
			let xs = corners.map { Double($0.x) * s }, ys = corners.map { Double($0.y) * s }
			bext = clamp([Int(xs.min()!.rounded(.down)), Int(ys.min()!.rounded(.down)), Int(xs.max()!.rounded(.up)), Int(ys.max()!.rounded(.up))], rootEdges)
		}
		// Earlier paint Dragon marks unstable (its capture may differ from the screen) under the group: warned once, still drawn.
		if !warnedUnstable {
			for painter in group.unstable {
				guard let v = context.view(painter, id), v.isDescendant(of: root) else { continue }
				let e = outer(layoutRect(v, in: root), s)
				if e[0] < bext[2], bext[0] < e[2], e[1] < bext[3], bext[1] < e[3] {
					warnedUnstable = true
					NSLog("Markless iOS host: opacity group %@ is drawn over %@, whose capture may differ from the screen", id, painter)
					break
				}
			}
		}
		// B: the platform's drawing of what paints before the group over the canvas, the group and every layer painted after it hidden.
		let bw = max(bext[2] - bext[0], 0), bh = max(bext[3] - bext[1], 0)
		var bb = [UInt8](repeating: 255, count: bw * bh * 4)
		if bw > 0, bh > 0 {
			var hidden: [(CALayer, Bool)] = []
			func hide(_ l: CALayer) {
				hidden.append((l, l.isHidden))
				l.isHidden = true
			}
			hide(gl)
			var at: CALayer = gl
			while at !== root.layer, let parent = at.superlayer {
				for later in paintedAfter(at, in: parent) { hide(later) }
				at = parent
			}
			displayTree(root.layer)
			let canvas = context.canvas().cgColor
			try renderPixels(into: &bb, bw, bh, space) { ctx in
				ctx.setFillColor(canvas)
				ctx.fill(CGRect(x: 0, y: 0, width: bw, height: bh))
				ctx.scaleBy(x: CGFloat(s), y: CGFloat(s))
				ctx.translateBy(x: -CGFloat(Double(bext[0]) / s), y: -CGFloat(Double(bext[1]) / s))
				root.layer.render(in: ctx)
			}
			for (l, was) in hidden.reversed() { l.isHidden = was }
		}
		// B in the group's local device px: the pixel under each local pixel centre once the platform maps the overlay.
		var bp = bb
		if transformed {
			bp = [UInt8](repeating: 255, count: w * h * 4)
			let o = toRoot(0, 0), ux = toRoot(1, 0), uy = toRoot(0, 1)
			let ax = Double(ux.x - o.x), bx = Double(ux.y - o.y), cx = Double(uy.x - o.x), dx = Double(uy.y - o.y)
			for y in 0..<h {
				for x in 0..<w {
					let lx = (Double(ext[0] + x) + 0.5) / s, ly = (Double(ext[1] + y) + 0.5) / s
					let px = Int(((Double(o.x) + ax * lx + cx * ly) * s).rounded(.down)) - bext[0]
					let py = Int(((Double(o.y) + bx * lx + dx * ly) * s).rounded(.down)) - bext[1]
					if px < 0 || py < 0 || px >= bw || py >= bh { continue }
					let i = (y * w + x) * 4, j = (py * bw + px) * 4
					for k in 0..<4 { bp[i + k] = bb[j + k] }
				}
			}
		}
		// Q: clear where the group drew nothing, else Dragon's composite; a group after a sticky box on a page that scrolls is layered.
		let layered = group.after != nil && context.rootOverflows()
		var q = [UInt8](repeating: 0, count: w * h * 4)
		for i in stride(from: 0, to: w * h * 4, by: 4) where lp[i + 3] != 0 {
			let l = (Double(lp[i]), Double(lp[i + 1]), Double(lp[i + 2]), Double(lp[i + 3]))
			let b = (Double(bp[i]), Double(bp[i + 1]), Double(bp[i + 2]), Double(bp[i + 3]))
			let packed = try (layered ? compositeLayered : composite)(l.0, l.1, l.2, l.3, b.0, b.1, b.2, b.3, alpha8)
			guard packed >= 0, packed <= 4_294_967_295, packed == packed.rounded() else { throw HostError("Dragon's composite gave \(packed), not a packed pixel") }
			let v = UInt32(packed)
			q[i] = UInt8(v & 0xff)
			q[i + 1] = UInt8((v >> 8) & 0xff)
			q[i + 2] = UInt8((v >> 16) & 0xff)
			q[i + 3] = UInt8((v >> 24) & 0xff)
		}
		guard let provider = CGDataProvider(data: Data(q) as CFData),
			let image = CGImage(
				width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4, space: space,
				bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue), provider: provider, decode: nil,
				shouldInterpolate: false, intent: .defaultIntent)
		else { throw HostError("no image for the composite") }
		bitmap.contents = image
		bitmap.contentsScale = CGFloat(s)
		bitmap.frame = CGRect(
			x: CGFloat(Double(ext[0]) / s) - gr.minX, y: CGFloat(Double(ext[1]) / s) - gr.minY, width: CGFloat(Double(w) / s), height: CGFloat(Double(h) / s))
	}

	/// The view the backdrop is drawn from: the page's root when the group is in the page, else its outermost ancestor (a top layer, a sheet).
	private func backdropRoot(of g: UIView) -> UIView {
		var at = g
		while let parent = at.superview {
			if parent === context.pageRoot { return parent }
			at = parent
		}
		return at
	}
}

/// The layers that paint after `layer` among its siblings, as Core Animation orders them: by zPosition, then by sublayer index.
func paintedAfter(_ layer: CALayer, in parent: CALayer) -> [CALayer] {
	let order = (parent.sublayers ?? []).enumerated().sorted { a, b in
		a.element.zPosition != b.element.zPosition ? a.element.zPosition < b.element.zPosition : a.offset < b.offset
	}.map(\.element)
	guard let k = order.firstIndex(where: { $0 === layer }) else { return [] }
	return Array(order[(k + 1)...])
}

/// A view's layout rect (its frame as if no transform applied) in `root`'s coordinates.
@MainActor
private func layoutRect(_ v: UIView, in root: UIView) -> CGRect {
	var x = v.center.x - v.bounds.width * v.layer.anchorPoint.x
	var y = v.center.y - v.bounds.height * v.layer.anchorPoint.y
	var at = v.superview
	while let sv = at, sv !== root {
		x += sv.center.x - sv.bounds.width * sv.layer.anchorPoint.x - sv.bounds.origin.x
		y += sv.center.y - sv.bounds.height * sv.layer.anchorPoint.y - sv.bounds.origin.y
		at = sv.superview
	}
	return CGRect(x: x - root.bounds.origin.x, y: y - root.bounds.origin.y, width: v.bounds.width, height: v.bounds.height)
}

/// A rect widened to the whole device px it touches: [left, top, right, bottom].
private func outer(_ r: CGRect, _ s: Double) -> [Int] {
	[Int((Double(r.minX) * s).rounded(.down)), Int((Double(r.minY) * s).rounded(.down)), Int((Double(r.maxX) * s).rounded(.up)), Int((Double(r.maxY) * s).rounded(.up))]
}

private func union(_ a: [Int], _ b: [Int]) -> [Int] { [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])] }

private func clamp(_ a: [Int], _ to: [Int]) -> [Int] { [max(a[0], to[0]), max(a[1], to[1]), min(a[2], to[2]), min(a[3], to[3])] }

/// Every layer's pending drawing done, so render(in:) sees this frame's contents.
private func displayTree(_ l: CALayer) {
	l.displayIfNeeded()
	for s in l.sublayers ?? [] { displayTree(s) }
}

/// Draws into a premultiplied sRGB RGBA8 buffer of w x h device px, y down.
private func renderPixels(into buffer: inout [UInt8], _ w: Int, _ h: Int, _ space: CGColorSpace, _ body: (CGContext) -> Void) throws {
	try buffer.withUnsafeMutableBytes { raw in
		guard let ctx = CGContext(
			data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: space,
			bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
		else { throw HostError("no RGBA8 context for a group") }
		ctx.interpolationQuality = .none
		ctx.translateBy(x: 0, y: CGFloat(h))
		ctx.scaleBy(x: 1, y: -1)
		body(ctx)
	}
}
#endif
