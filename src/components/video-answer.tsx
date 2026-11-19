"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A short answer on camera. Records in the browser with MediaRecorder, stops
 * itself at the limit, and lets the applicant watch it back and try again
 * before anything is sent. Where the browser can't record (or they'd rather
 * not), they can attach a video file instead. Nothing leaves the page until
 * the form is sent.
 */
export function VideoAnswer({ maxSeconds, onChange }: { maxSeconds: number; onChange: (f: File | null) => void }) {
  const live = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [state, setState] = useState<"idle" | "preview" | "recording" | "done">("idle");
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [canRecord, setCanRecord] = useState(true);

  useEffect(() => {
    setCanRecord(typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined");
    return () => stop(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function stop(teardown = false) {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (teardown) {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    }
  }

  async function camera() {
    setError("");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
      if (live.current) {
        live.current.srcObject = stream.current;
        live.current.muted = true;
        await live.current.play().catch(() => {});
      }
      setState("preview");
    } catch {
      setError("The camera didn't open. Allow it in your browser, or attach a video file below.");
    }
  }

  function record() {
    if (!stream.current) return;
    const type = ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream.current, type ? { mimeType: type, videoBitsPerSecond: 900_000 } : undefined);
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      const blob = new Blob(chunks, { type: r.mimeType || "video/webm" });
      const ext = (r.mimeType || "").includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `answer.${ext}`, { type: blob.type });
      if (url) URL.revokeObjectURL(url);
      setUrl(URL.createObjectURL(blob));
      setState("done");
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      onChange(file);
    };
    recorder.current = r;
    r.start(1000);
    setSeconds(0);
    setState("recording");
    const started = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= maxSeconds) stop();
    }, 250);
  }

  function again() {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    onChange(null);
    setState("idle");
    camera();
  }

  function attach(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (url) URL.revokeObjectURL(url);
    setUrl(f ? URL.createObjectURL(f) : null);
    setState(f ? "done" : "idle");
    onChange(f);
  }

  const left = Math.max(0, maxSeconds - seconds);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl bg-[oklch(0.18_0.006_265)] aspect-video grid place-items-center text-white/80">
        {state === "done" && url ? (
          <RecordedVideo src={url} className="w-full h-full object-cover" />
        ) : (
          <video ref={live} playsInline className={`w-full h-full object-cover -scale-x-100 ${state === "idle" ? "hidden" : ""}`} />
        )}
        {state === "idle" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="space-y-3">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto opacity-80" aria-hidden="true">
                <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
                <rect x="2" y="6" width="14" height="12" rx="2" />
              </svg>
              <p className="text-[13px]">Up to {maxSeconds} seconds. You can watch it back and try again before sending.</p>
              {canRecord && (
                <button type="button" onClick={camera} className="btn btn-primary">
                  Turn on camera
                </button>
              )}
            </div>
          </div>
        )}
        {state === "recording" && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-medium tabular">
            <span className="w-2 h-2 rounded-full bg-[oklch(0.65_0.22_25)] animate-pulse" />
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {state === "preview" && (
          <button type="button" onClick={record} className="btn btn-primary">
            Start recording
          </button>
        )}
        {state === "recording" && (
          <button type="button" onClick={() => stop()} className="btn">
            Stop
          </button>
        )}
        {state === "done" && (
          <>
            <span className="text-[12.5px] text-rt-success">Ready to send</span>
            {canRecord && (
              <button type="button" onClick={again} className="btn btn-quiet text-xs">
                Record again
              </button>
            )}
          </>
        )}
        <label className="ml-auto text-[12px] text-rt-muted cursor-pointer hover:text-rt-foreground">
          or attach a video file
          <input type="file" accept="video/*" className="sr-only" onChange={attach} />
        </label>
      </div>
      {error && <p className="text-[12.5px] text-rt-destructive">{error}</p>}
    </div>
  );
}

/**
 * Plays a recorded answer. Browsers write WebM recordings without a duration,
 * so the seek bar shows nothing until the player is nudged to the end once;
 * this does that on load, then rewinds.
 */
export function RecordedVideo({ src, className = "" }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const fix = () => {
      if (v.duration !== Infinity) return;
      const back = () => {
        v.removeEventListener("durationchange", back);
        v.currentTime = 0;
      };
      v.addEventListener("durationchange", back);
      v.currentTime = 1e101;
    };
    v.addEventListener("loadedmetadata", fix);
    if (v.readyState > 0) fix();
    return () => v.removeEventListener("loadedmetadata", fix);
  }, [src]);
  return <video ref={ref} src={src} controls playsInline preload="metadata" className={className} />;
}
