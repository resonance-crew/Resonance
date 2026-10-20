import Testing
@testable import StoryFormat

/// A title's clauses are cut where the web's LatinMarkText cuts them (its tests' cases): just after
/// each full-width stop or pause, so a title too long for a line breaks after its punctuation.
@Suite struct StoryTitleClausesTests {
    @Test func aCJKTitleIsCutJustAfterItsPunctuation() {
        #expect(StoryScript.titleClauses("湖中央，我看見了知行合一") == ["湖中央，", "我看見了知行合一"])
        #expect(StoryScript.titleClauses("我說 don’t，你說好") == ["我說 don’t，", "你說好"])
        #expect(StoryScript.titleClauses("一、二；三：四。五！六？") == ["一、", "二；", "三：", "四。", "五！", "六？"])
        #expect(StoryScript.titleClauses("「外婆」的（醬油）瓶《書》『名』") == ["「外婆」", "的（醬油）", "瓶《書》", "『名』"])
    }

    @Test func aTitleOfOneClauseIsOneAndNothingIsLost() {
        #expect(StoryScript.titleClauses("錢是什麼？") == ["錢是什麼？"])
        #expect(StoryScript.titleClauses("A walk by the lake, at dawn") == ["A walk by the lake, at dawn"])
        #expect(StoryScript.titleClauses("") == [])
        for title in ["等等……然後", "她說——不", "湖中央，我看見了知行合一", "😀，🌊"] {
            #expect(StoryScript.titleClauses(title).joined() == title)
        }
        // After every mark, as the web's split does: an ellipsis of two is two clauses' ends.
        #expect(StoryScript.titleClauses("等等……然後") == ["等等…", "…", "然後"])
    }
}
