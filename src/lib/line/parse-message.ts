import {
  isValidReportCount,
  parseReportInput,
  type ReportInput,
} from "../report-input"

export const TUBES_PER_BOX = 10

export type PurchaseMessageData = {
  boxCount: number
  allocations: Array<{
    location: ReportInput["location"]
    tubeCount: number
  }>
}

export type TransferMessageData = {
  fromLocation: ReportInput["location"]
  toLocation: ReportInput["location"]
  tubeCount: number
  semiTubeCount: number
}

export type ParsedLineMessage =
  | { type: "report"; data: ReportInput }
  | { type: "status" }
  | { type: "delete-report" }
  | { type: "purchase"; data: PurchaseMessageData }
  | { type: "transfer"; data: TransferMessageData }
  | { type: "invalid-report" }
  | { type: "invalid-purchase" }
  | { type: "invalid-transfer" }
  | { type: "ignore" }

const REPORT_PATTERN =
  /^(豊中|吹田)[ \t]*ニュー[ \t]*(-?\d+(?:\.\d+)?)[ \t]*セミ[ \t]*(-?\d+(?:\.\d+)?)[ \t]*(?:です)?[。.]?$/

const REPORT_KEYWORDS = ["ニュー", "セミ"]

const PURCHASE_PATTERN =
  /^(?:シャトル[ \t]*)?(\d+)[ \t]*箱[ \t]*購入しました(?:[。. \t]*(.*))?$/

const FULL_TRANSFER_PATTERN =
  /^(?:シャトル[ \t]*を?[ \t]*)?(豊中|吹田)[ \t]*から[ \t]*(豊中|吹田)[ \t]*(?:へ|に)[ \t]*(.+?)[ \t]*移動(?:しました)?[。.]?$/

const DESTINATION_ONLY_TRANSFER_PATTERN =
  /^(?:シャトル[ \t]*を?[ \t]*)?(豊中|吹田)[ \t]*(?:へ|に)[ \t]*(.+?)[ \t]*移動(?:しました)?[。.]?$/

const DELETE_REPORT_COMMANDS = ["シャトル報告削除", "報告削除", "削除"]

function parsePurchaseMessage(message: string): PurchaseMessageData | null {
  const match = message.match(PURCHASE_PATTERN)

  if (!match) {
    return null
  }

  const boxCount = Number(match[1])

  if (!Number.isSafeInteger(boxCount) || boxCount <= 0) {
    return null
  }

  const purchasedTubes = boxCount * TUBES_PER_BOX

  if (!Number.isSafeInteger(purchasedTubes)) {
    return null
  }

  const allocationText = (match[2] ?? "")
    .trim()
    .replace(/[。.]+$/, "")
    .replace(/です$/, "")
    .replace(/[ \t]/g, "")

  if (allocationText.length === 0) {
    return {
      boxCount,
      allocations: [{ location: "豊中", tubeCount: purchasedTubes }],
    }
  }

  const compactAllocationText = allocationText.replace(/[、,\/／・]/g, "")
  const locationlessAllocation = compactAllocationText.match(/^(\d+)(?:筒)?$/)

  if (locationlessAllocation) {
    const tubeCount = Number(locationlessAllocation[1])

    if (
      !Number.isSafeInteger(tubeCount) ||
      tubeCount !== purchasedTubes
    ) {
      return null
    }

    return {
      boxCount,
      allocations: [{ location: "豊中", tubeCount }],
    }
  }

  const allocationMatches = [
    ...compactAllocationText.matchAll(/(豊中|吹田)(\d+)(?:筒)?/g),
  ]

  if (
    allocationMatches.length === 0 ||
    allocationMatches.map((allocation) => allocation[0]).join("") !==
      compactAllocationText
  ) {
    return null
  }

  const allocations: PurchaseMessageData["allocations"] = []
  const specifiedLocations = new Set<ReportInput["location"]>()

  for (const allocationMatch of allocationMatches) {
    const location = allocationMatch[1] as ReportInput["location"]
    const tubeCount = Number(allocationMatch[2])

    if (
      specifiedLocations.has(location) ||
      !Number.isSafeInteger(tubeCount) ||
      tubeCount <= 0
    ) {
      return null
    }

    specifiedLocations.add(location)
    allocations.push({ location, tubeCount })
  }

  const allocatedTubes = allocations.reduce(
    (total, allocation) => total + allocation.tubeCount,
    0
  )

  if (
    !Number.isSafeInteger(allocatedTubes) ||
    allocatedTubes !== purchasedTubes
  ) {
    return null
  }

  return { boxCount, allocations }
}

