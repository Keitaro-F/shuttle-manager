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
  it("前回報告以降の購入・移動を反映して差分を返す", async () => {
    const previousReport = makeReport({
      id: "previous-id",
      newCount: 10,
      semiCount: 2,
      reportedAt: new Date("2026-08-07T09:00:00.000Z"),
    })
    const report = makeReport({ newCount: 12, semiCount: 3 })
    const findFirst = vi.fn(
      async ({ where }: { where: { location: string } }) =>
        where.location === "吹田" ? previousReport : null
    )
    const create = vi.fn().mockResolvedValue(report)
    const database = {
      report: { findFirst, create },
      purchaseAllocation: {
        findMany: vi.fn().mockResolvedValue([
          {
            location: "吹田",
            tubeCount: 5,
            purchase: {
              purchasedAt: new Date("2026-08-07T12:00:00.000Z"),
              createdAt: new Date("2026-08-07T12:00:01.000Z"),
            },
          },
        ]),
      },
      shuttleTransfer: {
        findMany: vi.fn().mockResolvedValue([
          {
            fromLocation: "吹田",
            toLocation: "豊中",
            tubeCount: 2,
            semiTubeCount: 1,
            transferredAt: new Date("2026-08-07T13:00:00.000Z"),
            createdAt: new Date("2026-08-07T13:00:01.000Z"),
          },
        ]),
      },
    }

    const result = await createReport(
      {
        location: "吹田",
        newCount: 12,
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
      where: {
        location: "吹田",
        reportedAt: { lte: report.reportedAt },
      },
      orderBy: [
        { reportedAt: "desc" },
        { createdAt: "desc" },
      ],
    })
    expect(create).toHaveBeenCalledWith({
      data: {
        location: "吹田",
        newCount: 12,
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
      difference: { newCount: -1, semiCount: 2 },
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
      purchaseAllocation: { findMany: vi.fn().mockResolvedValue([]) },
      shuttleTransfer: { findMany: vi.fn().mockResolvedValue([]) },
    }

    const result = await createReport(
      {
        location: "吹田",
        newCount: 2,
        semiCount: 3,
        source: ReportSource.WEB,
        reportedAt: report.reportedAt,
      },
      database as never
    )

    expect(result.previousReport).toBeNull()
    expect(result.difference).toBeNull()
  })
})
