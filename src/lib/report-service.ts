import {
  Prisma,
  ReportSource,
  type Report,
} from "@prisma/client"
import { getCurrentInventory } from "./inventory-service"
import { prisma } from "./prisma"
import type { ReportInput } from "./report-input"

type ReportDatabase = Pick<
  Prisma.TransactionClient,
  "report" | "purchaseAllocation" | "shuttleTransfer"
>

type CreateWebReportInput = ReportInput & {
  source: typeof ReportSource.WEB
  reportedAt?: Date
  lineMessageId?: never
  lineGroupId?: never
  lineUserId?: never
  originalMessage?: never
}

type CreateLineReportInput = ReportInput & {
  source: typeof ReportSource.LINE
  reportedAt: Date
  lineMessageId: string
  lineGroupId: string
  lineUserId?: string | null
  originalMessage: string
}

export type CreateReportInput = CreateWebReportInput | CreateLineReportInput

export type ReportDifference = {
  newCount: number
  semiCount: number
}

export type CreateReportResult = {
  report: Report
  previousReport: Report | null
  difference: ReportDifference | null
}

export async function findLatestReport(
  location: ReportInput["location"],
  database: ReportDatabase = prisma,
  asOf?: Date
) {
  return database.report.findFirst({
    where: {
      location,
      ...(asOf ? { reportedAt: { lte: asOf } } : {}),
    },
    orderBy: [
      { reportedAt: "desc" },
      { createdAt: "desc" },
    ],
  })
}

async function createReportWithDatabase(
  input: CreateReportInput,
  database: ReportDatabase
): Promise<CreateReportResult> {
  const reportedAt = input.reportedAt ?? new Date()
  const [previousReport, inventoryBeforeReport] = await Promise.all([
    findLatestReport(input.location, database, reportedAt),
    getCurrentInventory(database, { asOf: reportedAt }),
  ])
  const report = await database.report.create({
    data: {
      location: input.location,
      newCount: input.newCount,
      semiCount: input.semiCount,
      source: input.source,
      reportedAt,
      lineMessageId: input.lineMessageId,
      lineGroupId: input.lineGroupId,
      lineUserId: input.lineUserId,
      originalMessage: input.originalMessage,
    },
  })

  return {
    report,
    previousReport,
    difference: previousReport
      ? {
          newCount:
            report.newCount - inventoryBeforeReport[input.location].newCount,
          semiCount:
            report.semiCount - inventoryBeforeReport[input.location].semiCount,
        }
      : null,
  }
}

export async function createReport(
  input: CreateReportInput,
  database?: ReportDatabase
): Promise<CreateReportResult> {
  if (database) {
    return createReportWithDatabase(input, database)
  }

  return prisma.$transaction((transaction) =>
    createReportWithDatabase(input, transaction)
  )
}

export { ReportSource }
