import type { Report } from "@prisma/client"
import type { CreateReportResult } from "../report-service"

const INVALID_REPORT_REPLY = `⚠️ 登録できませんでした
「吹田ニュー2セミ3です。」の形式で送信してください。
数値は0.5刻みで入力できます。`

function formatCount(value: number) {
  return Object.is(value, -0) ? "0" : String(value)
}

function formatDifference(value: number) {
  const normalizedValue = Object.is(value, -0) ? 0 : value
  const sign = normalizedValue >= 0 ? "+" : ""

  return `${sign}${formatCount(normalizedValue)}`
}

function formatReportedAt(reportedAt: Date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(reportedAt)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return `${values.month}月${values.day}日 ${values.hour}:${values.minute}`
}

function formatLocationStatus(location: "豊中" | "吹田", report: Report | null) {
  if (!report) {
    return `${location}：報告なし`
  }

  return `${location}：ニュー${formatCount(report.newCount)} / セミ${formatCount(report.semiCount)}`
}

export function formatReportReply({ report, difference }: CreateReportResult) {
  const header = `✅ ${report.location}の残量を登録しました`
  const counts = `ニュー：${formatCount(report.newCount)}筒\nセミ：${formatCount(report.semiCount)}筒`

  if (!difference) {
    return `${header}\n\n${counts}\n\nこの拠点では最初の報告です。`
  }

  return `${header}\n\n今回\n${counts}\n\n前回比\nニュー：${formatDifference(difference.newCount)}筒\nセミ：${formatDifference(difference.semiCount)}筒`
}

export function formatInvalidReportReply() {
  return INVALID_REPORT_REPLY
}

export function formatStatusReply({
  toyonaka,
  suita,
}: {
  toyonaka: Report | null
  suita: Report | null
}) {
  const latestReport = [toyonaka, suita]
    .filter((report): report is Report => report !== null)
    .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime())[0]
  const latestReportedAt = latestReport
    ? formatReportedAt(latestReport.reportedAt)
    : "報告なし"

  return `🏸 現在のシャトル残量\n\n${formatLocationStatus("豊中", toyonaka)}\n${formatLocationStatus("吹田", suita)}\n\n最終報告：${latestReportedAt}`
}
