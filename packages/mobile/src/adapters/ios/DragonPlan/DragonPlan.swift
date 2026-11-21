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

	/// `runMarklessRowsLayout`: the page with each list's rows in it. The Dragon `dragon.json` pins has no rows layout yet (it
	/// comes with compiled-run/dragoncss#605), and its plans hold no row repeats, so a page never asks for one; asked, it says so.
	public static func rowsLayout(
		_ line: String, shape: @escaping (String, Double, String, Int, Int, String, [Double]) throws -> [Double]
	) -> String {
		"[\"harness-error\",\"the pinned Dragon has no runMarklessRowsLayout yet\"]"
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
