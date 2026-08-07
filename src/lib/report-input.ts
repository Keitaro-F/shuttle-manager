export const LOCATIONS = ["豊中", "吹田"] as const

export type ReportInput = {
  location: (typeof LOCATIONS)[number]
  newCount: number
  semiCount: number
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

  if (
    typeof newCount !== "number" ||
    !Number.isFinite(newCount) ||
    newCount < 0 ||
    !Number.isInteger(newCount * 2)
  ) {
    return null
  }

  if (
    typeof semiCount !== "number" ||
    !Number.isFinite(semiCount) ||
    semiCount < 0 ||
    !Number.isInteger(semiCount * 2)
  ) {
    return null
  }

  return {
    location: location as ReportInput["location"],
    newCount,
    semiCount,
  }
}