import { createRng, sample } from "./rng";
import type {
  BlockConfig,
  ModelConfig,
  RunResult,
  RunStats,
  SeriesPoint,
  ServiceBlock,
  TraceEvent,
} from "./types";

interface SimEvent {
  time: number;
  order: number;
  kind: "arrival" | "serviceEnd";
  agentId: number;
  blockId: string;
}

/** бинарная min-куча по (time, order) */
class EventHeap {
  private items: SimEvent[] = [];

  get size(): number {
    return this.items.length;
  }

  push(e: SimEvent): void {
    const a = this.items;
    a.push(e);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p])) {
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      } else break;
    }
  }

  pop(): SimEvent | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }

  private less(x: SimEvent, y: SimEvent): boolean {
    return x.time < y.time || (x.time === y.time && x.order < y.order);
  }
}

interface AgentInternal {
  id: number;
  createdAt: number;
  currentBlock: string;
  queueEnterAt: number; // момент постановки в ожидание (очередь блока Service)
}

interface QueueAcc {
  area: number;
  lastT: number;
  len: number;
  maxLength: number;
  countThrough: number;
  waitSum: number;
  waitCount: number;
  series: SeriesPoint[];
}

interface ServiceAcc {
  count: number;
  sum: number;
  min: number;
  max: number;
}

interface SinkAcc {
  count: number;
  sum: number;
  min: number;
  max: number;
}

interface PoolAcc {
  free: number;
  busy: number;
  lastT: number;
  busyArea: number;
  series: SeriesPoint[];
}

const MAX_EVENTS = 1_000_000;

