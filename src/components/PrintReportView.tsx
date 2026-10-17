/**
 * LEANZR FlowLab - Professional Printable Engineering Report & SOP
 * High-contrast, clean layout formatted for A4/Letter print and executive audit.
 */

import React from 'react';
import { FlowProject, LineCalculations } from '../types/flowlab.ts';
import { Printer, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface PrintReportViewProps {
  project: FlowProject;
  metrics: LineCalculations;
  onBack: () => void;
}

export const PrintReportView: React.FC<PrintReportViewProps> = ({
  project,
  metrics,
  onBack,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 print:bg-white print:text-black py-8 px-4 sm:px-8">
      {/* Non-print action header */}
      <div className="max-w-5xl mx-auto mb-6 flex items-center justify-between print:hidden">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to FlowLab Studio
        </button>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg shadow-md transition-colors cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          Print / Export PDF Report
        </button>
      </div>

      {/* Printable Sheet Document */}
      <div className="max-w-5xl mx-auto bg-white p-8 sm:p-12 rounded-xl shadow-xl print:shadow-none print:p-0 print:m-0 border border-slate-200 print:border-none">
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-6 mb-6 flex items-start justify-between">
          <div>
            <div className="text-xs font-bold tracking-wider uppercase text-slate-500 mb-1">
              Industrial Engineering & Lean Operations Report
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {project.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-2 font-mono">
              <span>Part: <strong className="text-slate-900">{project.partNumber}</strong></span>
              <span>·</span>
              <span>Facility: <strong className="text-slate-900">{project.plantLocation}</strong></span>
              <span>·</span>
              <span>Date: {new Date().toLocaleDateString()}</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-lg font-black tracking-tighter text-slate-900">
              LEANZR <span className="text-cyan-600">FlowLab</span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              LINE BALANCING AUDIT CERTIFICATE
            </div>
            <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Certified
            </div>
          </div>
        </div>

        {/* Executive Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200 mb-6 font-mono text-xs">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Customer Takt</span>
            <span className="text-lg font-bold text-slate-900">{metrics.taktTimeSeconds.toFixed(1)}s</span>
            <span className="text-slate-500 block text-[10px]">Target: {metrics.targetCycleTimeSeconds.toFixed(1)}s</span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Bottleneck Cycle</span>
            <span className={`text-lg font-bold ${metrics.bottleneckCycleTime > metrics.taktTimeSeconds ? 'text-rose-600' : 'text-slate-900'}`}>
              {metrics.bottleneckCycleTime.toFixed(1)}s
            </span>
            <span className="text-slate-500 block text-[10px]">
              {metrics.bottleneckStationId ? project.stations.find(s => s.id === metrics.bottleneckStationId)?.code : 'N/A'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Balancing Efficiency</span>
            <span className="text-lg font-bold text-slate-900">{metrics.lineBalancingEfficiencyPercent.toFixed(1)}%</span>
            <span className="text-slate-500 block text-[10px]">Loss: {metrics.balancingLossPercent.toFixed(1)}%</span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] uppercase">Capacity</span>
            <span className="text-lg font-bold text-slate-900">{metrics.hourlyProductionCapacity} u/hr</span>
            <span className="text-slate-500 block text-[10px]">{metrics.dailyProductionCapacity} u/day</span>
          </div>
        </div>

        {/* Operating Parameters Table */}
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2 border-b pb-1">
            1. Operating Assumptions & Demand
          </h2>
          <table className="w-full text-xs font-mono text-left border border-slate-200">
            <tbody className="divide-y divide-slate-200">
              <tr className="bg-slate-50">
                <td className="p-2 font-medium text-slate-600">Customer Demand</td>
                <td className="p-2 font-bold text-slate-900">{project.operatingParams.demandUnitsPerPeriod} units</td>
                <td className="p-2 font-medium text-slate-600">Daily Available Operating Time</td>
                <td className="p-2 font-bold text-slate-900">{metrics.availableTimeSecondsPerDay.toLocaleString()} sec ({(metrics.availableTimeSecondsPerDay / 3600).toFixed(1)} hrs)</td>
              </tr>
              <tr>
                <td className="p-2 font-medium text-slate-600">Shifts per Day</td>
                <td className="p-2 text-slate-900">{project.operatingParams.shiftsPerDay} shifts</td>
                <td className="p-2 font-medium text-slate-600">Planned Downtime per Shift</td>
                <td className="p-2 text-slate-900">{project.operatingParams.plannedDowntimeMinutesPerShift} minutes</td>
              </tr>
              <tr className="bg-slate-50">
                <td className="p-2 font-medium text-slate-600">Gross Shift Duration</td>
                <td className="p-2 text-slate-900">{project.operatingParams.hoursPerShift} hours</td>
                <td className="p-2 font-medium text-slate-600">Safety Buffer</td>
                <td className="p-2 text-slate-900">{project.operatingParams.targetBufferPercent}% under Takt</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Workstations Balance Summary */}
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2 border-b pb-1">
            2. Workstation Workload Allocation
          </h2>
          <table className="w-full text-xs font-mono text-left border border-slate-200">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-2 border">Station</th>
                <th className="p-2 border">Name</th>
                <th className="p-2 border text-center">Ops</th>
                <th className="p-2 border text-right">Cycle Time</th>
                <th className="p-2 border text-right">% Takt</th>
                <th className="p-2 border text-right">VA Time</th>
                <th className="p-2 border text-right">NVAR Time</th>
                <th className="p-2 border text-right">NVA Time</th>
                <th className="p-2 border text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {metrics.stationCalculations.map((sc) => (
                <tr key={sc.station.id} className={sc.isBottleneck ? 'bg-amber-50 font-semibold' : ''}>
                  <td className="p-2 border font-bold">{sc.station.code}</td>
                  <td className="p-2 border font-sans">{sc.station.name}</td>
                  <td className="p-2 border text-center">{sc.station.operatorCount}</td>
                  <td className="p-2 border text-right">{sc.stationCycleTime.toFixed(1)}s</td>
                  <td className="p-2 border text-right">{((sc.stationCycleTime / metrics.taktTimeSeconds) * 100).toFixed(0)}%</td>
                  <td className="p-2 border text-right text-emerald-700">{sc.vaTime}s</td>
                  <td className="p-2 border text-right text-amber-700">{sc.nvarTime}s</td>
                  <td className="p-2 border text-right text-rose-700">{sc.nvaTime}s</td>
                  <td className="p-2 border text-center">
                    {sc.isBottleneck ? (
                      <span className="text-amber-800 font-bold">Bottleneck</span>
                    ) : sc.isOverTakt ? (
                      <span className="text-rose-700 font-bold">Over Takt</span>
                    ) : (
                      <span className="text-slate-600">Balanced</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detailed Operations Routing Sheet */}
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2 border-b pb-1">
            3. Standard Operating Procedure (SOP) Routing Sheet
          </h2>
          <table className="w-full text-xs font-mono text-left border border-slate-200">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-2 border">OP Code</th>
                <th className="p-2 border">Operation Description</th>
                <th className="p-2 border text-center">Station</th>
                <th className="p-2 border text-right">Time (s)</th>
                <th className="p-2 border text-center">Lean Cat</th>
                <th className="p-2 border text-center">Ergo</th>
                <th className="p-2 border">Tools / Fixtures</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {project.tasks.map((task) => {
                const station = project.stations.find((s) => s.id === task.assignedStationId);
                return (
                  <tr key={task.id}>
                    <td className="p-2 border font-bold text-slate-900">{task.code}</td>
                    <td className="p-2 border font-sans text-slate-800">
                      <div>{task.name}</div>
                      {task.description && (
                        <div className="text-[10px] text-slate-500 mt-0.5">{task.description}</div>
                      )}
                    </td>
                    <td className="p-2 border text-center">{station ? station.code : 'UNASSIGNED'}</td>
                    <td className="p-2 border text-right font-bold">{task.duration}</td>
                    <td className="p-2 border text-center font-bold">
                      <span className={task.category === 'VA' ? 'text-emerald-700' : task.category === 'NVAR' ? 'text-amber-700' : 'text-rose-700'}>
                        {task.category}
                      </span>
                    </td>
                    <td className="p-2 border text-center capitalize text-slate-600">{task.ergonomics}</td>
                    <td className="p-2 border text-[11px] text-slate-600 font-sans">
                      {(task.toolsAndFixtures || []).join(', ') || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Engineering Sign-off Block */}
        <div className="pt-8 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs font-sans">
          <div className="space-y-4">
            <div className="font-semibold text-slate-900">Lead Industrial Engineer</div>
            <div className="h-10 border-b border-dashed border-slate-400"></div>
            <div className="text-[11px] text-slate-500 flex justify-between">
              <span>Signature & Date</span>
              <span>PE / Lean Six Sigma Black Belt</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="font-semibold text-slate-900">Plant Operations Manager</div>
            <div className="h-10 border-b border-dashed border-slate-400"></div>
            <div className="text-[11px] text-slate-500 flex justify-between">
              <span>Signature & Date</span>
              <span>Manufacturing Operations</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
