import { messagingApi } from "@line/bot-sdk"
import { handleLineWebhook } from "@/lib/line/webhook"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const allowedGroupId = process.env.LINE_ALLOWED_GROUP_ID

  if (!channelSecret || !channelAccessToken || !allowedGroupId) {
    console.error("LINE webhook configuration is incomplete")
    return new Response(null, { status: 500 })
  }

  const lineClient = new messagingApi.MessagingApiClient({
    channelAccessToken,
  })

  return handleLineWebhook(request, {
    channelSecret,
    allowedGroupId,
    lineClient,
  })
}
