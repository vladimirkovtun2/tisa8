// Типы движка дискретно-событийной симуляции (аналог Process Modeling Library AnyLogic)

export type DistKind = "exponential" | "uniform" | "triangular" | "constant";

export interface DistConfig {
  kind: DistKind;
  /** exponential: среднее; uniform/triangular: не используется напрямую */
  mean?: number;
  /** uniform/triangular: минимум */
  min?: number;
  /** uniform/triangular: максимум */
  max?: number;
  /** triangular: мода */
  mode?: number;
  /** constant: фиксированное значение */
  value?: number;
}

export type BlockType = "source" | "queue" | "service" | "select" | "sink";

interface BlockBase {
  id: string;
  type: BlockType;
  name: string;
  /** координаты центра блока на канвасе (px) */
  x: number;
  y: number;
}

export interface SourceBlock extends BlockBase {
  type: "source";
  /** распределение интервала между прибытиями (мин) */
  interarrival: DistConfig;
  /** время окончания генерации (мин, модельное время) */
  untilTime: number;
  next: string;
}

export interface QueueBlock extends BlockBase {
  type: "queue";
  next: string;
}

export interface ServiceBlock extends BlockBase {
  type: "service";
  /** id пула ресурсов */
  poolId: string;
  /** распределение длительности обслуживания (мин) */
  delay: DistConfig;
  next: string;
}

export interface SelectBlock extends BlockBase {
  type: "select";
  /** вероятность направления по ветви «да» */
  probTrue: number;
  nextTrue: string;
  nextFalse: string;
}

export interface SinkBlock extends BlockBase {
  type: "sink";
}

export type BlockConfig =
  | SourceBlock
  | QueueBlock
  | ServiceBlock
  | SelectBlock
  | SinkBlock;

export interface ResourcePool {
  id: string;
  name: string;
  capacity: number;
}

export interface ModelConfig {
  id: "salon" | "airplane";
  name: string;
  /** единица модельного времени */
  timeUnit: string;
  /** горизонт прогона */
  duration: number;
  blocks: BlockConfig[];
  pools: ResourcePool[];
}

// ---- Результаты прогона ----

export type TraceKind =
  | "create" // агент создан в Source
  | "move" // агент переместился из блока в блок
  | "seize" // агент занял ресурс (вошёл в обслуживание)
  | "release" // агент освободил ресурс
  | "exit"; // агент покинул систему через Sink

export interface TraceEvent {
  t: number;
  kind: TraceKind;
  agentId: number;
  /** блок, породивший/обработавший событие (source, service, sink) */
  blockId?: string;
  /** для move — откуда; для seize/release — блок обслуживания */
  from?: string;
  /** для move — куда */
  to?: string;
  /** для exit — время пребывания в системе */
  timeInSystem?: number;
}

export interface QueueStats {
  countThrough: number;
  meanLength: number;
  maxLength: number;
  meanWait: number;
}

export interface ServiceStats {
  countServed: number;
  meanDelay: number;
  minDelay: number;
  maxDelay: number;
}

export interface PoolStats {
  utilization: number; // 0..1
  busyTime: number;
}

export interface SinkStats {
  count: number;
  meanTimeInSystem: number;
  minTimeInSystem: number;
  maxTimeInSystem: number;
}

export interface RunStats {
  created: number;
  exited: number;
  inSystem: number;
  queues: Record<string, QueueStats>;
  services: Record<string, ServiceStats>;
  pools: Record<string, PoolStats>;
  sinks: Record<string, SinkStats>;
}

/** точка временного ряда для графиков */
export interface SeriesPoint {
  t: number;
  value: number;
}

export interface RunResult {
  trace: TraceEvent[];
  stats: RunStats;
  /** длина очереди по времени для каждого Queue-блока */
  queueSeries: Record<string, SeriesPoint[]>;
  /** число занятых ресурсов по времени для каждого пула */
  poolSeries: Record<string, SeriesPoint[]>;
  finalTime: number;
}
