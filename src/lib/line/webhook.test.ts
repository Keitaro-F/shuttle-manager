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
}: {
  groupId?: string
  sourceType?: "group" | "user"
  webhookEventId?: string
  messageId?: string
  replyToken?: string
  text?: string
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

function makeDatabase({
  failReportCreate = false,
  initialReports = [],
}: {
  failReportCreate?: boolean
  initialReports?: Report[]
} = {}) {
  const receipts = new Set<string>()
  const reports = [...initialReports]
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
  }
  const $transaction = vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) => {
      const receiptSnapshot = new Set(receipts)
      const reportSnapshot = [...reports]

      try {
        return await callback(transaction)
      } catch (error) {
        receipts.clear()
        receiptSnapshot.forEach((receipt) => receipts.add(receipt))
        reports.splice(0, reports.length, ...reportSnapshot)
        throw error
      }
    }
  )

  return {
    database: {
      $transaction,
    } as unknown as NonNullable<LineWebhookDependencies["database"]>,
    reports,
    $transaction,
    createMany,
    findFirst,
    create,
    deleteMany,
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
セミ：+0.5筒`,
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

この拠点では最初の報告です。`,
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

  it("シャトル残量コマンドで両拠点の最新値と最終報告日時を返信する", async () => {
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
      events: [makeMessageEvent({ text: "シャトル残量" })],
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

最終報告：8月7日 18:42`,
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
