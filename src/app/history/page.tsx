import type { ReactNode } from "react"
import { NavigationLink } from "@/components/navigation-link"
import { Button } from "@/components/ui/button"
import {
  calculateStockEventInventorySnapshots,
  INVENTORY_LOCATIONS,
  type CurrentInventory,
} from "@/lib/inventory-service"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const HISTORY_TYPES = ["report", "purchase", "transfer"] as const
const LOCATIONS = ["豊中", "吹田"] as const
const LOCATION_ORDER = ["豊中", "吹田"]

type HistoryType = (typeof HISTORY_TYPES)[number]
type Location = (typeof LOCATIONS)[number]

type Props = {
  searchParams: Promise<{
    type?: string | string[]
    location?: string | string[]
  }>
}

const HISTORY_TYPE_LABELS: Record<HistoryType, string> = {
  report: "シャトル報告",
  purchase: "購入履歴",
  transfer: "移動履歴",
}

function isHistoryType(value: unknown): value is HistoryType {
  return (
    typeof value === "string" &&
    HISTORY_TYPES.includes(value as HistoryType)
  )
}

function isLocation(value: unknown): value is Location {
  return (
    typeof value === "string" && LOCATIONS.includes(value as Location)
  )
}

function historyHref(type: HistoryType, location?: Location) {
  const params = new URLSearchParams({ type })

  if (location) {
    params.set("location", location)
  }

  return `/history?${params.toString()}`
}

function formatDate(value: Date) {
  return value.toLocaleString()
}

