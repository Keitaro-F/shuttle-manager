import {
  ReportSource,
  type Report,
  type ShuttleTransfer,
} from "@prisma/client"
import { describe, expect, it, vi } from "vitest"
import {
  calculateStockEventInventorySnapshots,
  getCurrentInventory,
  type InventoryDatabase,
  type InventoryTimelinePurchase,
} from "./inventory-service"

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-id",
    location: "豊中",
    newCount: 3,
    semiCount: 2,
    reportedAt: new Date("2026-08-10T09:00:00.000Z"),
    source: ReportSource.LINE,
    lineMessageId: "message-id",
    lineGroupId: "group-id",
    lineUserId: "user-id",
    originalMessage: "豊中ニュー3セミ2",
    createdAt: new Date("2026-08-10T09:00:01.000Z"),
    updatedAt: new Date("2026-08-10T09:00:01.000Z"),
    ...overrides,
  }
}

function makeDatabase({
  reports = [],
  allocations = [],
  transfers = [],
}: {
  reports?: Report[]
  allocations?: Array<{
    location: string
    tubeCount: number
    purchase: { purchasedAt: Date; createdAt: Date }
  }>
  transfers?: Array<{
    fromLocation: string
    toLocation: string
    tubeCount: number
    semiTubeCount?: number
    transferredAt: Date
    createdAt: Date
  }>
} = {}): InventoryDatabase {
  return {
    report: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { location: string; reportedAt?: { lte: Date } }
        }) =>
          reports
            .filter(
              (report) =>
                report.location === where.location &&
                (!where.reportedAt ||
                  report.reportedAt.getTime() <=
                    where.reportedAt.lte.getTime())
            )
            .sort(
              (a, b) =>
                b.reportedAt.getTime() - a.reportedAt.getTime() ||
                b.createdAt.getTime() - a.createdAt.getTime()
            )[0] ?? null
      ),
    },
    purchaseAllocation: {
      findMany: vi.fn().mockResolvedValue(allocations),
    },
    shuttleTransfer: {
      findMany: vi.fn().mockResolvedValue(
        transfers.map((transfer) => ({
          semiTubeCount: 0,
          ...transfer,
        }))
      ),
    },
  } as unknown as InventoryDatabase
}

function makePurchase(
  overrides: Partial<InventoryTimelinePurchase> = {}
): InventoryTimelinePurchase {
  const id = overrides.id ?? "purchase-id"

  return {
    id,
    boxCount: 1,
    tubesPerBox: 10,
    purchasedAt: new Date("2026-08-11T09:00:00.000Z"),
    createdAt: new Date("2026-08-11T09:00:01.000Z"),
    allocations: [
      {
        id: `${id}-allocation-id`,
        purchaseId: id,
        location: "豊中",
        tubeCount: 10,
        createdAt: new Date("2026-08-11T09:00:01.000Z"),
      },
    ],
    ...overrides,
  }
}

function makeTransfer(
  overrides: Partial<ShuttleTransfer> = {}
): ShuttleTransfer {
  const id = overrides.id ?? "transfer-id"

  return {
    id,
    fromLocation: "豊中",
    toLocation: "吹田",
    tubeCount: 2,
    semiTubeCount: 0,
    transferredAt: new Date("2026-08-12T09:00:00.000Z"),
    lineMessageId: `${id}-message-id`,
    lineGroupId: "group-id",
    lineUserId: "user-id",
    originalMessage: "吹田に2筒移動しました",
    createdAt: new Date("2026-08-12T09:00:01.000Z"),
    updatedAt: new Date("2026-08-12T09:00:01.000Z"),
    ...overrides,
  }
}

