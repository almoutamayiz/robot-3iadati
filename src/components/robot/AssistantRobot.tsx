import React, { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import type { RobotState } from '../../types/robot';
import {
  runRobotActionSequence,
  type RobotAction,
  type RobotActionDriver,
  type RobotEffectName,
  type RobotExpressionOverride,
  type RobotHand,
} from '../../lib/robotActions';
import type { RobotMotionLevel, RobotOutfitItem, RobotPositionMode, RobotSize, RobotTheme } from '../../lib/robotPreferences';
import './AssistantRobot.css';

export interface RobotPoint { x: number; y: number; r?: number; s?: number; o?: number; t?: number; }
export interface RobotBounds { top?: number; right?: number; bottom?: number; left?: number; }
export interface RobotPositionInfo { x: number; y: number; xPct: number; yPct: number; edge: 'left' | 'right'; }
export interface PointingTargetCoords { targetX: number; targetY: number; severity?: 'alert' | 'attention'; }
export type RobotPointAtTarget = HTMLElement | string | { dx: number; dy: number };

export interface AssistantRobotProps {
  state: RobotState;
  theme?: RobotTheme;
  outfit?: RobotOutfitItem[];
  size?: RobotSize;
  motion?: RobotMotionLevel;
  positionMode?: RobotPositionMode;
  embedded?: boolean;
  speaking?: boolean;
  carrying?: boolean;
  envelopeOpen?: boolean;
  envelopeCount?: number;
  sentBadge?: string | null;
  alertBadge?: number;
  glowing?: boolean;
  userId?: string;
  bounds?: RobotBounds;
  safeZoneSelectors?: string[];
  dragDisabled?: boolean;
  pointing?: PointingTargetCoords | null;
  onOpen?: () => void;
  onPositionChange?: (pos: RobotPositionInfo) => void;
  ariaLabel?: string;
  className?: string;
}

export interface AssistantRobotHandle {
  fly: (keyframes: RobotPoint[], duration: number, easing: string) => Promise<void>;
  cueEdge: (side: 'l' | 'r', y: number, color?: string) => void;
  place: (p: RobotPoint) => void;
  moveToPointNear: (rect: DOMRect | { left: number; top: number; right: number; bottom: number; width: number; height: number }) => Promise<{ x: number; y: number; rw: number; rh: number }>;
  returnHome: () => Promise<void>;
  getHome: () => { x: number; y: number };
  getCurrentPos: () => { x: number; y: number };
  getDimensions: () => { w: number; h: number; rw: number; rh: number };
  play: (action: RobotAction, options?: { ignoreMotionOff?: boolean }) => Promise<void>;
  deliverToNurse: () => Promise<void>;
  pointAt: (target: RobotPointAtTarget, hand?: RobotHand) => void;
  stopPointing: () => void;
  cancelAction: () => void;
  resetPosition: () => RobotPositionInfo;
}

const MOUTH_PATHS: Record<RobotExpressionOverride, string> = {
  idle: 'M165 189 Q180 201 195 189',
  attention: 'M170 191 Q180 197 190 191',
  thinking: 'M170 192 Q179 188 191 191',
  working: 'M170 191 L190 191',
  success: 'M162 186 Q180 208 198 186 Z',
  happy: 'M160 185 Q180 207 200 185',
  laugh: 'M158 183 Q180 214 202 183 Z',
  sad: 'M164 200 Q180 184 196 200',
  fly: 'M163 186 Q180 205 197 186',
  wink: 'M163 188 Q182 203 198 184',
  alert: 'M165 197 Q180 183 195 197',
  sleep: 'M172 192 Q180 195 188 192',
  flat: 'M170 191 L190 191',
};

const SPEAKING_MOUTH_FRAMES = [
  'M167 190 Q180 198 193 190 Q180 194 167 190 Z',
  'M164 186 Q180 208 196 186 Q180 192 164 186 Z',
  'M171 188 Q180 204 189 188 Q180 183 171 188 Z',
  'M165 188 Q180 202 195 188 Q180 196 165 188 Z',
  'M162 185 Q180 211 198 185 Q180 191 162 185 Z',
  'M169 190 Q180 196 191 190',
];

const BROWS: Partial<Record<RobotExpressionOverride, [string, string]>> = {
  thinking: ['M133 129 L166 129', 'M196 124 L228 119'],
  alert: ['M128 126 L168 114', 'M192 114 L232 126'],
  sad: ['M128 122 L166 131', 'M194 131 L232 122'],
};

const STATE_CLASSES: Array<RobotState | 'wink'> = [
  'idle', 'attention', 'thinking', 'working', 'success', 'alert', 'sleep', 'happy', 'laugh', 'sad', 'fly', 'wink',
];
const EFFECT_CLASSES = ['fx-sparkles', 'fx-thruster', 'fx-tear', 'fx-love', 'fx-scan'];
const DEFAULT_SAFE_ZONES = ['button[type="submit"]', '[data-robot-safe-zone]', 'form button.bg-emerald-600', 'input:focus', 'textarea:focus'];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const prefersReducedMotionMedia = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const readSafeAreaInsets = () => {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return { top: 0, right: 0, bottom: 0, left: 0 };
  const style = getComputedStyle(document.documentElement);
  const parse = (prop: string) => parseFloat(style.getPropertyValue(prop) || '0') || 0;
  return { top: parse('--sat'), right: parse('--sar'), bottom: parse('--sab'), left: parse('--sal') };
};

const getRobotSize = (size: RobotSize = 'm'): { rw: number; rh: number } => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
  const widthTable: Record<RobotSize, number> = isMobile ? { s: 56, m: 68, l: 84 } : { s: 64, m: 80, l: 99 };
  const rw = widthTable[size] ?? 80;
  return { rw, rh: Math.round(rw * (346 / 280)) };
};