async function getStockHistoryData() {
  const [reports, purchases, transfers] = await Promise.all([
    prisma.report.findMany({
      select: {
        id: true,
        location: true,
        newCount: true,
        semiCount: true,
        reportedAt: true,
        createdAt: true,
      },
    }),
    prisma.purchase.findMany({
      select: {
        id: true,
        boxCount: true,
        tubesPerBox: true,
        purchasedAt: true,
        createdAt: true,
        allocations: {
          select: {
            id: true,
            purchaseId: true,
            location: true,
            tubeCount: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.shuttleTransfer.findMany({
      select: {
        id: true,
        fromLocation: true,
        toLocation: true,
        tubeCount: true,
        transferredAt: true,
        createdAt: true,
      },
      orderBy: [{ transferredAt: "desc" }, { createdAt: "desc" }],
    }),
  ])

  return {
    purchases,
    transfers,
    snapshots: calculateStockEventInventorySnapshots({
      reports,
      purchases,
      transfers,
    }),
  }
}

export default async function HistoryPage({ searchParams }: Props) {
  const params = await searchParams
  const type = isHistoryType(params.type) ? params.type : "report"
  const location = isLocation(params.location) ? params.location : undefined
  let content: ReactNode

  if (type === "report") {
    const reports = await prisma.report.findMany({
      where: location ? { location } : undefined,
      orderBy: [{ reportedAt: "desc" }, { createdAt: "desc" }],
    })

    content = reports.length === 0 ? (
      <EmptyHistory />
    ) : (
      reports.map((report) => (
        <article
          key={report.id}
          className="rounded-xl border p-5 shadow-sm"
        >
          <div className="grid gap-1 text-sm">
            <p>拠点: {report.location}</p>
            <p>ニュー: {report.newCount}</p>
            <p>セミ: {report.semiCount}</p>
            <p>
              登録元: {report.source === "LINE" ? "LINE" : "Web"}
            </p>
            <p>
              日時:{" "}
              <time
                dateTime={report.reportedAt.toISOString()}
              >
                {formatDate(report.reportedAt)}
              </time>
            </p>
          </div>
          <Button asChild className="mt-4" variant="outline">
            <NavigationLink href={`/history/${report.id}/edit`}>
              編集
            </NavigationLink>
          </Button>
        </article>
      ))
    )
  } else if (type === "purchase") {
    const { purchases, snapshots } = await getStockHistoryData()
    const filteredPurchases = location
      ? purchases.filter((purchase) =>
          purchase.allocations.some(
            (allocation) => allocation.location === location
          )
        )
      : purchases

    content = filteredPurchases.length === 0 ? (
      <EmptyHistory />
    ) : (
      filteredPurchases.map((purchase) => {
        const allocations = [...purchase.allocations].sort(
          (a, b) =>
            LOCATION_ORDER.indexOf(a.location) -
            LOCATION_ORDER.indexOf(b.location)
        )

        return (
          <article
            key={purchase.id}
            className="rounded-xl border p-5 shadow-sm"
          >
            <div className="grid gap-1 text-sm">
              <p>
                購入: {purchase.boxCount}箱（
                {purchase.boxCount * purchase.tubesPerBox}筒）
              </p>
              {allocations.map((allocation) => (
                <p key={allocation.id}>
                  配分（{allocation.location}）: {allocation.tubeCount}筒
                </p>
              ))}
              <p>登録元: LINE</p>
              <p>
                日時:{" "}
                <time dateTime={purchase.purchasedAt.toISOString()}>
                  {formatDate(purchase.purchasedAt)}
                </time>
              </p>
            </div>
            <InventoryResult
              label="購入後のシャトル残量"
              inventory={snapshots.purchases.get(purchase.id)}
            />
          </article>
        )
      })
    )
  } else {
    const { transfers, snapshots } = await getStockHistoryData()
    const filteredTransfers = location
      ? transfers.filter(
          (transfer) =>
            transfer.fromLocation === location ||
            transfer.toLocation === location
        )
      : transfers

    content = filteredTransfers.length === 0 ? (
      <EmptyHistory />
    ) : (
      filteredTransfers.map((transfer) => (
        <article
          key={transfer.id}
          className="rounded-xl border p-5 shadow-sm"
        >
          <div className="grid gap-1 text-sm">
            <p>
              移動: {transfer.fromLocation} → {transfer.toLocation}
            </p>
            <p>移動量: {transfer.tubeCount}筒</p>
            <p>登録元: LINE</p>
            <p>
              日時:{" "}
              <time dateTime={transfer.transferredAt.toISOString()}>
                {formatDate(transfer.transferredAt)}
              </time>
            </p>
          </div>
          <InventoryResult
            label="移動後のシャトル残量"
            inventory={snapshots.transfers.get(transfer.id)}
          />
        </article>
      ))
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">履歴</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {HISTORY_TYPE_LABELS[type]}を新しい順に表示します。
          </p>
        </div>
        <Button asChild variant="outline">
          <NavigationLink href="/">ホームへ戻る</NavigationLink>
        </Button>
      </div>

      <nav aria-label="履歴の種類" className="flex flex-wrap gap-2">
        {HISTORY_TYPES.map((historyType) => (
          <Button
            key={historyType}
            asChild
            variant={type === historyType ? "default" : "outline"}
          >
            <NavigationLink
              href={historyHref(historyType, location)}
              aria-current={type === historyType ? "page" : undefined}
            >
              {HISTORY_TYPE_LABELS[historyType]}
            </NavigationLink>
          </Button>
        ))}
      </nav>

      <nav aria-label="拠点" className="flex flex-wrap gap-2">
        <Button asChild variant={!location ? "default" : "outline"}>
          <NavigationLink
            href={historyHref(type)}
            aria-current={!location ? "page" : undefined}
          >
            全体
          </NavigationLink>
        </Button>
        {LOCATIONS.map((filterLocation) => (
          <Button
            key={filterLocation}
            asChild
            variant={location === filterLocation ? "default" : "outline"}
          >
            <NavigationLink
              href={historyHref(type, filterLocation)}
              aria-current={
                location === filterLocation ? "page" : undefined
              }
            >
              {filterLocation}
            </NavigationLink>
          </Button>
        ))}
      </nav>

      <section className="flex flex-col gap-4">{content}</section>
    </main>
  )
}

function EmptyHistory() {
  return (
    <p className="rounded-xl border p-6 text-center text-muted-foreground">
      条件に一致する履歴はありません。
    </p>
  )
}

function InventoryResult({
  label,
  inventory,
}: {
  label: string
  inventory?: CurrentInventory
}) {
  if (!inventory) {
    return null
  }

  return (
    <div className="mt-4 border-t pt-4 text-sm">
      <p className="font-medium">{label}:</p>
      <div className="mt-1 grid gap-1">
        {INVENTORY_LOCATIONS.flatMap((location) => {
          const snapshot = inventory[location]

          return snapshot.updatedAt
            ? [
                <p key={`${location}-new`}>
                  {location} ニュー: {snapshot.newCount}
                </p>,
                <p key={`${location}-semi`}>
                  {location} セミ: {snapshot.semiCount}
                </p>,
              ]
            : [<p key={location}>{location}: 報告なし</p>]
        })}
      </div>
    </div>
  )
}
