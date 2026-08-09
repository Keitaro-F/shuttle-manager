import { describe, expect, it } from "vitest"
import { parseReportInput } from "./report-input"

describe("parseReportInput", () => {
  it.each([0, 0.5, 1, 2.5])("0以上の0.5刻みを受け付ける: %s", (count) => {
    expect(
      parseReportInput({
        location: "豊中",
        newCount: count,
        semiCount: count,
      })
    ).toEqual({
      location: "豊中",
      newCount: count,
      semiCount: count,
    })
  })

  it.each([-0.5, 0.1, 1.2, Number.NaN, Number.POSITIVE_INFINITY])(
    "不正な残量を拒否する: %s",
    (count) => {
      expect(
        parseReportInput({
          location: "豊中",
          newCount: count,
          semiCount: 1,
        })
      ).toBeNull()
    }
  )
})
