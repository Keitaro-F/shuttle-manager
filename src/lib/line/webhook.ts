import type { PrismaClient } from "@prisma/client"
import { messagingApi, validateSignature, type webhook } from "@line/bot-sdk"
import { prisma } from "../prisma"
import {
  createReport,
  findLatestReport,
  ReportSource,
} from "../report-service"
import { parseLineMessage } from "./parse-message"
import {
  formatInvalidReportReply,
  formatReportReply,
  formatStatusReply,
} from "./reply-message"

type WebhookDatabase = Pick<PrismaClient, "$transaction">
type LineReplyClient = Pick<messagingApi.MessagingApiClient, "replyMessage">

type WebhookLogger = Pick<Console, "error" | "info">

export const LINE_GROUP_ID_DISCOVERY_VALUE = "discover"

export type LineWebhookDependencies = {
  channelSecret: string
  allowedGroupId: string
  lineClient: LineReplyClient
  database?: WebhookDatabase
  logger?: WebhookLogger
}

function parseWebhookBody(rawBody: string): webhook.CallbackRequest | null {
  try {
    const parsed: unknown = JSON.parse(rawBody)

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("events" in parsed) ||
      !Array.isArray(parsed.events)
    ) {
      return null
    }

    return parsed as webhook.CallbackRequest
  } catch {
    return null
  }
}

function getSafeErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { name: "UnknownError" }
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined

  return code ? { name: error.name, code } : { name: error.name }
}

function logDiscoveredGroupIds(
  events: webhook.Event[],
  logger: WebhookLogger
) {
  const groupIds = new Set(
    events.flatMap((event) =>
      event.source?.type === "group" ? [event.source.groupId] : []
    )
  )

  for (const groupId of groupIds) {
    logger.info("LINE group ID discovered", { groupId })
  }
}

async function processEvent(
  event: webhook.Event,
  allowedGroupId: string,
  database: WebhookDatabase
): Promise<string | null> {
  if (
    event.source?.type !== "group" ||
    event.source.groupId !== allowedGroupId
  ) {
    return null
  }

  const source = event.source

  if (event.type === "unsend") {
    await database.$transaction(async (transaction) => {
      const receipt = await transaction.webhookReceipt.createMany({
        data: { webhookEventId: event.webhookEventId },
        skipDuplicates: true,
      })

      if (receipt.count === 0) {
        return
      }

      await transaction.report.deleteMany({
        where: {
          lineMessageId: event.unsend.messageId,
          lineGroupId: source.groupId,
        },
      })
    })

    return null
  }

  if (event.type !== "message" || event.message.type !== "text") {
    return null
  }

  const message = event.message
  const parsedMessage = parseLineMessage(message.text)

  if (parsedMessage.type === "ignore") {
    return null
  }

  return database.$transaction(async (transaction) => {
    const receipt = await transaction.webhookReceipt.createMany({
      data: { webhookEventId: event.webhookEventId },
      skipDuplicates: true,
    })

    if (receipt.count === 0) {
      return null
    }

    if (parsedMessage.type === "invalid-report") {
      return formatInvalidReportReply()
    }

    if (parsedMessage.type === "status") {
      const toyonaka = await findLatestReport("豊中", transaction)
      const suita = await findLatestReport("吹田", transaction)

      return formatStatusReply({ toyonaka, suita })
    }

    const result = await createReport(
      {
        ...parsedMessage.data,
        source: ReportSource.LINE,
        reportedAt: new Date(event.timestamp),
        lineMessageId: message.id,
        lineGroupId: source.groupId,
        lineUserId: source.userId ?? null,
        originalMessage: message.text,
      },
      transaction
    )

    return formatReportReply(result)
  })
}

export async function handleLineWebhook(
  request: Request,
  {
    channelSecret,
    allowedGroupId,
    lineClient,
    database = prisma,
    logger = console,
  }: LineWebhookDependencies
): Promise<Response> {
  const rawBody = await request.text()
  const signature = request.headers.get("x-line-signature")

  if (
    !signature ||
    !validateSignature(rawBody, channelSecret, signature)
  ) {
    return new Response(null, { status: 401 })
  }

  const webhookBody = parseWebhookBody(rawBody)

  if (!webhookBody) {
    return new Response(null, { status: 400 })
  }

  if (allowedGroupId === LINE_GROUP_ID_DISCOVERY_VALUE) {
    logDiscoveredGroupIds(webhookBody.events, logger)
    return new Response(null, { status: 200 })
  }

  try {
    for (const event of webhookBody.events) {
      const replyText = await processEvent(event, allowedGroupId, database)

      if (!replyText) {
        continue
      }

      if (event.type !== "message" || !event.replyToken) {
        logger.error("LINE reply skipped", {
          webhookEventId: event.webhookEventId,
          reason: "missing_reply_token",
        })
        continue
      }

      try {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: "text", text: replyText }],
        })
      } catch (error) {
        logger.error("LINE reply failed", {
          webhookEventId: event.webhookEventId,
          ...getSafeErrorDetails(error),
        })
      }
    }
  } catch (error) {
    logger.error(
      "LINE webhook processing failed",
      getSafeErrorDetails(error)
    )
    return new Response(null, { status: 500 })
  }

  return new Response(null, { status: 200 })
}