export function runSimulation(model: ModelConfig, seed: number): RunResult {
  const rnd = createRng(seed);
  const heap = new EventHeap();
  const blocks = new Map<string, BlockConfig>(model.blocks.map((b) => [b.id, b]));
  const sourceIds = model.blocks.filter((b) => b.type === "source").map((b) => b.id);

  const agents = new Map<number, AgentInternal>();
  let nextAgentId = 1;
  let now = 0;
  let seq = 0;
  let created = 0;
  let exited = 0;
  const trace: TraceEvent[] = [];

  const queues = new Map<string, number[]>(); // Queue-блоки
  const queueEnterTime = new Map<string, number>(); // "agentId:blockId" -> t
  const serviceWaits = new Map<string, number[]>(); // внутренние очереди Service

  const queueAcc = new Map<string, QueueAcc>();
  const serviceAcc = new Map<string, ServiceAcc>();
  const sinkAcc = new Map<string, SinkAcc>();
  const poolAcc = new Map<string, PoolAcc>();

  for (const b of model.blocks) {
    if (b.type === "queue") {
      queues.set(b.id, []);
      queueAcc.set(b.id, {
        area: 0, lastT: 0, len: 0, maxLength: 0,
        countThrough: 0, waitSum: 0, waitCount: 0, series: [],
      });
    }
    if (b.type === "service") {
      serviceWaits.set(b.id, []);
      serviceAcc.set(b.id, { count: 0, sum: 0, min: Infinity, max: 0 });
    }
    if (b.type === "sink") sinkAcc.set(b.id, { count: 0, sum: 0, min: Infinity, max: 0 });
  }
  for (const p of model.pools) {
    poolAcc.set(p.id, { free: p.capacity, busy: 0, lastT: 0, busyArea: 0, series: [] });
  }

  // ---- вспомогательные функции статистики ----

  function updateQueueLen(id: string, newLen: number): void {
    const acc = queueAcc.get(id)!;
    acc.area += acc.len * (now - acc.lastT);
    acc.lastT = now;
    acc.len = newLen;
    if (newLen > acc.maxLength) acc.maxLength = newLen;
    acc.series.push({ t: now, value: newLen });
  }

  function updatePoolBusy(id: string, newBusy: number): void {
    const acc = poolAcc.get(id)!;
    acc.busyArea += acc.busy * (now - acc.lastT);
    acc.lastT = now;
    acc.busy = newBusy;
    acc.series.push({ t: now, value: newBusy });
  }

  // ---- логика блоков ----

  /** перемещение агента в блок (с записью в трассу) */
  function dispatch(agentId: number, toBlockId: string): void {
    const agent = agents.get(agentId)!;
    trace.push({ t: now, kind: "move", agentId, from: agent.currentBlock, to: toBlockId });
    agent.currentBlock = toBlockId;
    enter(agentId, toBlockId);
  }

  function enter(agentId: number, blockId: string): void {
    const b = blocks.get(blockId)!;
    switch (b.type) {
      case "queue": {
        queues.get(blockId)!.push(agentId);
        queueEnterTime.set(`${agentId}:${blockId}`, now);
        updateQueueLen(blockId, queues.get(blockId)!.length);
        flushQueue(blockId);
        break;
      }
      case "service": {
        tryService(agentId, blockId, true);
        break;
      }
      case "select": {
        const r = rnd();
        dispatch(agentId, r < b.probTrue ? b.nextTrue : b.nextFalse);
        break;
      }
      case "sink": {
        const agent = agents.get(agentId)!;
        const tis = now - agent.createdAt;
        const acc = sinkAcc.get(blockId)!;
        acc.count++;
        acc.sum += tis;
        if (tis < acc.min) acc.min = tis;
        if (tis > acc.max) acc.max = tis;
        exited++;
        trace.push({ t: now, kind: "exit", agentId, blockId, timeInSystem: tis });
        agents.delete(agentId);
        break;
      }
      case "source":
        break;
    }
  }

  /** попытка обслужить агента: занять ресурс или встать во внутреннюю очередь */
  function tryService(agentId: number, serviceId: string, justArrived: boolean): void {
    const b = blocks.get(serviceId)! as ServiceBlock;
    const pool = poolAcc.get(b.poolId)!;
    if (pool.free > 0) {
      pool.free--;
      updatePoolBusy(b.poolId, pool.busy + 1);
      const agent = agents.get(agentId)!;
      agent.queueEnterAt = now;
      trace.push({ t: now, kind: "seize", agentId, blockId: serviceId });
      const d = sample(b.delay, rnd);
      const sa = serviceAcc.get(serviceId)!;
      sa.count++;
      sa.sum += d;
      if (d < sa.min) sa.min = d;
      if (d > sa.max) sa.max = d;
      heap.push({ time: now + d, order: seq++, kind: "serviceEnd", agentId, blockId: serviceId });
    } else {
      serviceWaits.get(serviceId)!.push(agentId);
      if (justArrived) agents.get(agentId)!.queueEnterAt = now;
    }
  }

  /** выталкивание агентов из Queue-блока в следующий, пока возможно */
  function flushQueue(queueId: string): void {
    const q = queues.get(queueId)!;
    const qb = blocks.get(queueId)! as Extract<BlockConfig, { type: "queue" }>;
    while (q.length > 0) {
      const head = q[0];
      const next = blocks.get(qb.next)!;
      if (next.type === "service") {
        const pool = poolAcc.get((next as ServiceBlock).poolId)!;
        if (pool.free === 0) break;
      }
      q.shift();
      updateQueueLen(queueId, q.length);
      const acc = queueAcc.get(queueId)!;
      acc.countThrough++;
      const tEnter = queueEnterTime.get(`${head}:${queueId}`)!;
      acc.waitSum += now - tEnter;
      acc.waitCount++;
      dispatch(head, qb.next);
    }
  }

  /** ресурс освобождён — обслужить внутреннюю очередь, затем связанные Queue-блоки */
  function notifyResourceFree(serviceId: string): void {
    const wait = serviceWaits.get(serviceId)!;
    while (wait.length > 0) {
      const next = blocks.get(serviceId)! as ServiceBlock;
      const pool = poolAcc.get(next.poolId)!;
      if (pool.free === 0) return;
      const agentId = wait.shift()!;
      trace.push({ t: now, kind: "seize", agentId, blockId: serviceId });
      pool.free--;
      updatePoolBusy(next.poolId, pool.busy + 1);
      const d = sample(next.delay, rnd);
      const sa = serviceAcc.get(serviceId)!;
      sa.count++;
      sa.sum += d;
      if (d < sa.min) sa.min = d;
      if (d > sa.max) sa.max = d;
      heap.push({ time: now + d, order: seq++, kind: "serviceEnd", agentId, blockId: serviceId });
    }
    for (const b of model.blocks) {
      if (b.type === "queue" && b.next === serviceId) flushQueue(b.id);
    }
  }

  // ---- генерация прибытий ----
  function scheduleArrival(sourceId: string, atTime: number): void {
    const src = blocks.get(sourceId);
    if (!src || src.type !== "source") return;
    if (atTime >= src.untilTime) return;
    heap.push({ time: atTime, order: seq++, kind: "arrival", agentId: -1, blockId: sourceId });
  }

  for (const sid of sourceIds) scheduleArrival(sid, sample((blocks.get(sid) as Extract<BlockConfig, { type: "source" }>).interarrival, rnd));

  // ---- главный цикл ----
  let processed = 0;
  while (heap.size > 0 && processed < MAX_EVENTS) {
    const e = heap.pop()!;
    if (e.time > model.duration) break;
    now = e.time;
    processed++;

    if (e.kind === "arrival") {
      const src = blocks.get(e.blockId)! as Extract<BlockConfig, { type: "source" }>;
      const agent: AgentInternal = {
        id: nextAgentId++,
        createdAt: now,
        currentBlock: e.blockId,
        queueEnterAt: now,
      };
      agents.set(agent.id, agent);
      created++;
      trace.push({ t: now, kind: "create", agentId: agent.id, blockId: e.blockId });
      scheduleArrival(e.blockId, now + sample(src.interarrival, rnd));
      dispatch(agent.id, src.next);
    } else {
      // serviceEnd
      const s = blocks.get(e.blockId)! as ServiceBlock;
      const pool = poolAcc.get(s.poolId)!;
      trace.push({ t: now, kind: "release", agentId: e.agentId, blockId: e.blockId });
      pool.free++;
      updatePoolBusy(s.poolId, pool.busy - 1);
      dispatch(e.agentId, s.next);
      notifyResourceFree(e.blockId);
    }
  }

  // ---- финализация статистики ----
  const finalTime = now > 0 ? now : 1;

  const stats: RunStats = {
    created,
    exited,
    inSystem: created - exited,
    queues: {},
    services: {},
    pools: {},
    sinks: {},
  };

  const queueSeries: Record<string, SeriesPoint[]> = {};
  for (const [id, acc] of queueAcc) {
    acc.area += acc.len * (finalTime - acc.lastT);
    stats.queues[id] = {
      countThrough: acc.countThrough,
      meanLength: acc.area / finalTime,
      maxLength: acc.maxLength,
      meanWait: acc.waitCount > 0 ? acc.waitSum / acc.waitCount : 0,
    };
    queueSeries[id] = downsample(acc.series, finalTime, acc.len);
  }

  for (const [id, acc] of serviceAcc) {
    stats.services[id] = {
      countServed: acc.count,
      meanDelay: acc.count > 0 ? acc.sum / acc.count : 0,
      minDelay: acc.count > 0 ? acc.min : 0,
      maxDelay: acc.max,
    };
  }

  const poolSeries: Record<string, SeriesPoint[]> = {};
  for (const p of model.pools) {
    const acc = poolAcc.get(p.id)!;
    acc.busyArea += acc.busy * (finalTime - acc.lastT);
    const utilization = acc.busyArea / (finalTime * p.capacity);
    stats.pools[p.id] = { utilization, busyTime: acc.busyArea };
    poolSeries[p.id] = downsample(acc.series, finalTime, acc.busy);
  }

  for (const [id, acc] of sinkAcc) {
    stats.sinks[id] = {
      count: acc.count,
      meanTimeInSystem: acc.count > 0 ? acc.sum / acc.count : 0,
      minTimeInSystem: acc.count > 0 ? acc.min : 0,
      maxTimeInSystem: acc.max,
    };
  }

  return { trace, stats, queueSeries, poolSeries, finalTime };
}

/** прореживание временного ряда до ~300 точек + финальная точка */
function downsample(series: SeriesPoint[], finalTime: number, finalValue: number): SeriesPoint[] {
  if (series.length <= 300) {
    const out = series.slice();
    const last = out[out.length - 1];
    if (!last || last.t < finalTime) out.push({ t: finalTime, value: finalValue });
    return out;
  }
  const stride = Math.ceil(series.length / 300);
  const out: SeriesPoint[] = [];
  for (let i = 0; i < series.length; i += stride) out.push(series[i]);
  out.push({ t: finalTime, value: finalValue });
  return out;
}
