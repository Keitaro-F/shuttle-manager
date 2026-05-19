import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"

export default async function Home() {
  const locations = ["豊中", "吹田"]
  const reports = await Promise.all(
    locations.map((location) => {
        return prisma.report.findFirst({
            where: {location},
            orderBy: { createdAt: "desc"}
        })
    })
  )
  return(
    <div className="min-h-screen flex flex-col items-center justify-center gap-10">
      <h1 className="text-4xl font-bold">
          シャトル管理システム
      </h1>

      <div className="flex gap-10">
        {reports.map((report, index) => (
          <div key={index} className="border rounded-xl p-8 shadow-md w-56 text-center">
            <h2 className="text-2xl font-bold">{report!.location}</h2>
            <div className="space-y-2">
            <p className="text-xl">ニュー</p>
            <p className="text-3xl">{report!.newCount}</p>
            <p className="text-xl">セミ</p>
            <p className="text-3xl">{report!.semiCount}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 w-48">
        <Link
          href="/report"
        >
          <Button className="w-full">シャトル報告</Button>
        </Link>

        <Link href="/history">
          <Button variant="outline" className="w-full">履歴</Button>
        </Link>

      </div>
    </div>
  )
}