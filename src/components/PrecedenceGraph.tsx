/**
 * LEANZR FlowLab - Interactive Precedence Network DAG & Critical Path Diagram
 * Visualizes assembly sequence constraints, station grouping, and critical path.
 */

import React, { useMemo, useState } from 'react';
import { Task, Workstation } from '../types/flowlab.ts';
import { GitCommit, ZoomIn, ZoomOut, RotateCcw, AlertTriangle } from 'lucide-react';

interface PrecedenceGraphProps {
  tasks: Task[];
  stations: Workstation[];
  onSelectTask: (task: Task) => void;
}

export const PrecedenceGraph: React.FC<PrecedenceGraphProps> = ({
  tasks,
  stations,
  onSelectTask,
}) => {
  const [zoom, setZoom] = useState(1);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const stationMap = useMemo(() => {
    const map = new Map<string, { code: string; index: number }>();
    stations.forEach((s, idx) => map.set(s.id, { code: s.code, index: idx }));
    return map;
  }, [stations]);

  // Compute Topological Levels for DAG layout
  const { levels, positions, criticalPathTaskIds } = useMemo(() => {
    const taskMap = new Map<string, Task>();
    tasks.forEach((t) => taskMap.set(t.id, t));

    // Calculate level of each task (max level of predecessors + 1)
    const taskLevels = new Map<string, number>();

    function getLevel(taskId: string, visited = new Set<string>()): number {
      if (taskLevels.has(taskId)) return taskLevels.get(taskId)!;
      if (visited.has(taskId)) return 0; // break cycle
      visited.add(taskId);

      const task = taskMap.get(taskId);
      if (!task || task.predecessors.length === 0) {
        taskLevels.set(taskId, 0);
        return 0;
      }

      let maxPredLevel = 0;
      for (const predId of task.predecessors) {
        const lvl = getLevel(predId, new Set(visited));
        if (lvl + 1 > maxPredLevel) {
          maxPredLevel = lvl + 1;
        }
      }

      taskLevels.set(taskId, maxPredLevel);
      return maxPredLevel;
    }

    tasks.forEach((t) => getLevel(t.id));

    // Group tasks by level
    const maxLevel = Math.max(...Array.from(taskLevels.values()), 0);
    const levelBuckets: Task[][] = Array.from({ length: maxLevel + 1 }, () => []);

    tasks.forEach((t) => {
      const lvl = taskLevels.get(t.id) || 0;
      levelBuckets[lvl].push(t);
    });

    // Compute coordinate positions: X = level * 200 + 60, Y = vertical center spacing
    const pos = new Map<string, { x: number; y: number }>();
    const colWidth = 220;
    const rowHeight = 90;

    levelBuckets.forEach((bucket, lvl) => {
      const startY = 80;
      bucket.forEach((task, idx) => {
        pos.set(task.id, {
          x: lvl * colWidth + 80,
          y: startY + idx * rowHeight,
        });
      });
    });

    // Find Critical Path (Longest path by duration from root to leaf)
    const earliestFinish = new Map<string, number>();

    function getEarliestFinish(taskId: string): number {
      if (earliestFinish.has(taskId)) return earliestFinish.get(taskId)!;
      const task = taskMap.get(taskId);
      if (!task) return 0;

      let maxPredFinish = 0;
      for (const predId of task.predecessors) {
        const pf = getEarliestFinish(predId);
        if (pf > maxPredFinish) maxPredFinish = pf;
      }

      const finish = maxPredFinish + task.duration;
      earliestFinish.set(taskId, finish);
      return finish;
    }

    tasks.forEach((t) => getEarliestFinish(t.id));

    // Trace back critical path
    let maxFinishTaskId: string | null = null;
    let maxFinishTime = 0;

    tasks.forEach((t) => {
      const f = earliestFinish.get(t.id) || 0;
      if (f > maxFinishTime) {
        maxFinishTime = f;
        maxFinishTaskId = t.id;
      }
    });

    const criticalIds = new Set<string>();
    let currentId: string | null = maxFinishTaskId;

    while (currentId) {
      criticalIds.add(currentId);
      const currTask = taskMap.get(currentId);
      if (!currTask || currTask.predecessors.length === 0) break;

      let bestPredId: string | null = null;
      let bestPredFinish = -1;

      for (const predId of currTask.predecessors) {
        const pf = earliestFinish.get(predId) || 0;
        if (pf > bestPredFinish) {
          bestPredFinish = pf;
          bestPredId = predId;
        }
      }
      currentId = bestPredId;
    }

    return {
      levels: levelBuckets,
      positions: pos,
      criticalPathTaskIds: criticalIds,
    };
  }, [tasks]);

  const svgWidth = Math.max(800, levels.length * 240 + 100);
  const maxRows = Math.max(...levels.map((l) => l.length), 1);
  const svgHeight = Math.max(480, maxRows * 100 + 120);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 flex flex-col shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-cyan-400" />
            Precedence Network Diagram (DAG) & Critical Path
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Assembly sequence flow. Glowing amber nodes indicate the Critical Path determining theoretical minimum line time.
          </p>
        </div>

        {/* Zoom and Legend Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-300 pr-3 border-r border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs border-2 border-amber-400 bg-amber-950 inline-block" />
              <span>Critical Path</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs border border-slate-600 bg-slate-800 inline-block" />
              <span>Standard Task</span>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            <button
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-mono text-slate-300">
              {(zoom * 100).toFixed(0)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700 ml-1"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SVG Canvas Container */}
      <div className="overflow-auto border border-slate-800 rounded-lg bg-slate-950/80 p-2 relative">
        <svg
          width={svgWidth * zoom}
          height={svgHeight * zoom}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="transition-transform duration-150 origin-top-left"
        >
          <defs>
            {/* Arrowhead marker */}
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748B" />
            </marker>
            <marker
              id="arrow-critical"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#F59E0B" />
            </marker>
          </defs>

          {/* Level Header Guides */}
          {levels.map((_, lvl) => (
            <g key={lvl}>
              <line
                x1={lvl * 220 + 80}
                y1={30}
                x2={lvl * 220 + 80}
                y2={svgHeight - 20}
                stroke="#1E293B"
                strokeDasharray="4 4"
              />
              <text
                x={lvl * 220 + 80}
                y={22}
                textAnchor="middle"
                fill="#64748B"
                fontSize="11"
                fontFamily="monospace"
              >
                Region {lvl + 1}
              </text>
            </g>
          ))}

          {/* Directed Precedence Edges (Lines) */}
          {tasks.map((task) => {
            const targetPos = positions.get(task.id);
            if (!targetPos) return null;

            return task.predecessors.map((predId) => {
              const sourcePos = positions.get(predId);
              if (!sourcePos) return null;

              const isEdgeCritical =
                criticalPathTaskIds.has(task.id) && criticalPathTaskIds.has(predId);

              // Bezier curve connector
              const startX = sourcePos.x + 80;
              const startY = sourcePos.y;
              const endX = targetPos.x - 80;
              const endY = targetPos.y;
              const midX = (startX + endX) / 2;

              return (
                <path
                  key={`${predId}->${task.id}`}
                  d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                  fill="none"
                  stroke={isEdgeCritical ? '#F59E0B' : '#475569'}
                  strokeWidth={isEdgeCritical ? 2.5 : 1.5}
                  strokeDasharray={isEdgeCritical ? 'none' : 'none'}
                  markerEnd={isEdgeCritical ? 'url(#arrow-critical)' : 'url(#arrow)'}
                />
              );
            });
          })}

          {/* Task Nodes */}
          {tasks.map((task) => {
            const pos = positions.get(task.id);
            if (!pos) return null;

            const isCritical = criticalPathTaskIds.has(task.id);
            const isSelected = selectedTaskId === task.id;
            const stationInfo = task.assignedStationId ? stationMap.get(task.assignedStationId) : null;

            return (
              <g
                key={task.id}
                transform={`translate(${pos.x - 70}, ${pos.y - 32})`}
                onClick={() => {
                  setSelectedTaskId(task.id);
                  onSelectTask(task);
                }}
                className="cursor-pointer group"
              >
                {/* Node Box */}
                <rect
                  width="140"
                  height="64"
                  rx="6"
                  fill={isSelected ? '#1E293B' : '#0F172A'}
                  stroke={
                    isSelected
                      ? '#38BDF8'
                      : isCritical
                      ? '#F59E0B'
                      : '#334155'
                  }
                  strokeWidth={isCritical || isSelected ? 2 : 1}
                  className="transition-colors group-hover:stroke-cyan-400"
                />

                {/* Left Category Stripe */}
                <rect
                  x="0"
                  y="0"
                  width="4"
                  height="64"
                  rx="2"
                  fill={
                    task.category === 'VA'
                      ? '#10B981'
                      : task.category === 'NVAR'
                      ? '#F59E0B'
                      : '#F43F5E'
                  }
                />

                {/* Task Code & Duration */}
                <text
                  x="12"
                  y="20"
                  fill="#FFFFFF"
                  fontSize="12"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {task.code}
                </text>
                <text
                  x="128"
                  y="20"
                  textAnchor="end"
                  fill="#38BDF8"
                  fontSize="11"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {task.duration}s
                </text>

                {/* Task Name truncated */}
                <text
                  x="12"
                  y="38"
                  fill="#94A3B8"
                  fontSize="10"
                  fontWeight="500"
                >
                  {task.name.length > 20 ? `${task.name.substring(0, 19)}...` : task.name}
                </text>

                {/* Station Tag */}
                <text
                  x="12"
                  y="54"
                  fill={stationInfo ? '#E2E8F0' : '#EAB308'}
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {stationInfo ? stationInfo.code : 'UNASSIGNED'}
                </text>
                <text
                  x="128"
                  y="54"
                  textAnchor="end"
                  fill="#64748B"
                  fontSize="9"
                >
                  {task.category}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
