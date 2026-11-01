"use client";

import type { BlockConfig, DistConfig, ModelConfig } from "@/simulation/types";
import { distLabel } from "@/simulation/rng";

interface ParamPanelProps {
  model: ModelConfig;
  selectedId: string | null;
  onChange: (model: ModelConfig) => void;
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-gray-700">
      <span>{label}</span>
      <input
        type="number"
        className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
        value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
      />
    </label>
  );
}

function DistEditor({
  label,
  dist,
  onChange,
}: {
  label: string;
  dist: DistConfig;
  onChange: (d: DistConfig) => void;
}) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <select
          className="rounded border border-gray-300 px-1 py-0.5 text-xs"
          value={dist.kind}
          onChange={(e) => {
            const kind = e.target.value as DistConfig["kind"];
            const base: DistConfig = { ...dist, kind };
            if (kind === "exponential" && !base.mean) base.mean = 10;
            if (kind === "constant" && base.value === undefined) base.value = 10;
            if ((kind === "uniform" || kind === "triangular")) {
              if (base.min === undefined) base.min = 5;
              if (base.max === undefined) base.max = 60;
            }
            if (kind === "triangular" && base.mode === undefined) base.mode = 30;
            onChange(base);
          }}
        >
          <option value="exponential">экспоненц.</option>
          <option value="uniform">равномерное</option>
          <option value="triangular">треугольное</option>
          <option value="constant">константа</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        {dist.kind === "exponential" && (
          <NumberField label="среднее (мин)" value={dist.mean ?? 10} min={0.1} onChange={(v) => onChange({ ...dist, mean: v })} />
        )}
        {dist.kind === "constant" && (
          <NumberField label="значение (мин)" value={dist.value ?? 0} min={0} onChange={(v) => onChange({ ...dist, value: v })} />
        )}
        {(dist.kind === "uniform" || dist.kind === "triangular") && (
          <>
            <NumberField label="мин (мин)" value={dist.min ?? 0} min={0} onChange={(v) => onChange({ ...dist, min: v })} />
            {dist.kind === "triangular" && (
              <NumberField label="мода (мин)" value={dist.mode ?? 0} min={0} onChange={(v) => onChange({ ...dist, mode: v })} />
            )}
            <NumberField label="макс (мин)" value={dist.max ?? 1} min={0} onChange={(v) => onChange({ ...dist, max: v })} />
          </>
        )}
      </div>
      <div className="mt-1 text-[10px] text-gray-500">{distLabel(dist)}</div>
    </div>
  );
}

export default function ParamPanel({ model, selectedId, onChange }: ParamPanelProps) {
  const block = model.blocks.find((b) => b.id === selectedId) ?? null;

  const updateBlock = (updated: BlockConfig) => {
    onChange({
      ...model,
      blocks: model.blocks.map((b) => (b.id === updated.id ? updated : b)),
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
      <h3 className="text-sm font-bold text-gray-800">Параметры</h3>

      <NumberField
        label={`Горизонт прогона (${model.timeUnit})`}
        value={model.duration}
        min={10}
        onChange={(v) => onChange({ ...model, duration: v })}
      />

      <div className="mt-1 border-t border-gray-200 pt-2">
        <div className="mb-1 text-xs font-semibold text-gray-700">Пулы ресурсов</div>
        {model.pools.map((p) => (
          <NumberField
            key={p.id}
            label={`${p.name} (ед.)`}
            value={p.capacity}
            min={1}
            max={12}
            onChange={(v) =>
              onChange({
                ...model,
                pools: model.pools.map((x) => (x.id === p.id ? { ...x, capacity: Math.round(v) } : x)),
              })
            }
          />
        ))}
      </div>

      {block ? (
        <div className="mt-1 border-t border-gray-200 pt-2">
          <div className="mb-1 text-xs font-semibold text-gray-700">
            Блок: {block.name} <span className="text-gray-400">({block.type})</span>
          </div>
          {block.type === "source" && (
            <>
              <DistEditor
                label="Интервал между прибытиями"
                dist={block.interarrival}
                onChange={(d) => updateBlock({ ...block, interarrival: d })}
              />
              <NumberField
                label="Генерация до (мин)"
                value={block.untilTime}
                min={1}
                onChange={(v) => updateBlock({ ...block, untilTime: v })}
              />
            </>
          )}
          {block.type === "service" && (
            <>
              <label className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-700">
                <span>Пул ресурсов</span>
                <select
                  className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                  value={block.poolId}
                  onChange={(e) => updateBlock({ ...block, poolId: e.target.value })}
                >
                  {model.pools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <DistEditor
                label="Длительность обслуживания"
                dist={block.delay}
                onChange={(d) => updateBlock({ ...block, delay: d })}
              />
            </>
          )}
          {block.type === "select" && (
            <NumberField
              label="Вероятность «да» (0..1)"
              value={block.probTrue}
              step={0.05}
              min={0}
              max={1}
              onChange={(v) => updateBlock({ ...block, probTrue: Math.min(1, Math.max(0, v)) })}
            />
          )}
          {block.type === "queue" && (
            <p className="text-xs text-gray-500">
              FIFO-очередь бесконечной ёмкости. Агенты ждут здесь, пока в следующем блоке
              обслуживания не освободится ресурс.
            </p>
          )}
          {block.type === "sink" && (
            <p className="text-xs text-gray-500">
              Точка выхода агентов из системы. Фиксирует время пребывания агента в системе.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-1 border-t border-gray-200 pt-2 text-xs text-gray-500">
          Кликните по блоку диаграммы, чтобы редактировать его параметры.
        </p>
      )}
    </div>
  );
}
