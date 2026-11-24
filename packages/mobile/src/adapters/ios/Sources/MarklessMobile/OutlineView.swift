#if canImport(UIKit)
import MarklessCore
import UIKit
#if canImport(DragonLayout)
import DragonLayout
#endif

/// A box's outline as Dragon's DragonOutlineView draws it: each ring filled even-odd in the outline colour, or a dotted, dashed or
/// 3D outline's side-painter operations. It sits in its host's view above the flow children and below the boxes the stacking
/// context paints later (zPosition between 0 and their 100_001), each box's descendants' outlines before its own.
final class OutlineView: UIView {
	private(set) var drawn: OutlinePaint?
	/// 24 numbers per ring in device px: outer and inner rect relative to the view, then their radii.
	private var rings: [Double] = []
	private var ops: [BorderOps.Op] = []
	private var origin = (x: 0.0, y: 0.0)

	init() {
		super.init(frame: .zero)
		isOpaque = false
		backgroundColor = nil
		isUserInteractionEnabled = false
		isAccessibilityElement = false
		contentMode = .redraw
	}

	required init?(coder: NSCoder) { fatalError("not built from a coder") }

	func apply(_ outline: OutlinePaint, in host: UIView) throws {
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		defer { CATransaction.commit() }
		if outline != drawn {
			let geometry = try outlineGeometry(outline)
			let all = geometry.rings
			let bx = all[0], by = all[1], s = outline.dpr
			rings = all.enumerated().map { k, x in k % 24 < 8 ? x - (k % 2 == 0 ? bx : by) : x }
			ops = geometry.ops
			origin = (bx, by)
			frame = CGRect(x: (bx - outline.hostX) / s, y: (by - outline.hostY) / s, width: (all[2] - bx) / s, height: (all[3] - by) / s)
			drawn = outline
			setNeedsDisplay()
		}
		if superview !== host {
			removeFromSuperview()
			host.addSubview(self)
		}
		layer.zPosition = 50_000 + CGFloat(outline.order)
	}

	override func draw(_ rect: CGRect) {
		guard let ctx = UIGraphicsGetCurrentContext(), let outline = drawn else { return }
		let s = outline.dpr
		if !ops.isEmpty {
			drawBorderOps(ctx, ops, colors: outline.tones, scale: s, dx: -origin.x, dy: -origin.y)
			return
		}
		let c = outline.color
		ctx.setFillColor(UIColor(red: c.r / 255, green: c.g / 255, blue: c.b / 255, alpha: c.alpha / 255).cgColor)
		var k = 0
		while k + 24 <= rings.count {
			let path = CGMutablePath()
			path.addPath(roundedRect(Array(rings[k..<(k + 4)]), Array(rings[(k + 8)..<(k + 16)]), s))
			path.addPath(roundedRect(Array(rings[(k + 4)..<(k + 8)]), Array(rings[(k + 16)..<(k + 24)]), s))
			ctx.addPath(path)
			ctx.fillPath(using: .evenOdd)
			k += 24
		}
	}
}

/// Dragon's dragonRRectPath: a rect (left, top, right, bottom) and its corner radii (four x, then four y) in device px, in points.
private func roundedRect(_ e: [Double], _ radii: [Double], _ scale: Double) -> CGPath {
	let k: CGFloat = 0.5522847498
	var rx = [CGFloat](repeating: 0, count: 4)
	var ry = [CGFloat](repeating: 0, count: 4)
	for c in 0..<4 where radii[c] > 0 && radii[c + 4] > 0 {
		rx[c] = CGFloat(radii[c] / scale)
		ry[c] = CGFloat(radii[c + 4] / scale)
	}
	let l = CGFloat(e[0] / scale), t = CGFloat(e[1] / scale), r = CGFloat(e[2] / scale), b = CGFloat(e[3] / scale)
	let p = CGMutablePath()
	p.move(to: CGPoint(x: l + rx[0], y: t))
	p.addLine(to: CGPoint(x: r - rx[1], y: t))
	p.addCurve(to: CGPoint(x: r, y: t + ry[1]), control1: CGPoint(x: r - rx[1] + k * rx[1], y: t), control2: CGPoint(x: r, y: t + ry[1] - k * ry[1]))
	p.addLine(to: CGPoint(x: r, y: b - ry[2]))
	p.addCurve(to: CGPoint(x: r - rx[2], y: b), control1: CGPoint(x: r, y: b - ry[2] + k * ry[2]), control2: CGPoint(x: r - rx[2] + k * rx[2], y: b))
	p.addLine(to: CGPoint(x: l + rx[3], y: b))
	p.addCurve(to: CGPoint(x: l, y: b - ry[3]), control1: CGPoint(x: l + rx[3] - k * rx[3], y: b), control2: CGPoint(x: l, y: b - ry[3] + k * ry[3]))
	p.addLine(to: CGPoint(x: l, y: t + ry[0]))
	p.addCurve(to: CGPoint(x: l + rx[0], y: t), control1: CGPoint(x: l, y: t + ry[0] - k * ry[0]), control2: CGPoint(x: l + rx[0] - k * rx[0], y: t))
	p.closeSubpath()
	return p
}

/// The rings (page device px) of Dragon's translated paint-radius.ts outlineRings, at the box's radii from its roundedShape, and
/// a dotted, dashed or 3D outline's operations from the translated paint-dash.ts outlinePaintOps.
func outlineGeometry(_ o: OutlinePaint) throws -> (rings: [Double], ops: [BorderOps.Op]) {
	#if canImport(DragonLayout)
	let e = o.edges
	do {
		let shape = try paintRadius_roundedShape(
			e[0], e[1], e[2], e[3], o.size[0], o.size[1], JsArray(o.borders), JsArray(o.radii.map { RadiusLength($0.percent, $0.value) }),
			o.dpr, RadiusFaults(false, false)
		).items
		let width = try paintRadius_outlineWidthPx(o.width, o.dpr)
		let offset = try paintRadius_outlineOffsetPx(o.offset, o.dpr)
		let rings = try paintRadius_outlineRings(e[0], e[1], e[2], e[3], JsArray(Array(shape[0..<8])), width, offset, o.style == "double").items
		guard rings.count >= 24, rings.count % 24 == 0 else { throw HostError("an outline of \(rings.count) ring values") }
		guard try paintDash_outlineNeedsSidePainter(JsString(o.style)) else { return (rings, []) }
		guard rings.count == 24 else { throw HostError("a \(o.style) outline has \(rings.count / 24) rings") }
		let c = o.color
		let ops = try paintDash_outlinePaintOps(
			rings[0], rings[1], rings[2], rings[3], width, JsString(o.style), c.r, c.g, c.b, c.alpha, DashFaults(false, false)
		).items
		return (rings, ops.map { BorderOps.Op(op: $0.op.description, side: Int($0.side), alpha: $0.alpha, antialias: $0.antialias, points: $0.points.items) })
	} catch let error as HostError {
		throw error
	} catch {
		throw HostError("Dragon's outline painter refused a \(o.style) outline: \(error)")
	}
	#else
	throw HostError("an outline is drawn by Dragon's translated painters, which this build does not link")
	#endif
}
#endif
