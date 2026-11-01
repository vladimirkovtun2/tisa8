"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BlockConfig, ModelConfig, RunResult } from "@/simulation/types";

interface AgentView {
  state: "moving" | "parked" | "seized";
  from?: string;
  to?: string;
  progress: number;
  block: string;
}

interface Edge {
  from: string;
  to: string;
  label?: string;
}

interface FlowchartProps {
  model: ModelConfig;
  result: RunResult;
  playing: boolean;
  /** скорость: единиц модельного времени в секунду */
  rate: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  stepSignal: number;
  onAutoPause: () => void;
  onTick: (time: number, done: boolean) => void;
}

const QUEUE_W = 132;
const BLOCK_H = 60;
const SERVICE_W = 132;
/** минут модельного времени на 1 px пути агента */
const MIN_PER_PX = 0.05;

function getEdges(model: ModelConfig): Edge[] {
  const edges: Edge[] = [];
  for (const b of model.blocks) {
    if (b.type === "source") edges.push({ from: b.id, to: b.next });
    else if (b.type === "queue") edges.push({ from: b.id, to: b.next });
    else if (b.type === "service") edges.push({ from: b.id, to: b.next });
    else if (b.type === "select") {
      edges.push({ from: b.id, to: b.nextTrue, label: "да" });
      edges.push({ from: b.id, to: b.nextFalse, label: "нет" });
    }
  }
  return edges;
}

