import { createHmac } from "node:crypto"
import { ReportSource, type Report } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"
import {
  handleLineWebhook,
  LINE_GROUP_ID_DISCOVERY_VALUE,
  type LineWebhookDependencies,
} from "./webhook"

const CHANNEL_SECRET = "test-channel-secret"
const ALLOWED_GROUP_ID = "allowed-group-id"

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-id",
    location: "吹田",
    newCount: 2,
    semiCount: 3,
    reportedAt: new Date("2026-08-08T09:00:00.000Z"),
    source: ReportSource.LINE,
    lineMessageId: "message-id",
    lineGroupId: ALLOWED_GROUP_ID,
    lineUserId: "user-id",
    originalMessage: "吹田ニュー2セミ3です。",
    createdAt: new Date("2026-08-08T09:00:01.000Z"),
    updatedAt: new Date("2026-08-08T09:00:01.000Z"),
    ...overrides,
  }
}

function makeMessageEvent({
  groupId = ALLOWED_GROUP_ID,
  sourceType = "group",
  webhookEventId = "webhook-event-id",
  messageId = "message-id",
  replyToken = "reply-token",
  text = "吹田ニュー2セミ3です。",
  quotedMessageId,
}: {
  groupId?: string
  sourceType?: "group" | "user"
  webhookEventId?: string
  messageId?: string
  replyToken?: string
  text?: string
  quotedMessageId?: string
} = {}) {
  return {
    type: "message",
    mode: "active",
    timestamp: Date.parse("2026-08-08T09:00:00.000Z"),
    webhookEventId,
    deliveryContext: { isRedelivery: false },
    replyToken,
    source:
      sourceType === "group"
        ? { type: "group", groupId, userId: "user-id" }
        : { type: "user", userId: "user-id" },
    message: {
      type: "text",
      id: messageId,
      text,
      quoteToken: "quote-token",
      quotedMessageId,
    },
  }
}

function makeUnsendEvent({
  groupId = ALLOWED_GROUP_ID,
  webhookEventId = "unsend-event-id",
  messageId = "message-id",
}: {
  groupId?: string
  webhookEventId?: string
  messageId?: string
} = {}) {
  return {
    type: "unsend",
    mode: "active",
    timestamp: Date.parse("2026-08-08T09:05:00.000Z"),
    webhookEventId,
    deliveryContext: { isRedelivery: false },
    source: { type: "group", groupId, userId: "user-id" },
    unsend: { messageId },
  }
}

function sign(body: string) {
  return createHmac("sha256", CHANNEL_SECRET).update(body).digest("base64")
}

function makeRequest(body: string, signature = sign(body)) {
  return new Request("http://localhost/api/line/webhook", {
    method: "POST",
    headers: { "x-line-signature": signature },
    body,
  })
}

type ReportCreateData = {
  location: string
  newCount: number
  semiCount: number
  source: ReportSource
  reportedAt?: Date
  lineMessageId?: string | null
  lineGroupId?: string | null
  lineUserId?: string | null
  originalMessage?: string | null
}

type PurchaseCreateData = {
  boxCount: number
  tubesPerBox: number
  purchasedAt: Date
  lineMessageId: string
  lineGroupId: string
  lineUserId: string | null
  originalMessage: string
  allocations: {
    create: Array<{ location: string; tubeCount: number }>
  }
}

type TransferCreateData = {
  fromLocation: string
  toLocation: string
  tubeCount: number
  transferredAt: Date
  lineMessageId: string
  lineGroupId: string
  lineUserId: string | null
  originalMessage: string
}

function makePurchase(
  overrides: Partial<PurchaseCreateData & { id: string }> = {}
): PurchaseCreateData & { id: string } {
  return {
    id: "purchase-id",
    boxCount: 1,
    tubesPerBox: 10,
    purchasedAt: new Date("2026-08-08T09:00:00.000Z"),
    lineMessageId: "message-id",
    lineGroupId: ALLOWED_GROUP_ID,
    lineUserId: "user-id",
    originalMessage: "シャトル1箱購入しました。豊中6筒、吹田4筒です。",
    allocations: {
      create: [
        { location: "豊中", tubeCount: 6 },
        { location: "吹田", tubeCount: 4 },
      ],
    },
    ...overrides,
  }
}

