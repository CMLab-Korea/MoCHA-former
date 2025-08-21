import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { ReactCompareSlider } from "react-compare-slider";

type OneSide = {
  src: string | any;      // 이미지/동영상 경로 (Astro asset 객체 가능)
  label?: string;
  poster?: string | any;
  thumb?: string | any;
};

export type VideoPair = {
  left: OneSide;
  right: OneSide;
  thumb?: string | any;
};

// 문자열 또는 {src: string} 형태 모두 대응
function toSrc(maybe: unknown): string {
  if (!maybe) return "";
  if (typeof maybe === "string") return maybe;
  if (typeof maybe === "object" && maybe !== null && "src" in (maybe as any)) {
    return (maybe as any).src || "";
  }
  return "";
}

// 단일 비디오 셀(자동재생/루프는 여기서 하지 않음)
const VideoItem = React.forwardRef<HTMLVideoElement, {
  side: OneSide;
  align?: "left" | "right";
}>(({ side, align = "left" }, ref) => {
  return (
    <div className="relative w-full h-full bg-black">
      <video
        ref={ref}
        src={toSrc(side.src)}
        muted
        playsInline
        preload="auto"              // 충분히 버퍼링
        poster={toSrc(side.poster)}
        className="w-full h-full object-cover rounded-lg"
      />
      {side.label ? (
        <span
          className={`absolute top-3 ${align === "left" ? "left-3" : "right-3"} text-xs md:text-sm bg-black/70 text-white px-2 py-1 rounded`}
        >
          {side.label}
        </span>
      ) : null}
    </div>
  );
});
VideoItem.displayName = "VideoItem";

