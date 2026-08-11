import { prisma } from "@/lib/prisma"
import Link from "next/link"
export const dynamic = "force-dynamic"
import { Button } from "@/components/ui/button"

type Props = {
    searchParams: Promise<{
        location?: string
    }>
}

export default async function HistoryPage({searchParams}: Props) {
    const {location} = await searchParams
    const reports = await prisma.report.findMany({
        where: location
        ? { location}
        : undefined,
        orderBy: [
            { reportedAt: "desc" },
            { createdAt: "desc" },
        ]
    })
    return (
    <div className="flex flex-col gap-5 m-5">
        <h1 className="text-3xl font-bold">履歴ページ</h1>

        <div>
            <Link href="/"><Button variant="outline">ホームへ戻る</Button></Link>
        </div>
        
        <div>
            <Link href="/history">
                <Button variant="outline">全て</Button>
            </Link>
            <Link href = "/history?location=豊中"><Button variant="outline">豊中</Button></Link>
            <Link href = "/history?location=吹田"><Button variant="outline">吹田</Button></Link>
        </div>

        <div className="flex flex-col gap-5">
            {reports.map((report) => (
                <div key={report.id} className="border w-70 p-2">
                    <p>拠点: {report.location}</p>
                    <p>ニュー: {report.newCount}</p>
                    <p>セミ: {report.semiCount}</p>
                    <p>登録元: {report.source === "LINE" ? "LINE" : "Web"}</p>
                    <p>日時: {report.reportedAt.toLocaleString()}</p>
                    <Link href={`/history/${report.id}/edit`}>
                        <Button variant="outline">編集</Button>
                    </Link>
                </div>
            ))}
        </div>

    </div>
  )
}
