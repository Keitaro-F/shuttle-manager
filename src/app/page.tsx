import { Button } from "@/components/ui/button"
import { NavigationLink } from "@/components/navigation-link"
import { getCurrentInventory } from "@/lib/inventory-service"

export const dynamic = "force-dynamic"

export default async function Home() {
  const locations = ["豊中", "吹田"] as const
  const inventory = await getCurrentInventory()

  return(
    <div className="min-h-screen flex flex-col items-center justify-center gap-10">
      <h1 className="text-4xl font-bold">
          シャトル管理システム
      </h1>

      <div className="flex gap-10">
        {locations.map((location) => {
          const snapshot = inventory[location]
          return (
            <div
              key={location}
              className="border rounded-xl p-8 shadow-md w-56 text-center"
            >
              <h2 className="text-2xl font-bold">
                {location}
              </h2>

              {snapshot.updatedAt ? (
                <div className="space-y-2">
                  <p className="text-xl">ニュー</p>
                  <p className="text-3xl">{snapshot.newCount}</p>

                  <p className="text-xl">セミ</p>
                  <p className="text-3xl">{snapshot.semiCount}</p>
                </div>
              ) : (
                <p className="mt-4 text-muted-foreground">
                  まだ記録がありません
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-4 w-48">
        <Button asChild className="w-full">
          <NavigationLink href="/report">シャトル報告</NavigationLink>
        </Button>

        <Button asChild variant="outline" className="w-full">
          <NavigationLink href="/history">履歴</NavigationLink>
        </Button>

      </div>
    </div>
  )
}