describe("getCurrentInventory", () => {
  it("最新Reportを各拠点の基準値にする", async () => {
    const inventory = await getCurrentInventory(
      makeDatabase({
        reports: [
          makeReport(),
          makeReport({
            id: "suita-report-id",
            location: "吹田",
            newCount: 4,
            semiCount: 1.5,
          }),
        ],
      })
    )

    expect(inventory["豊中"]).toEqual({
      location: "豊中",
      newCount: 3,
      semiCount: 2,
      updatedAt: new Date("2026-08-10T09:00:00.000Z"),
    })
    expect(inventory["吹田"]).toEqual({
      location: "吹田",
      newCount: 4,
      semiCount: 1.5,
      updatedAt: new Date("2026-08-10T09:00:00.000Z"),
    })
  })

  it("最新Reportより後の購入をニュー残量へ加算する", async () => {
    const inventory = await getCurrentInventory(
      makeDatabase({
        reports: [makeReport()],
        allocations: [
          {
            location: "豊中",
            tubeCount: 10,
            purchase: {
              purchasedAt: new Date("2026-08-11T09:00:00.000Z"),
              createdAt: new Date("2026-08-11T09:00:01.000Z"),
            },
          },
        ],
      })
    )

    expect(inventory["豊中"]).toEqual({
      location: "豊中",
      newCount: 13,
      semiCount: 2,
      updatedAt: new Date("2026-08-11T09:00:00.000Z"),
    })
  })

  it("最新Report以前の購入・移動は基準値へ重ねない", async () => {
    const inventory = await getCurrentInventory(
      makeDatabase({
        reports: [makeReport()],
        allocations: [
          {
            location: "豊中",
            tubeCount: 10,
            purchase: {
              purchasedAt: new Date("2026-08-09T09:00:00.000Z"),
              createdAt: new Date("2026-08-09T09:00:01.000Z"),
            },
          },
        ],
        transfers: [
          {
            fromLocation: "豊中",
            toLocation: "吹田",
            tubeCount: 2,
            transferredAt: new Date("2026-08-09T10:00:00.000Z"),
            createdAt: new Date("2026-08-09T10:00:01.000Z"),
          },
        ],
      })
    )

    expect(inventory["豊中"].newCount).toBe(3)
  })

  it("最新Reportより後の移動を両拠点のニュー残量へ反映する", async () => {
    const inventory = await getCurrentInventory(
      makeDatabase({
        reports: [
          makeReport({ newCount: 6 }),
          makeReport({
            id: "suita-report-id",
            location: "吹田",
            newCount: 1,
          }),
        ],
        transfers: [
          {
            fromLocation: "豊中",
            toLocation: "吹田",
            tubeCount: 2,
            transferredAt: new Date("2026-08-11T09:00:00.000Z"),
            createdAt: new Date("2026-08-11T09:00:01.000Z"),
          },
        ],
      })
    )

    expect(inventory["豊中"].newCount).toBe(4)
    expect(inventory["吹田"].newCount).toBe(3)
  })

  it("ニューとセミの同時移動を両拠点の各残量へ反映する", async () => {
    const inventory = await getCurrentInventory(
      makeDatabase({
        reports: [
          makeReport({ newCount: 6, semiCount: 3 }),
          makeReport({
            id: "suita-report-id",
            location: "吹田",
            newCount: 1,
            semiCount: 0.5,
          }),
        ],
        transfers: [
          {
            fromLocation: "豊中",
            toLocation: "吹田",
            tubeCount: 2,
            semiTubeCount: 1,
            transferredAt: new Date("2026-08-11T09:00:00.000Z"),
            createdAt: new Date("2026-08-11T09:00:01.000Z"),
          },
        ],
      })
    )

    expect(inventory["豊中"]).toEqual(
      expect.objectContaining({ newCount: 4, semiCount: 2 })
    )
    expect(inventory["吹田"]).toEqual(
      expect.objectContaining({ newCount: 3, semiCount: 1.5 })
    )
  })

  it("Reportがない拠点では0を基準に購入を反映する", async () => {
    const inventory = await getCurrentInventory(
      makeDatabase({
        allocations: [
          {
            location: "豊中",
            tubeCount: 10,
            purchase: {
              purchasedAt: new Date("2026-08-11T09:00:00.000Z"),
              createdAt: new Date("2026-08-11T09:00:01.000Z"),
            },
          },
        ],
      })
    )

    expect(inventory["豊中"]).toEqual({
      location: "豊中",
      newCount: 10,
      semiCount: 0,
      updatedAt: new Date("2026-08-11T09:00:00.000Z"),
    })
    expect(inventory["吹田"].updatedAt).toBeNull()
  })

  it("指定時刻より後のReport・購入・移動を残量へ反映しない", async () => {
    const asOf = new Date("2026-08-11T12:00:00.000Z")
    const inventory = await getCurrentInventory(
      makeDatabase({
        reports: [
          makeReport({ newCount: 5 }),
          makeReport({
            id: "future-report-id",
            newCount: 20,
            reportedAt: new Date("2026-08-12T09:00:00.000Z"),
            createdAt: new Date("2026-08-12T09:00:01.000Z"),
          }),
        ],
        allocations: [
          {
            location: "豊中",
            tubeCount: 10,
            purchase: {
              purchasedAt: new Date("2026-08-11T09:00:00.000Z"),
              createdAt: new Date("2026-08-11T09:00:01.000Z"),
            },
          },
          {
            location: "豊中",
            tubeCount: 10,
            purchase: {
              purchasedAt: new Date("2026-08-12T09:00:00.000Z"),
              createdAt: new Date("2026-08-12T09:00:01.000Z"),
            },
          },
        ],
        transfers: [
          {
            fromLocation: "豊中",
            toLocation: "吹田",
            tubeCount: 2,
            transferredAt: new Date("2026-08-11T10:00:00.000Z"),
            createdAt: new Date("2026-08-11T10:00:01.000Z"),
          },
          {
            fromLocation: "豊中",
            toLocation: "吹田",
            tubeCount: 3,
            transferredAt: new Date("2026-08-12T10:00:00.000Z"),
            createdAt: new Date("2026-08-12T10:00:01.000Z"),
          },
        ],
      }),
      { asOf }
    )

    expect(inventory["豊中"].newCount).toBe(13)
    expect(inventory["吹田"].newCount).toBe(2)
  })
})