function makeTransfer(
  overrides: Partial<TransferCreateData & { id: string }> = {}
): TransferCreateData & { id: string } {
  return {
    id: "transfer-id",
    fromLocation: "豊中",
    toLocation: "吹田",
    tubeCount: 2,
    transferredAt: new Date("2026-08-08T09:00:00.000Z"),
    lineMessageId: "message-id",
    lineGroupId: ALLOWED_GROUP_ID,
    lineUserId: "user-id",
    originalMessage: "シャトルを豊中から吹田へ2筒移動しました。",
    ...overrides,
  }
}

function makeDatabase({
  failReportCreate = false,
  initialReports = [],
  initialPurchases = [],
  initialTransfers = [],
}: {
  failReportCreate?: boolean
  initialReports?: Report[]
  initialPurchases?: Array<PurchaseCreateData & { id: string }>
  initialTransfers?: Array<TransferCreateData & { id: string }>
} = {}) {
  const receipts = new Set<string>()
  const reports = [...initialReports]
  const purchases = [...initialPurchases]
  const transfers = [...initialTransfers]
  const findFirst = vi.fn(
    async ({ where }: { where: { location: string } }) =>
      reports
        .filter((report) => report.location === where.location)
        .sort(
          (a, b) =>
            b.reportedAt.getTime() - a.reportedAt.getTime() ||
            b.createdAt.getTime() - a.createdAt.getTime()
        )[0] ?? null
  )
  const create = vi.fn(async ({ data }: { data: ReportCreateData }) => {
    if (failReportCreate) {
      throw new Error("database unavailable")
    }

    const report = makeReport({
      ...data,
      id: `report-${reports.length + 1}`,
      reportedAt: data.reportedAt ?? new Date("2026-08-08T09:00:00.000Z"),
      lineMessageId: data.lineMessageId ?? null,
      lineGroupId: data.lineGroupId ?? null,
      lineUserId: data.lineUserId ?? null,
      originalMessage: data.originalMessage ?? null,
    })
    reports.push(report)

    return report
  })
  const deleteMany = vi.fn(
    async ({
      where,
    }: {
      where: { lineMessageId: string; lineGroupId: string }
    }) => {
      const remainingReports = reports.filter(
        (report) =>
          report.lineMessageId !== where.lineMessageId ||
          report.lineGroupId !== where.lineGroupId
      )
      const count = reports.length - remainingReports.length

      reports.splice(0, reports.length, ...remainingReports)
      return { count }
    }
  )
  const purchaseCreate = vi.fn(
    async ({ data }: { data: PurchaseCreateData }) => {
      const purchase = {
        id: `purchase-${purchases.length + 1}`,
        ...data,
      }
      purchases.push(purchase)
      return purchase
    }
  )
  const purchaseDeleteMany = vi.fn(
    async ({
      where,
    }: {
      where: { lineMessageId: string; lineGroupId: string }
    }) => {
      const remainingPurchases = purchases.filter(
        (purchase) =>
          purchase.lineMessageId !== where.lineMessageId ||
          purchase.lineGroupId !== where.lineGroupId
      )
      const count = purchases.length - remainingPurchases.length

      purchases.splice(0, purchases.length, ...remainingPurchases)
      return { count }
    }
  )
  const transferCreate = vi.fn(
    async ({ data }: { data: TransferCreateData }) => {
      const transfer = {
        id: `transfer-${transfers.length + 1}`,
        ...data,
      }
      transfers.push(transfer)
      return transfer
    }
  )
  const transferDeleteMany = vi.fn(
    async ({
      where,
    }: {
      where: { lineMessageId: string; lineGroupId: string }
    }) => {
      const remainingTransfers = transfers.filter(
        (transfer) =>
          transfer.lineMessageId !== where.lineMessageId ||
          transfer.lineGroupId !== where.lineGroupId
      )
      const count = transfers.length - remainingTransfers.length

      transfers.splice(0, transfers.length, ...remainingTransfers)
      return { count }
    }
  )
  const purchaseAllocationFindMany = vi.fn(async () =>
    purchases.flatMap((purchase) =>
      purchase.allocations.create.map((allocation, index) => ({
        id: `${purchase.id}-allocation-${index + 1}`,
        purchaseId: purchase.id,
        location: allocation.location,
        tubeCount: allocation.tubeCount,
        createdAt: new Date(purchase.purchasedAt.getTime() + 1000),
        purchase: {
          ...purchase,
          createdAt: new Date(purchase.purchasedAt.getTime() + 1000),
          updatedAt: new Date(purchase.purchasedAt.getTime() + 1000),
        },
      }))
    )
  )
  const transferFindMany = vi.fn(async () =>
    transfers.map((transfer) => ({
      ...transfer,
      createdAt: new Date(transfer.transferredAt.getTime() + 1000),
      updatedAt: new Date(transfer.transferredAt.getTime() + 1000),
    }))
  )
  const createMany = vi.fn(
    async ({ data }: { data: { webhookEventId: string } }) => {
      if (receipts.has(data.webhookEventId)) {
        return { count: 0 }
      }

      receipts.add(data.webhookEventId)
      return { count: 1 }
    }
  )
  const transaction = {
    webhookReceipt: { createMany },
    report: { findFirst, create, deleteMany },
    purchase: {
      create: purchaseCreate,
      deleteMany: purchaseDeleteMany,
    },
    purchaseAllocation: { findMany: purchaseAllocationFindMany },
    shuttleTransfer: {
      create: transferCreate,
      deleteMany: transferDeleteMany,
      findMany: transferFindMany,
    },
  }
  const $transaction = vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) => {
      const receiptSnapshot = new Set(receipts)
      const reportSnapshot = [...reports]
      const purchaseSnapshot = [...purchases]
      const transferSnapshot = [...transfers]

      try {
        return await callback(transaction)
      } catch (error) {
        receipts.clear()
        receiptSnapshot.forEach((receipt) => receipts.add(receipt))
        reports.splice(0, reports.length, ...reportSnapshot)
        purchases.splice(0, purchases.length, ...purchaseSnapshot)
        transfers.splice(0, transfers.length, ...transferSnapshot)
        throw error
      }
    }
  )

  return {
    database: {
      $transaction,
    } as unknown as NonNullable<LineWebhookDependencies["database"]>,
    reports,
    purchases,
    transfers,
    $transaction,
    createMany,
    findFirst,
    create,
    deleteMany,
    purchaseCreate,
    purchaseDeleteMany,
    transferCreate,
    transferDeleteMany,
    purchaseAllocationFindMany,
    transferFindMany,
  }
}

