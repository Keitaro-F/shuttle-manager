import type { PrismaClient } from "@prisma/client"
import { messagingApi, validateSignature, type webhook } from "@line/bot-sdk"
import { getCurrentInventory } from "../inventory-service"
import { prisma } from "../prisma"
import { createReport, ReportSource } from "../report-service"
import { parseLineMessage, TUBES_PER_BOX } from "./parse-message"
import {
  formatDeleteReportNotFoundReply,
  formatDeleteReportSucceededReply,
  formatDeleteReportWithoutQuoteReply,
  formatInvalidReportReply,
  formatInvalidPurchaseReply,
  formatInvalidTransferReply,
  formatInsufficientTransferReply,
  formatPurchaseReply,
  formatReportReply,
  formatStatusReply,
  formatTransferReply,
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

      await transaction.purchase.deleteMany({
        where: {
          lineMessageId: event.unsend.messageId,
          lineGroupId: source.groupId,
        },
      })

      await transaction.shuttleTransfer.deleteMany({
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

    if (parsedMessage.type === "invalid-purchase") {
      return formatInvalidPurchaseReply()
    }

    if (parsedMessage.type === "invalid-transfer") {
      return formatInvalidTransferReply()
    }

    if (parsedMessage.type === "status") {
      const inventory = await getCurrentInventory(transaction)

      return formatStatusReply(inventory)
    }

    if (parsedMessage.type === "delete-report") {
      if (!message.quotedMessageId) {
        return formatDeleteReportWithoutQuoteReply()
      }

      const result = await transaction.report.deleteMany({
        where: {
          lineMessageId: message.quotedMessageId,
          lineGroupId: source.groupId,
        },
      })

      return result.count === 1
        ? formatDeleteReportSucceededReply()
        : formatDeleteReportNotFoundReply()
    }

    if (parsedMessage.type === "purchase") {
      await transaction.purchase.create({
        data: {
          boxCount: parsedMessage.data.boxCount,
          tubesPerBox: TUBES_PER_BOX,
          purchasedAt: new Date(event.timestamp),
          lineMessageId: message.id,
          lineGroupId: source.groupId,
          lineUserId: source.userId ?? null,
          originalMessage: message.text,
          allocations: {
            create: parsedMessage.data.allocations,
          },
        },
      })

      const inventory = await getCurrentInventory(transaction)

      return `${formatPurchaseReply(parsedMessage.data)}\n\n${formatStatusReply(inventory)}`
    }

    if (parsedMessage.type === "transfer") {
      const inventoryBeforeTransfer = await getCurrentInventory(transaction)
      const sourceInventory =
        inventoryBeforeTransfer[parsedMessage.data.fromLocation]

      if (sourceInventory.newCount < parsedMessage.data.tubeCount) {
        return formatInsufficientTransferReply({
          location: parsedMessage.data.fromLocation,
          availableCount: sourceInventory.newCount,
        })
      }

      await transaction.shuttleTransfer.create({
        data: {
          ...parsedMessage.data,
          transferredAt: new Date(event.timestamp),
          lineMessageId: message.id,
          lineGroupId: source.groupId,
          lineUserId: source.userId ?? null,
          originalMessage: message.text,
        },
      })

      const inventory = await getCurrentInventory(transaction)

      return `${formatTransferReply(parsedMessage.data)}\n\n${formatStatusReply(inventory)}`
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

    const inventory = await getCurrentInventory(transaction)

    return `${formatReportReply(result)}\n\n${formatStatusReply(inventory)}`
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
