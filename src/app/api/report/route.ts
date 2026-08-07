import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseReportInput } from "@/lib/report-input"

export async function POST(req: NextRequest) {
  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { message: "JSONの形式が正しくありません" },
      { status: 400 }
    )
  }

  const data = parseReportInput(body)

  if (!data) {
    return NextResponse.json(
        { message: "入力内容が正しくありません" },
        { status: 400 }
    )
  }

  try {
    const report = await prisma.report.create({ data })

    return NextResponse.json(report, { status: 201 })
  } catch (error) {
    console.error("Failed to create report:", error)

    return NextResponse.json(
      { message: "報告の登録に失敗しました" },
      { status: 500 }
    )
  }
}
