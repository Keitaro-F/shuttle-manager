import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { parseReportInput } from "@/lib/report-input"

type Context = {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params

  const report = await prisma.report.findUnique({
    where: { id },
  })

  if (!report) {
    return NextResponse.json(
      { message: "報告が見つかりません" },
      { status: 404 }
    )
  }

  return NextResponse.json(report)
}

export async function PUT(req: NextRequest, { params }: Context) {
  const { id } = await params

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
    const report = await prisma.report.update({
      where: { id },
      data,
    })

    return NextResponse.json(report)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { message: "報告が見つかりません" },
        { status: 404 }
      )
    }

    console.error("Failed to update report:", error)

    return NextResponse.json(
      { message: "報告の更新に失敗しました" },
      { status: 500 }
    )
  }
}