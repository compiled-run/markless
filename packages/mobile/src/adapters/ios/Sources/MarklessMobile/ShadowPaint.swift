#if canImport(UIKit)
import MarklessCore
import UIKit
#if canImport(DragonLayout)
import DragonLayout
#endif

/// A box's shadows as Dragon draws them: the outer shadows on a layer directly beneath the box in its superview's layer (so the
/// paint order is CSS's), the inset shadows on a layer at the bottom of the box's own, over its background and under its border.
@MainActor
final class ShadowLayers {
	private let outer = CALayer()
	private let inset = CALayer()
	private var drawn: BoxShadow?
	/// The outer bitmap's rect in points from the box's frame origin.
	private var outerRect = CGRect.zero

	init() {
		for layer in [outer, inset] {
			layer.magnificationFilter = .nearest
			layer.minificationFilter = .nearest
		}
		// Below the box's children, negative z-index ones included.
		inset.zPosition = -1_000_000
	}

	/// Rasters the shadows again when the box or anything beneath it moved or changed, and keeps the layers at the box.
	func apply(_ shadow: BoxShadow, to view: UIView) throws {
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		defer { CATransaction.commit() }
		if shadow != drawn {
			let bitmaps = try rasterShadow(shadow)
			outer.contents = bitmaps.outer.image
			outerRect = bitmaps.outer.rect
			inset.contents = bitmaps.inset.image
			inset.frame = bitmaps.inset.rect
			drawn = shadow
		}
		if inset.superlayer !== view.layer { view.layer.insertSublayer(inset, at: 0) }
		restack(beneath: view)
	}

	func restack(beneath view: UIView) {
		guard drawn != nil, let superlayer = view.layer.superlayer else { return }
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		outer.isHidden = view.isHidden
		outer.zPosition = view.layer.zPosition
		outer.frame = outerRect.offsetBy(dx: view.frame.minX, dy: view.frame.minY)
		superlayer.insertSublayer(outer, below: view.layer)
		CATransaction.commit()
	}

	func remove() {
		outer.removeFromSuperlayer()
		inset.removeFromSuperlayer()
		drawn = nil
	}
}

/// Each shadow layer as a premultiplied image and its rect in points from the box's frame origin.
struct ShadowBitmaps {
	var outer: (image: CGImage?, rect: CGRect)
	var inset: (image: CGImage?, rect: CGRect)
}

/// The outer and inset shadow layers of Dragon's translated paint-shadow.ts (its *Over layers: each shadow blitted onto the
/// backdrop as Chrome blits it), with the radii of its translated paint-radius.ts.
func rasterShadow(_ s: BoxShadow) throws -> ShadowBitmaps {
	#if canImport(DragonLayout)
	let radiusFaults = RadiusFaults(false, false)
	func shape(_ b: BoxShadow.Box) throws -> [Double] {
		try paintRadius_roundedShape(
			b.edges[0], b.edges[1], b.edges[2], b.edges[3], b.size[0], b.size[1], JsArray(b.borders),
			JsArray(b.radii.map { RadiusLength($0.percent, $0.value) }), s.dpr, radiusFaults
		).items
	}
	func fill(_ b: BoxShadow.Box, _ radii: [Double]) -> BackdropFill {
		BackdropFill(
			b.edges[0], b.edges[1], b.edges[2], b.edges[3], JsArray(Array(radii[0..<8])), b.background.r, b.background.g,
			b.background.b, b.background.alpha)
	}
	let own = try shape(s.box)
	let backdrop = try s.backdrop.map { fill($0, try shape($0)) }
	let shadows = JsArray(s.shadows.map { ShadowInput($0.inset, $0.x, $0.y, $0.blur, $0.spread, $0.color.r, $0.color.g, $0.color.b, $0.color.alpha) })
	let faults = ShadowFaults(false, false, false)
	let e = s.box.edges
	var out = ShadowBitmaps(outer: (nil, .zero), inset: (nil, .zero))
	if s.hasOuter {
		let layer = try paintShadow_outerShadowLayerOver(
			e[0], e[1], e[2], e[3], JsArray(Array(own[0..<8])), s.box.background.alpha == 255, shadows, s.dpr, faults, JsArray(backdrop))
		out.outer = try bitmap(layer, s)
	}
	if s.hasInset {
		let layer = try paintShadow_insetShadowLayerOver(
			e[0], e[1], e[2], e[3], JsArray(s.box.borders), JsArray(Array(own[8..<16])), shadows, s.dpr, faults,
			JsArray(backdrop + [fill(s.box, own)]))
		out.inset = try bitmap(layer, s)
	}
	return out
	#else
	throw HostError("box-shadow is rastered by Dragon's translated painter, which this build does not link")
	#endif
}

#if canImport(DragonLayout)
private func bitmap(_ layer: ShadowLayer, _ s: BoxShadow) throws -> (image: CGImage?, rect: CGRect) {
	let w = Int(layer.right - layer.left), h = Int(layer.bottom - layer.top)
	let rect = CGRect(
		x: (layer.left - s.originX) / s.dpr, y: (layer.top - s.originY) / s.dpr, width: Double(w) / s.dpr, height: Double(h) / s.dpr)
	let rgba = layer.rgba.items
	if w <= 0 || h <= 0 { return (nil, rect) }
	guard rgba.count == w * h * 4 else { throw HostError("a shadow layer of \(rgba.count) bytes is not \(w)x\(h) RGBA") }
	guard let space = CGColorSpace(name: CGColorSpace.sRGB), let provider = CGDataProvider(data: Data(rgba) as CFData),
		let image = CGImage(
			width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4, space: space,
			bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue), provider: provider, decode: nil,
			shouldInterpolate: false, intent: .defaultIntent)
	else { throw HostError("no sRGB image for a shadow layer") }
	return (image, rect)
}
#endif
#endif
