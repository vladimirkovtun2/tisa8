"use client";

import { useMemo } from "react";
import type { ModelConfig, RunResult, SeriesPoint } from "@/simulation/types";

interface StatsPanelProps {
  model: ModelConfig;
  result: RunResult;
  /** текущее модельное время воспроизведения */
  currentTime: number;
}

function fmt(v: number, digits = 1): string {
  return Number.isFinite(v) ? v.toFixed(digits) : "—";
}

function LineChart({
  title,
  series,
  finalTime,
  yMax,
  color = "#2e7d32",
  height = 70,
}: {
  title: string;
  series: SeriesPoint[];
  finalTime: number;
  yMax: number;
  color?: string;
  height?: number;
}) {
  const W = 250;
  const H = height;
  const pad = 4;
  const maxY = Math.max(yMax, 1e-6);

  const path = useMemo(() => {
    if (series.length === 0) return "";
    const pts = series.map(
      (p) =>
        `${pad + (p.t / Math.max(finalTime, 1e-6)) * (W - 2 * pad)},${H - pad - (p.value / maxY) * (H - 2 * pad)}`
    );
    // ступенчатый вид: продублируем точки по оси X
    let d = `M ${pts[0]}`;
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1];
      const xPrev = pad + (prev.t / Math.max(finalTime, 1e-6)) * (W - 2 * pad);
      d += ` L ${xPrev},${H - pad - (series[i].value / maxY) * (H - 2 * pad)} L ${pts[i]}`;
    }
    return d;
  }, [series, finalTime, maxY, H]);

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-gray-700">{title}</span>
        <span className="text-[10px] text-gray-400">
          max {fmt(maxY, maxY >= 10 ? 0 : 1)}
        </span>
      </div>
      <svg width={W} height={H} className="rounded border border-gray-200 bg-white">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e0e0e0" />
        <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#e0e0e0" />
        {path && <path d={path} fill="none" stroke={color} strokeWidth={1.5} />}
      </svg>
    </div>
  );
}

export default function StatsPanel({ model, result, currentTime }: StatsPanelProps) {
  const { stats, queueSeries, poolSeries, finalTime } = result;

  const queueBlocks = model.blocks.filter((b) => b.type === "queue");
  const serviceBlocks = model.blocks.filter((b) => b.type === "service");
  const sinkBlock = model.blocks.find((b) => b.type === "sink");

  // живые счётчики по событиям до текущего момента воспроизведения
  const live = useMemo(() => {
    let created = 0;
    let exited = 0;
    for (const e of result.trace) {
      if (e.t > currentTime) break;
      if (e.kind === "create") created++;
      else if (e.kind === "exit") exited++;
    }
    return { created, exited, inSystem: created - exited };
  }, [result, currentTime]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <h3 className="text-sm font-bold text-gray-800">Статистика</h3>

      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="rounded bg-blue-50 p-1.5">
          <div className="text-lg font-bold text-blue-700">{live.created}</div>
          <div className="text-[10px] text-gray-600">создано</div>
        </div>
        <div className="rounded bg-green-50 p-1.5">
          <div className="text-lg font-bold text-green-700">{live.exited}</div>
          <div className="text-[10px] text-gray-600">обслужено</div>
        </div>
        <div className="rounded bg-amber-50 p-1.5">
          <div className="text-lg font-bold text-amber-700">{live.inSystem}</div>
          <div className="text-[10px] text-gray-600">в системе</div>
        </div>
      </div>

      <p className="text-[10px] text-gray-400">
        Таблицы и графики ниже — итоги полного прогона (горизонт {finalTime.toFixed(0)} мин).
      </p>

      {queueBlocks.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-gray-700">Очереди</div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pr-1">блок</th>
                <th className="pr-1 text-right">прошло</th>
                <th className="pr-1 text-right">ср. длина</th>
                <th className="pr-1 text-right">макс</th>
                <th className="text-right">ср. ожид.</th>
              </tr>
            </thead>
            <tbody>
              {queueBlocks.map((b) => {
                const s = stats.queues[b.id];
                if (!s) return null;
                return (
                  <tr key={b.id} className="border-t border-gray-100">
                    <td className="pr-1">{b.name}</td>
                    <td className="pr-1 text-right">{s.countThrough}</td>
                    <td className="pr-1 text-right">{fmt(s.meanLength)}</td>
                    <td className="pr-1 text-right">{s.maxLength}</td>
                    <td className="text-right">{fmt(s.meanWait)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {serviceBlocks.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-gray-700">Обслуживание</div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pr-1">блок</th>
                <th className="pr-1 text-right">обслужено</th>
                <th className="pr-1 text-right">ср. время</th>
                <th className="text-right">мин / макс</th>
              </tr>
            </thead>
            <tbody>
              {serviceBlocks.map((b) => {
                const s = stats.services[b.id];
                if (!s) return null;
                return (
                  <tr key={b.id} className="border-t border-gray-100">
                    <td className="pr-1">{b.name}</td>
                    <td className="pr-1 text-right">{s.countServed}</td>
                    <td className="pr-1 text-right">{fmt(s.meanDelay)}</td>
                    <td className="text-right">
                      {fmt(s.minDelay)} / {fmt(s.maxDelay)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-semibold text-gray-700">Загрузка ресурсов</div>
        {model.pools.map((p) => {
          const s = stats.pools[p.id];
          const pct = s ? s.utilization * 100 : 0;
          return (
            <div key={p.id} className="mb-1.5">
              <div className="flex justify-between text-[11px] text-gray-600">
                <span>{p.name}</span>
                <span>{fmt(pct, 0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-gray-200">
                <div
                  className={`h-full ${pct > 95 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-green-600"}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {sinkBlock && stats.sinks[sinkBlock.id] && (
        <div className="rounded bg-gray-50 p-2 text-[11px] text-gray-700">
          <span className="font-semibold">Время в системе</span> ({sinkBlock.name}): среднее{" "}
          {fmt(stats.sinks[sinkBlock.id].meanTimeInSystem)} {model.timeUnit}, мин{" "}
          {fmt(stats.sinks[sinkBlock.id].minTimeInSystem)}, макс{" "}
          {fmt(stats.sinks[sinkBlock.id].maxTimeInSystem)}
        </div>
      )}

      <div className="border-t border-gray-200 pt-2">
        <div className="mb-1 text-xs font-semibold text-gray-700">Графики</div>
        <div className="flex flex-col gap-2">
          {queueBlocks.map((b) => (
            <LineChart
              key={b.id}
              title={`Длина очереди: ${b.name}`}
              series={queueSeries[b.id] ?? []}
              finalTime={finalTime}
              yMax={stats.queues[b.id]?.maxLength ?? 1}
            />
          ))}
          {model.pools.map((p) => {
            const series = poolSeries[p.id] ?? [];
            const maxBusy = Math.max(p.capacity, ...series.map((pt) => pt.value));
            return (
              <LineChart
                key={p.id}
                title={`Занято ресурсов: ${p.name}`}
                series={series}
                finalTime={finalTime}
                yMax={maxBusy}
                color="#1565c0"
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
