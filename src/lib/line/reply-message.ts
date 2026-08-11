import type {
  CurrentInventory,
  InventoryLocation,
  InventorySnapshot,
} from "../inventory-service"
import type { CreateReportResult } from "../report-service"
import {
  TUBES_PER_BOX,
  type PurchaseMessageData,
  type TransferMessageData,
} from "./parse-message"

const INVALID_REPORT_REPLY = `⚠️ 登録できませんでした
「吹田ニュー2セミ3です。」の形式で送信してください。
数値は0.5刻みで入力できます。`

const DELETE_REPORT_WITHOUT_QUOTE_REPLY = `⚠️ 削除できませんでした
削除したい報告メッセージにLINEの「リプライ」で
「削除」「報告削除」「シャトル報告削除」のいずれかを送信してください。`

const DELETE_REPORT_NOT_FOUND_REPLY = `⚠️ 削除できませんでした
引用元がLINE報告ではないか、すでに削除されています。`

const DELETE_REPORT_SUCCEEDED_REPLY = `✅ 引用したシャトル報告を削除しました

LINE上の元メッセージ自体は削除されません。`

const INVALID_PURCHASE_REPLY = `⚠️ 購入を登録できませんでした
「シャトル1箱購入しました。豊中6筒、吹田4筒です。」の形式で送信してください。
1箱は10筒で、配分の合計を購入した筒数と一致させてください。`

const INVALID_TRANSFER_REPLY = `⚠️ 移動を登録できませんでした
「豊中から吹田へニュー2筒セミ1筒移動」の形式で送信してください。
ニュー・セミの片方だけでも入力でき、種類を省略した場合はニューとして扱います。
移動量は0より大きい0.5筒刻みで入力できます。`

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

function formatLocationStatus(
  location: InventoryLocation,
  inventory: InventorySnapshot
) {
  if (!inventory.updatedAt) {
    return `${location}：報告なし`
  }

  return `${location}：ニュー${formatCount(inventory.newCount)} / セミ${formatCount(inventory.semiCount)}`
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

export function formatDeleteReportWithoutQuoteReply() {
  return DELETE_REPORT_WITHOUT_QUOTE_REPLY
}

export function formatDeleteReportNotFoundReply() {
  return DELETE_REPORT_NOT_FOUND_REPLY
}

export function formatDeleteReportSucceededReply() {
  return DELETE_REPORT_SUCCEEDED_REPLY
}

export function formatPurchaseReply({
  boxCount,
  allocations,
}: PurchaseMessageData) {
  const totalTubes = boxCount * TUBES_PER_BOX
  const allocationLines = allocations
    .map(
      ({ location, tubeCount }) =>
        `${location}：${formatCount(tubeCount)}筒`
    )
    .join("\n")

  return `✅ シャトル購入を登録しました

${boxCount}箱（${totalTubes}筒）
${allocationLines}`
}

export function formatInvalidPurchaseReply() {
  return INVALID_PURCHASE_REPLY
}

export function formatTransferReply({
  fromLocation,
  toLocation,
  tubeCount,
  semiTubeCount,
}: TransferMessageData) {
  const countLines = [
    tubeCount > 0 ? `ニュー：${formatCount(tubeCount)}筒` : null,
    semiTubeCount > 0 ? `セミ：${formatCount(semiTubeCount)}筒` : null,
  ].filter((line): line is string => line !== null)

  return `✅ シャトル移動を登録しました

${fromLocation} → ${toLocation}
${countLines.join("\n")}`
}

export function formatInvalidTransferReply() {
  return INVALID_TRANSFER_REPLY
}

export function formatInsufficientTransferReply({
  location,
  availableInventory,
  requestedTransfer,
}: {
  location: InventoryLocation
  availableInventory: InventorySnapshot
  requestedTransfer: TransferMessageData
}) {
  const shortageLines = [
    requestedTransfer.tubeCount > availableInventory.newCount
      ? `${location}のニュー残量は${formatCount(availableInventory.newCount)}筒です。`
      : null,
    requestedTransfer.semiTubeCount > availableInventory.semiCount
      ? `${location}のセミ残量は${formatCount(availableInventory.semiCount)}筒です。`
      : null,
  ].filter((line): line is string => line !== null)

  return `⚠️ 移動を登録できませんでした
${shortageLines.join("\n")}
残量以下の移動量を入力してください。`
}

export function formatStatusReply(inventory: CurrentInventory) {
  const latestUpdatedAt = Object.values(inventory)
    .map((snapshot) => snapshot.updatedAt)
    .filter((updatedAt): updatedAt is Date => updatedAt !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0]
  const formattedUpdatedAt = latestUpdatedAt
    ? formatReportedAt(latestUpdatedAt)
    : "報告なし"

  return `🏸 現在のシャトル残量\n\n${formatLocationStatus("豊中", inventory["豊中"])}\n${formatLocationStatus("吹田", inventory["吹田"])}\n\n最終更新：${formattedUpdatedAt}`
}