function parseTransferCounts(
  value: string
): Pick<TransferMessageData, "tubeCount" | "semiTubeCount"> | null {
  const compactValue = value.replace(/[ \t、,\/／・と]/g, "")
  const unlabeledMatch = compactValue.match(/^(-?\d+(?:\.\d+)?)(?:筒)?$/)

  if (unlabeledMatch) {
    const tubeCount = Number(unlabeledMatch[1])

    return isValidReportCount(tubeCount) && tubeCount > 0
      ? { tubeCount, semiTubeCount: 0 }
      : null
  }

  const countMatches = [
    ...compactValue.matchAll(
      /(ニュー|セミ)を?(-?\d+(?:\.\d+)?)(?:筒)?/g
    ),
  ]

  if (
    countMatches.length === 0 ||
    countMatches.map((countMatch) => countMatch[0]).join("") !== compactValue
  ) {
    return null
  }

  let tubeCount = 0
  let semiTubeCount = 0
  const specifiedTypes = new Set<string>()

  for (const countMatch of countMatches) {
    const type = countMatch[1]
    const count = Number(countMatch[2])

    if (
      specifiedTypes.has(type) ||
      !isValidReportCount(count) ||
      count === 0
    ) {
      return null
    }

    specifiedTypes.add(type)

    if (type === "セミ") {
      semiTubeCount = count
    } else {
      tubeCount = count
    }
  }

  return { tubeCount, semiTubeCount }
}

function parseTransferMessage(message: string): TransferMessageData | null {
  const fullMatch = message.match(FULL_TRANSFER_PATTERN)

  if (fullMatch) {
    const counts = parseTransferCounts(fullMatch[3])

    if (!counts) {
      return null
    }

    return validateTransferMessage({
      fromLocation: fullMatch[1] as ReportInput["location"],
      toLocation: fullMatch[2] as ReportInput["location"],
      ...counts,
    })
  }

  const destinationOnlyMatch = message.match(DESTINATION_ONLY_TRANSFER_PATTERN)

  if (!destinationOnlyMatch) {
    return null
  }

  const toLocation = destinationOnlyMatch[1] as ReportInput["location"]
  const counts = parseTransferCounts(destinationOnlyMatch[2])

  if (!counts) {
    return null
  }

  return validateTransferMessage({
    fromLocation: toLocation === "豊中" ? "吹田" : "豊中",
    toLocation,
    ...counts,
  })
}

function validateTransferMessage({
  fromLocation,
  toLocation,
  tubeCount,
  semiTubeCount,
}: TransferMessageData): TransferMessageData | null {

  if (
    fromLocation === toLocation ||
    (tubeCount === 0 && semiTubeCount === 0)
  ) {
    return null
  }

  return { fromLocation, toLocation, tubeCount, semiTubeCount }
}

export function parseLineMessage(message: string): ParsedLineMessage {
  const normalizedMessage = message.normalize("NFKC").trim()

  if (
    normalizedMessage === "シャトル残量" ||
    normalizedMessage === "残量"
  ) {
    return { type: "status" }
  }

  if (DELETE_REPORT_COMMANDS.includes(normalizedMessage)) {
    return { type: "delete-report" }
  }

  const purchase = parsePurchaseMessage(normalizedMessage)

  if (purchase) {
    return { type: "purchase", data: purchase }
  }

  if (
    (normalizedMessage.includes("シャトル") ||
      normalizedMessage.includes("箱")) &&
    normalizedMessage.includes("購入")
  ) {
    return { type: "invalid-purchase" }
  }

  const transfer = parseTransferMessage(normalizedMessage)

  if (transfer) {
    return { type: "transfer", data: transfer }
  }

  if (
    (normalizedMessage.includes("豊中") ||
      normalizedMessage.includes("吹田")) &&
    normalizedMessage.includes("移動")
  ) {
    return { type: "invalid-transfer" }
  }

  const match = normalizedMessage.match(REPORT_PATTERN)

  if (match) {
    const data = parseReportInput({
      location: match[1],
      newCount: Number(match[2]),
      semiCount: Number(match[3]),
    })

    if (data) {
      return { type: "report", data }
    }
  }

  if (REPORT_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword))) {
    return { type: "invalid-report" }
  }

  return { type: "ignore" }
}
