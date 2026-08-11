import type {
  PrismaClient,
  Purchase,
  PurchaseAllocation,
  Report,
  ShuttleTransfer,
} from "@prisma/client"
import { prisma } from "./prisma"

export const INVENTORY_LOCATIONS = ["豊中", "吹田"] as const

export type InventoryLocation = (typeof INVENTORY_LOCATIONS)[number]

export type InventorySnapshot = {
  location: InventoryLocation
  newCount: number
  semiCount: number
  updatedAt: Date | null
}

export type CurrentInventory = Record<InventoryLocation, InventorySnapshot>

export type InventoryTimelineReport = Pick<
  Report,
  | "id"
  | "location"
  | "newCount"
  | "semiCount"
  | "reportedAt"
  | "createdAt"
>

export type InventoryTimelinePurchase = Pick<
  Purchase,
  "id" | "boxCount" | "tubesPerBox" | "purchasedAt" | "createdAt"
> & {
  allocations: Array<
    Pick<
      PurchaseAllocation,
      "id" | "purchaseId" | "location" | "tubeCount" | "createdAt"
    >
  >
}

export type InventoryTimelineTransfer = Pick<
  ShuttleTransfer,
  | "id"
  | "fromLocation"
  | "toLocation"
  | "tubeCount"
  | "semiTubeCount"
  | "transferredAt"
  | "createdAt"
>

export type StockEventInventorySnapshots = {
  purchases: Map<string, CurrentInventory>
  transfers: Map<string, CurrentInventory>
}

export type InventoryDatabase = Pick<
  PrismaClient,
  "report" | "purchaseAllocation" | "shuttleTransfer"
>

type InventoryQueryOptions = {
  asOf?: Date
}

function isAfterReport(
  report: Report | null,
  occurredAt: Date,
  createdAt: Date
) {
  if (!report) {
    return true
  }

  const occurredDifference =
    occurredAt.getTime() - report.reportedAt.getTime()

  if (occurredDifference !== 0) {
    return occurredDifference > 0
  }

  return createdAt.getTime() > report.createdAt.getTime()
}

function laterDate(current: Date | null, candidate: Date) {
  return !current || candidate.getTime() > current.getTime()
    ? candidate
    : current
}

function isAtOrBefore(occurredAt: Date, asOf?: Date) {
  return !asOf || occurredAt.getTime() <= asOf.getTime()
}

function createEmptyInventory(): CurrentInventory {
  return Object.fromEntries(
    INVENTORY_LOCATIONS.map((location) => [
      location,
      {
        location,
        newCount: 0,
        semiCount: 0,
        updatedAt: null,
      },
    ])
  ) as CurrentInventory
}

function copyInventory(inventory: CurrentInventory): CurrentInventory {
  return Object.fromEntries(
    INVENTORY_LOCATIONS.map((location) => [
      location,
      { ...inventory[location] },
    ])
  ) as CurrentInventory
}

type TimelineEvent =
  | {
      type: "report"
      id: string
      occurredAt: Date
      createdAt: Date
      value: InventoryTimelineReport
    }
  | {
      type: "purchase"
      id: string
      occurredAt: Date
      createdAt: Date
      value: InventoryTimelinePurchase
    }
  | {
      type: "transfer"
      id: string
      occurredAt: Date
      createdAt: Date
      value: InventoryTimelineTransfer
    }

const TIMELINE_TYPE_ORDER: Record<TimelineEvent["type"], number> = {
  report: 0,
  purchase: 1,
  transfer: 2,
}