function makeLineClient(error?: Error) {
  const replyMessage = error
    ? vi.fn().mockRejectedValue(error)
    : vi.fn().mockResolvedValue({ sentMessages: [] })

  return {
    lineClient: {
      replyMessage,
    } as unknown as LineWebhookDependencies["lineClient"],
    replyMessage,
  }
}

function makeDependencies(
  database: NonNullable<LineWebhookDependencies["database"]>,
  overrides: Partial<LineWebhookDependencies> = {}
): LineWebhookDependencies {
  return {
    channelSecret: CHANNEL_SECRET,
    allowedGroupId: ALLOWED_GROUP_ID,
    database,
    logger: { error: vi.fn(), info: vi.fn() },
    ...makeLineClient(),
    ...overrides,
  }
}

describe("handleLineWebhook", () => {
  it("正しい署名の空イベント配列へHTTP 200を返す", async () => {
    const body = JSON.stringify({ destination: "bot-user-id", events: [] })
    const { database, $transaction } = makeDatabase()
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect($transaction).not.toHaveBeenCalled()
    expect(replyMessage).not.toHaveBeenCalled()
  })

  it("不正な署名をHTTP 401で拒否する", async () => {
    const body = JSON.stringify({ events: [makeMessageEvent()] })
    const { database, $transaction } = makeDatabase()

    const response = await handleLineWebhook(
      makeRequest(body, "invalid-signature"),
      makeDependencies(database)
    )

    expect(response.status).toBe(401)
    expect($transaction).not.toHaveBeenCalled()
  })

  it("署名がないリクエストをHTTP 401で拒否する", async () => {
    const body = JSON.stringify({ events: [makeMessageEvent()] })
    const request = new Request("http://localhost/api/line/webhook", {
      method: "POST",
      body,
    })
    const { database, $transaction } = makeDatabase()

    const response = await handleLineWebhook(
      request,
      makeDependencies(database)
    )

    expect(response.status).toBe(401)
    expect($transaction).not.toHaveBeenCalled()
  })

  it("発見モードでは署名済みイベントのグループIDだけを記録する", async () => {
    const body = JSON.stringify({ events: [makeMessageEvent()] })
    const { database, $transaction } = makeDatabase()
    const { lineClient, replyMessage } = makeLineClient()
    const logger = { error: vi.fn(), info: vi.fn() }

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, {
        allowedGroupId: LINE_GROUP_ID_DISCOVERY_VALUE,
        lineClient,
        logger,
      })
    )

    expect(response.status).toBe(200)
    expect(logger.info).toHaveBeenCalledWith(
      "LINE group ID discovered",
      { groupId: ALLOWED_GROUP_ID }
    )
    expect($transaction).not.toHaveBeenCalled()
    expect(replyMessage).not.toHaveBeenCalled()
  })

  it("正常登録後に今回値と前回差を返信する", async () => {
    const previousReport = makeReport({
      id: "previous-report-id",
      newCount: 3,
      semiCount: 2.5,
      reportedAt: new Date("2026-08-07T09:00:00.000Z"),
    })
    const body = JSON.stringify({ events: [makeMessageEvent()] })
    const { database, createMany, findFirst, create } = makeDatabase({
      initialReports: [previousReport],
    })
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(createMany).toHaveBeenCalledWith({
      data: { webhookEventId: "webhook-event-id" },
      skipDuplicates: true,
    })
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
        reportedAt: new Date("2026-08-08T09:00:00.000Z"),
        lineMessageId: "message-id",
        lineGroupId: ALLOWED_GROUP_ID,
        lineUserId: "user-id",
        originalMessage: "吹田ニュー2セミ3です。",
      },
    })
    expect(replyMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      messages: [
        {
          type: "text",
          text: `✅ 吹田の残量を登録しました

今回
ニュー：2筒
セミ：3筒

前回比
ニュー：-1筒
セミ：+0.5筒

🏸 現在のシャトル残量

豊中：報告なし
吹田：ニュー2 / セミ3

最終更新：8月8日 18:00`,
        },
      ],
    })
  })

  it("初回登録で最初の報告であることを返信する", async () => {
    const body = JSON.stringify({ events: [makeMessageEvent()] })
    const { database } = makeDatabase()
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(replyMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      messages: [
        {
          type: "text",
          text: `✅ 吹田の残量を登録しました

ニュー：2筒
セミ：3筒

この拠点では最初の報告です。

🏸 現在のシャトル残量

豊中：報告なし
吹田：ニュー2 / セミ3

最終更新：8月8日 18:00`,
        },
      ],
    })
  })

  it("不正な報告に入力例を返信し、Reportは保存しない", async () => {
    const body = JSON.stringify({
      events: [makeMessageEvent({ text: "吹田ニュー2です。" })],
    })
    const { database, createMany, create } = makeDatabase()
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(createMany).toHaveBeenCalledTimes(1)
    expect(create).not.toHaveBeenCalled()
    expect(replyMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      messages: [
        {
          type: "text",
          text: `⚠️ 登録できませんでした
「吹田ニュー2セミ3です。」の形式で送信してください。
数値は0.5刻みで入力できます。`,
        },
      ],
    })
  })

  it("購入と拠点別配分を保存して返信する", async () => {
    const text = "シャトル1箱購入しました。豊中6筒、吹田4筒です。"
    const body = JSON.stringify({
      events: [makeMessageEvent({ text })],
    })
    const { database, purchases, purchaseCreate } = makeDatabase()
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(purchaseCreate).toHaveBeenCalledWith({
      data: {
        boxCount: 1,
        tubesPerBox: 10,
        purchasedAt: new Date("2026-08-08T09:00:00.000Z"),
        lineMessageId: "message-id",
        lineGroupId: ALLOWED_GROUP_ID,
        lineUserId: "user-id",
        originalMessage: text,
        allocations: {
          create: [
            { location: "豊中", tubeCount: 6 },
            { location: "吹田", tubeCount: 4 },
          ],
        },
      },
    })
    expect(purchases).toHaveLength(1)
    expect(replyMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      messages: [
        {
          type: "text",
          text: `✅ シャトル購入を登録しました

1箱（10筒）
豊中：6筒
吹田：4筒

🏸 現在のシャトル残量

豊中：ニュー6 / セミ0
吹田：ニュー4 / セミ0

最終更新：8月8日 18:00`,
        },
      ],
    })
  })

  it("購入先を省略した場合は購入した全筒を豊中へ保存する", async () => {
    const text = "シャトル2箱購入しました"
    const body = JSON.stringify({
      events: [makeMessageEvent({ text })],
    })
    const { database, purchaseCreate } = makeDatabase()
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(purchaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        boxCount: 2,
        tubesPerBox: 10,
        originalMessage: text,
        allocations: {
          create: [{ location: "豊中", tubeCount: 20 }],
        },
      }),
    })
    expect(replyMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      messages: [
        {
          type: "text",
          text: `✅ シャトル購入を登録しました

2箱（20筒）
豊中：20筒

🏸 現在のシャトル残量

豊中：ニュー20 / セミ0
吹田：報告なし

最終更新：8月8日 18:00`,
        },
      ],
    })
  })

  it("配分合計が購入筒数と異なる場合は保存せず入力例を返信する", async () => {
    const body = JSON.stringify({
      events: [
        makeMessageEvent({
          text: "シャトル1箱購入しました。豊中6筒、吹田3筒です。",
        }),
      ],
    })
    const { database, purchases, purchaseCreate } = makeDatabase()
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(purchases).toHaveLength(0)
    expect(purchaseCreate).not.toHaveBeenCalled()
    expect(replyMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            text: expect.stringContaining("配分の合計を購入した筒数と一致"),
          }),
        ],
      })
    )
  })

  it("拠点間移動を保存して返信する", async () => {
    const text = "吹田に2移動しました"
    const body = JSON.stringify({
      events: [makeMessageEvent({ text })],
    })
    const { database, transfers, transferCreate } = makeDatabase({
      initialReports: [
        makeReport({
          id: "toyonaka-report-id",
          location: "豊中",
          newCount: 5,
          semiCount: 2,
          reportedAt: new Date("2026-08-07T09:00:00.000Z"),
          lineMessageId: "toyonaka-message-id",
        }),
      ],
    })
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(transferCreate).toHaveBeenCalledWith({
      data: {
        fromLocation: "豊中",
        toLocation: "吹田",
        tubeCount: 2,
        transferredAt: new Date("2026-08-08T09:00:00.000Z"),
        lineMessageId: "message-id",
        lineGroupId: ALLOWED_GROUP_ID,
        lineUserId: "user-id",
        originalMessage: text,
      },
    })
    expect(transfers).toHaveLength(1)
    expect(replyMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      messages: [
        {
          type: "text",
          text: `✅ シャトル移動を登録しました

豊中 → 吹田
2筒

🏸 現在のシャトル残量

豊中：ニュー3 / セミ2
吹田：ニュー2 / セミ0

最終更新：8月8日 18:00`,
        },
      ],
    })
  })

  it("移動元のニュー残量を超える移動は保存しない", async () => {
    const text = "吹田に2移動しました"
    const body = JSON.stringify({
      events: [makeMessageEvent({ text })],
    })
    const { database, transfers, transferCreate } = makeDatabase({
      initialReports: [
        makeReport({
          id: "toyonaka-report-id",
          location: "豊中",
          newCount: 1,
          semiCount: 2,
          reportedAt: new Date("2026-08-07T09:00:00.000Z"),
          lineMessageId: "toyonaka-message-id",
        }),
      ],
    })
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(transfers).toHaveLength(0)
    expect(transferCreate).not.toHaveBeenCalled()
    expect(replyMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      messages: [
        {
          type: "text",
          text: `⚠️ 移動を登録できませんでした
豊中のニュー残量は1筒です。
残量以下の移動量を入力してください。`,
        },
      ],
    })
  })

  it("同一拠点への移動は保存せず入力例を返信する", async () => {
    const body = JSON.stringify({
      events: [
        makeMessageEvent({
          text: "シャトルを豊中から豊中へ2筒移動しました。",
        }),
      ],
    })
    const { database, transfers, transferCreate } = makeDatabase()
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(transfers).toHaveLength(0)
    expect(transferCreate).not.toHaveBeenCalled()
    expect(replyMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            text: expect.stringContaining("移動を登録できませんでした"),
          }),
        ],
      })
    )
  })

  it("一般会話は保存も返信もしない", async () => {
    const body = JSON.stringify({
      events: [makeMessageEvent({ text: "今日の練習お疲れさまでした。" })],
    })
    const { database, $transaction } = makeDatabase()
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect($transaction).not.toHaveBeenCalled()
    expect(replyMessage).not.toHaveBeenCalled()
  })

  it("残量コマンドで両拠点の最新値と最終報告日時を返信する", async () => {
    const toyonaka = makeReport({
      id: "toyonaka-report-id",
      location: "豊中",
      newCount: 3,
      semiCount: 2.5,
      reportedAt: new Date("2026-08-07T08:30:00.000Z"),
    })
    const suita = makeReport({
      id: "suita-report-id",
      reportedAt: new Date("2026-08-07T09:42:00.000Z"),
    })
    const body = JSON.stringify({
      events: [makeMessageEvent({ text: "残量" })],
    })
    const { database, findFirst, create } = makeDatabase({
      initialReports: [toyonaka, suita],
    })
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(findFirst).toHaveBeenCalledTimes(2)
    expect(create).not.toHaveBeenCalled()
    expect(replyMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      messages: [
        {
          type: "text",
          text: `🏸 現在のシャトル残量

豊中：ニュー3 / セミ2.5
吹田：ニュー2 / セミ3

最終更新：8月7日 18:42`,
        },
      ],
    })
  })

  it("報告がない拠点を報告なしと表示する", async () => {
    const suita = makeReport({
      id: "suita-report-id",
      reportedAt: new Date("2026-08-07T09:42:00.000Z"),
    })
    const body = JSON.stringify({
      events: [makeMessageEvent({ text: "シャトル残量" })],
    })
    const { database } = makeDatabase({ initialReports: [suita] })
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(replyMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            text: expect.stringContaining("豊中：報告なし"),
          }),
        ],
      })
    )
  })

  it.each([
    ["未許可グループ", makeMessageEvent({ groupId: "other-group-id" })],
    ["1対1トーク", makeMessageEvent({ sourceType: "user" })],
  ])("%sからの報告を保存せず返信もしない", async (_label, event) => {
    const body = JSON.stringify({ events: [event] })
    const { database, $transaction } = makeDatabase()
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect($transaction).not.toHaveBeenCalled()
    expect(replyMessage).not.toHaveBeenCalled()
  })

  it("同じwebhookEventIdの再送でReportも返信も重複させない", async () => {
    const body = JSON.stringify({ events: [makeMessageEvent()] })
    const { database, $transaction, create } = makeDatabase()
    const { lineClient, replyMessage } = makeLineClient()
    const dependencies = makeDependencies(database, { lineClient })

    const firstResponse = await handleLineWebhook(
      makeRequest(body),
      dependencies
    )
    const secondResponse = await handleLineWebhook(
      makeRequest(body),
      dependencies
    )

    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(200)
    expect($transaction).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenCalledTimes(1)
    expect(replyMessage).toHaveBeenCalledTimes(1)
  })

  it("購入Webhookの再送で購入記録も返信も重複させない", async () => {
    const body = JSON.stringify({
      events: [
        makeMessageEvent({
          text: "シャトル1箱購入しました。豊中6筒、吹田4筒です。",
        }),
      ],
    })
    const { database, purchases, purchaseCreate } = makeDatabase()
    const { lineClient, replyMessage } = makeLineClient()
    const dependencies = makeDependencies(database, { lineClient })

    const firstResponse = await handleLineWebhook(
      makeRequest(body),
      dependencies
    )
    const secondResponse = await handleLineWebhook(
      makeRequest(body),
      dependencies
    )

    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(200)
    expect(purchases).toHaveLength(1)
    expect(purchaseCreate).toHaveBeenCalledTimes(1)
    expect(replyMessage).toHaveBeenCalledTimes(1)
  })

  it("許可グループのメンバーが引用したLINE報告を削除する", async () => {
    const quotedReport = makeReport({ lineUserId: "original-user-id" })
    const body = JSON.stringify({
      events: [
        makeMessageEvent({
          webhookEventId: "delete-event-id",
          messageId: "delete-command-message-id",
          text: "削除",
          quotedMessageId: "message-id",
        }),
      ],
    })
    const { database, reports, deleteMany } = makeDatabase({
      initialReports: [quotedReport],
    })
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        lineMessageId: "message-id",
        lineGroupId: ALLOWED_GROUP_ID,
      },
    })
    expect(reports).toHaveLength(0)
    expect(replyMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      messages: [
        {
          type: "text",
          text: `✅ 引用したシャトル報告を削除しました

LINE上の元メッセージ自体は削除されません。`,
        },
      ],
    })
  })

  it("最新Reportの引用削除後は次に新しいReportを残量として扱う", async () => {
    const previousReport = makeReport({
      id: "previous-report-id",
      newCount: 5,
      semiCount: 4,
      reportedAt: new Date("2026-08-07T09:00:00.000Z"),
      lineMessageId: "previous-message-id",
    })
    const latestReport = makeReport({
      id: "latest-report-id",
      reportedAt: new Date("2026-08-08T09:00:00.000Z"),
    })
    const { database, reports } = makeDatabase({
      initialReports: [previousReport, latestReport],
    })
    const { lineClient, replyMessage } = makeLineClient()
    const dependencies = makeDependencies(database, { lineClient })
    const deleteBody = JSON.stringify({
      events: [
        makeMessageEvent({
          webhookEventId: "delete-event-id",
          text: "シャトル報告削除",
          quotedMessageId: "message-id",
        }),
      ],
    })
    const statusBody = JSON.stringify({
      events: [
        makeMessageEvent({
          webhookEventId: "status-after-delete-event-id",
          messageId: "status-message-id",
          text: "シャトル残量",
        }),
      ],
    })

    await handleLineWebhook(makeRequest(deleteBody), dependencies)
    await handleLineWebhook(makeRequest(statusBody), dependencies)

    expect(reports).toEqual([previousReport])
    expect(replyMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            text: expect.stringContaining("吹田：ニュー5 / セミ4"),
          }),
        ],
      })
    )
  })

  it("引用元がない削除コマンドではReportを削除せず操作方法を返信する", async () => {
    const report = makeReport()
    const body = JSON.stringify({
      events: [makeMessageEvent({ text: "報告削除" })],
    })
    const { database, reports, deleteMany } = makeDatabase({
      initialReports: [report],
    })
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(deleteMany).not.toHaveBeenCalled()
    expect(reports).toEqual([report])
    expect(replyMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      messages: [
        {
          type: "text",
          text: `⚠️ 削除できませんでした
削除したい報告メッセージにLINEの「リプライ」で
「削除」「報告削除」「シャトル報告削除」のいずれかを送信してください。`,
        },
      ],
    })
  })

  it("別グループのReportを引用しても削除しない", async () => {
    const otherGroupReport = makeReport({ lineGroupId: "other-group-id" })
    const body = JSON.stringify({
      events: [
        makeMessageEvent({
          text: "シャトル報告削除",
          quotedMessageId: "message-id",
        }),
      ],
    })
    const { database, reports } = makeDatabase({
      initialReports: [otherGroupReport],
    })
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(reports).toEqual([otherGroupReport])
    expect(replyMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            text: expect.stringContaining("引用元がLINE報告ではないか"),
          }),
        ],
      })
    )
  })

  it("未許可グループの削除コマンドを処理せず返信もしない", async () => {
    const report = makeReport()
    const body = JSON.stringify({
      events: [
        makeMessageEvent({
          groupId: "other-group-id",
          text: "シャトル報告削除",
          quotedMessageId: "message-id",
        }),
      ],
    })
    const { database, reports, $transaction } = makeDatabase({
      initialReports: [report],
    })
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect($transaction).not.toHaveBeenCalled()
    expect(reports).toEqual([report])
    expect(replyMessage).not.toHaveBeenCalled()
  })

  it("削除コマンドのWebhook再送で削除も返信も重複させない", async () => {
    const body = JSON.stringify({
      events: [
        makeMessageEvent({
          webhookEventId: "delete-event-id",
          text: "シャトル報告削除",
          quotedMessageId: "message-id",
        }),
      ],
    })
    const { database, reports, deleteMany } = makeDatabase({
      initialReports: [makeReport()],
    })
    const { lineClient, replyMessage } = makeLineClient()
    const dependencies = makeDependencies(database, { lineClient })

    const firstResponse = await handleLineWebhook(
      makeRequest(body),
      dependencies
    )
    const secondResponse = await handleLineWebhook(
      makeRequest(body),
      dependencies
    )

    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(200)
    expect(reports).toHaveLength(0)
    expect(deleteMany).toHaveBeenCalledTimes(1)
    expect(replyMessage).toHaveBeenCalledTimes(1)
  })

  it("送信取消イベントで対象グループのReportを削除し、返信しない", async () => {
    const unsentReport = makeReport()
    const body = JSON.stringify({ events: [makeUnsendEvent()] })
    const { database, reports, deleteMany } = makeDatabase({
      initialReports: [unsentReport],
    })
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        lineMessageId: "message-id",
        lineGroupId: ALLOWED_GROUP_ID,
      },
    })
    expect(reports).toHaveLength(0)
    expect(replyMessage).not.toHaveBeenCalled()
  })

  it("購入メッセージの送信取消で対象グループの購入記録を削除する", async () => {
    const body = JSON.stringify({ events: [makeUnsendEvent()] })
    const { database, purchases, purchaseDeleteMany } = makeDatabase({
      initialPurchases: [makePurchase()],
    })
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(purchaseDeleteMany).toHaveBeenCalledWith({
      where: {
        lineMessageId: "message-id",
        lineGroupId: ALLOWED_GROUP_ID,
      },
    })
    expect(purchases).toHaveLength(0)
    expect(replyMessage).not.toHaveBeenCalled()
  })

  it("移動メッセージの送信取消で対象グループの移動記録を削除する", async () => {
    const body = JSON.stringify({ events: [makeUnsendEvent()] })
    const { database, transfers, transferDeleteMany } = makeDatabase({
      initialTransfers: [makeTransfer()],
    })
    const { lineClient, replyMessage } = makeLineClient()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient })
    )

    expect(response.status).toBe(200)
    expect(transferDeleteMany).toHaveBeenCalledWith({
      where: {
        lineMessageId: "message-id",
        lineGroupId: ALLOWED_GROUP_ID,
      },
    })
    expect(transfers).toHaveLength(0)
    expect(replyMessage).not.toHaveBeenCalled()
  })

  it("誤報告の送信取消後に再送した正しいReportだけを残す", async () => {
    const wrongReport = makeReport({ newCount: 20 })
    const { database, reports } = makeDatabase({
      initialReports: [wrongReport],
    })
    const { lineClient } = makeLineClient()
    const dependencies = makeDependencies(database, { lineClient })
    const unsendBody = JSON.stringify({ events: [makeUnsendEvent()] })
    const correctedBody = JSON.stringify({
      events: [
        makeMessageEvent({
          webhookEventId: "corrected-event-id",
          messageId: "corrected-message-id",
          text: "吹田ニュー2セミ3です。",
        }),
      ],
    })

    const unsendResponse = await handleLineWebhook(
      makeRequest(unsendBody),
      dependencies
    )
    const correctedResponse = await handleLineWebhook(
      makeRequest(correctedBody),
      dependencies
    )

    expect(unsendResponse.status).toBe(200)
    expect(correctedResponse.status).toBe(200)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toEqual(
      expect.objectContaining({
        newCount: 2,
        semiCount: 3,
        lineMessageId: "corrected-message-id",
      })
    )
  })

  it("LINE返信に失敗してもReportを維持し、安全なエラーだけを記録する", async () => {
    const replyError = Object.assign(new Error("secret response body"), {
      code: "REPLY_FAILED",
    })
    const body = JSON.stringify({ events: [makeMessageEvent()] })
    const { database, reports } = makeDatabase()
    const { lineClient } = makeLineClient(replyError)
    const logger = { error: vi.fn(), info: vi.fn() }

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient, logger })
    )

    expect(response.status).toBe(200)
    expect(reports).toHaveLength(1)
    expect(logger.error).toHaveBeenCalledWith("LINE reply failed", {
      webhookEventId: "webhook-event-id",
      name: "Error",
      code: "REPLY_FAILED",
    })
  })

  it("DB保存に失敗した場合はHTTP 500を返し、返信しない", async () => {
    const body = JSON.stringify({ events: [makeMessageEvent()] })
    const { database, reports } = makeDatabase({ failReportCreate: true })
    const { lineClient, replyMessage } = makeLineClient()
    const logger = { error: vi.fn(), info: vi.fn() }

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { lineClient, logger })
    )

    expect(response.status).toBe(500)
    expect(reports).toHaveLength(0)
    expect(replyMessage).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      "LINE webhook processing failed",
      { name: "Error" }
    )
  })
})
