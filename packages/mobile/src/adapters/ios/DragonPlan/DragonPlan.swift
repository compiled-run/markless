// Compiled with Dragon's translated harness (Harness.swift, Host.swift) into one module, so its internal entry point is reachable.
#if canImport(DragonLayout)
import DragonLayout
#endif

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
	/// in device px, text, start and end (UTF-16 offsets), script tag, right-to-left, language and Dragon's feature integers, giving
	/// Dragon's glyph records.
	public static func rowsLayout(
		_ line: String, shape: @escaping (String, Double, String, Int, Int, String, Bool, String, [Double]) throws -> [Double]
	) -> String {
		// The translated harness turns any error into ["threw"]; the shaper's own reason is kept to report it by name.
		var refused: String?
		let shaper = GlyphShaper { face, size, text, start, end, script, rtl, language, features in
			do {
				return JsArray(try shape(face.description, size, text.description, Int(start), Int(end), script.description, rtl, language.description, features.items))
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

	/// Dragon's translated library cases; `rt-band` looks a page's `@media` band up by its size.
	public static func library(_ line: String) -> String {
		do {
			return try harness_runLibraryCase(JsString(line)).description
		} catch {
			return "[\"threw\"]"
		}
	}
}
