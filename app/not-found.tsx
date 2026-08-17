import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center px-5 text-center">
      <div className="font-mono text-7xl font-black text-up" style={{ textShadow: '0 0 34px rgba(255,77,79,0.5)' }}>
        404
      </div>
      <p className="mt-4 text-sm text-white/55">
        这个「假如」不存在 —— 也许历史里根本没有那一天。
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="rounded-full bg-up px-6 py-2.5 text-sm font-bold text-white transition hover:brightness-110 active:scale-95"
        >
          回首页
        </Link>
        <Link
          href="/replay/?s=msft&y=1996&a=100000"
          className="rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-white/80 transition hover:border-white/30 active:scale-95"
        >
          直接看微软 1996
        </Link>
      </div>
    </main>
  );
}
