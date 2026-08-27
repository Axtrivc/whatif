/**
 * 回放视频导出 — WebCodecs H.264 + mp4-muxer
 *
 * 离屏 canvas 逐帧调 renderFrame(与页面预览同一渲染路径), 硬件编码 H.264,
 * mp4-muxer 封装 → 1280×720 MP4 下载。帧率无关(逐帧确定性渲染, 非屏幕录制)。
 *
 * 时长策略: 回放动画本身 45-240s, 直接 1:1 导出太长; 按目标 ≤45s 视频等比
 * 提高时间倍率(采样同一条渲染曲线, 只是 t 推进更快)。
 * 降级: VideoEncoder 不可用(旧浏览器/Firefox)时调用方隐藏入口。
 */
import type { ArrayBufferTarget as Mp4ArrayBufferTarget, Muxer as Mp4Muxer } from 'mp4-muxer';
import { durationFor, type ReplayInput } from '@/lib/engine';
import { renderFrame, type SmoothState } from '@/components/replay-render';
import type { Locale } from '@/lib/i18n';

export function videoExportSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'VideoEncoder' in window &&
    'VideoFrame' in window &&
    typeof document !== 'undefined'
  );
}

const VW = 1280;
const VH = 720;
const FPS = 30;
const TARGET_SEC = 45; // 视频目标时长上限
const MIN_SEC = 12; // 太短的回放不加速, 保底时长

interface ExportOpts {
  input: ReplayInput;
  locale: Locale;
  ccy?: string; // 标的计价货币(英文金额前缀), 缺省 USD
  compareSeries?: Float64Array;
  onProgress?: (p: number) => void; // 0..1
  signal?: AbortSignal;
}

/** 导出回放 MP4, 完成 resolve 下载 Blob */
export async function exportReplayVideo(opts: ExportOpts): Promise<Blob> {
  const { input, locale, ccy, compareSeries, onProgress, signal } = opts;
  // mp4-muxer 只在真正导出时才加载(懒 chunk), 回放页常规浏览不必下载这段 JS
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const animSec = durationFor(input.end - input.start);
  const speed = Math.max(1, animSec / Math.max(MIN_SEC, Math.min(TARGET_SEC, animSec)));
  const outSec = animSec / speed;
  const totalFrames = Math.ceil(outSec * FPS);

  const cv = document.createElement('canvas');
  cv.width = VW;
  cv.height = VH;
  const ctx = cv.getContext('2d', { alpha: false })!;
  const smooth: SmoothState = {};

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: VW, height: VH },
    fastStart: 'in-memory',
  });

  // 编码器错误在回调里抛出不会传给 await 链, 先捕获再在循环/收尾处检查
  let encError: Error | null = null;
  const enc = new (window as any).VideoEncoder({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: Error) => {
      encError = e;
    },
  });
  enc.configure({
    codec: 'avc1.640028', // High Profile L4.0 — 1080p30 常规档
    width: VW,
    height: VH,
    bitrate: 4_500_000,
    framerate: FPS,
  });

  const usPerFrame = 1e6 / FPS;
  for (let f = 0; f < totalFrames; f++) {
    if (signal?.aborted) {
      enc.close();
      throw new DOMException('aborted', 'AbortError');
    }
    if (encError) {
      enc.close();
      throw encError;
    }
    const t = Math.min(1, (f * speed) / (animSec * FPS));
    renderFrame(ctx, {
      w: VW,
      h: VH,
      dpr: 1,
      t,
      ts: performance.now(),
      input,
      smooth,
      watermark: 'whatif.axtrivc.com',
      locale,
      ccy,
      compareSeries,
    });
    const frame = new (window as any).VideoFrame(cv, {
      timestamp: Math.round(f * usPerFrame),
      duration: Math.round(usPerFrame),
    });
    enc.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
    frame.close();
    if (f % 6 === 0) {
      onProgress?.(f / totalFrames);
      // 编码队列背压: 渲染快于编码时让出主线程等队列排空, 防内存堆积
      while (enc.encodeQueueSize > 12 && !encError) {
        await new Promise((r) => setTimeout(r, 1));
      }
      await new Promise((r) => setTimeout(r, 0)); // 让出主线程, 保 UI 可响应
    }
  }
  if (encError) {
    enc.close();
    throw encError;
  }
  onProgress?.(1);
  await enc.flush();
  enc.close();
  if (encError) throw encError;
  muxer.finalize();
  const { buffer } = muxer.target as Mp4ArrayBufferTarget;
  return new Blob([buffer], { type: 'video/mp4' });
}
