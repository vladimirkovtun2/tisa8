import type { ModelConfig } from "./types";

/**
 * Шаблоны моделей построены по данным лабораторных работ:
 * - ЛР-1: салон красоты — стохастическая СМО с нестрого регламентированными
 *   потоками посетителей; самолёт — детерминированная система, работающая по расписанию.
 * - ЛР-3: спектр услуг салона (стрижка / маникюр / косметология).
 * - ЛР-2/ЛР-4: состав систем (мастера, бригады наземного обслуживания, топливо, багаж).
 */

export interface ModelInfo {
  id: ModelConfig["id"];
  name: string;
  subtitle: string;
  description: string;
}

export const MODEL_INFOS: ModelInfo[] = [
  {
    id: "salon",
    name: "Салон красоты",
    subtitle: "Стохастическая система массового обслуживания",
    description:
      "Социально-экономическая система (ЛР-1): «система массового обслуживания с нестрого регламентированными потоками посетителей». Клиенты приходят в случайные моменты времени (экспоненциальный поток), выбирают услугу из спектра (ЛР-3): стрижка, маникюр или косметология. Общий пул ресурсов — мастера (ЛР-2, ЛР-4). Время обслуживания — треугольное распределение.",
  },
  {
    id: "airplane",
    name: "Самолёт (наземное обслуживание)",
    subtitle: "Детерминированная система, работающая по расписанию",
    description:
      "Техническая система (ЛР-1): «выполняет строго определённые функции по расписанию». Борта прибывают с фиксированным интервалом (расписание) и проходят цепочку регламентных операций (ЛР-4): посадка пассажиров, заправка топливом, погрузка багажа, техосмотр. Каждая операция — свой пул ресурсов (бригады). Все длительности детерминированы.",
  },
];

export function createSalonModel(): ModelConfig {
  return {
    id: "salon",
    name: "Салон красоты",
    timeUnit: "мин",
    duration: 720,
    pools: [{ id: "masters", name: "Мастера", capacity: 4 }],
    blocks: [
      {
        id: "source",
        type: "source",
        name: "Поток клиентов",
        x: 70,
        y: 240,
        interarrival: { kind: "exponential", mean: 15 },
        untilTime: 720,
        next: "selMain",
      },
      {
        id: "selMain",
        type: "select",
        name: "Услуга: стрижка?",
        x: 215,
        y: 240,
        probTrue: 0.45,
        nextTrue: "qHair",
        nextFalse: "selSub",
      },
      {
        id: "selSub",
        type: "select",
        name: "Маникюр?",
        x: 215,
        y: 400,
        probTrue: 0.35,
        nextTrue: "qNail",
        nextFalse: "qCos",
      },
      {
        id: "qHair",
        type: "queue",
        name: "Очередь: стрижка",
        x: 380,
        y: 90,
        next: "sHair",
      },
      {
        id: "sHair",
        type: "service",
        name: "Стрижка",
        x: 560,
        y: 90,
        poolId: "masters",
        delay: { kind: "triangular", min: 20, mode: 35, max: 60 },
        next: "sink",
      },
      {
        id: "qNail",
        type: "queue",
        name: "Очередь: маникюр",
        x: 380,
        y: 240,
        next: "sNail",
      },
      {
        id: "sNail",
        type: "service",
        name: "Маникюр",
        x: 560,
        y: 240,
        poolId: "masters",
        delay: { kind: "triangular", min: 30, mode: 45, max: 70 },
        next: "sink",
      },
      {
        id: "qCos",
        type: "queue",
        name: "Очередь: косметология",
        x: 380,
        y: 390,
        next: "sCos",
      },
      {
        id: "sCos",
        type: "service",
        name: "Косметология",
        x: 560,
        y: 390,
        poolId: "masters",
        delay: { kind: "triangular", min: 40, mode: 60, max: 90 },
        next: "sink",
      },
      {
        id: "sink",
        type: "sink",
        name: "Клиенты обслужены",
        x: 760,
        y: 240,
      },
    ],
  };
}

export function createAirplaneModel(): ModelConfig {
  return {
    id: "airplane",
    name: "Самолёт: наземное обслуживание",
    timeUnit: "мин",
    duration: 1000,
    pools: [
      { id: "attendants", name: "Бортпроводники", capacity: 3 },
      { id: "fuelers", name: "Бригада заправки", capacity: 2 },
      { id: "loaders", name: "Бригада погрузки", capacity: 2 },
      { id: "mechanics", name: "Техники", capacity: 2 },
    ],
    blocks: [
      {
        id: "source",
        type: "source",
        name: "Прибытие борта (расписание)",
        x: 80,
        y: 240,
        interarrival: { kind: "constant", value: 45 },
        untilTime: 901,
        next: "sBoard",
      },
      {
        id: "sBoard",
        type: "service",
        name: "Посадка пассажиров",
        x: 245,
        y: 130,
        poolId: "attendants",
        delay: { kind: "constant", value: 25 },
        next: "sFuel",
      },
      {
        id: "sFuel",
        type: "service",
        name: "Заправка топливом",
        x: 410,
        y: 240,
        poolId: "fuelers",
        delay: { kind: "constant", value: 20 },
        next: "sLoad",
      },
      {
        id: "sLoad",
        type: "service",
        name: "Погрузка багажа",
        x: 575,
        y: 130,
        poolId: "loaders",
        delay: { kind: "constant", value: 30 },
        next: "sCheck",
      },
      {
        id: "sCheck",
        type: "service",
        name: "Техосмотр",
        x: 740,
        y: 240,
        poolId: "mechanics",
        delay: { kind: "constant", value: 15 },
        next: "sink",
      },
      {
        id: "sink",
        type: "sink",
        name: "Вылет рейса",
        x: 890,
        y: 240,
      },
    ],
  };
}

export function createModel(id: ModelConfig["id"]): ModelConfig {
  return id === "salon" ? createSalonModel() : createAirplaneModel();
}
