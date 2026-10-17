/**
 * LEANZR FlowLab - Interactive Industrial Yamazumi Chart
 * Lean Manufacturing stacked bar visualization for line balance,
 * takt time comparison, and muda (waste) breakdown.
 */

import React, { useState } from 'react';
import { LineCalculations, Task } from '../types/flowlab.ts';
import { HelpCircle, Layers } from 'lucide-react';

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
    Math.min(Number.MAX_VALUE, takt * 1.25),
    Math.min(Number.MAX_VALUE, metrics.bottleneckCycleTime * 1.15),
    Math.min(Number.MAX_VALUE, targetCT * 1.15),
    100
  );

  const chartHeightPx = 360;
  const columnLayout = { gridTemplateColumns: `repeat(${Math.max(1, metrics.stationCalculations.length)}, minmax(80px, 1fr))` };
  const displayValue = (seconds: number) => viewUnit === 'seconds'
    ? `${seconds.toFixed(1)}s`
    : takt > 0 ? `${((seconds / takt) * 100).toFixed(0)}%` : 'N/A';

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

      {/* Headers and labels are outside the fixed plot; every bar shares its zero baseline. */}
      <div className="w-full overflow-x-auto pb-2">
        <div className="flex" style={{ minWidth: `${Math.max(700, metrics.stationCalculations.length * 110 + 64)}px` }}>
          <div className="w-16 shrink-0 pt-12">
            <div className="relative border-r border-slate-800 text-[11px] text-slate-500 font-mono select-none" style={{ height: chartHeightPx }}>
              {[1, 0.75, 0.5, 0.25, 0].map(step => (
                <div key={step} className="absolute right-2 -translate-y-1/2" style={{ top: chartHeightPx * (1 - step) }}>
                  {displayValue(maxTime * step)}
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="grid h-12 items-center gap-6 px-4 text-center text-xs font-mono" style={columnLayout}>
              {metrics.stationCalculations.map(sc => (
                <div key={sc.station.id}>
                  <span className={`font-bold ${sc.isOverTakt ? 'text-rose-400' : sc.isBottleneck ? 'text-amber-400' : 'text-slate-200'}`}>
                    {displayValue(sc.stationCycleTime)}
                  </span>
                  <span className="block text-[10px] text-slate-400">{sc.station.operatorCount} ops · sequential</span>
                </div>
              ))}
            </div>
            <div data-testid="yamazumi-plot" data-max-seconds={maxTime} className="relative" style={{ height: chartHeightPx }}>
              <div className="absolute bottom-0 left-0 right-0 border-t border-slate-600 pointer-events-none" />
              {[0.25, 0.5, 0.75, 1].map(step => (
                <div key={step} className="absolute left-0 right-0 border-t border-slate-800/60 pointer-events-none" style={{ top: chartHeightPx * (1 - step) }} />
              ))}
              {targetCT > 0 && targetY >= 0 && (
                <div data-testid="yamazumi-target-line" data-seconds={targetCT} className="absolute left-0 right-0 border-t border-dashed border-amber-500/80 pointer-events-none z-10" style={{ top: targetY }}>
                  <span className="absolute right-32 bottom-0 px-1.5 py-0.5 bg-amber-950/90 border border-amber-600/60 text-amber-300 text-[10px] font-mono rounded-xs">
                    Target: {targetCT.toFixed(1)}s
                  </span>
                </div>
              )}
              {takt > 0 && taktY >= 0 && (
                <div data-testid="yamazumi-takt-line" data-seconds={takt} className="absolute left-0 right-0 border-t-2 border-cyan-400 pointer-events-none z-10" style={{ top: taktY }}>
                  <span className="absolute right-0 bottom-0 px-2 py-0.5 bg-cyan-950 border border-cyan-400 text-cyan-200 text-[10px] font-mono font-bold rounded-xs">
                    TAKT: {takt.toFixed(1)}s
                  </span>
                </div>
              )}
              <div className="absolute inset-0 grid gap-6 px-4" style={columnLayout}>
                {metrics.stationCalculations.map(sc => {
                  const cycleTime = sc.stationCycleTime;
                  const barHeight = maxTime > 0 ? (cycleTime / maxTime) * chartHeightPx : 0;
                  return (
                    <div key={sc.station.id} className="relative flex items-end justify-center min-w-0">
                      <div
                        data-testid="yamazumi-bar"
                        data-station-id={sc.station.id}
                        data-seconds={cycleTime}
                        className={`w-full max-w-[120px] shrink-0 rounded-t-md overflow-hidden flex flex-col-reverse ${sc.isBottleneck ? 'ring-2 ring-amber-400/60' : ''}`}
                        style={{ height: barHeight }}
                      >
                        {cycleTime > 0 && (stackMode === 'tasks' ? sc.tasks.map(task => (
                          <button
                            key={task.id}
                            type="button"
                            aria-label={`Edit ${task.code}: ${task.name}`}
                            onClick={() => { onSelectTask(task); onOpenTaskModal(task); }}
                            onMouseEnter={event => {
                              setHoveredTask(task);
                              const rect = event.currentTarget.getBoundingClientRect();
                              setHoverPosition({ x: rect.right + 10, y: rect.top });
                            }}
                            onMouseLeave={() => { setHoveredTask(null); setHoverPosition(null); }}
                            className="w-full min-h-0 shrink-0 relative cursor-pointer border-t border-slate-900/40 transition-colors flex items-center justify-center px-1 overflow-hidden focus-visible:outline-2 focus-visible:outline-white focus-visible:-outline-offset-2"
                            style={{ flex: `0 0 ${(task.duration / cycleTime) * 100}%`, backgroundColor: getCategoryColor(task.category, hoveredTask?.id === task.id) }}
                          >
                            <span className="text-[10px] font-mono text-white/95 truncate font-medium drop-shadow-xs">{task.duration >= 18 ? task.code : ''}</span>
                          </button>
                        )) : ([['VA', sc.vaTime], ['NVAR', sc.nvarTime], ['NVA', sc.nvaTime]] as const).filter(([, duration]) => duration > 0).map(([category, duration]) => (
                          <div key={category} className="w-full min-h-0 overflow-hidden shrink-0 border-t border-slate-900/40 flex items-center justify-center text-[10px] text-white font-mono" style={{ flex: `0 0 ${(duration / cycleTime) * 100}%`, backgroundColor: getCategoryColor(category) }}>
                            {duration >= 20 ? `${duration}s ${category}` : ''}
                          </div>
                        )))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-6 px-4 pt-3 text-center" style={columnLayout}>
              {metrics.stationCalculations.map(sc => (
                <div key={sc.station.id} className="min-w-0">
                  <div className="font-semibold text-xs text-white">{sc.station.code}</div>
                  <div className="text-[11px] text-slate-400 truncate" title={sc.station.name}>{sc.station.name}</div>
                  <div className="mt-1 text-[10px] font-mono">
                    {sc.isOverTakt ? <span className="text-rose-300">Over Takt</span> : sc.isBottleneck ? <span className="text-amber-300">Bottleneck</span> : <span className="text-slate-500">{sc.stationCycleTime > 0 ? `Idle: ${sc.idleTimeSeconds.toFixed(0)}s` : 'Empty'}</span>}
                  </div>
                </div>
              ))}
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
          Project: {metrics.totalWorkContentSeconds.toFixed(1)}s ({metrics.vaRatioPercent.toFixed(1)}% VA) · Allocated: {metrics.allocatedWorkContentSeconds.toFixed(1)}s
        </span>
      </div>
    </div>
  );
};