describe("calculateStockEventInventorySnapshots", () => {
  it("購入・移動の各操作直後の残量を保存する", () => {
    const purchase = makePurchase({
      allocations: [
        {
          id: "toyonaka-allocation-id",
          purchaseId: "purchase-id",
          location: "豊中",
          tubeCount: 6,
          createdAt: new Date("2026-08-11T09:00:01.000Z"),
        },
        {
          id: "suita-allocation-id",
          purchaseId: "purchase-id",
          location: "吹田",
          tubeCount: 4,
          createdAt: new Date("2026-08-11T09:00:01.000Z"),
        },
      ],
    })
    const transfer = makeTransfer({ semiTubeCount: 1 })

    const snapshots = calculateStockEventInventorySnapshots({
      reports: [
        makeReport({ newCount: 5, semiCount: 2 }),
        makeReport({
          id: "suita-report-id",
          location: "吹田",
          newCount: 1,
          semiCount: 3,
        }),
      ],
      purchases: [purchase],
      transfers: [transfer],
    })

    expect(snapshots.purchases.get(purchase.id)?.["豊中"]).toEqual(
      expect.objectContaining({ newCount: 11, semiCount: 2 })
    )
    expect(snapshots.purchases.get(purchase.id)?.["吹田"]).toEqual(
      expect.objectContaining({ newCount: 5, semiCount: 3 })
    )
    expect(snapshots.transfers.get(transfer.id)?.["豊中"]).toEqual(
      expect.objectContaining({ newCount: 9, semiCount: 1 })
    )
    expect(snapshots.transfers.get(transfer.id)?.["吹田"]).toEqual(
      expect.objectContaining({ newCount: 7, semiCount: 4 })
    )
  })

  it("後続のReportは過去の購入結果を変えず新しい基準値にする", () => {
    const purchase = makePurchase({
      purchasedAt: new Date("2026-08-09T09:00:00.000Z"),
      createdAt: new Date("2026-08-09T09:00:01.000Z"),
    })
    const transfer = makeTransfer()

    const snapshots = calculateStockEventInventorySnapshots({
      reports: [makeReport({ newCount: 4, semiCount: 1 })],
      purchases: [purchase],
      transfers: [transfer],
    })

    expect(snapshots.purchases.get(purchase.id)?.["豊中"]).toEqual(
      expect.objectContaining({ newCount: 10, semiCount: 0 })
    )
    expect(snapshots.transfers.get(transfer.id)?.["豊中"]).toEqual(
      expect.objectContaining({ newCount: 2, semiCount: 1 })
    )
    expect(snapshots.transfers.get(transfer.id)?.["吹田"]).toEqual(
      expect.objectContaining({ newCount: 2, semiCount: 0 })
    )
  })
})
