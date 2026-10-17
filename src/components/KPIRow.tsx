/**
 * LEANZR FlowLab - High-Density Industrial Engineering KPI Bar
 */

import React from 'react';
import { LineCalculations, OperatingParameters } from '../types/flowlab.ts';
import {
  Clock,
  Gauge,
  Percent,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  Zap,
} from 'lucide-react';

interface KPIRowProps {
  metrics: LineCalculations;
  params: OperatingParameters;
  onOpenParams: () => void;
}

export const KPIRow: React.FC<KPIRowProps> = ({ metrics, params, onOpenParams }) => {
  const isBottleneckCritical = metrics.bottleneckCycleTime > metrics.taktTimeSeconds && metrics.taktTimeSeconds > 0;
  const efficiency = metrics.lineBalancingEfficiencyPercent;
  const isValid = metrics.assessment.status === 'valid';
  const meetsPeriodDemand = isValid && metrics.periodProductionCapacity >= params.demandUnitsPerPeriod;

  return (
    <section className="bg-slate-900 border-b border-slate-800 text-slate-100 px-4 py-3 select-none">
      <div data-testid="engineering-status" data-status={metrics.assessment.status} className={`max-w-[1600px] mx-auto mb-3 rounded-lg border p-3 text-xs ${isValid ? 'border-slate-700 bg-slate-800/60 text-slate-200' : 'border-amber-700 bg-amber-950/30 text-amber-200'}`}>
        <div className="font-semibold">Engineering model: <span className="capitalize">{metrics.assessment.status}</span></div>
        {metrics.assessment.reasons.length > 0 && (
          <ul className="mt-1 list-disc pl-4 space-y-1">
            {metrics.assessment.reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reason.message}</li>)}
          </ul>
        )}
        <div className="mt-1 text-slate-400">Ideal sequential estimates; OEE {params.oeeTargetPercent}% is informational and is not applied. {isValid ? 'Valid under the stated model assumptions; no engineering approval is recorded.' : 'Capacity and balance figures are diagnostic estimates; takt attainment is unavailable.'}</div>
      </div>
      <div className="max-w-[1600px] mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Metric 1: Takt Time */}
        <div
          onClick={onOpenParams}
          className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-lg p-2.5 cursor-pointer transition-colors group"
          title="Click to adjust demand, shifts, and operating hours"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              Customer Takt
            </span>
            <span className="text-[10px] text-cyan-400 group-hover:underline">Edit Params</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-white font-mono tabular-nums">
              {metrics.taktTimeSeconds.toFixed(1)}
            </span>
            <span className="text-xs text-slate-400 font-mono">s/unit</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Target: <span className="font-mono text-slate-300">{metrics.targetCycleTimeSeconds.toFixed(1)}s</span></span>
            <span>{params.demandUnitsPerPeriod}u / {params.shiftsPerDay}sh</span>
          </div>
        </div>

        {/* Metric 2: Bottleneck Station & Cycle Time */}
        <div
          className={`border rounded-lg p-2.5 transition-colors ${
            isBottleneckCritical
              ? 'bg-rose-950/40 border-rose-800/80'
              : 'bg-slate-800/80 border-slate-700/60'
          }`}
        >
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center gap-1.5 font-medium text-slate-400">
              <Gauge className={`w-3.5 h-3.5 ${isBottleneckCritical ? 'text-rose-400' : 'text-amber-400'}`} />
              Bottleneck Cycle
            </span>
            {!isValid ? (
              <span className="text-[10px] text-amber-400 font-semibold capitalize">{metrics.assessment.status}</span>
            ) : isBottleneckCritical ? (
              <span className="text-[10px] text-rose-400 font-semibold flex items-center gap-0.5">
                <AlertTriangle className="w-3 h-3" /> Over-Takt
              </span>
            ) : (
              <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> Within Takt
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-xl font-bold tracking-tight font-mono tabular-nums ${
                isBottleneckCritical ? 'text-rose-400' : 'text-white'
              }`}
            >
              {metrics.bottleneckCycleTime.toFixed(1)}
            </span>
            <span className="text-xs text-slate-400 font-mono">s/unit</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between truncate">
            <span>Station: <span className="text-slate-200 font-medium font-mono">{metrics.bottleneckStationId ? metrics.stationCalculations.find(s => s.station.id === metrics.bottleneckStationId)?.station.code || 'N/A' : 'None'}</span></span>
            <span className="font-mono">{metrics.taktTimeSeconds > 0 ? `${((metrics.bottleneckCycleTime / metrics.taktTimeSeconds) * 100).toFixed(0)}% Takt` : '0%'}</span>
          </div>
        </div>

        {/* Metric 3: Line Balancing Efficiency */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Percent className="w-3.5 h-3.5 text-emerald-400" />
              Line Efficiency
            </span>
            <span className="text-[10px] text-slate-400 font-mono">LE</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-xl font-bold tracking-tight font-mono tabular-nums ${
                !isValid ? 'text-slate-200' : efficiency >= 85 ? 'text-emerald-400' : efficiency >= 70 ? 'text-amber-400' : 'text-rose-400'
              }`}
            >
              {efficiency.toFixed(1)}%
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Balancing Loss: <span className="font-mono text-slate-300">{metrics.balancingLossPercent.toFixed(1)}%</span></span>
            <span>SI: <span className="font-mono text-slate-300">{metrics.smoothnessIndex.toFixed(1)}s</span></span>
          </div>
        </div>

        {/* Metric 4: Line Output Capacity */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
              Ideal Capacity
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Nominal</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-white font-mono tabular-nums">
              {metrics.hourlyProductionCapacity}
            </span>
            <span className="text-xs text-slate-400 font-mono">units/hr</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Daily: <span className="font-mono text-slate-300">{metrics.dailyProductionCapacity} u/d</span></span>
            <span className={isValid ? (meetsPeriodDemand ? 'text-emerald-400' : 'text-rose-400') : 'text-amber-400'}>
              {isValid ? (meetsPeriodDemand ? 'Meets Period Demand' : 'Period Deficit') : 'Not validated'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">Period ({params.demandPeriodDays}d): {metrics.periodProductionCapacity} units</div>
        </div>

        {/* Metric 5: Workstations & Operators */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Boxes className="w-3.5 h-3.5 text-violet-400" />
              Workstations
            </span>
            <span className="text-[10px] text-slate-400">Physical / labor</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-white font-mono tabular-nums">
              {metrics.actualWorkstationsCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">stations</span>
            <span className="text-xs text-slate-500 font-mono">({metrics.actualOperatorsCount} ops)</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Labor lower bound: <span className="font-mono text-slate-300">{metrics.theoreticalMinOperators} ops</span></span>
          </div>
        </div>

        {/* Metric 6: Work Content & Value-Add Ratio */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Work Content
            </span>
            <span className="text-[10px] text-emerald-400 font-mono font-medium">{metrics.vaRatioPercent.toFixed(0)}% VA</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-white font-mono tabular-nums">
              {metrics.totalWorkContentSeconds.toFixed(1)}
            </span>
            <span className="text-xs text-slate-400 font-mono">s total</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Allocated: <span className="font-mono text-slate-300">{metrics.allocatedWorkContentSeconds.toFixed(1)}s ({metrics.allocatedVaRatioPercent.toFixed(0)}% VA)</span></div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Unassigned: <span className={`font-mono ${metrics.unassignedTasks.length > 0 ? 'text-amber-400 font-semibold' : 'text-slate-300'}`}>{metrics.unassignedTasks.length} tasks</span></span>
            {metrics.precedenceErrors.length > 0 && (
              <span className="text-rose-400 font-medium text-[10px] flex items-center gap-0.5">
                <AlertTriangle className="w-3 h-3" /> {metrics.precedenceErrors.length} Seq Err
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
