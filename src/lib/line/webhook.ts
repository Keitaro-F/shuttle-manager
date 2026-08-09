import type { PrismaClient } from "@prisma/client"
import { validateSignature, type webhook } from "@line/bot-sdk"
import { prisma } from "../prisma"
import { createReport, ReportSource } from "../report-service"
import { parseLineMessage } from "./parse-message"

type WebhookDatabase = Pick<PrismaClient, "$transaction">

type ErrorLogger = Pick<Console, "error">

export type LineWebhookDependencies = {
  channelSecret: string
  allowedGroupId: string
  database?: WebhookDatabase
  logger?: ErrorLogger
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

async function processEvent(
  event: webhook.Event,
  allowedGroupId: string,
  database: WebhookDatabase
) {
  if (
    event.type !== "message" ||
    event.message.type !== "text" ||
    event.source?.type !== "group" ||
    event.source.groupId !== allowedGroupId
  ) {
    return
  }

  const message = event.message
  const source = event.source
  const parsedMessage = parseLineMessage(message.text)

  if (parsedMessage.type !== "report") {
    return
  }

  await database.$transaction(async (transaction) => {
    const receipt = await transaction.webhookReceipt.createMany({
      data: { webhookEventId: event.webhookEventId },
      skipDuplicates: true,
    })

    if (receipt.count === 0) {
      return
    }

    await createReport(
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
  })
}

export async function handleLineWebhook(
  request: Request,
  {
    channelSecret,
    allowedGroupId,
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

  try {
    for (const event of webhookBody.events) {
      await processEvent(event, allowedGroupId, database)
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
