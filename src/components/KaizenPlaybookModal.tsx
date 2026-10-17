/**
 * LEANZR FlowLab - Industrial Engineering Kaizen Playbook & Formula Guide
 */

import React from 'react';
import { Calculator, Layers, Zap, CheckCircle2 } from 'lucide-react';
import { Modal } from './Modal.tsx';

interface KaizenPlaybookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KaizenPlaybookModal: React.FC<KaizenPlaybookModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Industrial Engineering Formula Reference & Lean Kaizen Playbook" className="max-w-4xl">
        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-300 text-xs leading-relaxed">
          <p className="rounded-lg border border-cyan-900 bg-cyan-950/30 p-3 text-cyan-200">Current model: operations at each station execute sequentially at their recorded elapsed durations. Extra operators do not shorten machine or task durations. Multi-operator schedules, skills, equipment sharing, overlap, and OEE-adjusted good output require separate engineering validation.</p>
          {/* Section 1: Core Mathematical Formulas */}
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3 pb-1 border-b border-slate-800">
              <Calculator className="w-4 h-4 text-cyan-400" />
              1. Mathematical Line Balancing Formulas
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <div className="font-semibold text-cyan-300 font-mono text-sm">
                  Takt Time (Takt)
                </div>
                <div className="p-2 bg-slate-900 rounded font-mono text-slate-200 text-xs">
                  Takt = Net Available Operating Time / Customer Demand
                </div>
                <p className="text-slate-400 text-[11px]">
                  The heartbeat of Lean Manufacturing. Defines the exact pace at which a finished unit must roll off the line to satisfy customer demand without overproduction.
                </p>
              </div>

              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <div className="font-semibold text-emerald-300 font-mono text-sm">
                  Line Balancing Efficiency (LE)
                </div>
                <div className="p-2 bg-slate-900 rounded font-mono text-slate-200 text-xs">
                  LE = [ Σ(Allocated Task Times) / (N_stations × Max_Cycle_Time) ] × 100%
                </div>
                <p className="text-slate-400 text-[11px]">
                  Measures station-load balance under the sequential elapsed-time model. This is not operator utilization or evidence of feasible machine/resource scheduling. Unallocated tasks are excluded from this ratio and remain visible in total project work content.
                </p>
              </div>

              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <div className="font-semibold text-amber-300 font-mono text-sm">
                  Smoothness Index (SI)
                </div>
                <div className="p-2 bg-slate-900 rounded font-mono text-slate-200 text-xs">
                  SI = √ [ Σ (Max_Cycle_Time - Station_Cycle_Time_i)² ]
                </div>
                <p className="text-slate-400 text-[11px]">
                  Quantifies workload disparity between stations. An SI of 0 indicates identical station cycle times; it does not establish resource feasibility.
                </p>
              </div>

              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <div className="font-semibold text-violet-300 font-mono text-sm">
                  Work-content Lower Bound (N_min)
                </div>
                <div className="p-2 bg-slate-900 rounded font-mono text-slate-200 text-xs">
                  N_min = ⌈ Σ(Task Times) / Takt Time ⌉
                </div>
                <p className="text-slate-400 text-[11px]">
                  An ideal sequential work-content lower bound. Precedence, indivisible operations, skills, machine resources, and overlap can require more capacity. This is not a validated minimum physical station count.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Yamazumi Lean Taxonomy */}
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3 pb-1 border-b border-slate-800">
              <Layers className="w-4 h-4 text-emerald-400" />
              2. Yamazumi Stacked Analysis & Muda Elimination
            </h3>

            <div className="space-y-3">
              <p>
                In the Toyota Production System, <span className="font-semibold text-white">Yamazumi</span> (literally "to stack up") is used to visualize cycle times and separate work content into three categories:
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-950/30 border border-emerald-800/60 rounded-lg">
                  <span className="font-semibold text-emerald-400 block mb-1">
                    Value-Added (VA)
                  </span>
                  <p className="text-slate-300 text-[11px]">
                    Direct physical or chemical transformation of the product that the customer is willing to pay for (e.g. welding, gluing, assembling, fastening).
                  </p>
                </div>

                <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-lg">
                  <span className="font-semibold text-amber-400 block mb-1">
                    Non-Value-Added Required (NVAR)
                  </span>
                  <p className="text-slate-300 text-[11px]">
                    Type 1 Waste: Incidental work necessary under current process or regulatory constraints (e.g. AOI inspection, Hipot safety test, ESD prep, unwrapping). Target: Simplify and reduce.
                  </p>
                </div>

                <div className="p-3 bg-rose-950/30 border border-rose-800/60 rounded-lg">
                  <span className="font-semibold text-rose-400 block mb-1">
                    Pure Waste (NVA)
                  </span>
                  <p className="text-slate-300 text-[11px]">
                    Type 2 Waste: Unnecessary activities that add zero value and can be eliminated immediately (e.g. searching for tools, excessive walking, waiting, rework). Target: Eliminate completely.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Bottleneck Kaizen Playbook */}
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3 pb-1 border-b border-slate-800">
              <Zap className="w-4 h-4 text-amber-400" />
              3. Bottleneck Elimination & Balancing Heuristics
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  Task Splitting & Offloading
                </div>
                <p className="text-slate-400 text-[11px]">
                  Break down long operations into smaller sub-tasks. Reassign sub-tasks to underutilized upstream or downstream stations with idle capacity.
                </p>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  Dual-Operator Workcells
                </div>
                <p className="text-slate-400 text-[11px]">
                  Separate manual attendance, setup, and fixed machine time in a reviewed resource schedule before claiming a second operator increases output. The current conservative model preserves recorded elapsed durations when operator count changes.
                </p>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  Precedence Repositioning
                </div>
                <p className="text-slate-400 text-[11px]">
                  Inspect the Precedence DAG to identify tasks on non-critical paths with high slack time. Shift their execution to level the line without violating constraints.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close Guide
          </button>
        </div>
    </Modal>
  );
};
