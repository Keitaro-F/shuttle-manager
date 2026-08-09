import { handleLineWebhook } from "@/lib/line/webhook"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET
  const allowedGroupId = process.env.LINE_ALLOWED_GROUP_ID

  if (!channelSecret || !allowedGroupId) {
    console.error("LINE webhook configuration is incomplete")
    return new Response(null, { status: 500 })
  }

  return handleLineWebhook(request, { channelSecret, allowedGroupId })
}
