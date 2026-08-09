export const LOCATIONS = ["豊中", "吹田"] as const

export type ReportInput = {
  location: (typeof LOCATIONS)[number]
  newCount: number
  semiCount: number
}

export function isValidReportCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isInteger(value * 2)
  )
}

export function parseReportInput(value: unknown): ReportInput | null {
  if (typeof value !== "object" || value === null) {
    return null
  }

  const data = value as Record<string, unknown>
  const { location, newCount, semiCount } = data

  if (
    typeof location !== "string" ||
    !LOCATIONS.includes(location as ReportInput["location"])
  ) {
    return null
  }

  if (!isValidReportCount(newCount)) {
    return null
  }

  if (!isValidReportCount(semiCount)) {
    return null
  }

  return {
    location: location as ReportInput["location"],
    newCount,
    semiCount,
  }
}
