import { parseReportInput, type ReportInput } from "../report-input"

export type ParsedLineMessage =
  | { type: "report"; data: ReportInput }
  | { type: "status" }
  | { type: "invalid-report" }
  | { type: "ignore" }

const REPORT_PATTERN =
  /^(豊中|吹田)[ \t]*ニュー[ \t]*(-?\d+(?:\.\d+)?)[ \t]*セミ[ \t]*(-?\d+(?:\.\d+)?)[ \t]*(?:です)?[。.]?$/

const REPORT_KEYWORDS = ["ニュー", "セミ"]

export function parseLineMessage(message: string): ParsedLineMessage {
  const normalizedMessage = message.normalize("NFKC").trim()

  if (normalizedMessage === "シャトル残量") {
    return { type: "status" }
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
