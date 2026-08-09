import { describe, expect, it } from "vitest"
import { parseLineMessage } from "./parse-message"

describe("parseLineMessage", () => {
  it.each([
    ["吹田ニュー2セミ3です。", "吹田", 2, 3],
    ["吹田ニュー2セミ3", "吹田", 2, 3],
    ["吹田 ニュー2 セミ3", "吹田", 2, 3],
    ["豊中ニュー2.5セミ0", "豊中", 2.5, 0],
    ["豊中ニュー0セミ0.5。", "豊中", 0, 0.5],
    ["  吹田ニュー2セミ3です.  ", "吹田", 2, 3],
  ])("正常な報告を解析する: %s", (message, location, newCount, semiCount) => {
    expect(parseLineMessage(message)).toEqual({
      type: "report",
      data: { location, newCount, semiCount },
    })
  })

  it("全角数字と全角空白をNFKC正規化して解析する", () => {
    expect(parseLineMessage("吹田　ニュー２．５　セミ３です。"))
      .toEqual({
        type: "report",
        data: { location: "吹田", newCount: 2.5, semiCount: 3 },
      })
  })

  it("残量確認コマンドを分類する", () => {
    expect(parseLineMessage("　シャトル残量　")).toEqual({ type: "status" })
  })

  it.each([
    "吹田ニュー-1セミ3",
    "吹田ニュー1.2セミ3",
    "吹田ニューNaNセミ3",
    "吹田ニューInfinityセミ3",
    "ニュー2セミ3",
    "吹田ニュー2",
    "吹田セミ3",
    "吹田ニュー2セミ3本です。",
  ])("報告の意図がある不正な形式を拒否する: %s", (message) => {
    expect(parseLineMessage(message)).toEqual({ type: "invalid-report" })
  })

  it.each([
    "今日はお疲れさまでした",
    "次の練習は吹田です",
    "シャトル残量を教えて",
    "",
  ])("一般会話を無視する: %s", (message) => {
    expect(parseLineMessage(message)).toEqual({ type: "ignore" })
  })
})
