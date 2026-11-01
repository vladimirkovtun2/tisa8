"use client";

import { useMemo, useState } from "react";
import Flowchart from "@/components/Flowchart";
import LogPanel from "@/components/LogPanel";
import ParamPanel from "@/components/ParamPanel";
import StatsPanel from "@/components/StatsPanel";
import { runSimulation } from "@/simulation/engine";
import { createModel, MODEL_INFOS } from "@/simulation/models";
import type { ModelConfig } from "@/simulation/types";

const SPEEDS = [1, 2, 5, 10, 20, 50];
const DEFAULT_SEED = 42;

export default function Home() {
  const [modelId, setModelId] = useState<ModelConfig["id"]>("salon");
  const [model, setModel] = useState<ModelConfig>(() => createModel("salon"));
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [runCounter, setRunCounter] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stepSignal, setStepSignal] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const result = useMemo(() => {
    void runCounter; // «Стоп»: пересоздать результат прогона с теми же параметрами
    return runSimulation(model, seed);
  }, [model, seed, runCounter]);

  const info = MODEL_INFOS.find((m) => m.id === modelId)!;

  const switchModel = (id: ModelConfig["id"]) => {
    setModelId(id);
    setModel(createModel(id));
    setSelectedId(null);
    setPlaying(false);
    setCurrentTime(0);
    setStepSignal(0);
  };

  const handleParamChange = (m: ModelConfig) => {
    setModel(m);
    setPlaying(false);
    setCurrentTime(0);
  };

  const stop = () => {
    setPlaying(false);
    setCurrentTime(0);
    setStepSignal(0);
    setRunCounter((c) => c + 1);
  };

  const handleTick = (t: number, done: boolean) => {
    setCurrentTime(t);
    if (done) setPlaying(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 text-gray-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-3">
        <header>
          <h1 className="text-xl font-bold">
            Имитация AnyLogic <span className="text-gray-400">·</span>{" "}
            <span className="text-green-700">Process Modeling Library</span>
          </h1>
          <p className="text-sm text-gray-600">
            Лабораторная работа №8 · дисциплина «Теория систем и системный анализ» · входные
            данные — системы из ЛР №1–7
          </p>
        </header>

        {/* выбор системы */}
        <div className="flex gap-2">
          {MODEL_INFOS.map((m) => (
            <button
              key={m.id}
              onClick={() => switchModel(m.id)}
              className={`rounded-lg border px-4 py-2 text-left text-sm transition ${
                modelId === m.id
                  ? "border-green-600 bg-green-600 text-white"
                  : "border-gray-300 bg-white hover:border-green-500"
              }`}
            >
              <div className="font-semibold">{m.name}</div>
              <div
                className={`text-xs ${modelId === m.id ? "text-green-100" : "text-gray-500"}`}
              >
                {m.subtitle}
              </div>
            </button>
          ))}
        </div>

        <p className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs leading-5 text-gray-600">
          {info.description}
        </p>

        {/* панель управления прогоном */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
          {!playing ? (
            <button
              onClick={() => setPlaying(true)}
              className="rounded bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700"
            >
              ▶ Запуск
            </button>
          ) : (
            <button
              onClick={() => setPlaying(false)}
              className="rounded bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-600"
            >
              ⏸ Пауза
            </button>
          )}
          <button
            onClick={() => {
              setPlaying(false);
              setStepSignal((s) => s + 1);
            }}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Шаг
          </button>
          <button
            onClick={stop}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            ⏹ Стоп
          </button>

          <label className="ml-2 flex items-center gap-1 text-sm text-gray-600">
            Скорость
            <select
              className="rounded border border-gray-300 px-1 py-1 text-sm"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s} мин/с
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-gray-600">
              Модельное время:{" "}
              <span className="font-mono font-bold text-gray-900">
                {currentTime.toFixed(1)} мин
              </span>
            </span>
            <span className="text-gray-500">
              seed: <span className="font-mono">{seed}</span>
            </span>
            <button
              onClick={() => {
                setSeed(Math.floor(Math.random() * 100000));
                setPlaying(false);
                setCurrentTime(0);
              }}
              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
              title="Новый seed — новая случайная реализация"
            >
              🎲 seed
            </button>
          </div>
        </div>

        {/* основная область */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-2 lg:col-span-2">
            <Flowchart
              model={model}
              result={result}
              playing={playing}
              rate={rate}
              selectedId={selectedId}
              onSelect={setSelectedId}
              stepSignal={stepSignal}
              onAutoPause={() => setPlaying(false)}
              onTick={handleTick}
            />
          </div>
          <div className="flex flex-col gap-3">
            <ParamPanel model={model} selectedId={selectedId} onChange={handleParamChange} />
            <StatsPanel model={model} result={result} currentTime={currentTime} />
          </div>
        </div>

        <LogPanel model={model} result={result} currentTime={currentTime} />
      </div>
    </div>
  );
}
