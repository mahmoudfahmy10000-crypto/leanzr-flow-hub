/**
 * LEANZR FlowLab - Industrial Engineering Kaizen Playbook & Formula Guide
 */

import React from 'react';
import { X, BookOpen, Calculator, Layers, Zap, CheckCircle2 } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-700/60 flex items-center justify-center text-cyan-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Industrial Engineering Formula Reference & Lean Kaizen Playbook
              </h2>
              <p className="text-xs text-slate-400">
                Rigorous definitions, mathematical proofs, and lean manufacturing line balancing guidelines
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-300 text-xs leading-relaxed">
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
                  LE = [ Σ(Task Times) / (N_operators × Max_Cycle_Time) ] × 100%
                </div>
                <p className="text-slate-400 text-[11px]">
                  Measures total productive utilization. A line balancing efficiency of &gt;85% is considered world-class; below 70% indicates heavy operator idle time / starvation.
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
                  Quantifies the workload disparity between operators. An SI of 0 indicates a perfectly leveled line where every station has identical cycle time.
                </p>
              </div>

              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <div className="font-semibold text-violet-300 font-mono text-sm">
                  Theoretical Minimum Workstations (N_min)
                </div>
                <div className="p-2 bg-slate-900 rounded font-mono text-slate-200 text-xs">
                  N_min = ⌈ Σ(Task Times) / Takt Time ⌉
                </div>
                <p className="text-slate-400 text-[11px]">
                  The minimum physical stations required under ideal 100% efficiency. Any actual station count N &gt; N_min represents potential balancing opportunity.
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
                  When a single machine or fixture has large work content (e.g. laser welding cell), add a 2nd operator to split manual setup from machine cycle time.
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
      </div>
    </div>
  );
};
