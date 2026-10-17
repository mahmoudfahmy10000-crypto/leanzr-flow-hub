/**
 * LEANZR FlowLab - Interactive Precedence Network DAG & Critical Path Diagram
 * Visualizes assembly sequence constraints, station grouping, and critical path.
 */

import React, { useMemo, useState } from 'react';
import { Task, Workstation } from '../types/flowlab.ts';
import { topologicalTaskOrder } from '../utils/project-validation.ts';
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

  // The shared validator guarantees an acyclic order before any layout/path work.
  const { levels, positions, criticalPathTaskIds, graphIssues } = useMemo(() => {
    const graph = topologicalTaskOrder(tasks);
    const positions = new Map<string, { x: number; y: number }>();
    const criticalPathTaskIds = new Set<string>();
    if (graph.issues.length > 0) {
      return { levels: [] as Task[][], positions, criticalPathTaskIds, graphIssues: graph.issues };
    }

    const taskLevels = new Map<string, number>();
    const earliestFinish = new Map<string, number>();
    const criticalPredecessor = new Map<string, string | null>();
    let lastCriticalTask: string | null = null;
    let maxFinish = 0;
    for (const task of graph.order) {
      let level = 0;
      let precedingFinish = 0;
      let precedingId: string | null = null;
      for (const predecessorId of task.predecessors) {
        level = Math.max(level, (taskLevels.get(predecessorId) ?? -1) + 1);
        const finish = earliestFinish.get(predecessorId) ?? 0;
        if (finish > precedingFinish) {
          precedingFinish = finish;
          precedingId = predecessorId;
        }
      }
      taskLevels.set(task.id, level);
      const finish = precedingFinish + task.duration;
      earliestFinish.set(task.id, finish);
      criticalPredecessor.set(task.id, precedingId);
      if (finish > maxFinish) {
        maxFinish = finish;
        lastCriticalTask = task.id;
      }
    }
    const maxLevel = Array.from(taskLevels.values()).reduce((max, level) => Math.max(max, level), 0);
    const levels: Task[][] = Array.from({ length: maxLevel + 1 }, () => []);
    for (const task of graph.order) levels[taskLevels.get(task.id) ?? 0].push(task);
    levels.forEach((bucket, level) => bucket.forEach((task, index) => {
      positions.set(task.id, { x: level * 220 + 80, y: 80 + index * 90 });
    }));
    for (let id = lastCriticalTask; id !== null; id = criticalPredecessor.get(id) ?? null) {
      criticalPathTaskIds.add(id);
    }
    return { levels, positions, criticalPathTaskIds, graphIssues: graph.issues };
  }, [tasks]);

  const svgWidth = Math.max(800, levels.length * 240 + 100);
  const maxRows = levels.reduce((max, level) => Math.max(max, level.length), 1);
  const svgHeight = Math.max(480, maxRows * 100 + 120);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 flex flex-col shadow-sm">
      {graphIssues.length > 0 && (
        <div role="alert" className="mb-4 rounded-lg border border-rose-700 bg-rose-950/40 p-3 text-xs text-rose-200">
          <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" /> Invalid precedence graph</div>
          <p className="mt-1">Correct these references or remove the cyclic dependency before using the network diagram.</p>
          <ul className="mt-2 list-disc pl-4 space-y-1">
            {graphIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
          </ul>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-cyan-400" />
            Precedence Network Diagram (DAG) & Critical Path
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Assembly sequence flow. Amber shows the precedence-only longest path; this is a processing-latency lower bound, not the production interval.
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