export function VideoComparisonGallery({
  pairs,
  initialIndex = 0,
  className = "",
  overlayClassName,
  toggleButtonClassName,
}: {
  pairs: VideoPair[];
  initialIndex?: number;
  className?: string;
  overlayClassName?: string;
  toggleButtonClassName?: string;
}) {
  const [active, setActive] = useState(Math.min(Math.max(initialIndex, 0), pairs.length - 1));
  const [isPlaying, setIsPlaying] = useState(true);

  const leftRef  = useRef<HTMLVideoElement>(null);
  const rightRef = useRef<HTMLVideoElement>(null);

  // rVFC/RAF 루프 핸들
  const loopHandle = useRef<{ kind: "vfc" | "raf"; id: number } | null>(null);

  // 연속 루프 트리거 방지
  const justLoopedAt = useRef<number>(-1);

  const activePair = pairs[active];

  const thumbs = useMemo(
    () => pairs.map((p) => toSrc(p.thumb) || toSrc(p.left.thumb) || toSrc(p.left.poster) || ""),
    [pairs]
  );

  // 루프 취소
  const cancelSyncLoop = useCallback(() => {
    const L = leftRef.current;
    const h = loopHandle.current;
    if (!h) return;
    if (h.kind === "vfc" && L && "cancelVideoFrameCallback" in L) {
      // @ts-ignore: TS 타입 미정의 대응
      L.cancelVideoFrameCallback(h.id);
    } else {
      cancelAnimationFrame(h.id);
    }
    loopHandle.current = null;
  }, []);

  // 다음 스텝 예약 (가능하면 rVFC, 아니면 RAF)
  const scheduleStep = useCallback((step: () => void) => {
    const L = leftRef.current;
    if (L && "requestVideoFrameCallback" in L) {
      // @ts-ignore
      const id: number = L.requestVideoFrameCallback(() => step());
      loopHandle.current = { kind: "vfc", id };
    } else {
      const id = requestAnimationFrame(() => step());
      loopHandle.current = { kind: "raf", id };
    }
  }, []);

  // 특정 비디오가 로드되길 기다림
  const waitReady = useCallback(async (v: HTMLVideoElement) => {
    if (v.readyState >= 2) return; // HAVE_CURRENT_DATA
    await new Promise<void>((resolve) => {
      const on = () => {
        if (v.readyState >= 2) {
          v.removeEventListener("loadeddata", on);
          resolve();
        }
      };
      v.addEventListener("loadeddata", on);
    });
  }, []);

  // 두 비디오 모두 준비될 때까지
  const waitBothReady = useCallback(async () => {
    const L = leftRef.current, R = rightRef.current;
    if (!L || !R) return;
    await Promise.all([waitReady(L), waitReady(R)]);
  }, [waitReady]);

  // seek 완료 프로미스
  const seekTo = useCallback((v: HTMLVideoElement, t: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        v.removeEventListener("seeked", done);
        v.removeEventListener("timeupdate", done);
        resolve();
      };
      v.addEventListener("seeked", done, { once: true });
      v.addEventListener("timeupdate", done, { once: true });
      try { v.currentTime = t; } catch { resolve(); }
    }), []);

  // 동시 재시작(수동 루프)
  const syncRestart = useCallback(async () => {
    const L = leftRef.current, R = rightRef.current;
    if (!L || !R) return;
    if (!isPlaying) return; // 일시정지 상태면 루프 X

    const now = performance.now();
    if (now - justLoopedAt.current < 200) return; // 중복 방지
    justLoopedAt.current = now;

    L.pause(); R.pause();
    L.playbackRate = 1; R.playbackRate = 1;

    await Promise.all([seekTo(L, 0), seekTo(R, 0)]);
    await Promise.allSettled([L.play(), R.play()]);
  }, [isPlaying, seekTo]);

  // 프레임 동기 루프(드리프트 보정 + 끝 근접 시 수동 루프)
  const startSyncLoop = useCallback(() => {
    const HARD = 0.08;     // 80ms 이상: 하드 점프
    const SOFT = 0.02;     // 20~80ms: 속도로 서서히 보정
    const LOOP_GAP = 0.04; // 끝에서 40ms 이내면 루프

    const step = () => {
      const L = leftRef.current, R = rightRef.current;
      if (!L || !R) return;

      // ① 끝 근접 시 둘 다 0초로 리셋 후 동시 재생
      const d = Number.isFinite(L.duration) ? L.duration : NaN;
      if (Number.isFinite(d) && d > 0 && (d - L.currentTime) <= LOOP_GAP) {
        syncRestart();
        // 다음 프레임도 계속 감시
        scheduleStep(step);
        return;
      }

      // ② 드리프트 보정(R을 슬레이브로)
      const diff = R.currentTime - L.currentTime; // +면 R이 앞섬
      if (Math.abs(diff) >= HARD) {
        R.playbackRate = 1;
        R.currentTime = L.currentTime;
      } else if (Math.abs(diff) >= SOFT) {
        const sign  = diff < 0 ? 1 : -1;                          // 뒤지면 빠르게
        const delta = Math.min(0.05, Math.max(0.01, Math.abs(diff) * 0.6)); // 1~5%
        R.playbackRate = 1 + sign * delta;
      } else if (R.playbackRate !== 1) {
        R.playbackRate = 1;
      }

      scheduleStep(step);
    };

    cancelSyncLoop();
    scheduleStep(step);
  }, [scheduleStep, cancelSyncLoop, syncRestart]);

  // 현재 쌍 로드 및 시작
  const loadAndStart = useCallback(async (play: boolean) => {
    const L = leftRef.current, R = rightRef.current;
    if (!L || !R) return;

    cancelSyncLoop();

    [L, R].forEach((v) => {
      v.pause();
      v.playbackRate = 1;
      try { v.currentTime = 0; } catch {}
      v.load();
    });

    await waitBothReady();

    if (!play) {
      try { L.currentTime = 0.001; R.currentTime = 0.001; } catch {}
      return;
    }

    const res = await Promise.allSettled([L.play(), R.play()]);
    const failed = res.some(r => r.status === "rejected");
    if (!failed) {
      startSyncLoop();
    } else {
      // (정책 등으로) 자동재생 실패 시 수동 토글 유도
      setIsPlaying(false);
    }
  }, [waitBothReady, startSyncLoop, cancelSyncLoop]);

  // 세트 변경 시 재동기화
  useEffect(() => {
    loadAndStart(isPlaying);
    return () => cancelSyncLoop();
  }, [active]); // isPlaying은 별도 토글 훅에서 처리

  // 재생/일시정지 토글
  useEffect(() => {
    const L = leftRef.current, R = rightRef.current;
    if (!L || !R) return;

    if (isPlaying) {
      const t = Math.min(L.currentTime || 0, R.currentTime || 0);
      try { L.currentTime = t; R.currentTime = t; } catch {}
      Promise.allSettled([L.play(), R.play()]);
      startSyncLoop();
    } else {
      cancelSyncLoop();
      L.pause(); R.pause();
    }
  }, [isPlaying, startSyncLoop, cancelSyncLoop]);

  // ended 이벤트로도 수동 루프 (브라우저/인코딩 차로 ended 누락 방지도 step에서 처리)
  useEffect(() => {
    const L = leftRef.current, R = rightRef.current;
    if (!L || !R) return;

    const onEnded = () => { syncRestart(); };
    L.addEventListener("ended", onEnded);
    R.addEventListener("ended", onEnded);
    return () => {
      L.removeEventListener("ended", onEnded);
      R.removeEventListener("ended", onEnded);
    };
  }, [active, syncRestart]);

  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);

  return (
    <div className={`w-full ${className}`}>
      {/* 썸네일 스트립 */}
      <div className="flex items-center gap-3 mb-3 pb-1 overflow-x-auto md:overflow-visible justify-start md:justify-center">
        {thumbs.map((t, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`relative shrink-0 rounded-lg overflow-hidden border ${i === active ? "border-white ring-2 ring-blue-500" : "border-gray-300"}`}
            aria-label={`Select comparison ${i + 1}`}
            style={{ width: 96, height: 64 }}
            title={`Set ${i + 1}`}
          >
            {t ? (
              <img src={t} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-gray-200 grid place-items-center text-xs text-gray-600">No Thumb</div>
            )}
          </button>
        ))}
      </div>

      {/* 슬라이더 + 오버레이 버튼 */}
      <div className="relative w-full">
        <ReactCompareSlider
          key={active}
          itemOne={<VideoItem ref={leftRef}  side={activePair.left}  align="left"  />}
          itemTwo={<VideoItem ref={rightRef} side={activePair.right} align="right" />}
          boundsPadding={0}
          keyboardIncrement="5%"
          position={50}
          style={{
            backgroundColor: "white",
            backgroundImage: `
              linear-gradient(45deg, #ccc 25%, transparent 25%),
              linear-gradient(-45deg, #ccc 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #ccc 75%),
              linear-gradient(-45deg, transparent 75%, #ccc 75%)
            `,
            backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
            backgroundSize: "20px 20px",
            width: "100%",
            borderRadius: "0.5rem",
          }}
        />

        {/* 가운데 하단 Play/Pause 버튼 */}
        <div className={overlayClassName ?? "pointer-events-none absolute inset-0 z-10 flex items-end justify-center"}>
          <button
            type="button"
            onClick={togglePlay}
            className={toggleButtonClassName ?? `pointer-events-auto mb-3 rounded-full border px-4 py-2 text-sm bg-white/90 backdrop-blur hover:bg-white`}
            aria-pressed={!isPlaying}
            aria-label={isPlaying ? "Pause both videos" : "Play both videos"}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "❚❚ Pause" : "▶ Play"}
          </button>
        </div>
      </div>
    </div>
  );
}
