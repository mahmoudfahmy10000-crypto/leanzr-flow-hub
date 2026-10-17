/**
 * LEANZR FlowLab - Interactive Industrial Yamazumi Chart
 * Lean Manufacturing stacked bar visualization for line balance,
 * takt time comparison, and muda (waste) breakdown.
 */

import React, { useState } from 'react';
import { LineCalculations, Task, StationCalculation } from '../types/flowlab.ts';
import { AlertCircle, HelpCircle, Layers, Maximize2 } from 'lucide-react';

interface YamazumiChartProps {
  metrics: LineCalculations;
  onSelectTask: (task: Task) => void;
  onOpenTaskModal: (task: Task) => void;
}

export const YamazumiChart: React.FC<YamazumiChartProps> = ({
  metrics,
  onSelectTask,
  onOpenTaskModal,
}) => {
  const [viewUnit, setViewUnit] = useState<'seconds' | 'percent'>('seconds');
  const [hoveredTask, setHoveredTask] = useState<Task | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [stackMode, setStackMode] = useState<'tasks' | 'lean_category'>('tasks');

  const takt = metrics.taktTimeSeconds;
  const targetCT = metrics.targetCycleTimeSeconds;

  // Compute chart height scale
  const maxTime = Math.max(
    takt * 1.25,
    metrics.bottleneckCycleTime * 1.15,
    100
  );

  const chartHeightPx = 360; // main SVG bar plotting height

  const getY = (val: number) => {
    if (maxTime <= 0) return chartHeightPx;
    const ratio = Math.min(val / maxTime, 1.2);
    return chartHeightPx - ratio * chartHeightPx;
  };

  const taktY = getY(takt);
  const targetY = getY(targetCT);

  const getCategoryColor = (category: 'VA' | 'NVAR' | 'NVA', isHovered = false) => {
    if (category === 'VA') {
      return isHovered ? '#10B981' : '#059669'; // Emerald
    }
    if (category === 'NVAR') {
      return isHovered ? '#F59E0B' : '#D97706'; // Amber
    }
    return isHovered ? '#F43F5E' : '#E11D48'; // Rose
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-sm flex flex-col">
      {/* Chart Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Yamazumi Workload & Takt Balance Chart
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time stacked cycle time distribution vs Customer Takt ({takt.toFixed(1)}s) & Target ({targetCT.toFixed(1)}s)
          </p>
        </div>

        {/* View Controls & Legend */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Legend */}
          <div className="flex items-center gap-3 text-xs text-slate-300 pr-3 border-r border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
              <span>VA (Value-Add)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-amber-600 inline-block" />
              <span>NVAR (Required Waste)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-rose-600 inline-block" />
              <span>NVA (Pure Waste)</span>
            </div>
          </div>

          {/* Unit Toggle */}
          <div className="flex items-center p-0.5 bg-slate-800 rounded-lg text-xs font-medium">
            <button
              onClick={() => setViewUnit('seconds')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                viewUnit === 'seconds'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Seconds (s)
            </button>
            <button
              onClick={() => setViewUnit('percent')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                viewUnit === 'percent'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              % Takt
            </button>
          </div>

          {/* Stacking Mode Toggle */}
          <div className="flex items-center p-0.5 bg-slate-800 rounded-lg text-xs font-medium">
            <button
              onClick={() => setStackMode('tasks')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                stackMode === 'tasks'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              By Tasks
            </button>
            <button
              onClick={() => setStackMode('lean_category')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                stackMode === 'lean_category'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              By Lean Category
            </button>
          </div>
        </div>
      </div>

      {/* Main Chart Canvas */}
      <div className="relative w-full overflow-x-auto pb-2">
        <div className="min-w-[700px] flex">
          {/* Y-Axis scale labels */}
          <div className="w-16 h-[360px] relative border-r border-slate-800 shrink-0 text-[11px] text-slate-500 font-mono select-none">
            {[1, 0.75, 0.5, 0.25, 0].map((step) => {
              const val = maxTime * step;
              const y = chartHeightPx - step * chartHeightPx;
              return (
                <div
                  key={step}
                  className="absolute right-2 -translate-y-1/2 flex items-center gap-1"
                  style={{ top: `${y}px` }}
                >
                  <span>
                    {viewUnit === 'seconds'
                      ? `${val.toFixed(0)}s`
                      : `${((val / takt) * 100).toFixed(0)}%`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Chart Columns Area */}
          <div className="relative flex-1 h-[360px] pl-4 pr-6">
            {/* Horizontal Grid lines */}
            {[0.25, 0.5, 0.75, 1].map((step) => {
              const y = chartHeightPx - step * chartHeightPx;
              return (
                <div
                  key={step}
                  className="absolute left-0 right-0 border-b border-slate-800/60 pointer-events-none"
                  style={{ top: `${y}px` }}
                />
              );
            })}

            {/* Target Cycle Time Line */}
            {targetCT > 0 && targetY >= 0 && (
              <div
                className="absolute left-0 right-0 pointer-events-none z-10 flex items-center"
                style={{ top: `${targetY}px` }}
              >
                <div className="w-full border-b border-dashed border-amber-500/80" />
                <span className="shrink-0 ml-2 px-1.5 py-0.5 bg-amber-950/80 border border-amber-600/60 text-amber-300 text-[10px] font-mono font-medium rounded-xs">
                  Target CT: {targetCT.toFixed(1)}s
                </span>
              </div>
            )}

            {/* Takt Time Line */}
            {takt > 0 && taktY >= 0 && (
              <div
                className="absolute left-0 right-0 pointer-events-none z-10 flex items-center"
                style={{ top: `${taktY}px` }}
              >
                <div className="w-full border-b-2 border-cyan-400" />
                <span className="shrink-0 ml-2 px-2 py-0.5 bg-cyan-950 border border-cyan-400 text-cyan-200 text-xs font-mono font-bold rounded-xs shadow-xs">
                  TAKT: {takt.toFixed(1)}s
                </span>
              </div>
            )}

            {/* Station Bars Container */}
            <div className="w-full h-full flex items-end gap-6 justify-around pt-6">
              {metrics.stationCalculations.map((sc, stIdx) => {
                const isOver = sc.isOverTakt;
                const isBottleneck = sc.isBottleneck;
                const cycleTime = sc.stationCycleTime;
                const barHeight = maxTime > 0 ? (cycleTime / maxTime) * chartHeightPx : 0;

                return (
                  <div
                    key={sc.station.id}
                    className="flex-1 max-w-[120px] flex flex-col items-center h-full justify-end group"
                  >
                    {/* Top Metric Header for Bar */}
                    <div className="text-center mb-1 text-xs select-none">
                      <span
                        className={`font-mono font-bold tabular-nums text-xs ${
                          isOver
                            ? 'text-rose-400'
                            : isBottleneck
                            ? 'text-amber-400'
                            : 'text-slate-200'
                        }`}
                      >
                        {viewUnit === 'seconds'
                          ? `${cycleTime.toFixed(1)}s`
                          : `${((cycleTime / takt) * 100).toFixed(0)}%`}
                      </span>
                      {sc.station.operatorCount > 1 && (
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {sc.station.operatorCount} ops
                        </span>
                      )}
                    </div>

                    {/* Stacked Bar Body */}
                    <div
                      className={`w-full rounded-t-md overflow-hidden flex flex-col-reverse relative border transition-all ${
                        isBottleneck
                          ? 'border-amber-400 ring-2 ring-amber-400/30'
                          : 'border-slate-700 hover:border-slate-500'
                      }`}
                      style={{ height: `${Math.max(barHeight, 4)}px` }}
                    >
                      {cycleTime === 0 ? (
                        <div className="w-full h-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-500">
                          Empty
                        </div>
                      ) : stackMode === 'tasks' ? (
                        // Individual Task Segments
                        sc.tasks.map((task) => {
                          const taskHeight = (task.duration / (cycleTime * sc.station.operatorCount)) * 100;
                          const isHovered = hoveredTask?.id === task.id;

                          return (
                            <div
                              key={task.id}
                              onClick={() => {
                                onSelectTask(task);
                                onOpenTaskModal(task);
                              }}
                              onMouseEnter={(e) => {
                                setHoveredTask(task);
                                const rect = e.currentTarget.getBoundingClientRect();
                                setHoverPosition({ x: rect.right + 10, y: rect.top });
                              }}
                              onMouseLeave={() => {
                                setHoveredTask(null);
                                setHoverPosition(null);
                              }}
                              className="w-full relative cursor-pointer border-t border-slate-900/40 transition-colors flex items-center justify-center px-1 overflow-hidden"
                              style={{
                                height: `${taskHeight}%`,
                                backgroundColor: getCategoryColor(task.category, isHovered),
                              }}
                            >
                              <span className="text-[10px] font-mono text-white/95 truncate font-medium drop-shadow-xs">
                                {task.duration >= 18 ? task.code : ''}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        // Lean Category Aggregate Segments (VA, NVAR, NVA)
                        <>
                          {sc.vaTime > 0 && (
                            <div
                              className="w-full bg-emerald-600 flex items-center justify-center border-t border-slate-900/40 text-[10px] text-white font-mono"
                              style={{ height: `${(sc.vaTime / sc.totalWorkContent) * 100}%` }}
                            >
                              {sc.vaTime >= 20 ? `${sc.vaTime}s VA` : ''}
                            </div>
                          )}
                          {sc.nvarTime > 0 && (
                            <div
                              className="w-full bg-amber-600 flex items-center justify-center border-t border-slate-900/40 text-[10px] text-white font-mono"
                              style={{ height: `${(sc.nvarTime / sc.totalWorkContent) * 100}%` }}
                            >
                              {sc.nvarTime >= 20 ? `${sc.nvarTime}s NVAR` : ''}
                            </div>
                          )}
                          {sc.nvaTime > 0 && (
                            <div
                              className="w-full bg-rose-600 flex items-center justify-center border-t border-slate-900/40 text-[10px] text-white font-mono"
                              style={{ height: `${(sc.nvaTime / sc.totalWorkContent) * 100}%` }}
                            >
                              {sc.nvaTime >= 15 ? `${sc.nvaTime}s NVA` : ''}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Bottom Station Label */}
                    <div className="mt-3 text-center">
                      <div className="font-semibold text-xs text-white tracking-tight flex items-center justify-center gap-1">
                        <span>{sc.station.code}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 block truncate max-w-[110px]" title={sc.station.name}>
                        {sc.station.name}
                      </span>
                      {/* Status Badges */}
                      <div className="mt-1">
                        {isBottleneck ? (
                          <span className="inline-block px-1.5 py-0.5 bg-amber-950/80 text-amber-300 border border-amber-600/60 rounded-xs text-[9px] font-mono uppercase tracking-wider font-semibold">
                            Bottleneck
                          </span>
                        ) : isOver ? (
                          <span className="inline-block px-1.5 py-0.5 bg-rose-950/80 text-rose-300 border border-rose-600/60 rounded-xs text-[9px] font-mono uppercase tracking-wider font-semibold">
                            Over Takt
                          </span>
                        ) : sc.idleTimeSeconds > 0 ? (
                          <span className="text-[10px] text-slate-500 font-mono">
                            Idle: {sc.idleTimeSeconds.toFixed(0)}s
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Hover Tooltip for Task Segments */}
      {hoveredTask && hoverPosition && (
        <div
          className="fixed z-50 bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl pointer-events-none text-xs w-64"
          style={{
            left: `${Math.min(hoverPosition.x, window.innerWidth - 270)}px`,
            top: `${Math.min(hoverPosition.y, window.innerHeight - 200)}px`,
          }}
        >
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
            <span className="font-mono font-bold text-white text-sm">{hoveredTask.code}</span>
            <span
              className={`font-semibold px-1.5 py-0.5 rounded-xs text-[10px] ${
                hoveredTask.category === 'VA'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                  : hoveredTask.category === 'NVAR'
                  ? 'bg-amber-950 text-amber-300 border border-amber-700'
                  : 'bg-rose-950 text-rose-300 border border-rose-700'
              }`}
            >
              {hoveredTask.category === 'VA'
                ? 'Value-Add'
                : hoveredTask.category === 'NVAR'
                ? 'Type 1 Waste (NVAR)'
                : 'Type 2 Waste (NVA)'}
            </span>
          </div>
          <div className="font-medium text-slate-200 mb-2">{hoveredTask.name}</div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono mb-2">
            <div>
              Duration: <span className="text-white font-bold">{hoveredTask.duration}s</span>
            </div>
            <div>
              Ergo: <span className="text-slate-200 capitalize">{hoveredTask.ergonomics}</span>
            </div>
          </div>
          {hoveredTask.predecessors.length > 0 && (
            <div className="text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5">
              Prerequisites: {hoveredTask.predecessors.length} tasks
            </div>
          )}
          <div className="text-[10px] text-cyan-400 mt-1.5">Click segment to edit or reassign</div>
        </div>
      )}

      {/* Footer Kaizen Note */}
      <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
          <span>
            Lean Rule: Eliminate red NVA waste first, simplify amber NVAR, then balance remaining work across stations.
          </span>
        </span>
        <span className="font-mono text-slate-400">
          Total Work Content: {metrics.totalWorkContentSeconds.toFixed(1)}s ({metrics.vaRatioPercent.toFixed(1)}% VA)
        </span>
      </div>
    </div>
  );
};
