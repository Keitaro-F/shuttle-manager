import { createHmac } from "node:crypto"
import { ReportSource, type Report } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"
import {
  handleLineWebhook,
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
  text = "吹田ニュー2セミ3です。",
}: {
  groupId?: string
  sourceType?: "group" | "user"
  webhookEventId?: string
  text?: string
} = {}) {
  return {
    type: "message",
    mode: "active",
    timestamp: Date.parse("2026-08-08T09:00:00.000Z"),
    webhookEventId,
    deliveryContext: { isRedelivery: false },
    source:
      sourceType === "group"
        ? { type: "group", groupId, userId: "user-id" }
        : { type: "user", userId: "user-id" },
    message: {
      type: "text",
      id: "message-id",
      text,
      quoteToken: "quote-token",
    },
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

function makeDatabase({ failReportCreate = false } = {}) {
  const receipts = new Set<string>()
  const findFirst = vi.fn().mockResolvedValue(null)
  const create = failReportCreate
    ? vi.fn().mockRejectedValue(new Error("database unavailable"))
    : vi.fn().mockResolvedValue(makeReport())
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
    report: { findFirst, create },
  }
  const $transaction = vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction)
  )

  return {
    database: {
      $transaction,
    } as unknown as NonNullable<LineWebhookDependencies["database"]>,
    $transaction,
    createMany,
    findFirst,
    create,
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
    logger: { error: vi.fn() },
    ...overrides,
  }
}

describe("handleLineWebhook", () => {
  it("正しい署名の空イベント配列へHTTP 200を返す", async () => {
    const body = JSON.stringify({ destination: "bot-user-id", events: [] })
    const { database, $transaction } = makeDatabase()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database)
    )

    expect(response.status).toBe(200)
    expect($transaction).not.toHaveBeenCalled()
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

  it("許可グループの報告を受付記録と同じtransactionで保存する", async () => {
    const body = JSON.stringify({ events: [makeMessageEvent()] })
    const { database, $transaction, createMany, findFirst, create } =
      makeDatabase()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database)
    )

    expect(response.status).toBe(200)
    expect($transaction).toHaveBeenCalledTimes(1)
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
  })

  it.each([
    ["未許可グループ", makeMessageEvent({ groupId: "other-group-id" })],
    ["1対1トーク", makeMessageEvent({ sourceType: "user" })],
  ])("%sからの報告を保存しない", async (_label, event) => {
    const body = JSON.stringify({ events: [event] })
    const { database, $transaction } = makeDatabase()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database)
    )

    expect(response.status).toBe(200)
    expect($transaction).not.toHaveBeenCalled()
  })

  it("同じwebhookEventIdの再送でReportを二重登録しない", async () => {
    const body = JSON.stringify({ events: [makeMessageEvent()] })
    const { database, $transaction, create } = makeDatabase()
    const dependencies = makeDependencies(database)

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
  })

  it("一般会話と不正な報告をフェーズ5では保存しない", async () => {
    const body = JSON.stringify({
      events: [
        makeMessageEvent({
          webhookEventId: "conversation-event-id",
          text: "今日の練習お疲れさまでした。",
        }),
        makeMessageEvent({
          webhookEventId: "invalid-report-event-id",
          text: "吹田ニュー2です。",
        }),
      ],
    })
    const { database, $transaction } = makeDatabase()

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database)
    )

    expect(response.status).toBe(200)
    expect($transaction).not.toHaveBeenCalled()
  })

  it("DB保存に失敗した場合はHTTP 500を返す", async () => {
    const body = JSON.stringify({ events: [makeMessageEvent()] })
    const { database } = makeDatabase({ failReportCreate: true })
    const logger = { error: vi.fn() }

    const response = await handleLineWebhook(
      makeRequest(body),
      makeDependencies(database, { logger })
    )

    expect(response.status).toBe(500)
    expect(logger.error).toHaveBeenCalledWith(
      "LINE webhook processing failed",
      { name: "Error" }
    )
  })
})
