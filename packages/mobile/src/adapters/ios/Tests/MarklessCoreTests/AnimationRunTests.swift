import Foundation
@testable import MarklessCore
import Testing

// AnimationRun against a stand-in (numbers as the harness writes them, their bit patterns) for Dragon's runMarklessAnimation: the steps it is sent, and each event given once.
@Test func anAnimationRunGivesEachEventOnceAndSendsItsSteps() throws {
	let fixture = try Data(contentsOf: try #require(Bundle.module.url(forResource: "Fixtures/s21-styled-rows.native-app-style", withExtension: "json")))
	var style = try #require(try StyleExport.decodeApp(fixture)["/"])
	style.plan = "{}"
	style.anim = "{}"
	style.planNames = [["d1": "h1"], ["d1": "h1"]]
	var lines: [String] = []
	var answer = #"["ok",[[-1,"animationstart","d1","close","0000000000000000"]],[],[],[],true]"#
	let run = AnimationRun(style: style, initial: 0) { line in
		lines.append(line)
		return answer
	}
	let first = try run.next(dpr: 3, width: 402, height: 874)
	#expect(first.events == [AnimationEvent(event: .animationstart, node: "h1", name: "close", elapsedTime: 0)])
	#expect(first.busy)
	run.moved(to: 1)
	run.advanced(ms: 250)
	answer = #"["ok",[[-1,"animationstart","d1","close","0000000000000000"],[1,"animationend","d1","close","3fd0000000000000"]],[],[],[],false]"#
	let second = try run.next(dpr: 3, width: 402, height: 874)
	#expect(second.events == [AnimationEvent(event: .animationend, node: "h1", name: "close", elapsedTime: 0.25)])
	#expect(!second.busy)
	#expect(lines.last?.contains(#""initial":0,"steps":[["event",1],["advance",250]]"#) == true)
}
