import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(){
    const reports = await prisma.report.findMany({
        orderBy: {
            createdAt: "desc"
        }
    })

    return NextResponse.json(reports)
}

export async function PUT(req: NextRequest){
    
}