export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-4"
    >
      <div
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-4 border-muted border-t-foreground"
      />
      <p className="text-sm text-muted-foreground">読み込み中...</p>
    </div>
  )
}
