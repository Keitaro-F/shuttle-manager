"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function EditPage({params}: {params: {id: string}}) {
    const router = useRouter()
    const [location, setLocation] = useState("豊中")
    const [newCount, setNewCount] = useState("")
    const [semiCount, setSemiCount] = useState("")

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const res = await fetch("/api/report", {
            method: "PUT",
            body: JSON.stringify({
                location,
                newCount: Number(newCount),
                semiCount: Number(semiCount)
            })
        })

        router.push("/history")


    }

  return(
    <div className="flex items-center justify-center w-full h-screen ">
    <form onSubmit={handleSubmit}>
        <FieldSet>
            <FieldLegend>シャトル報告フォーム</FieldLegend>
            <FieldDescription>間違いのないよう入力してください</FieldDescription>
            <FieldGroup>
                <Field>
                    <FieldLabel>
                        拠点
                    </FieldLabel>
                    <Select
                        value={location}
                        onValueChange={setLocation}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="拠点を選んでください" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value="豊中">豊中</SelectItem>
                                <SelectItem value="吹田">吹田</SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    <FieldDescription>
                        拠点を選んでください
                    </FieldDescription>
                </Field>
                <Field>
                    <FieldLabel>
                        ニュー残量
                    </FieldLabel>
                    <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={newCount}
                        onChange={(e)=>setNewCount(e.target.value)}
                        required
                    />
                    <FieldDescription>
                        ニュー残量を0.5刻みで入力してください
                    </FieldDescription>
                </Field>
                <Field>
                    <FieldLabel>
                        セミ残量
                    </FieldLabel>
                    <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={semiCount}
                        onChange={(e)=>setSemiCount(e.target.value)}
                        required
                    />
                    <FieldDescription>
                        セミ残量を0.5刻みで入力してください
                    </FieldDescription>
                </Field>
                <Field>
                    <Button type="submit">提出</Button>
                </Field>
                <Field>
                    <Button variant="outline" onClick={()=>router.push("/history")}>
                        履歴に戻る
                    </Button>
                </Field>
            </FieldGroup>
        </FieldSet>
    </form>
    </div>
  )
}

