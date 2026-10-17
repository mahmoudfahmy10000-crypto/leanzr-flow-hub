/**
 * LEANZR FlowLab - What-If Scenario Comparison Studio
 * Enables side-by-side comparison of baseline, kaizen, and optimized production configurations.
 */

import React, { useState } from 'react';
import { FlowProject, Scenario, LineCalculations } from '../types/flowlab.ts';
import { calculateLineMetrics } from '../utils/engineering-math.ts';
import {
  GitCompare,
  Plus,
  Trash2,
  ArrowRight,
} from 'lucide-react';

interface ScenarioCompareProps {
  project: FlowProject;
  currentMetrics: LineCalculations;
  onActivateScenario: (scenario: Scenario) => void;
  onCreateScenario: (name: string, description: string) => void;
  onDeleteScenario: (scenarioId: string) => void;
}

const EngineeringStatus = ({ metrics }: { metrics: LineCalculations }) => (
  <div className="font-sans text-xs">
    <span className={`font-semibold capitalize ${metrics.assessment.status === 'valid' ? 'text-emerald-400' : 'text-amber-400'}`}>
      {metrics.assessment.status === 'valid' && metrics.taktAttainmentAchieved ? 'Valid · Takt attained' : metrics.assessment.status}
    </span>
    {metrics.assessment.reasons.length > 0 && (
      <details className="mt-1 min-w-[200px] text-slate-400">
        <summary className="cursor-pointer">Reasons ({metrics.assessment.reasons.length})</summary>
        <ul className="mt-1 list-disc pl-4 space-y-1">
          {metrics.assessment.reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reason.message}</li>)}
        </ul>
      </details>
    )}
  </div>
);

