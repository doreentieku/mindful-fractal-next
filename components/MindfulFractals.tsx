'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PRESETS = {
  'Box 4-4-4-4': { inhale: 4, hold1: 4, exhale: 4, hold2: 4 },
  '4-7-8': { inhale: 4, hold1: 7, exhale: 8, hold2: 0 },
  'Calm 5-5-5-0': { inhale: 5, hold1: 5, exhale: 5, hold2: 0 },
} as const;

type BuiltinPresetKey = keyof typeof PRESETS;
type PresetKey = BuiltinPresetKey | 'Custom';
type Phase = 'Inhale' | 'Hold' | 'Exhale' | 'Hold2';
type BreathingPlan = { inhale: number; hold1: number; exhale: number; hold2: number };

const DEFAULT_SESSION_MIN = 10;

export default function MindfulFractals() {
  const [presetKey, setPresetKey] = useState<PresetKey>('Box 4-4-4-4');
  const [plan, setPlan] = useState<BreathingPlan>(PRESETS['Box 4-4-4-4']);
  const [customPlan, setCustomPlan] = useState<BreathingPlan>({ inhale: 4, hold1: 4, exhale: 4, hold2: 4 });
  const [pattern, setPattern] = useState<'Tree' | 'Spiro'>('Tree');
  const [sessionMinutes, setSessionMinutes] = useState<number>(DEFAULT_SESSION_MIN);
  const [isRunning, setIsRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const [timeLeft, setTimeLeft] = useState(sessionMinutes * 60);
  const [breathsCompleted, setBreathsCompleted] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [ambientOn, setAmbientOn] = useState(false);
  const [minutesTotal, setMinutesTotal] = useState<number>(() => Number(localStorage.getItem('mf_total_minutes')) || 0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const ambientNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  const ensureAudio = () => {
    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0.6;
      gain.connect(ctx.destination);
      masterGainRef.current = gain;
    }
    return audioCtxRef.current!;
  };

  const playChime = (freq = 528) => {
    if (!soundOn) return;
    const ctx = ensureAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.5, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    o.connect(g);
    g.connect(masterGainRef.current!);
    o.start();
    o.stop(now + 1.25);
  };

  const toggleAmbient = async () => {
    if (ambientOn) {
      ambientNodeRef.current?.stop();
      ambientNodeRef.current = null;
      setAmbientOn(false);
      return;
    }
    const ctx = ensureAudio();
    const duration = 2;
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, duration * rate, rate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 0.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.15;
    src.connect(g);
    g.connect(masterGainRef.current!);
    src.start();
    ambientNodeRef.current = src;
    setAmbientOn(true);
  };

  const phases = useMemo(() => {
    const p = presetKey === 'Custom' ? customPlan : plan;
    return [
      { label: 'Inhale' as Phase, secs: p.inhale },
      { label: 'Hold' as Phase, secs: p.hold1 },
      { label: 'Exhale' as Phase, secs: p.exhale },
      { label: 'Hold2' as Phase, secs: p.hold2 },
    ].filter((x) => x.secs > 0 || x.label.includes('Hold'));
  }, [plan, customPlan, presetKey]);

  const currentPhase = phases[phaseIndex % Math.max(1, phases.length)];

  useEffect(() => {
    if (!isRunning) return;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      setTimeLeft((t) => Math.max(0, t - dt));
      setPhaseElapsed((e) => {
        const next = e + dt;
        if (currentPhase.secs > 0 && next >= currentPhase.secs) {
          setPhaseIndex((i) => (i + 1) % Math.max(1, phases.length));
          if (currentPhase.label === 'Exhale') setBreathsCompleted((b) => b + 1);
          playChime(currentPhase.label === 'Exhale' ? 432 : 528);
          return 0;
        }
        return next;
      });

      if (timeLeftRef.current <= 0) {
        stopSession();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isRunning, phaseIndex, phases]);

  const timeLeftRef = useRef(timeLeft);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  useEffect(() => {
    if (presetKey !== 'Custom') setPlan(PRESETS[presetKey as BuiltinPresetKey]);
  }, [presetKey]);

  useEffect(() => {
    if (!isRunning && timeLeft === 0) {
      const minutesDone = sessionMinutes;
      const total = minutesTotal + minutesDone;
      setMinutesTotal(total);
      localStorage.setItem('mf_total_minutes', String(total));
    }
  }, [isRunning, timeLeft, minutesTotal, sessionMinutes]);

  const startSession = () => { setIsRunning(true); ensureAudio(); playChime(682); };
  const pauseSession = () => setIsRunning(false);
  const resetSession = () => {
    setIsRunning(false);
    setPhaseIndex(0);
    setPhaseElapsed(0);
    setTimeLeft(sessionMinutes * 60);
    setBreathsCompleted(0);
  };
  const stopSession = () => setIsRunning(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let handle = 0;
    const DPR = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      canvas.width = Math.floor(clientWidth * DPR);
      canvas.height = Math.floor(clientHeight * DPR);
    };
    resize();
    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const t = performance.now() * 0.001;

      const phDur = Math.max(0.001, currentPhase.secs || 1);
      const phProg = Math.min(1, phaseElapsed / phDur);

      const base = 220 + Math.sin(t * 0.2) * 20 + phProg * 10;
      ctx.fillStyle = `hsl(${base}, 40%, 6%)`;
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      if (pattern === 'Tree') {
        const maxDepth = 10;
        const breath = (currentPhase.label === 'Inhale' ? phProg : currentPhase.label === 'Exhale' ? 1 - phProg : 0.5);
        const angle = (Math.PI / 6) * (0.6 + breath * 0.8);
        const len = Math.min(w, h) * (0.09 + 0.03 * Math.sin(t * 0.5 + breath * Math.PI));

        ctx.save();
        ctx.translate(cx, h - 40 * DPR);
        ctx.strokeStyle = 'rgba(220,230,255,0.8)';
        ctx.lineCap = 'round';

        const drawBranch = (depth: number, length: number, thickness: number) => {
          if (depth <= 0 || length < 2) return;
          ctx.lineWidth = thickness;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -length);
          ctx.stroke();

          ctx.translate(0, -length);
          ctx.save();
          ctx.rotate(angle);
          drawBranch(depth - 1, length * 0.75, Math.max(0.5, thickness * 0.72));
          ctx.restore();

          ctx.save();
          ctx.rotate(-angle);
          drawBranch(depth - 1, length * 0.75, Math.max(0.5, thickness * 0.72));
          ctx.restore();
        };

        drawBranch(maxDepth, len, 6 * DPR);
        ctx.restore();
      } else {
        const arms = 8;
        const rad = Math.min(w, h) * 0.35 * (0.7 + 0.3 * (currentPhase.label === 'Inhale' ? phProg : 1 - phProg));
        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < arms; k++) {
          ctx.save();
          ctx.rotate((k * Math.PI * 2) / arms);
          ctx.beginPath();
          const points = 220;
          for (let i = 0; i <= points; i++) {
            const u = i / points;
            const a = u * Math.PI * 2 + t * 0.25;
            const x = Math.sin(3 * a) * rad * 0.6 + Math.sin(a) * rad * 0.4;
            const y = Math.cos(2 * a) * rad * 0.6;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `hsla(${(base + k * 8) % 360}, 60%, 70%, 0.3)`;
          ctx.lineWidth = DPR * 1.2;
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }

      handle = requestAnimationFrame(draw);
    };

    handle = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(handle); window.removeEventListener('resize', onResize); };
  }, [pattern, currentPhase, phaseElapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsRunning((r) => (!r ? (ensureAudio(), playChime(682), true) : false));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const totalSessionSecs = sessionMinutes * 60;
  const progress = 1 - timeLeft / totalSessionSecs;
  const phasePct = currentPhase.secs ? Math.min(1, phaseElapsed / currentPhase.secs) : 1;

  const PRESET_OPTIONS: PresetKey[] = ['Box 4-4-4-4', '4-7-8', 'Calm 5-5-5-0', 'Custom'];
  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/10 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 grid place-items-center">
            <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M12 2a1 1 0 0 1 1 1v3.1c3.9.5 7 3.8 7 7.9A8 8 0 1 1 5 10a1 1 0 1 1 2 0 6 6 0 1 0 6 6 6 6 0 0 0-6-6 1 1 0 1 1 0-2c2.8 0 5.2 1.5 6.5 3.7V3a1 1 0 0 1 1-1Z" /></svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Mindful Fractals</h1>
            <p className="text-xs text-slate-400">Breathe • Focus • Unwind</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="px-2 py-1 rounded bg-white/5">Total mindful minutes: <b>{minutesTotal}</b></span>
          <button onClick={() => setSoundOn((s) => !s)} className={`px-2 py-1 rounded border border-white/10 hover:bg-white/10 ${soundOn ? '' : 'opacity-60'}`}>
            {soundOn ? 'Sound On' : 'Sound Off'}
          </button>
          <button onClick={toggleAmbient} className={`px-2 py-1 rounded border border-white/10 hover:bg-white/10 ${ambientOn ? '' : 'opacity-60'}`}>
            {ambientOn ? 'Ambient On' : 'Ambient Off'}
          </button>
        </div>
      </header>

      <div className="grid lg:grid-cols-[360px_1fr] gap-6 p-6 flex-1">
        <aside className="space-y-6 bg-white/5 rounded-2xl p-5 border border-white/10 shadow-xl">
          <section className="space-y-3">
            <h2 className="font-semibold text-sm tracking-wide text-slate-300">Session</h2>
            <div className="grid grid-cols-3 gap-2">
              {[5, 10, 15].map((m) => (
                <button
                  key={m}
                  onClick={() => { setSessionMinutes(m); setTimeLeft(m * 60); }}
                  className={`px-3 py-2 rounded-lg text-sm border border-white/10 hover:bg-white/10 ${sessionMinutes === m ? 'bg-indigo-500/20 border-indigo-500/40' : ''}`}
                >{m} min</button>
              ))}
              <div className="col-span-3 flex items-center gap-2 text-sm">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={sessionMinutes}
                  onChange={(e) => { const v = Math.max(1, Math.min(120, Number(e.target.value) || 1)); setSessionMinutes(v); setTimeLeft(v * 60); }}
                  className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 focus:outline-none"
                />
                <span className="text-slate-400">custom minutes</span>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-sm tracking-wide text-slate-300">Breathing</h2>
            <div className="flex flex-wrap gap-2">
              {(['Box 4-4-4-4', '4-7-8', 'Calm 5-5-5-0', 'Custom'] as PresetKey[]).map((k) => (
                <button key={k} onClick={() => setPresetKey(k)} className={`px-3 py-2 rounded-lg text-sm border border-white/10 hover:bg-white/10 ${presetKey === k ? 'bg-emerald-500/20 border-emerald-500/40' : ''}`}>{k}</button>
              ))}
            </div>

            {presetKey === 'Custom' && (
              <div className="grid grid-cols-4 gap-2 text-xs">
                {(['inhale', 'hold1', 'exhale', 'hold2'] as const).map((key) => (
                  <div key={key} className="space-y-1">
                    <label className="block text-slate-400 capitalize">{key}</label>
                    <input type="number" min={0} max={20} value={customPlan[key] as number} onChange={(e) => setCustomPlan({ ...customPlan, [key]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 focus:outline-none" />
                  </div>
                ))}
                <button onClick={() => setPlan(customPlan)} className="col-span-4 mt-2 px-3 py-2 rounded-lg text-sm border border-white/10 hover:bg-white/10">Apply</button>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-sm tracking-wide text-slate-300">Pattern</h2>
            <div className="flex gap-2">
              {['Tree', 'Spiro'].map((p) => (
                <button key={p} onClick={() => setPattern(p as any)} className={`px-3 py-2 rounded-lg text-sm border border-white/10 hover:bg-white/10 ${pattern === p ? 'bg-cyan-500/20 border-cyan-500/40' : ''}`}>{p}</button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-sm tracking-wide text-slate-300">Controls</h2>
            <div className="flex items-center gap-2">
              {!isRunning ? (
                <button onClick={() => { setIsRunning(true); ensureAudio(); playChime(682); }} className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700">Start</button>
              ) : (
                <button onClick={() => setIsRunning(false)} className="flex-1 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700">Pause</button>
              )}
              <button onClick={() => { resetSession(); }} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600">Reset</button>
            </div>
            <p className="text-xs text-slate-400">Tip: press <kbd className="px-1 py-0.5 bg-white/10 rounded">Space</kbd> to start/pause.</p>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-sm tracking-wide text-slate-300">Progress</h2>
            <ProgressBar value={progress} />
            <div className="grid grid-cols-3 gap-2 text-center">
              <InfoCard label="Time Left" value={formatTime(timeLeft)} />
              <InfoCard label="Phase" value={prettyPhase(currentPhase.label)} />
              <InfoCard label="Breaths" value={String(breathsCompleted)} />
            </div>
          </section>
        </aside>

        <main className="relative rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <BreathingRing phase={currentPhase.label} pct={phasePct} />
          </div>
          <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/70 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm text-slate-300">Follow the cue</h3>
                <p className="text-2xl font-semibold">{cueText(currentPhase.label)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-300">Session</p>
                <p className="text-2xl font-semibold tabular-nums">{formatTime(totalSessionSecs - timeLeft)}</p>
              </div>
            </div>
          </div>
        </main>
      </div>

      <footer className="px-6 py-4 text-center text-xs text-slate-500">
        Built for calm. Patterns are generative and respond to your breath cycle. Headphones recommended.
      </footer>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
      <div className="h-full bg-indigo-500/60" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

function prettyPhase(p: Phase) {
  if (p === 'Hold2') return 'Hold';
  return p;
}

function cueText(p: Phase) {
  switch (p) {
    case 'Inhale': return 'Inhale gently';
    case 'Hold':
    case 'Hold2': return 'Hold softly';
    case 'Exhale': return 'Exhale slowly';
  }
}

function formatTime(secs: number) {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function BreathingRing({ phase, pct }: { phase: Phase; pct: number }) {
  const scale = phase === 'Inhale' ? 0.75 + 0.25 * pct : phase === 'Exhale' ? 1.0 - 0.25 * pct : 0.88;
  const color = phase === 'Inhale' ? 'from-emerald-400/70 to-cyan-500/40' : phase === 'Exhale' ? 'from-indigo-400/70 to-violet-500/40' : 'from-amber-300/60 to-yellow-400/20';

  return (
    <motion.div
      className={`w-[52vmin] h-[52vmin] rounded-full bg-gradient-to-br ${color} shadow-[0_0_120px_rgba(99,102,241,0.35)] ring-1 ring-white/20`}
      animate={{ scale }}
      transition={{ type: 'spring', stiffness: 60, damping: 12 }}
    >
      <div className="absolute inset-6 rounded-full border border-white/20" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="uppercase text-[10px] tracking-[0.2em] text-white/70">{phase === 'Hold2' ? 'Hold' : phase}</div>
          <AnimatePresence mode="wait">
            <motion.div key={phase + Math.round(pct * 20)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-5xl font-bold tabular-nums">
              {Math.max(0, Math.ceil((1 - pct) * 8))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