export function calculateStockEventInventorySnapshots({
  reports,
  purchases,
  transfers,
}: {
  reports: InventoryTimelineReport[]
  purchases: InventoryTimelinePurchase[]
  transfers: InventoryTimelineTransfer[]
}): StockEventInventorySnapshots {
  const inventory = createEmptyInventory()
  const snapshots: StockEventInventorySnapshots = {
    purchases: new Map(),
    transfers: new Map(),
  }
  const events: TimelineEvent[] = [
    ...reports.map(
      (report): TimelineEvent => ({
        type: "report",
        id: report.id,
        occurredAt: report.reportedAt,
        createdAt: report.createdAt,
        value: report,
      })
    ),
    ...purchases.map(
      (purchase): TimelineEvent => ({
        type: "purchase",
        id: purchase.id,
        occurredAt: purchase.purchasedAt,
        createdAt: purchase.createdAt,
        value: purchase,
      })
    ),
    ...transfers.map(
      (transfer): TimelineEvent => ({
        type: "transfer",
        id: transfer.id,
        occurredAt: transfer.transferredAt,
        createdAt: transfer.createdAt,
        value: transfer,
      })
    ),
  ].sort(
    (a, b) =>
      a.occurredAt.getTime() - b.occurredAt.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      TIMELINE_TYPE_ORDER[a.type] - TIMELINE_TYPE_ORDER[b.type] ||
      a.id.localeCompare(b.id)
  )

  for (const event of events) {
    if (event.type === "report") {
      const location = event.value.location as InventoryLocation

      if (!INVENTORY_LOCATIONS.includes(location)) {
        continue
      }

      inventory[location] = {
        location,
        newCount: event.value.newCount,
        semiCount: event.value.semiCount,
        updatedAt: event.value.reportedAt,
      }
      continue
    }

    if (event.type === "purchase") {
      for (const allocation of event.value.allocations) {
        const location = allocation.location as InventoryLocation

        if (!INVENTORY_LOCATIONS.includes(location)) {
          continue
        }

        inventory[location] = {
          ...inventory[location],
          newCount:
            inventory[location].newCount + allocation.tubeCount,
          updatedAt: event.value.purchasedAt,
        }
      }

      snapshots.purchases.set(event.id, copyInventory(inventory))
      continue
    }

    const fromLocation = event.value.fromLocation as InventoryLocation
    const toLocation = event.value.toLocation as InventoryLocation

    if (
      !INVENTORY_LOCATIONS.includes(fromLocation) ||
      !INVENTORY_LOCATIONS.includes(toLocation)
    ) {
      continue
    }

    inventory[fromLocation] = {
      ...inventory[fromLocation],
      newCount: inventory[fromLocation].newCount - event.value.tubeCount,
      semiCount:
        inventory[fromLocation].semiCount - event.value.semiTubeCount,
      updatedAt: event.value.transferredAt,
    }
    inventory[toLocation] = {
      ...inventory[toLocation],
      newCount: inventory[toLocation].newCount + event.value.tubeCount,
      semiCount: inventory[toLocation].semiCount + event.value.semiTubeCount,
      updatedAt: event.value.transferredAt,
    }
    snapshots.transfers.set(event.id, copyInventory(inventory))
  }

  return snapshots
}

export async function getCurrentInventory(
  database: InventoryDatabase = prisma,
  { asOf }: InventoryQueryOptions = {}
): Promise<CurrentInventory> {
  const [reports, allocations, transfers] = await Promise.all([
    Promise.all(
      INVENTORY_LOCATIONS.map((location) =>
        database.report.findFirst({
          where: {
            location,
            ...(asOf ? { reportedAt: { lte: asOf } } : {}),
          },
          orderBy: [{ reportedAt: "desc" }, { createdAt: "desc" }],
        })
      )
    ),
    database.purchaseAllocation.findMany({
      include: { purchase: true },
    }),
    database.shuttleTransfer.findMany(),
  ])

  return Object.fromEntries(
    INVENTORY_LOCATIONS.map((location, index) => {
      const report = reports[index]
      let newCount = report?.newCount ?? 0
      let semiCount = report?.semiCount ?? 0
      let updatedAt = report?.reportedAt ?? null

      for (const allocation of allocations) {
        if (
          allocation.location !== location ||
          !isAtOrBefore(allocation.purchase.purchasedAt, asOf) ||
          !isAfterReport(
            report,
            allocation.purchase.purchasedAt,
            allocation.purchase.createdAt
          )
        ) {
          continue
        }

        newCount += allocation.tubeCount
        updatedAt = laterDate(updatedAt, allocation.purchase.purchasedAt)
      }

      for (const transfer of transfers) {
        if (
          !isAtOrBefore(transfer.transferredAt, asOf) ||
          !isAfterReport(
            report,
            transfer.transferredAt,
            transfer.createdAt
          )
        ) {
          continue
        }

        if (transfer.fromLocation === location) {
          newCount -= transfer.tubeCount
          semiCount -= transfer.semiTubeCount
          updatedAt = laterDate(updatedAt, transfer.transferredAt)
        }

        if (transfer.toLocation === location) {
          newCount += transfer.tubeCount
          semiCount += transfer.semiTubeCount
          updatedAt = laterDate(updatedAt, transfer.transferredAt)
        }
      }

      return [
        location,
        {
          location,
          newCount: Object.is(newCount, -0) ? 0 : newCount,
          semiCount: Object.is(semiCount, -0) ? 0 : semiCount,
          updatedAt,
        },
      ]
    })
  ) as CurrentInventory
}
