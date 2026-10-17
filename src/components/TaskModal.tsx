/**
 * LEANZR FlowLab - Task Editor & Creation Modal
 */

import React, { useState, useEffect } from 'react';
import { Task, Workstation, TaskCategory, ErgonomicRating } from '../types/flowlab.ts';
import { X, CheckCircle, Trash2 } from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null; // null if creating a new task
  stations: Workstation[];
  allTasks: Task[];
  onSaveTask: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  task,
  stations,
  allTasks,
  onSaveTask,
  onDeleteTask,
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [category, setCategory] = useState<TaskCategory>('VA');
  const [assignedStationId, setAssignedStationId] = useState<string | null>(null);
  const [ergonomics, setErgonomics] = useState<ErgonomicRating>('low');
  const [predecessors, setPredecessors] = useState<string[]>([]);
  const [toolsString, setToolsString] = useState('');

  useEffect(() => {
    if (task) {
      setCode(task.code);
      setName(task.name);
      setDescription(task.description || '');
      setDuration(task.duration);
      setCategory(task.category);
      setAssignedStationId(task.assignedStationId);
      setErgonomics(task.ergonomics);
      setPredecessors(task.predecessors || []);
      setToolsString((task.toolsAndFixtures || []).join(', '));
    } else {
      // New task defaults
      setCode(`OP-${String(allTasks.length * 10 + 10).padStart(3, '0')}`);
      setName('');
      setDescription('');
      setDuration(30);
      setCategory('VA');
      setAssignedStationId(stations[0]?.id || null);
      setErgonomics('low');
      setPredecessors([]);
      setToolsString('');
    }
  }, [task, allTasks, stations, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const tools = toolsString
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const updatedTask: Task = {
      id: task ? task.id : `task-${Date.now()}`,
      code: code.trim() || 'OP-000',
      name: name.trim(),
      description: description.trim() || undefined,
      duration: Math.max(1, duration),
      category,
      assignedStationId: assignedStationId || null,
      ergonomics,
      predecessors,
      toolsAndFixtures: tools.length > 0 ? tools : undefined,
    };

    onSaveTask(updatedTask);
    onClose();
  };

  const togglePredecessor = (predId: string) => {
    if (predecessors.includes(predId)) {
      setPredecessors(predecessors.filter((id) => id !== predId));
    } else {
      setPredecessors([...predecessors, predId]);
    }
  };

  // Other tasks available as predecessors (cannot depend on self)
  const candidatePredecessors = allTasks.filter((t) => !task || t.id !== task.id);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <h3 className="text-sm font-semibold text-white">
            {task ? `Edit Task: ${task.code}` : 'Add New Task Element'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Operation Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Task Name / Operation
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Laser weld busbar terminals"
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Duration (seconds)
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value) || 1)}
                required
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Lean Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="VA">VA (Value-Add)</option>
                <option value="NVAR">NVAR (Type 1 Waste)</option>
                <option value="NVA">NVA (Type 2 Waste)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Assigned Station
              </label>
              <select
                value={assignedStationId || ''}
                onChange={(e) => setAssignedStationId(e.target.value || null)}
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="">Unassigned Backlog</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Ergonomics Load
              </label>
              <select
                value={ergonomics}
                onChange={(e) => setErgonomics(e.target.value as ErgonomicRating)}
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="low">Low (Light manual dexterity)</option>
                <option value="moderate">Moderate (Standing/moderate torque)</option>
                <option value="high">High (Heavy lift / awkward posture)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Tools & Fixtures
              </label>
              <input
                type="text"
                value={toolsString}
                onChange={(e) => setToolsString(e.target.value)}
                placeholder="e.g. Torque wrench, ESD mat"
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              Operation Instructions / Standard Work (SOP)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed step-by-step assembly instructions, quality checks, or Kaizen notes..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Predecessor DAG dependencies */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">
              Sequence Predecessors ({predecessors.length} selected)
            </label>
            <div className="border border-slate-800 rounded-lg bg-slate-950/60 p-2 max-h-36 overflow-y-auto space-y-1">
              {candidatePredecessors.length === 0 ? (
                <span className="text-xs text-slate-500">No other tasks available</span>
              ) : (
                candidatePredecessors.map((cand) => {
                  const isChecked = predecessors.includes(cand.id);
                  return (
                    <label
                      key={cand.id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-800/60 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => togglePredecessor(cand.id)}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span className="font-mono text-cyan-300 font-bold">{cand.code}</span>
                      <span className="text-slate-300 truncate">{cand.name}</span>
                      <span className="font-mono text-slate-500 ml-auto">{cand.duration}s</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            {task && onDeleteTask ? (
              <button
                type="button"
                onClick={() => {
                  onDeleteTask(task.id);
                  onClose();
                }}
                className="text-rose-400 hover:text-rose-300 text-xs flex items-center gap-1 p-1.5 rounded hover:bg-rose-950/40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Task
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Save Task
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
