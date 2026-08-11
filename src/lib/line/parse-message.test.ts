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

  it.each(["　シャトル残量　", "残量"])(
    "残量確認コマンドを分類する: %s",
    (message) => {
      expect(parseLineMessage(message)).toEqual({ type: "status" })
    }
  )

  it.each(["　シャトル報告削除　", "報告削除", "削除"])(
    "引用返信による削除コマンドを分類する: %s",
    (message) => {
      expect(parseLineMessage(message)).toEqual({ type: "delete-report" })
    }
  )

  it.each([
    [
      "シャトル1箱購入しました。豊中6筒、吹田4筒です。",
      1,
      [
        { location: "豊中", tubeCount: 6 },
        { location: "吹田", tubeCount: 4 },
      ],
    ],
    [
      "シャトル1箱購入しました。豊中10筒です。",
      1,
      [{ location: "豊中", tubeCount: 10 }],
    ],
    [
      "シャトル２箱購入しました。豊中１０筒、吹田１０筒です。",
      2,
      [
        { location: "豊中", tubeCount: 10 },
        { location: "吹田", tubeCount: 10 },
      ],
    ],
    [
      "シャトル1箱購入しました",
      1,
      [{ location: "豊中", tubeCount: 10 }],
    ],
    [
      "シャトル1箱購入しました。",
      1,
      [{ location: "豊中", tubeCount: 10 }],
    ],
    [
      "シャトル2箱購入しました。20筒",
      2,
      [{ location: "豊中", tubeCount: 20 }],
    ],
    [
      "シャトル1箱購入しました豊中6吹田4",
      1,
      [
        { location: "豊中", tubeCount: 6 },
        { location: "吹田", tubeCount: 4 },
      ],
    ],
    [
      "シャトル1箱購入しました。豊中6筒吹田4筒",
      1,
      [
        { location: "豊中", tubeCount: 6 },
        { location: "吹田", tubeCount: 4 },
      ],
    ],
    [
      "1箱購入しました。豊中6筒、吹田4筒です。",
      1,
      [
        { location: "豊中", tubeCount: 6 },
        { location: "吹田", tubeCount: 4 },
      ],
    ],
    [
      "2箱購入しました",
      2,
      [{ location: "豊中", tubeCount: 20 }],
    ],
  ])("購入と拠点別配分を解析する: %s", (message, boxCount, allocations) => {
    expect(parseLineMessage(message)).toEqual({
      type: "purchase",
      data: { boxCount, allocations },
    })
  })

  it.each([
    "シャトルを購入しました。",
    "シャトル0箱購入しました。豊中0筒です。",
    "シャトル1.5箱購入しました。豊中15筒です。",
    "シャトル2箱購入しました。10筒",
    "シャトル1箱購入しました。豊中6筒、吹田3筒です。",
    "シャトル1箱購入しました。豊中6.5筒、吹田3.5筒です。",
    "シャトル1箱購入しました。豊中5筒、豊中5筒です。",
    "1箱購入しました。豊中6筒、吹田3筒です。",
  ])("不正な購入形式を拒否する: %s", (message) => {
    expect(parseLineMessage(message)).toEqual({ type: "invalid-purchase" })
  })

  it.each([
    ["シャトルを豊中から吹田へ2筒移動しました。", "豊中", "吹田", 2, 0],
    ["シャトルを吹田から豊中へ０．５筒移動しました。", "吹田", "豊中", 0.5, 0],
    ["豊中から吹田へ2移動しました", "豊中", "吹田", 2, 0],
    ["吹田に2筒移動しました", "豊中", "吹田", 2, 0],
    ["豊中へ0.5移動しました", "吹田", "豊中", 0.5, 0],
    ["シャトル吹田へ２移動しました", "豊中", "吹田", 2, 0],
    ["シャトルを豊中から吹田へ2筒移動", "豊中", "吹田", 2, 0],
    ["吹田に2筒移動", "豊中", "吹田", 2, 0],
    ["豊中から吹田へニュー2筒移動", "豊中", "吹田", 2, 0],
    ["吹田にセミ1.5筒移動", "豊中", "吹田", 0, 1.5],
    ["豊中から吹田へニュー2筒セミ1筒移動", "豊中", "吹田", 2, 1],
    ["豊中から吹田へセミを1筒、ニューを2筒移動", "豊中", "吹田", 2, 1],
    ["吹田にニュー2筒とセミ0.5筒移動しました", "豊中", "吹田", 2, 0.5],
  ])(
    "拠点間移動を解析する: %s",
    (message, fromLocation, toLocation, tubeCount, semiTubeCount) => {
      expect(parseLineMessage(message)).toEqual({
        type: "transfer",
        data: { fromLocation, toLocation, tubeCount, semiTubeCount },
      })
    }
  )

  it.each([
    "シャトルを豊中から豊中へ2筒移動しました。",
    "シャトルを豊中から吹田へ0筒移動しました。",
    "シャトルを豊中から吹田へ1.2筒移動しました。",
    "シャトルを豊中から吹田へ-1筒移動しました。",
    "豊中から吹田へセミ0筒移動",
    "豊中から吹田へセミ1.2筒移動",
    "豊中から吹田へニュー1筒ニュー1筒移動",
    "豊中から吹田へニュー2筒セミ-1筒移動",
  ])("不正な拠点間移動を拒否する: %s", (message) => {
    expect(parseLineMessage(message)).toEqual({ type: "invalid-transfer" })
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
