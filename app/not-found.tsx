import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center px-5 text-center">
      <div className="font-mono text-7xl font-black text-ink-950">
        404
      </div>
      <p className="mt-4 text-sm text-ink-950/55">
        这个「假如」不存在 —— 也许历史里根本没有那一天。
        <span className="block text-ink-950/35">This &quot;what if&quot; doesn&apos;t exist.</span>
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="rounded-full bg-ink-950 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-900 active:scale-95"
        >
          回首页
        </Link>
        <Link
          href="/replay/?s=msft&y=1996&a=100000"
          className="rounded-full border border-ink-950/15 px-6 py-2.5 text-sm font-semibold text-ink-950/80 transition hover:border-ink-950/30 active:scale-95"
        >
          直接看微软 1996
        </Link>
      </div>
    </main>
  );
}
