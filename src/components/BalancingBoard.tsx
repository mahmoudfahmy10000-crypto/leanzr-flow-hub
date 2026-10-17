/**
 * LEANZR FlowLab - Interactive Line Balancing Board
 * Workstation columns with task reallocation, operator count controls,
 * precedence constraint validation, and capacity gauges.
 */

import React, { useState } from 'react';
import {
  Task,
  Workstation,
  LineCalculations,
} from '../types/flowlab.ts';
import {
  Plus,
  Trash2,
  Users,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  MoveHorizontal,
  Edit2,
  CheckCircle,
  Inbox,
  ArrowRightLeft,
} from 'lucide-react';

interface BalancingBoardProps {
  stations: Workstation[];
  tasks: Task[];
  metrics: LineCalculations;
  onUpdateStation: (station: Workstation) => void;
  onAddStation: () => void;
  onDeleteStation: (stationId: string) => void;
  onMoveTask: (taskId: string, targetStationId: string | null) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onOpenNewTaskModal: () => void;
}

export const BalancingBoard: React.FC<BalancingBoardProps> = ({
  stations,
  tasks,
  metrics,
  onUpdateStation,
  onAddStation,
  onDeleteStation,
  onMoveTask,
  onEditTask,
  onDeleteTask,
  onOpenNewTaskModal,
}) => {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const precedenceErrorTaskIds = new Set(metrics.precedenceErrors.map((e) => e.taskId));

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumnId(columnId);
  };

  const handleDrop = (e: React.DragEvent, targetStationId: string | null) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (taskId) {
      onMoveTask(taskId, targetStationId);
    }
    setDraggedTaskId(null);
    setDragOverColumnId(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Precedence Sequence Errors Alert */}
      {metrics.precedenceErrors.length > 0 && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-3.5 text-rose-200 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-rose-300 block mb-0.5">
              Sequence Precedence Violations ({metrics.precedenceErrors.length})
            </span>
            <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
              {metrics.precedenceErrors.map((err, idx) => (
                <li key={idx}>{err.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Board Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-white tracking-tight">
            Workstation Task Allocation ({stations.length} Stations)
          </h3>
          <span className="text-xs text-slate-400">
            Drag cards or use quick-shift arrows to rebalance tasks
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenNewTaskModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Task
          </button>
          <button
            onClick={onAddStation}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Workstation
          </button>
        </div>
      </div>

      {/* Columns Container */}
      <div className="flex gap-4 overflow-x-auto pb-4 items-start select-none">
        {/* Workstation Columns */}
        {metrics.stationCalculations.map((sc, stIdx) => {
          const isOver = sc.isOverTakt;
          const isBottleneck = sc.isBottleneck;
          const isDragOver = dragOverColumnId === sc.station.id;
          const station = sc.station;

          return (
            <div
              key={station.id}
              onDragOver={(e) => handleDragOver(e, station.id)}
              onDragLeave={() => setDragOverColumnId(null)}
              onDrop={(e) => handleDrop(e, station.id)}
              className={`w-80 shrink-0 bg-slate-900 border rounded-xl flex flex-col transition-all ${
                isDragOver
                  ? 'border-cyan-400 ring-2 ring-cyan-400/20'
                  : isBottleneck
                  ? 'border-amber-500/80'
                  : 'border-slate-800'
              }`}
            >
              {/* Station Header */}
              <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/90 rounded-t-xl">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-white px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">
                      {station.code}
                    </span>
                    <input
                      type="text"
                      value={station.name}
                      onChange={(e) => onUpdateStation({ ...station, name: e.target.value })}
                      className="text-xs font-semibold text-slate-200 bg-transparent border-b border-transparent hover:border-slate-700 focus:border-cyan-400 focus:outline-none w-36 truncate"
                      title="Click to rename station"
                    />
                  </div>

                  {/* Delete Station Button */}
                  {stations.length > 1 && (
                    <button
                      onClick={() => onDeleteStation(station.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors"
                      title="Delete station (tasks move to backlog)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Operator Allocation Stepper */}
                <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>Operators:</span>
                    <span className="font-mono font-bold text-white ml-0.5">{station.operatorCount}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        onUpdateStation({
                          ...station,
                          operatorCount: Math.max(1, station.operatorCount - 1),
                        })
                      }
                      disabled={station.operatorCount <= 1}
                      className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 font-mono text-xs"
                    >
                      -
                    </button>
                    <button
                      onClick={() =>
                        onUpdateStation({
                          ...station,
                          operatorCount: Math.min(5, station.operatorCount + 1),
                        })
                      }
                      className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Station Cycle Time Gauge */}
                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                    <span className="text-slate-400">
                      Cycle: <span className="font-bold text-white">{sc.stationCycleTime.toFixed(1)}s</span>
                    </span>
                    <span
                      className={`font-semibold ${
                        isOver
                          ? 'text-rose-400'
                          : isBottleneck
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {metrics.taktTimeSeconds > 0
                        ? `${((sc.stationCycleTime / metrics.taktTimeSeconds) * 100).toFixed(0)}% Takt`
                        : '0%'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isOver
                          ? 'bg-rose-500'
                          : isBottleneck
                          ? 'bg-amber-400'
                          : 'bg-emerald-500'
                      }`}
                      style={{
                        width: `${Math.min(
                          metrics.taktTimeSeconds > 0
                            ? (sc.stationCycleTime / metrics.taktTimeSeconds) * 100
                            : 0,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Station Tasks List */}
              <div className="p-2.5 flex-1 flex flex-col gap-2 min-h-[200px]">
                {sc.tasks.length === 0 ? (
                  <div className="h-32 border-2 border-dashed border-slate-800/80 rounded-lg flex flex-col items-center justify-center text-xs text-slate-500">
                    <span>Drop tasks here</span>
                  </div>
                ) : (
                  sc.tasks.map((task) => {
                    const hasPrecedenceError = precedenceErrorTaskIds.has(task.id);

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        className={`bg-slate-800/90 hover:bg-slate-800 border rounded-lg p-2.5 shadow-xs transition-all cursor-grab active:cursor-grabbing ${
                          hasPrecedenceError
                            ? 'border-rose-500 ring-1 ring-rose-500/40'
                            : 'border-slate-700/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-xs shrink-0 ${
                                task.category === 'VA'
                                  ? 'bg-emerald-500'
                                  : task.category === 'NVAR'
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                            />
                            <span className="font-mono text-xs font-bold text-white">
                              {task.code}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-xs text-cyan-300 tabular-nums">
                            {task.duration}s
                          </span>
                        </div>

                        <div className="text-xs text-slate-200 font-medium mb-1 line-clamp-2">
                          {task.name}
                        </div>

                        {/* Ergonomic & Predecessor indicators */}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-2 pt-1.5 border-t border-slate-700/50">
                          <span className="capitalize text-slate-400">
                            Ergo: <span className="text-slate-300">{task.ergonomics}</span>
                          </span>
                          {task.predecessors.length > 0 && (
                            <span
                              className={
                                hasPrecedenceError
                                  ? 'text-rose-400 font-bold'
                                  : 'text-slate-400'
                              }
                            >
                              Pred: {task.predecessors.length}
                            </span>
                          )}
                        </div>

                        {/* Quick Shift Toolbar */}
                        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-700/40">
                          <div className="flex items-center gap-1">
                            {stIdx > 0 && (
                              <button
                                onClick={() => onMoveTask(task.id, stations[stIdx - 1].id)}
                                className="p-1 text-slate-400 hover:text-white rounded bg-slate-700/50 hover:bg-slate-700"
                                title="Move left to previous station"
                              >
                                <ChevronLeft className="w-3 h-3" />
                              </button>
                            )}
                            {stIdx < stations.length - 1 && (
                              <button
                                onClick={() => onMoveTask(task.id, stations[stIdx + 1].id)}
                                className="p-1 text-slate-400 hover:text-white rounded bg-slate-700/50 hover:bg-slate-700"
                                title="Move right to next station"
                              >
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={() => onMoveTask(task.id, null)}
                              className="p-1 text-slate-400 hover:text-amber-300 rounded bg-slate-700/50 hover:bg-slate-700"
                              title="Send to unassigned backlog"
                            >
                              <Inbox className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onEditTask(task)}
                              className="p-1 text-slate-400 hover:text-cyan-300 rounded bg-slate-700/50 hover:bg-slate-700"
                              title="Edit task details"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => onDeleteTask(task.id)}
                              className="p-1 text-slate-400 hover:text-rose-400 rounded bg-slate-700/50 hover:bg-slate-700"
                              title="Delete task"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {/* Unassigned Tasks Backlog Column */}
        <div
          onDragOver={(e) => handleDragOver(e, 'backlog')}
          onDragLeave={() => setDragOverColumnId(null)}
          onDrop={(e) => handleDrop(e, null)}
          className={`w-72 shrink-0 bg-slate-900/60 border rounded-xl flex flex-col transition-all ${
            dragOverColumnId === 'backlog'
              ? 'border-cyan-400 ring-2 ring-cyan-400/20'
              : 'border-dashed border-slate-800'
          }`}
        >
          <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/40 rounded-t-xl">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-300 flex items-center gap-1.5">
                <Inbox className="w-3.5 h-3.5 text-amber-400" />
                Unassigned Backlog
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-amber-300">
                {metrics.unassignedTasks.length} tasks
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Tasks waiting to be allocated to a station
            </p>
          </div>

          <div className="p-2.5 flex-1 flex flex-col gap-2 min-h-[200px]">
            {metrics.unassignedTasks.length === 0 ? (
              <div className="h-32 rounded-lg flex flex-col items-center justify-center text-xs text-slate-500">
                <CheckCircle className="w-5 h-5 text-emerald-500/60 mb-1" />
                <span>All tasks assigned</span>
              </div>
            ) : (
              metrics.unassignedTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-2.5 shadow-xs cursor-grab hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold text-white">{task.code}</span>
                    <span className="font-mono text-xs text-cyan-300">{task.duration}s</span>
                  </div>
                  <div className="text-xs text-slate-300 line-clamp-1 mb-2">{task.name}</div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-700/40 text-[11px]">
                    <select
                      onChange={(e) => {
                        if (e.target.value) onMoveTask(task.id, e.target.value);
                      }}
                      defaultValue=""
                      className="bg-slate-700 text-slate-200 text-[10px] rounded px-1.5 py-0.5 border border-slate-600 focus:outline-none"
                    >
                      <option value="" disabled>Assign to...</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} - {s.name}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => onEditTask(task)}
                      className="text-slate-400 hover:text-white p-1"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
