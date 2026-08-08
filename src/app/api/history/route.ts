import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(){
    const reports = await prisma.report.findMany({
        orderBy: [
            { reportedAt: "desc" },
            { createdAt: "desc" },
        ]
    })

    return NextResponse.json(reports)
}