export default function Flowchart({
  model,
  result,
  playing,
  rate,
  selectedId,
  onSelect,
  stepSignal,
  onAutoPause,
  onTick,
}: FlowchartProps) {
  const blockById = useMemo(
    () => new Map<string, BlockConfig>(model.blocks.map((b) => [b.id, b])),
    [model]
  );
  const poolById = useMemo(
    () => new Map(model.pools.map((p) => [p.id, p])),
    [model]
  );
  const edges = useMemo(() => getEdges(model), [model]);

  const [agents, setAgents] = useState<Map<number, AgentView>>(new Map());
  const agentsRef = useRef<Map<number, AgentView>>(new Map());
  const idxRef = useRef(0);
  const timeRef = useRef(0);
  const doneRef = useRef(false);
  const [, setFrame] = useState(0);

  const center = (id: string) => {
    const b = blockById.get(id);
    return b ? { x: b.x, y: b.y } : { x: 0, y: 0 };
  };

  const travelTime = (from: string, to: string) => {
    const a = center(from);
    const b = center(to);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    return Math.min(40, Math.max(1.5, d * MIN_PER_PX));
  };

  function applyEvent(e: (typeof result.trace)[number]) {
    const m = agentsRef.current;
    switch (e.kind) {
      case "create":
        m.set(e.agentId, { state: "parked", block: e.blockId!, progress: 0 });
        break;
      case "move":
        m.set(e.agentId, {
          state: "moving",
          from: e.from,
          to: e.to!,
          progress: 0,
          block: e.to!,
        });
        break;
      case "seize": {
        const a = m.get(e.agentId);
        if (a) {
          a.state = "seized";
          a.block = e.blockId!;
        }
        break;
      }
      case "release": {
        const a = m.get(e.agentId);
        if (a) {
          a.state = "parked";
          a.block = e.blockId!;
        }
        break;
      }
      case "exit":
        m.delete(e.agentId);
        break;
    }
  }

  /** продвинуть воспроизведение на dt единиц модельного времени */
  function advance(dt: number) {
    timeRef.current += dt;
    const trace = result.trace;
    while (idxRef.current < trace.length && trace[idxRef.current].t <= timeRef.current) {
      applyEvent(trace[idxRef.current]);
      idxRef.current++;
    }
    const m = agentsRef.current;
    for (const a of m.values()) {
      if (a.state === "moving") {
        const tt = travelTime(a.from!, a.to!);
        a.progress = Math.min(1, a.progress + dt / tt);
        if (a.progress >= 1) {
          a.state = "parked";
          a.block = a.to!;
        }
      }
    }
    setAgents(new Map(m));
    setFrame((f) => f + 1);
    const done = idxRef.current >= trace.length;
    if (done && !doneRef.current) {
      doneRef.current = true;
      onTick(timeRef.current, true);
    } else {
      onTick(timeRef.current, false);
    }
  }

  // сброс при новом результате прогона
  useEffect(() => {
    agentsRef.current = new Map();
    idxRef.current = 0;
    timeRef.current = 0;
    doneRef.current = false;
    setAgents(new Map());
    setFrame((f) => f + 1);
  }, [result]);

  // игровой цикл
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (nowMs: number) => {
      const dt = Math.min(0.25, (nowMs - last) / 1000);
      last = nowMs;
      advance(dt * rate);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, rate, result]);

  // пошаговый режим: применить пачку событий следующего временного шага
  useEffect(() => {
    if (stepSignal === 0) return;
    const trace = result.trace;
    if (idxRef.current >= trace.length) return;
    const target = trace[idxRef.current].t;
    timeRef.current = target;
    while (idxRef.current < trace.length && trace[idxRef.current].t <= target) {
      applyEvent(trace[idxRef.current]);
      idxRef.current++;
    }
    doneRef.current = idxRef.current >= trace.length;
    setAgents(new Map(agentsRef.current));
    setFrame((f) => f + 1);
    onTick(timeRef.current, doneRef.current);
    onAutoPause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepSignal]);

  // позиции агентов для текущего кадра
  const agentDots: { id: number; x: number; y: number }[] = [];
  const queueCounts = new Map<string, number>();
  const serviceBusy = new Map<string, number>();
  const serviceWait = new Map<string, number>();

  for (const [id, a] of agents) {
    if (a.state === "moving" && a.from && a.to) {
      const p0 = center(a.from);
      const p1 = center(a.to);
      const t = a.progress;
      agentDots.push({
        id,
        x: p0.x + (p1.x - p0.x) * t,
        y: p0.y + (p1.y - p0.y) * t - Math.sin(t * Math.PI) * 10,
      });
    } else if (a.state === "seized") {
      const n = serviceBusy.get(a.block) ?? 0;
      serviceBusy.set(a.block, n + 1);
      const b = center(a.block);
      agentDots.push({ id, x: b.x - 40 + n * 18, y: b.y + 10 });
    } else {
      const blk = blockById.get(a.block);
      if (!blk) continue;
      if (blk.type === "queue") {
        const n = queueCounts.get(a.block) ?? 0;
        queueCounts.set(a.block, n + 1);
        agentDots.push({
          id,
          x: blk.x - QUEUE_W / 2 + 22 + (n % 6) * 18,
          y: blk.y + 6 + Math.floor(n / 6) * 14,
        });
      } else if (blk.type === "service") {
        const n = serviceWait.get(a.block) ?? 0;
        serviceWait.set(a.block, n + 1);
        agentDots.push({
          id,
          x: blk.x - SERVICE_W / 2 + 22 + (n % 6) * 18,
          y: blk.y + 24 + Math.floor(n / 6) * 13,
        });
      } else {
        const n = 0;
        agentDots.push({ id, x: blk.x + 24 + (n % 3) * 13, y: blk.y - 20 });
      }
    }
  }

  const agentColor = model.id === "salon" ? "#1e88e5" : "#ef6c00";

  return (
    <svg
      viewBox="0 0 980 500"
      className="h-auto w-full select-none"
      onClick={() => onSelect(null)}
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#666" />
        </marker>
      </defs>

      {/* фон */}
      <rect x={0} y={0} width={980} height={500} fill="#fafbfc" rx={8} />

      {/* связи */}
      {edges.map((e, i) => {
        const a = center(e.from);
        const b = center(e.to);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        return (
          <g key={i}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#888"
              strokeWidth={1.6}
              markerEnd="url(#arrow)"
            />
            {e.label && (
              <text x={mx} y={my - 5} fontSize={11} fill="#555" textAnchor="middle">
                {e.label}
              </text>
            )}
          </g>
        );
      })}

      {/* блоки */}
      {model.blocks.map((b) => {
        const isSel = selectedId === b.id;
        const common = {
          onClick: (ev: React.MouseEvent) => {
            ev.stopPropagation();
            onSelect(b.id);
          },
          style: { cursor: "pointer" as const },
        };
        if (b.type === "source") {
          return (
            <g key={b.id} {...common}>
              <circle
                cx={b.x}
                cy={b.y}
                r={22}
                fill="#9ccc65"
                stroke={isSel ? "#ff6f00" : "#33691e"}
                strokeWidth={isSel ? 3 : 1.6}
              />
              <path
                d={`M ${b.x - 5} ${b.y - 9} L ${b.x + 10} ${b.y} L ${b.x - 5} ${b.y + 9} Z`}
                fill="#1b5e20"
              />
              <text x={b.x} y={b.y + 40} fontSize={11} textAnchor="middle" fill="#333">
                {b.name}
              </text>
            </g>
          );
        }
        if (b.type === "queue") {
          const n = queueCounts.get(b.id) ?? 0;
          return (
            <g key={b.id} {...common}>
              <rect
                x={b.x - QUEUE_W / 2}
                y={b.y - BLOCK_H / 2}
                width={QUEUE_W}
                height={BLOCK_H}
                rx={8}
                fill="#c8e6c9"
                stroke={isSel ? "#ff6f00" : "#558b2f"}
                strokeWidth={isSel ? 3 : 1.6}
              />
              {Array.from({ length: 8 }).map((_, i) => (
                <rect
                  key={i}
                  x={b.x - QUEUE_W / 2 + 10 + i * 14}
                  y={b.y - BLOCK_H / 2 + 8}
                  width={8}
                  height={14}
                  fill={i < n ? "#33691e" : "#a5d6a7"}
                />
              ))}
              <text x={b.x} y={b.y - 2} fontSize={11} textAnchor="middle" fill="#1b5e20" fontWeight={600}>
                {b.name}
              </text>
              <text x={b.x} y={b.y + 46} fontSize={11} textAnchor="middle" fill="#555">
                очередь: {n}
              </text>
            </g>
          );
        }
        if (b.type === "service") {
          const pool = poolById.get(b.poolId);
          const cap = pool?.capacity ?? 1;
          const busy = serviceBusy.get(b.id) ?? 0;
          const waiting = serviceWait.get(b.id) ?? 0;
          return (
            <g key={b.id} {...common}>
              <rect
                x={b.x - SERVICE_W / 2}
                y={b.y - BLOCK_H / 2 - 6}
                width={SERVICE_W}
                height={BLOCK_H + 12}
                rx={8}
                fill="#ffffff"
                stroke={isSel ? "#ff6f00" : "#2e7d32"}
                strokeWidth={isSel ? 3 : 1.8}
              />
              <text x={b.x} y={b.y - BLOCK_H / 2 + 8} fontSize={11} textAnchor="middle" fill="#1b5e20" fontWeight={600}>
                {b.name}
              </text>
              {Array.from({ length: cap }).map((_, i) => (
                <circle
                  key={i}
                  cx={b.x - ((cap - 1) * 16) / 2 + i * 16}
                  cy={b.y + 10}
                  r={5.5}
                  fill={i < busy ? "#2e7d32" : "#e0e0e0"}
                  stroke="#9e9e9e"
                  strokeWidth={0.8}
                />
              ))}
              <text x={b.x} y={b.y + BLOCK_H / 2 + 22} fontSize={11} textAnchor="middle" fill="#555">
                {pool?.name}: {busy}/{cap}
                {waiting > 0 ? ` (+${waiting} ждут)` : ""}
              </text>
            </g>
          );
        }
        if (b.type === "select") {
          return (
            <g key={b.id} {...common}>
              <polygon
                points={`${b.x},${b.y - 34} ${b.x + 58},${b.y} ${b.x},${b.y + 34} ${b.x - 58},${b.y}`}
                fill="#fff9c4"
                stroke={isSel ? "#ff6f00" : "#f9a825"}
                strokeWidth={isSel ? 3 : 1.6}
              />
              <text x={b.x} y={b.y - 2} fontSize={10.5} textAnchor="middle" fill="#5d4037">
                {b.name}
              </text>
              <text x={b.x} y={b.y + 11} fontSize={10} textAnchor="middle" fill="#8d6e63">
                {(b.probTrue * 100).toFixed(0)}% / {(100 - b.probTrue * 100).toFixed(0)}%
              </text>
            </g>
          );
        }
        // sink
        return (
          <g key={b.id} {...common}>
            <circle
              cx={b.x}
              cy={b.y}
              r={20}
              fill="#ef9a9a"
              stroke={isSel ? "#ff6f00" : "#b71c1c"}
              strokeWidth={isSel ? 3 : 1.6}
            />
            <path
              d={`M ${b.x - 8} ${b.y - 6} L ${b.x + 8} ${b.y - 6} M ${b.x} ${b.y - 6} L ${b.x} ${b.y + 8} M ${b.x - 6} ${b.y + 8} L ${b.x + 6} ${b.y + 8}`}
              stroke="#7f0000"
              strokeWidth={2.4}
              fill="none"
            />
            <text x={b.x} y={b.y + 40} fontSize={11} textAnchor="middle" fill="#333">
              {b.name}
            </text>
          </g>
        );
      })}

      {/* агенты */}
      {agentDots.map((d) => (
        <circle
          key={d.id}
          cx={d.x}
          cy={d.y}
          r={6}
          fill={agentColor}
          stroke="#fff"
          strokeWidth={1.4}
        />
      ))}
    </svg>
  );
}
