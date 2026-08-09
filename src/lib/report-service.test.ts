import { describe, expect, it, vi } from "vitest"
import { ReportSource, type Report } from "@prisma/client"
import { createReport } from "./report-service"

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-id",
    location: "吹田",
    newCount: 2,
    semiCount: 3,
    reportedAt: new Date("2026-08-08T09:00:00.000Z"),
    source: ReportSource.LINE,
    lineMessageId: "message-id",
    lineGroupId: "group-id",
    lineUserId: "user-id",
    originalMessage: "吹田ニュー2セミ3です。",
    createdAt: new Date("2026-08-08T09:00:01.000Z"),
    updatedAt: new Date("2026-08-08T09:00:01.000Z"),
    ...overrides,
  }
}

describe("createReport", () => {
  it("前回報告を取得して保存し、差分を返す", async () => {
    const previousReport = makeReport({
      id: "previous-id",
      newCount: 3,
      semiCount: 2.5,
    })
    const report = makeReport()
    const findFirst = vi.fn().mockResolvedValue(previousReport)
    const create = vi.fn().mockResolvedValue(report)
    const database = { report: { findFirst, create } }

    const result = await createReport(
      {
        location: "吹田",
        newCount: 2,
        semiCount: 3,
        source: ReportSource.LINE,
        reportedAt: report.reportedAt,
        lineMessageId: "message-id",
        lineGroupId: "group-id",
        lineUserId: "user-id",
        originalMessage: "吹田ニュー2セミ3です。",
      },
      database as never
    )

    expect(findFirst).toHaveBeenCalledWith({
      where: { location: "吹田" },
      orderBy: [
        { reportedAt: "desc" },
        { createdAt: "desc" },
      ],
    })
    expect(create).toHaveBeenCalledWith({
      data: {
        location: "吹田",
        newCount: 2,
        semiCount: 3,
        source: ReportSource.LINE,
        reportedAt: report.reportedAt,
        lineMessageId: "message-id",
        lineGroupId: "group-id",
        lineUserId: "user-id",
        originalMessage: "吹田ニュー2セミ3です。",
      },
    })
    expect(result).toEqual({
      report,
      previousReport,
      difference: { newCount: -1, semiCount: 0.5 },
    })
  })

  it("前回報告がない場合は差分をnullにする", async () => {
    const report = makeReport({
      source: ReportSource.WEB,
      lineMessageId: null,
      lineGroupId: null,
      lineUserId: null,
      originalMessage: null,
    })
    const database = {
      report: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(report),
      },
    }

    const result = await createReport(
      {
        location: "吹田",
        newCount: 2,
        semiCount: 3,
        source: ReportSource.WEB,
      },
      database as never
    )

    expect(result.previousReport).toBeNull()
    expect(result.difference).toBeNull()
  })
})
