// Compiled with Dragon's translated harness (Harness.swift, Host.swift) into one module, so its internal entry point is reachable.
#if canImport(DragonLayout)
import DragonLayout
#endif
import Foundation

/// Dragon's on-device layout of a Markless page: `runMarklessLayout`, translated from Dragon's TypeScript.
public enum DragonPlan {
	public static func layout(_ line: String) -> String {
		do {
			return try harness_runMarklessLayout(JsString(line)).description
		} catch {
			return "[\"threw\"]"
		}
	}

	/// `runMarklessRowsLayout`: the page with each list's rows in it. Text the build did not record is shaped by `shape`: face, size
	/// in device px, text, start and end (UTF-16 offsets), language and Dragon's feature integers, giving Dragon's glyph records.
	public static func rowsLayout(
		_ line: String, shape: @escaping (String, Double, String, Int, Int, String, [Double]) throws -> [Double]
	) -> String {
		// The translated harness turns any error into ["threw"]; the shaper's own reason is kept to report it by name.
		var refused: String?
		let shaper = GlyphShaper { face, size, text, start, end, _, rtl, language, features in
			do {
				if rtl { throw RowShapingError(description: "right-to-left text in a row is not shaped on iOS yet") }
				return JsArray(try shape(face.description, size, text.description, Int(start), Int(end), language.description, features.items))
			} catch {
				refused = "\(error)"
				throw error
			}
		}
		let out: String
		do {
			out = try harness_runMarklessRowsLayout(JsString(line), shaper).description
		} catch {
			out = "[\"threw\"]"
		}
		if let refused {
			let escaped = refused.map { $0 == "\\" ? "\\\\" : $0 == "\"" ? "\\\"" : String($0) }.joined()
			return "[\"harness-error\",\"\(escaped)\"]"
		}
		return out
	}

	/// `runMarklessAnimation`: a page's animation events and frame from its export's animator tables, over every step so far.
	public static func animation(_ line: String) -> String {
		do {
			return try harness_runMarklessAnimation(JsString(line)).description
		} catch {
			return "[\"threw\"]"
		}
	}

	/// POSX-s scroll: `runMarklessSticky`, each sticky box's shift at the page's scroll offset.
	public static func sticky(_ line: String) -> String {
		do {
			return try harness_runMarklessSticky(JsString(line)).description
		} catch {
			return "[\"threw\"]"
		}
	}

	/// Dragon's translated library cases; `rt-band` looks a page's `@media` band up by its size.
	public static func library(_ line: String) -> String {
		do {
			return try harness_runLibraryCase(JsString(line)).description
		} catch {
			return "[\"threw\"]"
		}
	}
}

/// Dragon's translated paint math for a box's transform and a pre-composited opacity group; a length is (kind, px, percent).
extension DragonPlan {
	public typealias Length = (kind: String, px: Double, percent: Double)

	/// A transform at a border box of `width` x `height` CSS px, as the affine matrix [a, b, c, d, tx, ty] about the box's centre
	/// (UIKit's anchor point): paint-transform.ts with the platform's sin and cos.
	public static func transformMatrix(
		_ functions: [(fn: String, x: Length, y: Length, angle: Double, sx: Double, sy: Double)], originX: Length, originY: Length,
		width: Double, height: Double
	) throws -> [Double] {
		let length = { (l: Length) in LengthValue(JsString(l.kind), l.px, l.percent) }
		let ops = functions.map { TransformOp(JsString($0.fn), length($0.x), length($0.y), $0.angle, $0.sx, $0.sy) }
		let trig = Trig({ Foundation.sin($0) }, { Foundation.cos($0) })
		let m = try paintTransform_paintTransformMatrix(JsArray(ops), TransformOrigin(length(originX), length(originY)), width, height, trig)
		let about = try paintTransform_transformAboutPoint(m, width / 2, height / 2)
		return [about.a, about.b, about.c, about.d, about.e, about.f]
	}

	/// Chrome's paint alpha byte of an opacity (paint.ts).
	public static func opacityAlpha8(_ opacity: Double) throws -> Double { try paint_opacityAlpha8(opacity) }

	/// One pixel of a group's layer (premultiplied RGBA bytes) over its backdrop at the alpha byte `a8`, packed as r | g << 8 | b << 16 | a << 24.
	public static func groupComposite(
		_ lr: Double, _ lg: Double, _ lb: Double, _ la: Double, _ dr: Double, _ dg: Double, _ db: Double, _ da: Double, _ a8: Double, fold: Bool
	) throws -> Double {
		try paintGroup_groupComposite(lr, lg, lb, la, dr, dg, db, da, a8, fold)
	}

	/// The same pixel when Chrome composites the group in a layer of its own (after a sticky box on a page that scrolls).
	public static func groupCompositeLayered(
		_ lr: Double, _ lg: Double, _ lb: Double, _ la: Double, _ dr: Double, _ dg: Double, _ db: Double, _ da: Double, _ a8: Double
	) throws -> Double {
		try paintGroup_groupCompositeLayered(lr, lg, lb, la, dr, dg, db, da, a8)
	}
}

/// A row's text this host cannot shape as the build does.
struct RowShapingError: Error, CustomStringConvertible {
	let description: String
}
