import Foundation

/// One CSS animation event a run of Dragon's animator gives, by the export's node id.
public struct AnimationEvent: Equatable, Sendable {
	public let event: NativeEventName
	public let node: String
	public let name: String
	public let elapsedTime: Double
}

/// A page's transitions and animations, run by Dragon's animator (`runMarklessAnimation`) from the assignment at mount through
/// every style change and frame since; each run answers the events not yet given and whether the animator still runs.
public final class AnimationRun {
	private let style: StyleExport
	private let run: (String) -> String
	private let initial: Int
	private var steps: [String] = []
	private var given = 0
	private var assignment: Int

	public init(style: StyleExport, initial: Int, run: @escaping (String) -> String) {
		self.style = style
		self.initial = initial
		assignment = initial
		self.run = run
	}

	/// The style program moved to `to`: one style change event.
	public func moved(to: Int) {
		guard to != assignment else { return }
		assignment = to
		steps.append("[\"event\",\(to)]")
	}

	/// Time passed.
	public func advanced(ms: Double) {
		guard ms > 0 else { return }
		steps.append("[\"advance\",\(JSONValue.number(ms).jsonText)]")
	}

	/// Runs the animator over every step so far: the events it has not given yet, and whether it still runs.
	public func next(dpr: Double, width: Double, height: Double) throws -> (events: [AnimationEvent], busy: Bool) {
		guard let plan = style.plan, let anim = style.anim else { return ([], false) }
		let line = "{\"dpr\":\(JSONValue.number(dpr).jsonText),\"viewport\":{\"width\":\(JSONValue.number(width).jsonText),\"height\":\(JSONValue.number(height).jsonText)},\"plan\":\(plan),\"anim\":\(anim),\"initial\":\(initial),\"steps\":[\(steps.joined(separator: ","))]}"
		let answer = try Reader(JSONValue.parse(Data(run(line).utf8)), at: "animation").array()
		guard answer.count == 6, try answer[0].string() == "ok" else {
			throw PayloadError(path: "animation", reason: "Dragon's animator failed: \(String(run(line).prefix(300)))")
		}
		let all = try answer[1].array()
		var events: [AnimationEvent] = []
		for e in all.dropFirst(given) {
			let f = try e.array()
			guard f.count == 5, let event = NativeEventName(rawValue: try f[1].string()) else { throw e.fail("expected [step, type, node, name, elapsedTime]") }
			let dragon = try f[2].string()
			let names = assignment < style.planNames.count ? style.planNames[assignment] : [:]
			events.append(AnimationEvent(event: event, node: names[dragon] ?? dragon, name: try f[3].string(), elapsedTime: try planNumber(f[4].value)))
		}
		given = all.count
		guard case let .bool(busy) = answer[5].value else { throw answer[5].fail("expected whether the animator runs") }
		return (events, busy)
	}
}