export const AssistantRobot = forwardRef<AssistantRobotHandle, AssistantRobotProps>(
  (
    {
      state, theme = 'white', outfit = [], size = 'm', motion = 'calm', positionMode = 'free',
      embedded = false, speaking = false, carrying = false, envelopeOpen = false, envelopeCount = 0,
      sentBadge = null, alertBadge = 0, glowing = false, userId = 'default', bounds,
      safeZoneSelectors = DEFAULT_SAFE_ZONES, dragDisabled = false, pointing = null,
      onOpen, onPositionChange, ariaLabel = 'مساعد عيادتي — انقر للتفاعل', className = '',
    },
    ref
  ) => {
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const sgId = `sg-${uid}`, sdId = `sd-${uid}`, fjId = `fj-${uid}`, fcId = `fc-${uid}`;
    const rimId = `rim-${uid}`, vgId = `vg-${uid}`, ppId = `pp-${uid}`, slId = `sl-${uid}`;
    const glId = `gl-${uid}`, bl3Id = `bl3-${uid}`, vcId = `vc-${uid}`, antId = `ant-${uid}`;

    const robRef = useRef<HTMLDivElement | null>(null);
    const rbRef = useRef<SVGGElement | null>(null);
    const bwRef = useRef<SVGGElement | null>(null);
    const headRef = useRef<SVGGElement | null>(null);
    const gzLRef = useRef<SVGGElement | null>(null);
    const gzRRef = useRef<SVGGElement | null>(null);
    const aLRef = useRef<SVGGElement | null>(null);
    const aRRef = useRef<SVGGElement | null>(null);
    const moRef = useRef<SVGPathElement | null>(null);
    const brLRef = useRef<SVGPathElement | null>(null);
    const brRRef = useRef<SVGPathElement | null>(null);

    const gidRef = useRef(0);
    const actionBusyRef = useRef(false);
    const manualPointingRef = useRef(false);

    const effectivePropState: RobotState = pointing?.severity === 'alert' ? 'alert' : state;
    const propStateRef = useRef<RobotState>(effectivePropState);
    propStateRef.current = effectivePropState;

    const motionOff = motion === 'off' || prefersReducedMotionMedia();
    const effectiveDragDisabled = dragDisabled || embedded || positionMode === 'fixed';
    const storageKey = `assistant.position.${userId || 'default'}`;

    const getLimits = useCallback(() => {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const h = typeof window !== 'undefined' ? window.innerHeight : 720;
      const { rw, rh } = getRobotSize(size);
      const safe = readSafeAreaInsets();
      const minX = Math.max(6, bounds?.left ?? 6) + safe.left;
      const maxX = Math.max(minX, w - rw - Math.max(6, bounds?.right ?? 6) - safe.right);
      const minY = Math.max(76, bounds?.top ?? 76) + safe.top;
      const maxY = Math.max(minY, h - rh - Math.max(10, bounds?.bottom ?? 10) - safe.bottom);
      return { w, h, rw, rh, minX, maxX, minY, maxY };
    }, [bounds?.bottom, bounds?.left, bounds?.right, bounds?.top, size]);

    const getDefaultCornerHome = useCallback(() => {
      const { w, rw, minX, maxX, minY, maxY } = getLimits();
      return { x: clamp(w - rw - 14, minX, maxX), y: clamp(maxY - 12, minY, maxY) };
    }, [getLimits]);

    const loadSavedHome = useCallback((): { x: number; y: number } => {
      if (positionMode === 'fixed') return getDefaultCornerHome();
      const { w, h, minX, maxX, minY, maxY } = getLimits();
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw) as { xPct?: number; yPct?: number };
            if (typeof parsed.xPct === 'number' && typeof parsed.yPct === 'number') {
              return { x: clamp(parsed.xPct * w, minX, maxX), y: clamp(parsed.yPct * h, minY, maxY) };
            }
          }
        } catch { /* ignore */ }
      }
      return getDefaultCornerHome();
    }, [getDefaultCornerHome, getLimits, positionMode, storageKey]);

    const homeRef = useRef<{ x: number; y: number }>({ x: 20, y: 120 });
    const posRef = useRef<RobotPoint>({ x: 20, y: 120, r: 0, s: 1, o: 1 });
    const activeFlyAnimRef = useRef<Animation | null>(null);
    const dragRafRef = useRef<number | null>(null);
    const pendingDragPointRef = useRef<RobotPoint | null>(null);
    const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean; lx: number; tilt: number } | null>(null);
    const justDraggedRef = useRef<boolean>(false);
    const internalBusyRef = useRef<boolean>(false);
    const [isDraggingUI, setIsDraggingUI] = useState(false);
    const [isDeliveringEnvelope, setIsDeliveringEnvelope] = useState(false);
    const [deliverySentBadge, setDeliverySentBadge] = useState<string | null>(null);
    const lastPoseRef = useRef<{ nx: number; ny: number }>({ nx: 99, ny: 99 });

    const fmtTransform = (p: RobotPoint) =>
      `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) rotate(${(p.r || 0).toFixed(2)}deg) scale(${p.s ?? 1})`;

    const emitPosition = useCallback((x: number, y: number): RobotPositionInfo => {
      const { w, h, rw } = getLimits();
      const info: RobotPositionInfo = {
        x, y, xPct: w > 0 ? x / w : 0, yPct: h > 0 ? y / h : 0,
        edge: x + rw / 2 < w / 2 ? 'left' : 'right',
      };
      onPositionChange?.(info);
      return info;
    }, [getLimits, onPositionChange]);

    const saveHomeToStorage = useCallback((x: number, y: number) => {
      const { w, h } = getLimits();
      if (typeof window === 'undefined' || w <= 0 || h <= 0) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify({ xPct: Number((x / w).toFixed(4)), yPct: Number((y / h).toFixed(4)) }));
      } catch { /* ignore */ }
    }, [getLimits, storageKey]);

    const place = useCallback((p: RobotPoint) => {
      if (embedded) return;
      posRef.current = p;
      const el = robRef.current;
      if (el) {
        el.style.transform = fmtTransform(p);
        el.style.opacity = String(p.o ?? 1);
      }
    }, [embedded]);

    const fly = useCallback(async (list: RobotPoint[], dur: number, ease: string) => {
      if (embedded) return;
      const el = robRef.current;
      if (!el || list.length === 0) return;
      if (activeFlyAnimRef.current) {
        try { activeFlyAnimRef.current.cancel(); } catch { /* ignore */ }
        activeFlyAnimRef.current = null;
      }
      if (motionOff || typeof el.animate !== 'function' || dur <= 0) {
        place(list[list.length - 1]);
        return;
      }
      const frames: Keyframe[] = list.map((p) => {
        const k: Keyframe = { transform: fmtTransform(p), opacity: p.o ?? 1 };
        if (typeof p.t === 'number') k.offset = p.t;
        return k;
      });
      const anim = el.animate(frames, { duration: dur, easing: ease, fill: 'forwards' });
      activeFlyAnimRef.current = anim;
      try { await anim.finished; } catch { /* cancelled */ }
      if (activeFlyAnimRef.current === anim) {
        place(list[list.length - 1]);
        activeFlyAnimRef.current = null;
      }
      try { anim.cancel(); } catch { /* ignore */ }
    }, [embedded, motionOff, place]);

    const glideTo = useCallback(async (destX: number, destY: number, minDur = 340, maxDur = 680) => {
      const start = posRef.current;
      const dx = destX - start.x;
      const dy = destY - start.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 3) {
        place({ x: destX, y: destY, r: 0, s: 1, o: 1 });
        return;
      }
      const { minY } = getLimits();
      const lift = clamp(dist * 0.08, 6, 26);
      const ctrlX = (start.x + destX) / 2;
      const ctrlY = Math.max(minY, Math.min(start.y, destY) - lift);
      const maxTilt = clamp(dx * 0.015, -4.5, 4.5);
      const steps = 14;
      const frames: RobotPoint[] = [];
      for (let i = 0; i <= steps; i++) {
        const linearT = i / steps;
        const easedT = linearT < 0.5 ? 4 * linearT * linearT * linearT : 1 - Math.pow(-2 * linearT + 2, 3) / 2;
        const u = 1 - easedT;
        const x = u * u * start.x + 2 * u * easedT * ctrlX + easedT * easedT * destX;
        const y = u * u * start.y + 2 * u * easedT * ctrlY + easedT * easedT * destY;
        const bank = Math.sin(Math.PI * linearT) * maxTilt;
        const hoverScale = 1 + Math.sin(Math.PI * linearT) * 0.025;
        frames.push({ x, y, r: i === steps ? 0 : bank, s: i === steps ? 1 : hoverScale, o: 1, t: linearT });
      }
      const duration = Math.round(clamp(260 + dist * 0.52, minDur, maxDur));
      await fly(frames, duration, 'linear');
    }, [fly, getLimits, place]);

    const cueEdge = useCallback((side: 'l' | 'r', y: number, color = '#3aa0ff') => {
      if (typeof document === 'undefined' || motionOff || embedded) return;
      const { rh } = getRobotSize(size);
      const edgeEl = document.createElement('div');
      edgeEl.className = 'v9-edge-cue';
      edgeEl.style.setProperty('--v9-ac', color);
      edgeEl.style[side === 'r' ? 'right' : 'left'] = '0px';
      edgeEl.style.top = `${Math.max(70, y + rh * 0.1)}px`;
      document.body.appendChild(edgeEl);
      if (typeof edgeEl.animate === 'function') {
        edgeEl.animate([{ opacity: 0 }, { opacity: 0.65, offset: 0.4 }, { opacity: 0 }], { duration: 1300, easing: 'ease-in-out' })
          .finished.then(() => edgeEl.remove()).catch(() => edgeEl.remove());
      } else {
        edgeEl.remove();
      }
    }, [embedded, motionOff, size]);

    const currentExprRef = useRef<RobotExpressionOverride>(effectivePropState);

    const applyExpressionDOM = useCallback((expr: RobotExpressionOverride) => {
      currentExprRef.current = expr;
      const rb = rbRef.current, mo = moRef.current, bL = brLRef.current, bR = brRRef.current;
      if (rb) {
        STATE_CLASSES.forEach((cls) => rb.classList.remove(`s-${cls}`));
        rb.classList.add(`s-${expr === 'flat' ? 'idle' : expr}`);
      }
      if (mo && !speaking) mo.setAttribute('d', MOUTH_PATHS[expr] || MOUTH_PATHS.idle);
      const brows = BROWS[expr];
      if (bL && bR) {
        if (brows) {
          bL.setAttribute('d', brows[0]); bR.setAttribute('d', brows[1]);
          bL.style.opacity = '1'; bR.style.opacity = '1';
        } else {
          bL.style.opacity = '0'; bR.style.opacity = '0';
        }
      }
    }, [speaking]);

    const setEffectDOM = useCallback((effect: RobotEffectName) => {
      const rb = rbRef.current;
      if (!rb) return;
      EFFECT_CLASSES.forEach((cls) => rb.classList.remove(cls));
      if (effect) rb.classList.add(`fx-${effect}`);
    }, []);

    // Realistic frame-by-frame lip-sync animation while robot speaks
    useEffect(() => {
      const mo = moRef.current;
      if (!speaking || motionOff) {
        if (mo) {
          mo.setAttribute('d', MOUTH_PATHS[currentExprRef.current] || MOUTH_PATHS.idle);
        }
        return;
      }
      let frameIdx = 0;
      const intervalId = window.setInterval(() => {
        if (moRef.current) {
          moRef.current.setAttribute(
            'd',
            SPEAKING_MOUTH_FRAMES[frameIdx % SPEAKING_MOUTH_FRAMES.length]
          );
          frameIdx++;
        }
      }, 110);
      return () => {
        window.clearInterval(intervalId);
        if (moRef.current) {
          moRef.current.setAttribute(
            'd',
            MOUTH_PATHS[currentExprRef.current] || MOUTH_PATHS.idle
          );
        }
      };
    }, [speaking, motionOff]);

    const setArmDOM = useCallback((side: RobotHand, rotateDeg = 0, tx = 0, ty = 0, tip = false) => {
      const el = side === 'L' ? aLRef.current : aRRef.current;
      if (!el) return;
      el.style.transform = rotateDeg === 0 && tx === 0 && ty === 0 ? '' : `translate(${tx}px, ${ty}px) rotate(${rotateDeg}deg)`;
      el.classList.toggle('pt', tip);
    }, []);

    const setHeadDOM = useCallback((rotateDeg = 0, x = 0, y = 0) => {
      const el = headRef.current;
      if (!el) return;
      el.style.transform = rotateDeg === 0 && x === 0 && y === 0 ? '' : `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rotateDeg.toFixed(2)}deg)`;
    }, []);

    const setGazeDOM = useCallback((x = 0, y = 0) => {
      const tf = x === 0 && y === 0 ? '' : `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      if (gzLRef.current) gzLRef.current.style.transform = tf;
      if (gzRRef.current) gzRRef.current.style.transform = tf;
    }, []);

    const setBodyTransformDOM = useCallback((transform: string) => {
      if (bwRef.current) bwRef.current.style.transform = transform;
    }, []);

    const restDOM = useCallback(() => {
      setArmDOM('L'); setArmDOM('R'); setHeadDOM(); setGazeDOM(); setBodyTransformDOM(''); setEffectDOM(null);
      manualPointingRef.current = false;
      rbRef.current?.classList.remove('pointing', 'acting');
      applyExpressionDOM(propStateRef.current);
      lastPoseRef.current = { nx: 99, ny: 99 };
    }, [applyExpressionDOM, setArmDOM, setBodyTransformDOM, setEffectDOM, setGazeDOM, setHeadDOM]);

    useEffect(() => {
      if (!actionBusyRef.current && !manualPointingRef.current) applyExpressionDOM(effectivePropState);
    }, [applyExpressionDOM, effectivePropState]);

    useEffect(() => {
      if (embedded) return;
      if (!pointing || carrying) {
        if (!actionBusyRef.current && !manualPointingRef.current) {
          setArmDOM('L'); setArmDOM('R'); rbRef.current?.classList.remove('pointing');
        }
        return;
      }
      const { rw, rh } = getRobotSize(size);
      const cur = posRef.current;
      const chooseLeft = pointing.targetX < cur.x + rw / 2;
      const hand: RobotHand = chooseLeft ? 'L' : 'R';
      const shoulderX = cur.x + (((chooseLeft ? 112 : 248) - 40) / 280) * rw;
      const shoulderY = cur.y + ((258 - 12) / 346) * rh;
      const rotateDeg = (Math.atan2(-(pointing.targetX - shoulderX), pointing.targetY - shoulderY) * 180) / Math.PI;
      gidRef.current++;
      actionBusyRef.current = false;
      rbRef.current?.classList.add('pointing');
      setArmDOM(chooseLeft ? 'R' : 'L');
      setArmDOM(hand, Number(rotateDeg.toFixed(1)), 0, 0, true);
      applyExpressionDOM(pointing.severity === 'alert' ? 'alert' : 'attention');
    }, [applyExpressionDOM, carrying, embedded, pointing, setArmDOM, size]);

    const play = useCallback(async (action: RobotAction, options?: { ignoreMotionOff?: boolean }) => {
      if (motionOff && !options?.ignoreMotionOff) return;
      const id = ++gidRef.current;
      actionBusyRef.current = true;
      manualPointingRef.current = false;
      const driver: RobotActionDriver = {
        setExpression: applyExpressionDOM, setArm: setArmDOM, setHead: setHeadDOM,
        setGaze: setGazeDOM, setBodyTransform: setBodyTransformDOM, setEffect: setEffectDOM, rest: restDOM,
      };
      driver.rest();
      rbRef.current?.classList.add('acting');
      const wait = async (ms: number) => {
        await sleep(ms);
        if (id !== gidRef.current) throw new Error('ROBOT_ACTION_CANCELLED');
      };
      try {
        await sleep(50);
        if (id !== gidRef.current) return;
        await runRobotActionSequence(action, driver, wait);
        await wait(240);
        if (id === gidRef.current) driver.rest();
      } catch { /* cancelled */ } finally {
        if (id === gidRef.current) {
          actionBusyRef.current = false;
          rbRef.current?.classList.remove('acting');
        }
      }
    }, [applyExpressionDOM, motionOff, restDOM, setArmDOM, setBodyTransformDOM, setEffectDOM, setGazeDOM, setHeadDOM]);

    const pointAt = useCallback((target: RobotPointAtTarget, hand?: RobotHand) => {
      let dx = 0, dy = 0, resolvedEl: HTMLElement | null = null;
      if (typeof target === 'string' && typeof document !== 'undefined') {
        const direct = document.querySelector(`[data-assistant-id="${target}"]`) || document.querySelector(target);
        if (direct instanceof HTMLElement) resolvedEl = direct;
      } else if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
        resolvedEl = target;
      }
      if (resolvedEl) {
        const targetRect = resolvedEl.getBoundingClientRect();
        const hostRect = robRef.current?.getBoundingClientRect();
        if (hostRect && (targetRect.width > 0 || targetRect.height > 0)) {
          const rawDx = (targetRect.left + targetRect.width / 2) - (hostRect.left + hostRect.width / 2);
          const rawDy = (targetRect.top + targetRect.height / 2) - (hostRect.top + hostRect.height * 0.72);
          const dist = Math.hypot(rawDx, rawDy) || 1;
          dx = rawDx / dist; dy = rawDy / dist;
        }
      } else if (typeof target === 'object' && target !== null && 'dx' in target) {
        const dist = Math.hypot(target.dx, target.dy) || 1;
        dx = target.dx / dist; dy = target.dy / dist;
      }
      const chosenHand: RobotHand = hand || (dx < 0 ? 'L' : 'R');
      gidRef.current++;
      actionBusyRef.current = false;
      restDOM();
      manualPointingRef.current = true;
      rbRef.current?.classList.add('pointing');
      setArmDOM(chosenHand, Number(((Math.atan2(-dx, dy) * 180) / Math.PI).toFixed(1)), 0, 0, true);
      applyExpressionDOM('attention');
      setHeadDOM(dx * 4, dx * 2, dy * 2);
      setGazeDOM(dx * 5, dy * 4);
    }, [applyExpressionDOM, restDOM, setArmDOM, setGazeDOM, setHeadDOM]);

    const stopPointingImperative = useCallback(() => { gidRef.current++; actionBusyRef.current = false; restDOM(); }, [restDOM]);
    const cancelAction = useCallback(() => { gidRef.current++; actionBusyRef.current = false; restDOM(); }, [restDOM]);

    const resolveSafeDropPosition = useCallback((candidateX: number, candidateY: number) => {
      const { w, rw, rh, minX, maxX, minY, maxY } = getLimits();
      const bestX = clamp(candidateX, minX, maxX);
      const bestY = clamp(candidateY, minY, maxY);
      if (typeof document === 'undefined' || !safeZoneSelectors.length) return { x: bestX, y: bestY };
      const safeRects: DOMRect[] = [];
      try {
        document.querySelectorAll(safeZoneSelectors.join(',')).forEach((node) => {
          if (robRef.current && robRef.current.contains(node)) return;
          const r = node.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) safeRects.push(r);
        });
      } catch { return { x: bestX, y: bestY }; }
      const overlaps = (x: number, y: number) =>
        safeRects.some((r) => x < r.right + 8 && x + rw > r.left - 8 && y < r.bottom + 8 && y + rh > r.top - 8);
      if (!overlaps(bestX, bestY)) return { x: bestX, y: bestY };
      const altEdges = [bestX, bestX < w / 2 ? clamp(w - rw - 12, minX, maxX) : clamp(12, minX, maxX)];
      for (const testX of altEdges) {
        if (!overlaps(testX, bestY)) return { x: testX, y: bestY };
        for (const dy of [-64, 64, -120, 120, -180, 180]) {
          const testY = clamp(bestY + dy, minY, maxY);
          if (!overlaps(testX, testY)) return { x: testX, y: testY };
        }
      }
      return { x: bestX, y: bestY };
    }, [getLimits, safeZoneSelectors]);

    const moveToPointNear = useCallback(async (rect: DOMRect | { left: number; top: number; right: number; bottom: number; width: number; height: number }) => {
      const { w, rw, rh, minX, maxX, minY, maxY } = getLimits();
      if (embedded) return { x: 0, y: 0, rw, rh };
      const gap = 14, targetCenterX = rect.left + rect.width / 2, targetCenterY = rect.top + rect.height / 2;
      const cur = posRef.current;
      const idealHorizontalX = clamp(rect.width > 340 ? clamp(cur.x, rect.left + 12, rect.right - rw - 12) : targetCenterX - rw / 2, minX, maxX);
      const candidates: Array<{ x: number; y: number; score: number }> = [];
      const rightX = rect.right + gap;
      if (rightX <= maxX) {
        const y = clamp(targetCenterY - rh * 0.54, minY, maxY);
        candidates.push({ x: clamp(rightX, minX, maxX), y, score: Math.hypot(rightX - cur.x, y - cur.y) });
      }
      const leftX = rect.left - rw - gap;
      if (leftX >= minX) {
        const y = clamp(targetCenterY - rh * 0.54, minY, maxY);
        candidates.push({ x: clamp(leftX, minX, maxX), y, score: Math.hypot(leftX - cur.x, y - cur.y) });
      }
      const aboveY = rect.top - rh - 10;
      if (aboveY >= minY) {
        candidates.push({ x: idealHorizontalX, y: aboveY, score: Math.hypot(idealHorizontalX - cur.x, aboveY - cur.y) + (rect.width > w * 0.45 ? -40 : 45) });
      }
      const belowY = rect.bottom + 10;
      if (belowY <= maxY) {
        candidates.push({ x: idealHorizontalX, y: belowY, score: Math.hypot(idealHorizontalX - cur.x, belowY - cur.y) + (rect.width > w * 0.45 ? -30 : 55) });
      }
      let destX = idealHorizontalX, destY = clamp(targetCenterY - rh * 0.54, minY, maxY);
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.score - b.score);
        destX = candidates[0].x; destY = candidates[0].y;
      } else {
        destX = clamp(rect.right + 8 <= maxX ? rect.right + 8 : rect.left - rw - 8 >= minX ? rect.left - rw - 8 : idealHorizontalX, minX, maxX);
        destY = clamp(rect.top - rh - 6 >= minY ? rect.top - rh - 6 : rect.bottom + 6, minY, maxY);
      }
      await glideTo(destX, destY, 340, 620);
      return { x: destX, y: destY, rw, rh };
    }, [embedded, getLimits, glideTo]);

    const returnHome = useCallback(async () => {
      if (embedded) return;
      await glideTo(homeRef.current.x, homeRef.current.y, 320, 660);
    }, [embedded, glideTo]);

    const resetPosition = useCallback((): RobotPositionInfo => {
      const def = getDefaultCornerHome();
      homeRef.current = def;
      if (!embedded) {
        place({ x: def.x, y: def.y, r: 0, s: 1, o: 1 });
        saveHomeToStorage(def.x, def.y);
      }
      return emitPosition(def.x, def.y);
    }, [embedded, emitPosition, getDefaultCornerHome, place, saveHomeToStorage]);

    const deliverToNurse = useCallback(async () => {
      const el = robRef.current;
      const id = ++gidRef.current;
      actionBusyRef.current = true;
      manualPointingRef.current = false;
      setDeliverySentBadge(null);
      setIsDeliveringEnvelope(true);
      applyExpressionDOM('fly');
      setEffectDOM('thruster');
      setHeadDOM(6, 3, -2);
      setGazeDOM(6, 0);

      const stageRect = el?.parentElement?.getBoundingClientRect();
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
      const rightTravel = embedded
        ? Math.max(240, Math.round((stageRect?.width || vw) * 0.56))
        : Math.max(120, Math.round(vw - posRef.current.x - 40));

      if (!motionOff && el && typeof el.animate === 'function') {
        try {
          if (embedded) {
            const outAnim = el.animate(
              [
                { transform: 'translate3d(0px, 0px, 0) rotate(0deg) scale(1)', opacity: 1 },
                { transform: 'translate3d(18px, -14px, 0) rotate(6deg) scale(1.05)', opacity: 1, offset: 0.18 },
                { transform: `translate3d(${Math.round(rightTravel * 0.52)}px, -26px, 0) rotate(13deg) scale(0.98)`, opacity: 0.95, offset: 0.62 },
                { transform: `translate3d(${rightTravel}px, -30px, 0) rotate(15deg) scale(0.9)`, opacity: 0.12 },
              ],
              { duration: 680, easing: 'cubic-bezier(0.35, 0, 0.25, 1)', fill: 'forwards' }
            );
            await outAnim.finished;
            outAnim.cancel();
          } else {
            const cur = posRef.current;
            await fly(
              [
                { ...cur, r: 0, s: 1, o: 1 },
                { x: cur.x + rightTravel * 0.5, y: cur.y - 24, r: 12, s: 0.96, o: 0.95, t: 0.55 },
                { x: cur.x + rightTravel, y: cur.y - 28, r: 15, s: 0.88, o: 0.15, t: 1 },
              ],
              640,
              'ease-in-out'
            );
          }

          if (id !== gidRef.current) return;
          cueEdge('r', el.getBoundingClientRect().top || 220, '#10b981');
          setIsDeliveringEnvelope(false);
          setDeliverySentBadge('تم الإيصال للممرض');
          await sleep(260);
          if (id !== gidRef.current) return;

          setHeadDOM(-5, -2, -2);
          setGazeDOM(-5, 0);
          applyExpressionDOM('happy');

          if (embedded) {
            const backAnim = el.animate(
              [
                { transform: `translate3d(${rightTravel}px, -22px, 0) rotate(-12deg) scale(0.9)`, opacity: 0.18 },
                { transform: `translate3d(${Math.round(rightTravel * 0.4)}px, -16px, 0) rotate(-7deg) scale(1.02)`, opacity: 0.95, offset: 0.55 },
                { transform: 'translate3d(0px, 0px, 0) rotate(0deg) scale(1)', opacity: 1 },
              ],
              { duration: 580, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
            );
            await backAnim.finished;
            backAnim.cancel();
          } else {
            await returnHome();
          }
        } catch {
          // cancelled
        }
      } else {
        setDeliverySentBadge('تم الإيصال للممرض');
        await sleep(350);
        setIsDeliveringEnvelope(false);
      }

      if (id === gidRef.current) {
        setEffectDOM('sparkles');
        applyExpressionDOM('happy');
        setHeadDOM(0, 0, -2);
        setGazeDOM(0, 0);
        await sleep(550);
        if (id === gidRef.current) {
          actionBusyRef.current = false;
          restDOM();
        }
        window.setTimeout(() => {
          setDeliverySentBadge((curr) => (curr === 'تم الإيصال للممرض' ? null : curr));
        }, 1800);
      }
    }, [applyExpressionDOM, cueEdge, embedded, fly, motionOff, restDOM, returnHome, setEffectDOM, setGazeDOM, setHeadDOM]);

    useImperativeHandle(ref, () => ({
      fly, cueEdge, place, moveToPointNear, returnHome,
      getHome: () => ({ ...homeRef.current }),
      getCurrentPos: () => ({ x: posRef.current.x, y: posRef.current.y }),
      getDimensions: () => getLimits(),
      play, deliverToNurse, pointAt, stopPointing: stopPointingImperative, cancelAction, resetPosition,
    }), [cancelAction, cueEdge, deliverToNurse, fly, getLimits, moveToPointNear, place, play, pointAt, resetPosition, returnHome, stopPointingImperative]);

    useEffect(() => {
      if (embedded) return;
      const initial = loadSavedHome();
      homeRef.current = initial;
      place({ x: initial.x, y: initial.y, r: 0, s: 1, o: 1 });
      emitPosition(initial.x, initial.y);
      const handleResize = () => {
        if (internalBusyRef.current || dragRef.current) return;
        if (positionMode === 'fixed') {
          const def = getDefaultCornerHome();
          homeRef.current = def; place({ x: def.x, y: def.y, r: 0, s: 1, o: 1 }); emitPosition(def.x, def.y);
          return;
        }
        const { minX, maxX, minY, maxY } = getLimits();
        const clamped = { x: clamp(homeRef.current.x, minX, maxX), y: clamp(homeRef.current.y, minY, maxY) };
        homeRef.current = clamped; place({ x: clamped.x, y: clamped.y, r: 0, s: 1, o: 1 }); emitPosition(clamped.x, clamped.y);
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        if (dragRafRef.current !== null) { window.cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null; }
      };
    }, [embedded, emitPosition, getDefaultCornerHome, getLimits, loadSavedHome, place, positionMode]);

    const applyPose = useCallback((nx: number, ny: number) => {
      if (actionBusyRef.current || manualPointingRef.current) return;
      const cx = clamp(nx, -1, 1), cy = clamp(ny, -1, 1);
      if (Math.abs(cx - lastPoseRef.current.nx) < 0.015 && Math.abs(cy - lastPoseRef.current.ny) < 0.015) return;
      lastPoseRef.current = { nx: cx, ny: cy };
      const eyeTransform = `translate3d(${(cx * 6.5).toFixed(2)}px, ${(cy * 5.2).toFixed(2)}px, 0)`;
      if (gzLRef.current) gzLRef.current.style.transform = eyeTransform;
      if (gzRRef.current) gzRRef.current.style.transform = eyeTransform;
      if (headRef.current) {
        headRef.current.style.transform = `translate3d(${(cx * 4.2).toFixed(2)}px, ${(cy * 3.0).toFixed(2)}px, 0) rotate(${(cx * 4.0).toFixed(2)}deg)`;
      }
    }, []);

    useEffect(() => {
      if (pointing && !embedded) {
        const el = robRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const dx = pointing.targetX - (rect.left + rect.width / 2);
          const dy = pointing.targetY - (rect.top + rect.height * 0.36);
          const d = Math.hypot(dx, dy) || 1;
          const k = Math.min(1, d / 110);
          applyPose((dx / d) * k, (dy / d) * k);
        }
        return;
      }
      if (state === 'sleep') { applyPose(0, 0.25); return; }
      if (state === 'thinking') { applyPose(0.8, -0.65); return; }
      if (motionOff) { applyPose(0, 0); return; }

      let rafId = 0, px: number | null = null, py: number | null = null;
      const flush = () => {
        rafId = 0;
        if (px === null || py === null || !robRef.current) return;
        const rect = robRef.current.getBoundingClientRect();
        const dx = px - (rect.left + rect.width / 2);
        const dy = py - (rect.top + rect.height * 0.36);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 160);
        applyPose((dx / d) * k, (dy / d) * k);
      };
      const onPointer = (e: PointerEvent) => {
        if (document.hidden || actionBusyRef.current || manualPointingRef.current) return;
        px = e.clientX; py = e.clientY;
        if (!rafId) rafId = window.requestAnimationFrame(flush);
      };
      const onBlur = () => applyPose(0, 0);
      window.addEventListener('pointermove', onPointer, { passive: true });
      window.addEventListener('pointerdown', onPointer, { passive: true });
      window.addEventListener('blur', onBlur);
      return () => {
        if (rafId) window.cancelAnimationFrame(rafId);
        window.removeEventListener('pointermove', onPointer);
        window.removeEventListener('pointerdown', onPointer);
        window.removeEventListener('blur', onBlur);
      };
    }, [applyPose, embedded, motionOff, pointing, state]);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (effectiveDragDisabled || internalBusyRef.current) return;
      try { robRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      dragRef.current = { sx: e.clientX, sy: e.clientY, ox: homeRef.current.x, oy: homeRef.current.y, moved: false, lx: e.clientX, tilt: 0 };
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) { drag.moved = true; setIsDraggingUI(true); }
      const v = e.clientX - drag.lx;
      drag.lx = e.clientX;
      drag.tilt = drag.tilt * 0.68 + clamp(v * 0.45, -5, 5) * 0.32;
      const { minX, maxX, minY, maxY } = getLimits();
      const nextX = clamp(drag.ox + dx, minX, maxX), nextY = clamp(drag.oy + dy, minY, maxY);
      homeRef.current = { x: nextX, y: nextY };
      pendingDragPointRef.current = { x: nextX, y: nextY, r: drag.tilt, s: 1.03, o: 1 };
      if (dragRafRef.current === null && typeof window !== 'undefined') {
        dragRafRef.current = window.requestAnimationFrame(() => {
          dragRafRef.current = null;
          if (pendingDragPointRef.current) { place(pendingDragPointRef.current); pendingDragPointRef.current = null; }
        });
      }
    };

    const finishDrag = async (e?: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      setIsDraggingUI(false);
      if (dragRafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null;
      }
      if (pendingDragPointRef.current) { place(pendingDragPointRef.current); pendingDragPointRef.current = null; }
      if (e && robRef.current) {
        try { if (robRef.current.hasPointerCapture(e.pointerId)) robRef.current.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      if (!drag.moved) return;
      justDraggedRef.current = true;
      window.setTimeout(() => { justDraggedRef.current = false; }, 80);
      const safeTo = resolveSafeDropPosition(homeRef.current.x, homeRef.current.y);
      internalBusyRef.current = true;
      await glideTo(safeTo.x, safeTo.y, 180, 320);
      homeRef.current = safeTo;
      saveHomeToStorage(safeTo.x, safeTo.y);
      emitPosition(safeTo.x, safeTo.y);
      internalBusyRef.current = false;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (onOpen) { e.preventDefault(); onOpen(); }
        return;
      }
      if (embedded) return;
      const stepMap: Record<string, [number, number]> = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] };
      const delta = stepMap[e.key];
      if (delta && !effectiveDragDisabled && !internalBusyRef.current) {
        e.preventDefault();
        const { minX, maxX, minY, maxY } = getLimits();
        const next = { x: clamp(homeRef.current.x + delta[0], minX, maxX), y: clamp(homeRef.current.y + delta[1], minY, maxY) };
        homeRef.current = next; place({ x: next.x, y: next.y, r: 0, s: 1, o: 1 });
        saveHomeToStorage(next.x, next.y); emitPosition(next.x, next.y);
      }
    };

    const handleClick = () => {
      if (justDraggedRef.current) return;
      onOpen?.();
    };

    const outfitSet = new Set<RobotOutfitItem>(outfit);
    const hasJacket = outfitSet.has('jacket') && !outfitSet.has('coat');
    const hasCoat = outfitSet.has('coat');
    const outfitClasses = outfit.filter((item) => !(item === 'jacket' && hasCoat)).map((item) => `o-${item}`).join(' ');
    const armFill = hasJacket ? `url(#${fjId})` : hasCoat ? `url(#${fcId})` : `url(#${sdId})`;
    const themeClass = theme && theme !== 'white' ? `th-${theme}` : 'th-white';

    const effectiveCarrying = carrying || isDeliveringEnvelope;
    const effectiveSentBadge = sentBadge || deliverySentBadge;

    return (
      <div
        ref={robRef}
        tabIndex={onOpen || !embedded ? 0 : -1}
        role={onOpen || !embedded ? 'button' : 'img'}
        aria-label={ariaLabel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        className={`v9-rob-host no-print ${embedded ? 'embedded' : `size-${size}`} ${isDraggingUI ? 'drag' : ''} ${effectiveDragDisabled ? 'busy' : ''} ${motionOff ? 'motion-off' : ''} ${className}`.trim()}
      >
        {envelopeCount > 0 && effectiveCarrying && (
          <span className="absolute -top-1 -left-1 z-10 min-w-[24px] h-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-md standard-digits" aria-label={`${envelopeCount} رسائل`}>
            {envelopeCount}
          </span>
        )}
        {!effectiveCarrying && alertBadge > 0 && !effectiveSentBadge && (
          <span className="absolute -top-1 -left-1 z-10 min-w-[24px] h-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-md standard-digits">
            {alertBadge}
          </span>
        )}
        {effectiveSentBadge && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-emerald-700 text-white text-[11px] font-bold shadow-md whitespace-nowrap pointer-events-none">
            {effectiveSentBadge}
          </div>
        )}

        <svg className={`v9-rsvg ${themeClass}`} viewBox="40 12 280 346" role="img" aria-hidden="true">
          <defs>
            <linearGradient id={sgId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--s0)' }} /><stop offset=".18" style={{ stopColor: 'var(--s1)' }} />
              <stop offset=".38" style={{ stopColor: 'var(--s2)' }} /><stop offset=".52" style={{ stopColor: 'var(--s3)' }} />
              <stop offset=".62" style={{ stopColor: 'var(--s4)' }} /><stop offset=".8" style={{ stopColor: 'var(--s5)' }} />
              <stop offset="1" style={{ stopColor: 'var(--s6)' }} />
            </linearGradient>
            <linearGradient id={sdId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--d0)' }} /><stop offset=".26" style={{ stopColor: 'var(--d1)' }} />
              <stop offset=".38" style={{ stopColor: 'var(--d2)' }} /><stop offset=".62" style={{ stopColor: 'var(--d3)' }} />
              <stop offset="1" style={{ stopColor: 'var(--d4)' }} />
            </linearGradient>
            <linearGradient id={fjId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--o2)' }} /><stop offset=".4" style={{ stopColor: 'var(--o1)' }} /><stop offset="1" style={{ stopColor: 'var(--o2)' }} />
            </linearGradient>
            <linearGradient id={fcId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#cfd6e2" /><stop offset=".4" stopColor="#fff" /><stop offset="1" stopColor="#c3ccda" />
            </linearGradient>
            <linearGradient id={rimId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" /><stop offset=".38" stopColor="#fff" stopOpacity=".2" />
              <stop offset=".65" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity=".85" />
            </linearGradient>
            <linearGradient id={vgId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#262e3e" /><stop offset="1" stopColor="#0a0e16" />
            </linearGradient>
            <linearGradient id={ppId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#e6ebf3" />
            </linearGradient>
            <pattern id={slId} width="4" height="4" patternUnits="userSpaceOnUse">
              <rect width="4" height="1" fill="#fff" opacity=".06" />
            </pattern>
            <filter id={glId} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id={bl3Id}><feGaussianBlur stdDeviation="3" /></filter>
            <clipPath id={vcId}><rect x="98" y="98" width="164" height="108" rx="46" /></clipPath>
          </defs>

          <g ref={rbRef} className={`v9-rb s-${effectivePropState} ${speaking ? 'speaking' : ''} ${glowing ? 'glowing' : ''} ${effectiveCarrying ? 'carry' : ''} ${envelopeOpen ? 'open' : ''} ${outfitClasses}`.trim()}>
            <g className="v9-bot">
              <g ref={bwRef} className="v9-bw">
                {/* Shoes */}
                <g className="v9-acc v9-shoes">
                  <rect x="155" y="306" width="10" height="18" rx="5" fill={`url(#${sdId})`} />
                  <rect x="195" y="306" width="10" height="18" rx="5" fill={`url(#${sdId})`} />
                  <path d="M138 336 Q138 322 158 322 Q178 322 178 336Z" fill="var(--o1)" />
                  <rect x="136" y="334" width="44" height="8" rx="4" fill="#f4f6fa" stroke="#aab4c2" strokeWidth=".8" />
                  <path d="M182 336 Q182 322 202 322 Q222 322 222 336Z" fill="var(--o1)" />
                  <rect x="180" y="334" width="44" height="8" rx="4" fill="#f4f6fa" stroke="#aab4c2" strokeWidth=".8" />
                  <path d="M146 329 Q158 325 170 329M190 329 Q202 325 214 329" stroke="#fff" strokeOpacity=".4" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                </g>

                {/* Jet Thruster Flames (Flying FX) */}
                <g className="v9-fx-thruster" filter={`url(#${glId})`}>
                  <path className="v9-flame" d="M150 310 Q162 346 172 310 Z" fill="#38bdf8" opacity="0.9" />
                  <path className="v9-flame" d="M188 310 Q198 346 210 310 Z" fill="#38bdf8" opacity="0.9" />
                  <path className="v9-flame" d="M168 312 Q180 356 192 312 Z" fill="#e0f2fe" />
                </g>

                {/* Neck & Body */}
                <rect x="164" y="222" width="32" height="24" rx="8" fill={`url(#${sdId})`} />
                <rect x="128" y="236" width="104" height="76" rx="34" fill={`url(#${sgId})`} />
                <rect x="128.5" y="236.5" width="103" height="75" rx="33.5" fill="none" stroke={`url(#${rimId})`} strokeWidth="1.6" />
                <path d="M142 246 Q180 238 218 246" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="3" strokeLinecap="round" />
                <path d="M136 298 Q180 308 224 298" fill="none" stroke="#6b778a" strokeOpacity=".4" strokeWidth="1.5" />
                <circle cx="180" cy="278" r="19" fill="#151b27" stroke="#dfe5ee" strokeOpacity=".8" strokeWidth="2" />
                <circle cx="180" cy="278" r="23" fill="none" className="v9-gear v9-acs" strokeWidth="2.5" strokeDasharray="6 7" />
                <circle cx="180" cy="278" r="14" className="v9-chest-halo v9-ac" filter={`url(#${glId})`} />
                <circle cx="180" cy="278" r="8" className="v9-pulse v9-ac" filter={`url(#${glId})`} />

                {/* Jacket */}
                <g className="v9-acc v9-jacket">
                  <path d="M126 246 Q124 236 138 236 L160 238 L168 314 L136 314 Q124 314 124 300Z" fill="var(--o1)" stroke="var(--o2)" strokeWidth="1.5" />
                  <path d="M234 246 Q236 236 222 236 L200 238 L192 314 L224 314 Q236 314 236 300Z" fill="var(--o1)" stroke="var(--o2)" strokeWidth="1.5" />
                  <path d="M160 238 L150 262 L167 272M200 238 L210 262 L193 272" fill="none" stroke="var(--o2)" strokeWidth="1.6" />
                  <path d="M158 236 L180 252 L202 236 L196 231 L180 244 L164 231Z" fill="var(--o2)" />
                  <path d="M132 244 Q148 240 160 242" stroke="#fff" strokeOpacity=".25" strokeWidth="2" fill="none" strokeLinecap="round" />
                </g>

                {/* Doctor Coat */}
                <g className="v9-acc v9-coat">
                  <path d="M126 246 Q124 236 138 236 L160 238 L168 314 L136 314 Q124 314 124 300Z" fill="#f7f9fc" stroke="#b4bfd0" strokeWidth="1.5" />
                  <path d="M234 246 Q236 236 222 236 L200 238 L192 314 L224 314 Q236 314 236 300Z" fill="#f7f9fc" stroke="#b4bfd0" strokeWidth="1.5" />
                  <path d="M158 236 L180 254 L202 236 L196 230 L180 246 L164 230Z" fill="#fff" stroke="#b4bfd0" strokeWidth="1.2" />
                  <rect x="134" y="282" width="22" height="18" rx="3" fill="none" stroke="#b4bfd0" strokeWidth="1.4" />
                  <path d="M144 277V287" stroke="#3aa0ff" strokeWidth="2.4" strokeLinecap="round" />
                </g>

                {/* Tie & Stethoscope */}
                <g className="v9-acc v9-tie">
                  <path d="M180 248 L162 240 L162 256Z M180 248 L198 240 L198 256Z" fill="#8f1d2c" />
                  <rect x="175" y="243" width="10" height="10" rx="3" fill="#a8283a" />
                </g>
                <g className="v9-acc v9-steth" fill="none" stroke="#2b3445" strokeWidth="3.5" strokeLinecap="round">
                  <path d="M158 234 Q150 280 178 300M202 234 Q210 280 178 300M178 300 Q196 312 214 300" />
                  <circle cx="214" cy="300" r="7" fill="#cfd6e2" />
                  <circle cx="214" cy="300" r="3" fill="#8a93a3" stroke="none" />
                </g>

                {/* Courier Envelope */}
                <g className="v9-env">
                  <rect x="142" y="270" width="76" height="50" rx="6" fill={`url(#${ppId})`} stroke="#aab4c2" strokeWidth="1.5" />
                  <g className="v9-paper">
                    <rect x="150" y="278" width="60" height="38" rx="3" fill="#fff" stroke="#c4cddb" />
                    <path d="M158 288h44M158 296h44M158 304h28" stroke="#9aa5b5" strokeWidth="2.2" strokeLinecap="round" />
                  </g>
                  <path d="M142 320 L142 290 L180 308 L218 290 L218 320 Z" fill="#eef2f8" stroke="#aab4c2" strokeWidth="1.2" />
                  <path d="M144 271 L180 298 L216 271 Z" className="v9-flap" fill="#dde3ee" stroke="#aab4c2" strokeWidth="1.2" />
                  <circle cx="180" cy="296" r="5" className="v9-seal v9-ac" />
                </g>

                {/* Head */}
                <g ref={headRef} className="v9-hd">
                  <g id={antId}>
                    <rect x="177.5" y="44" width="5" height="30" rx="2.5" fill={`url(#${sdId})`} />
                    <circle cx="180" cy="36" r="10" fill={`url(#${sgId})`} />
                    <circle cx="180" cy="36" r="6" className="v9-ac" filter={`url(#${glId})`} />
                    <circle cx="176.5" cy="32.5" r="1.8" fill="#fff" opacity=".95" />
                  </g>
                  <rect x="62" y="116" width="22" height="56" rx="11" fill={`url(#${sdId})`} />
                  <rect x="276" y="116" width="22" height="56" rx="11" fill={`url(#${sdId})`} />
                  <rect x="70" y="128" width="5" height="32" rx="2.5" className="v9-ac" opacity=".95" filter={`url(#${glId})`} />
                  <rect x="285" y="128" width="5" height="32" rx="2.5" className="v9-ac" opacity=".95" filter={`url(#${glId})`} />
                  <circle cx="73" cy="122" r="2" fill="#fff" stroke="#7a8696" strokeWidth=".8" />
                  <circle cx="73" cy="166" r="2" fill="#fff" stroke="#7a8696" strokeWidth=".8" />
                  <circle cx="287" cy="122" r="2" fill="#fff" stroke="#7a8696" strokeWidth=".8" />
                  <circle cx="287" cy="166" r="2" fill="#fff" stroke="#7a8696" strokeWidth=".8" />

                  <rect x="78" y="70" width="204" height="162" rx="66" fill={`url(#${sgId})`} />
                  <rect x="78.5" y="70.5" width="203" height="161" rx="65.5" fill="none" stroke={`url(#${rimId})`} strokeWidth="2" />
                  <rect x="82" y="74" width="196" height="154" rx="62" fill="none" stroke="#6b778a" strokeOpacity=".35" strokeWidth="1.5" />
                  <ellipse cx="128" cy="90" rx="44" ry="11" fill="#fff" opacity=".6" transform="rotate(-22 128 90)" filter={`url(#${bl3Id})`} />
                  <path d="M104 104 Q116 82 160 76" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity=".95" />
                  <circle cx="111" cy="92" r="2.2" fill="#fff" />
                  <path d="M262 188 Q256 214 226 224" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".8" />

                  {/* Headset */}
                  <g className="v9-acc v9-headset">
                    <path d="M82 126 Q82 66 180 64 Q278 66 278 126" fill="none" stroke="var(--o2)" strokeWidth="7" strokeLinecap="round" />
                    <rect x="52" y="112" width="32" height="66" rx="15" fill="var(--o2)" />
                    <rect x="57" y="118" width="12" height="54" rx="6" fill="var(--o1)" />
                    <rect x="276" y="112" width="32" height="66" rx="15" fill="var(--o2)" />
                    <rect x="291" y="118" width="12" height="54" rx="6" fill="var(--o1)" />
                    <path d="M60 172 Q58 212 112 214" fill="none" stroke="var(--o2)" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="116" cy="214" r="6" fill="var(--o2)" />
                    <circle cx="116" cy="214" r="2.6" className="v9-ac" />
                  </g>

                  {/* Visor & Eyes */}
                  <rect x="94" y="94" width="172" height="116" rx="50" fill="#121823" stroke="#aab4c2" strokeOpacity=".6" strokeWidth="1.2" />
                  <rect x="98" y="98" width="164" height="108" rx="46" fill={`url(#${vgId})`} />
                  <rect x="98" y="98" width="164" height="108" rx="46" fill={`url(#${slId})`} clipPath={`url(#${vcId})`} />
                  <path d="M112 112 Q150 98 204 104 L190 124 Q150 118 112 134 Z" fill="#fff" opacity=".07" clipPath={`url(#${vcId})`} />

                  <g filter={`url(#${glId})`}>
                    <g transform="translate(150 150)">
                      <g ref={gzLRef} className="v9-gz"><g className="v9-bl"><g className="v9-sc">
                        <rect x="-14" y="-17" width="28" height="34" rx="13" className="v9-e" />
                        <rect className="v9-hl" x="-9" y="-12" width="8" height="8" rx="3" fill="#fff" opacity=".85" />
                        <circle className="v9-hl" cx="7" cy="9" r="2" fill="#fff" opacity=".7" />
                      </g></g></g>
                    </g>
                    <g transform="translate(210 150)" className="v9-eye-r">
                      <g ref={gzRRef} className="v9-gz"><g className="v9-bl"><g className="v9-sc">
                        <rect x="-14" y="-17" width="28" height="34" rx="13" className="v9-e" />
                        <rect className="v9-hl" x="-9" y="-12" width="8" height="8" rx="3" fill="#fff" opacity=".85" />
                        <circle className="v9-hl" cx="7" cy="9" r="2" fill="#fff" opacity=".7" />
                      </g></g></g>
                    </g>
                  </g>

                  {/* Rosy Cheeks (Happy / Laugh / Love FX) */}
                  <g className="v9-fx-cheeks">
                    <ellipse cx="128" cy="176" rx="12" ry="6" fill="#fb7185" opacity="0.45" />
                    <ellipse cx="232" cy="176" rx="12" ry="6" fill="#fb7185" opacity="0.45" />
                  </g>

                  {/* Empathy Tear (Sad FX) */}
                  <g className="v9-fx-tear">
                    <path d="M142 169 C138 175 138 182 142 184 C146 182 146 175 142 169 Z" fill="#60a5fa" />
                  </g>

                  {/* Medical Laser Scan Beam (Scan FX) */}
                  <g className="v9-fx-scan" clipPath={`url(#${vcId})`}>
                    <rect x="102" y="146" width="156" height="6" rx="3" fill="#38bdf8" opacity="0.75" filter={`url(#${glId})`} />
                  </g>

                  {/* Glasses */}
                  <g className="v9-acc v9-glasses" fill="rgba(255,255,255,.06)" stroke="var(--gf)" strokeWidth="3">
                    <rect x="125" y="124" width="50" height="52" rx="18" />
                    <rect x="185" y="124" width="50" height="52" rx="18" />
                    <path d="M175 146 Q180 141 185 146M125 142 L104 138M235 142 L256 138" fill="none" />
                    <path d="M133 133 L147 130M193 133 L207 130" stroke="#fff" strokeOpacity=".7" strokeWidth="2" fill="none" strokeLinecap="round" />
                  </g>

                  <path ref={brLRef} className="v9-br" d="" style={{ opacity: 0 }} />
                  <path ref={brRRef} className="v9-br" d="" style={{ opacity: 0 }} />
                  <path ref={moRef} className="v9-mo" d={MOUTH_PATHS[effectivePropState]} filter={`url(#${glId})`} />

                  {/* Hat */}
                  <g className="v9-acc v9-hat">
                    <path d="M96 98 Q96 60 180 54 Q264 60 264 98 Q180 110 96 98Z" fill="var(--o1)" stroke="var(--o2)" strokeWidth="1.5" />
                    <path d="M90 98 Q180 116 270 98 Q266 108 180 113 Q94 108 90 98Z" fill="var(--o2)" />
                    <path d="M180 56V104M110 86 Q128 68 156 60" stroke="#fff" strokeOpacity=".3" strokeWidth="2" fill="none" strokeLinecap="round" />
                  </g>
                  <use className="v9-acc v9-hat" href={`#${antId}`} />
                </g>

                <g className="v9-th">
                  <circle cx="262" cy="70" r="3.5" /><circle cx="274" cy="56" r="5" /><circle cx="290" cy="38" r="8" />
                </g>
                <g className="v9-zz">
                  <text x="250" y="70" fontSize="18">z</text><text x="264" y="52" fontSize="24">Z</text>
                </g>

                {/* Sparkles FX */}
                <g className="v9-fx-sparkles" filter={`url(#${glId})`}>
                  <path d="M68 78 L72 68 L76 78 L86 82 L76 86 L72 96 L68 86 L58 82 Z" fill="#fde047" />
                  <path d="M286 64 L289 56 L292 64 L300 67 L292 70 L289 78 L286 70 L278 67 Z" fill="#38bdf8" />
                  <path d="M272 206 L275 199 L278 206 L285 209 L278 212 L275 219 L272 212 L265 209 Z" fill="#4ade80" />
                </g>

                {/* Floating Hearts FX */}
                <g className="v9-fx-love" filter={`url(#${glId})`}>
                  <path d="M104 62 C104 54 92 54 92 62 C92 70 104 78 104 78 C104 78 116 70 116 62 C116 54 104 54 104 62 Z" fill="#fb7185" />
                  <path d="M254 58 C254 51 244 51 244 58 C244 65 254 72 254 72 C254 72 264 65 264 58 C264 51 254 51 254 58 Z" fill="#f43f5e" />
                </g>
              </g>

              {/* Limbs + Laser Pointer Tip */}
              <g className="v9-arm">
                <g ref={aLRef} className="v9-lim v9-la">
                  <rect className="v9-armf" x="104" y="254" width="16" height="44" rx="8" fill={armFill} transform="rotate(8 112 276)" />
                  <g className="v9-tip" transform="rotate(8 112 276)">
                    <line x1="112" y1="302" x2="112" y2="352" stroke="var(--acc)" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="112" cy="300" r="3.5" className="v9-ac" filter={`url(#${glId})`} />
                  </g>
                </g>
                <g ref={aRRef} className="v9-lim v9-wv">
                  <rect className="v9-armf" x="240" y="254" width="16" height="44" rx="8" fill={armFill} transform="rotate(-8 248 276)" />
                  <g className="v9-tip" transform="rotate(-8 248 276)">
                    <line x1="248" y1="302" x2="248" y2="352" stroke="var(--acc)" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="248" cy="300" r="3.5" className="v9-ac" filter={`url(#${glId})`} />
                  </g>
                </g>
              </g>
            </g>
          </g>
        </svg>
      </div>
    );
  }
);

AssistantRobot.displayName = 'AssistantRobot';