export const ScenarioCompare: React.FC<ScenarioCompareProps> = ({
  project,
  currentMetrics,
  onActivateScenario,
  onCreateScenario,
  onDeleteScenario,
}) => {
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newScenarioDesc, setNewScenarioDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Evaluate metrics for all scenarios
  const evaluatedScenarios = React.useMemo(() => {
    return project.scenarios.map((scen) => {
      const metrics = calculateLineMetrics(
        scen.stations,
        scen.tasks,
        scen.operatingParams
      );
      return {
        scenario: scen,
        metrics,
      };
    });
  }, [project.scenarios]);

  const handleSaveCurrentAsScenario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScenarioName.trim()) return;
    onCreateScenario(newScenarioName.trim(), newScenarioDesc.trim());
    setNewScenarioName('');
    setNewScenarioDesc('');
    setIsCreating(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 flex flex-col gap-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-cyan-400" />
            What-If Scenario Comparison Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Compare ideal sequential estimates; daily capacity deltas use a common one-day horizon. OEE is informational, not applied.
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Snapshot Current State as Scenario
        </button>
      </div>

      {/* Snapshot Creation Form Drawer */}
      {isCreating && (
        <form
          onSubmit={handleSaveCurrentAsScenario}
          className="bg-slate-950/70 border border-slate-700/80 rounded-xl p-4 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">
              Save Current Line Configuration as Scenario
            </span>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Scenario Name (e.g., Kaizen: -25s NVA Eliminated)"
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              required
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
            />
            <input
              type="text"
              placeholder="Description / Engineering Notes (optional)"
              value={newScenarioDesc}
              onChange={(e) => setNewScenarioDesc(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg"
            >
              Save Snapshot
            </button>
          </div>
        </form>
      )}

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-medium">
              <th className="py-3 px-4 min-w-[200px]">Configuration</th>
              <th className="py-3 px-4 min-w-[120px]">Workstations</th>
              <th className="py-3 px-4 min-w-[120px]">Project / Allocated Work</th>
              <th className="py-3 px-4 min-w-[130px]">Bottleneck CT</th>
              <th className="py-3 px-4 min-w-[120px]">Line Efficiency</th>
              <th className="py-3 px-4 min-w-[130px]">Ideal Capacity</th>
              <th className="py-3 px-4 min-w-[120px]">Smoothness Index</th>
              <th className="py-3 px-4 min-w-[110px]">Engineering Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {/* Active Workspace Baseline Row */}
            <tr className="bg-cyan-950/20 border-l-2 border-l-cyan-400">
              <td className="py-3 px-4">
                <div className="font-sans font-bold text-white flex items-center gap-2">
                  <span>Current Active Workspace</span>
                  <span className="px-1.5 py-0.5 rounded-xs bg-cyan-900/60 text-cyan-300 text-[10px] font-mono">
                    LIVE
                  </span>
                </div>
                <div className="font-sans text-[11px] text-slate-400 mt-0.5">
                  Currently modeled on the board
                </div>
              </td>
              <td className="py-3 px-4 text-slate-200">
                <span className="font-bold text-white">{currentMetrics.actualWorkstationsCount}</span> stations
                <span className="text-slate-400 block text-[10px]">({currentMetrics.actualOperatorsCount} ops)</span>
              </td>
              <td className="py-3 px-4 text-slate-200">
                <span className="font-bold">{currentMetrics.totalWorkContentSeconds.toFixed(1)}s</span>
                <span className="text-slate-400 block text-[10px]">({currentMetrics.vaRatioPercent.toFixed(0)}% VA); allocated {currentMetrics.allocatedWorkContentSeconds.toFixed(1)}s</span>
              </td>
              <td className="py-3 px-4">
                <span className={`font-bold ${currentMetrics.bottleneckCycleTime > currentMetrics.taktTimeSeconds ? 'text-rose-400' : 'text-slate-200'}`}>
                  {currentMetrics.bottleneckCycleTime.toFixed(1)}s
                </span>
                <span className="text-slate-400 block text-[10px]">
                  Takt: {currentMetrics.taktTimeSeconds.toFixed(1)}s
                </span>
              </td>
              <td className="py-3 px-4">
                <span className={`font-bold ${currentMetrics.assessment.status === 'valid' && currentMetrics.lineBalancingEfficiencyPercent >= 85 ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {currentMetrics.lineBalancingEfficiencyPercent.toFixed(1)}%
                </span>
                <span className="text-slate-400 block text-[10px]">Loss: {currentMetrics.balancingLossPercent.toFixed(1)}%</span>
              </td>
              <td className="py-3 px-4 text-slate-200">
                <span className="font-bold text-white">{currentMetrics.hourlyProductionCapacity}</span> u/hr
                <span className="text-slate-400 block text-[10px]">{currentMetrics.dailyProductionCapacity} u/day</span>
                <span className="text-slate-400 block text-[10px]">{currentMetrics.periodProductionCapacity} u/{project.operatingParams.demandPeriodDays}d</span>
              </td>
              <td className="py-3 px-4 text-slate-300">
                {currentMetrics.smoothnessIndex.toFixed(1)}s
              </td>
              <td className="py-3 px-4">
                <EngineeringStatus metrics={currentMetrics} />
              </td>
              <td className="py-3 px-4 text-right font-sans text-slate-500 text-xs">
                Active
              </td>
            </tr>

            {/* Saved Scenarios Rows */}
            {evaluatedScenarios.map(({ scenario, metrics }) => {
              const effDiff = metrics.lineBalancingEfficiencyPercent - currentMetrics.lineBalancingEfficiencyPercent;
              const capDiff = metrics.dailyProductionCapacity - currentMetrics.dailyProductionCapacity;
              const comparable = metrics.assessment.status === 'valid' && currentMetrics.assessment.status === 'valid';

              return (
                <tr key={scenario.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-sans font-semibold text-white">
                      {scenario.name}
                    </div>
                    {scenario.description && (
                      <div className="font-sans text-[11px] text-slate-400 mt-0.5">
                        {scenario.description}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-200">
                    <span className="font-bold">{metrics.actualWorkstationsCount}</span> stations
                    <span className="text-slate-400 block text-[10px]">({metrics.actualOperatorsCount} ops)</span>
                  </td>
                  <td className="py-3 px-4 text-slate-200">
                    <span className="font-bold">{metrics.totalWorkContentSeconds.toFixed(1)}s</span>
                    <span className="text-slate-400 block text-[10px]">({metrics.vaRatioPercent.toFixed(0)}% VA); allocated {metrics.allocatedWorkContentSeconds.toFixed(1)}s</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`font-bold ${metrics.bottleneckCycleTime > metrics.taktTimeSeconds ? 'text-rose-400' : 'text-slate-200'}`}>
                      {metrics.bottleneckCycleTime.toFixed(1)}s
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-bold text-white">
                      {metrics.lineBalancingEfficiencyPercent.toFixed(1)}%
                    </span>
                    <span className={`block text-[10px] ${!comparable ? 'text-slate-400' : effDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {effDiff >= 0 ? `+${effDiff.toFixed(1)}%` : `${effDiff.toFixed(1)}%`}{!comparable && ' (diagnostic)'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-200">
                    <span className="font-bold">{metrics.hourlyProductionCapacity}</span> u/hr
                    <span className="text-slate-400 block text-[10px]">{metrics.dailyProductionCapacity} u/day; {metrics.periodProductionCapacity} u/{scenario.operatingParams.demandPeriodDays}d</span>
                    <span className={`block text-[10px] ${!comparable ? 'text-slate-400' : capDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {capDiff >= 0 ? `+${capDiff} u/d` : `${capDiff} u/d`}{!comparable && ' (diagnostic)'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {metrics.smoothnessIndex.toFixed(1)}s
                  </td>
                  <td className="py-3 px-4">
                    <EngineeringStatus metrics={metrics} />
                  </td>
                  <td className="py-3 px-4 text-right font-sans">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onActivateScenario(scenario)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs rounded border border-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                        title="Load this scenario into active workspace"
                      >
                        <span>Activate</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onDeleteScenario(scenario.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Delete scenario"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {evaluatedScenarios.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500 font-sans">
                  No saved scenarios yet. Use the button above or run the Optimizer to create what-if scenarios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
