import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
    try {
        const data = await req.json()
        const report = await prisma.report.create({
            data: data
        })
        console.log(report)

        return NextResponse.json(report)


    } catch (error) {
        console.error(error)
    }
}


