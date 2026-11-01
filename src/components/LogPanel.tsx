"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ModelConfig, RunResult, TraceEvent } from "@/simulation/types";

interface LogPanelProps {
  model: ModelConfig;
  result: RunResult;
  currentTime: number;
}

const KIND_LABEL: Record<TraceEvent["kind"], string> = {
  create: "создан",
  move: "перемещение",
  seize: "начало обслуживания",
  release: "конец обслуживания",
  exit: "покинул систему",
};

export default function LogPanel({ model, result, currentTime }: LogPanelProps) {
  const blockNames = useMemo(
    () => new Map(model.blocks.map((b) => [b.id, b.name])),
    [model]
  );
  const boxRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const events = result.trace.filter((e) => e.t <= currentTime);
    return events.slice(-200);
  }, [result, currentTime]);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-3 py-1.5 text-sm font-bold text-gray-800">
        Журнал событий
      </div>
      <div ref={boxRef} className="h-32 overflow-y-auto px-3 py-1 font-mono text-[11px] leading-4">
        {visible.map((e, i) => (
          <div key={i} className="whitespace-nowrap">
            <span className="text-gray-400">t={e.t.toFixed(1).padStart(7)}</span>{" "}
            <span className="text-blue-700">агент {e.agentId}</span>{" "}
            <span className="text-gray-700">{KIND_LABEL[e.kind]}</span>{" "}
            {e.kind === "move" && (
              <span className="text-gray-500">
                {blockNames.get(e.from ?? "") ?? e.from} → {blockNames.get(e.to ?? "") ?? e.to}
              </span>
            )}
            {(e.kind === "seize" || e.kind === "release") && (
              <span className="text-gray-500">{blockNames.get(e.blockId ?? "")}</span>
            )}
            {e.kind === "exit" && e.timeInSystem !== undefined && (
              <span className="text-gray-500">(в системе {e.timeInSystem.toFixed(1)} мин)</span>
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <div className="text-gray-400">Нет событий — запустите модель.</div>
        )}
      </div>
    </div>
  );
}
