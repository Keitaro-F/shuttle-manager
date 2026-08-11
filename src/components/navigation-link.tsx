"use client"

import type { ComponentProps, ReactNode } from "react"
import Link, { useLinkStatus } from "next/link"

type NavigationLinkProps = ComponentProps<typeof Link> & {
  children: ReactNode
  pendingLabel?: string
}

function NavigationLinkContent({
  children,
  pendingLabel,
}: {
  children: ReactNode
  pendingLabel: string
}) {
  const { pending } = useLinkStatus()

  return (
    <span className="grid place-items-center">
      <span
        className={`[grid-area:1/1] ${pending ? "opacity-0" : ""}`}
      >
        {children}
      </span>
      <span
        role="status"
        aria-live="polite"
        className={`[grid-area:1/1] inline-flex items-center gap-1.5 ${pending ? "" : "invisible"}`}
      >
        <span
          aria-hidden="true"
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
        {pendingLabel}
      </span>
    </span>
  )
}

export function NavigationLink({
  children,
  pendingLabel = "読み込み中...",
  ...props
}: NavigationLinkProps) {
  return (
    <Link {...props}>
      <NavigationLinkContent pendingLabel={pendingLabel}>
        {children}
      </NavigationLinkContent>
    </Link>
  )
}
