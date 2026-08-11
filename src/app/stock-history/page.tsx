import { redirect } from "next/navigation"

export default function StockHistoryPage() {
  redirect("/history?type=purchase")
}
