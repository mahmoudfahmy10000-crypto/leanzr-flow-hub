/**
 * LEANZR FlowLab - Operating Parameters & Takt Time Calculator Modal
 */

import React, { useState } from 'react';
import { OperatingParameters } from '../types/flowlab.ts';
import { calculateAvailableTime, calculateTaktTime, calculateTargetCycleTime } from '../utils/engineering-math.ts';
import { Clock, X, Check, Calculator } from 'lucide-react';

interface OperatingParamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  params: OperatingParameters;
  onSaveParams: (params: OperatingParameters) => void;
}

export const OperatingParamsModal: React.FC<OperatingParamsModalProps> = ({
  isOpen,
  onClose,
  params,
  onSaveParams,
}) => {
  const [formData, setFormData] = useState<OperatingParameters>({ ...params });

  if (!isOpen) return null;

  // Live preview calculations
  const availableTime = calculateAvailableTime(formData);
  const taktTime = calculateTaktTime(formData);
  const targetCT = calculateTargetCycleTime(formData, taktTime);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveParams(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">
              Line Operating Parameters & Takt Time Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Customer Demand (Units)
              </label>
              <input
                type="number"
                min="1"
                value={formData.demandUnitsPerPeriod}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    demandUnitsPerPeriod: Math.max(1, parseInt(e.target.value) || 1),
                  })
                }
                required
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Demand Period (Days)
              </label>
              <input
                type="number"
                min="1"
                value={formData.demandPeriodDays}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    demandPeriodDays: Math.max(1, parseInt(e.target.value) || 1),
                  })
                }
                required
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Shifts per Day
              </label>
              <select
                value={formData.shiftsPerDay}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    shiftsPerDay: parseInt(e.target.value) || 1,
                  })
                }
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                <option value={1}>1 Shift (Single)</option>
                <option value={2}>2 Shifts (Double)</option>
                <option value={3}>3 Shifts (Continuous 24h)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Gross Hours per Shift
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="12"
                value={formData.hoursPerShift}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    hoursPerShift: Math.max(1, parseFloat(e.target.value) || 8),
                  })
                }
                required
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Planned Downtime / Shift (min)
              </label>
              <input
                type="number"
                min="0"
                value={formData.plannedDowntimeMinutesPerShift}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    plannedDowntimeMinutesPerShift: Math.max(0, parseInt(e.target.value) || 0),
                  })
                }
                placeholder="Lunch, breaks, 5S"
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                e.g. 2x 15m breaks + 10m 5S = 40 min
              </span>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Target Safety Buffer (%)
              </label>
              <input
                type="number"
                min="0"
                max="40"
                value={formData.targetBufferPercent}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    targetBufferPercent: Math.max(0, parseFloat(e.target.value) || 0),
                  })
                }
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Reduces Target CT below Takt (e.g. 10%)
              </span>
            </div>
          </div>

          {/* Live Dynamic Calculation Box */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 mt-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
              <Calculator className="w-3.5 h-3.5 text-cyan-400" />
              Live Industrial Engineering Calculation
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div className="p-2 bg-slate-900 rounded border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block">Available Time</span>
                <span className="text-white font-bold">{availableTime.toLocaleString()}s</span>
                <span className="text-[10px] text-slate-500 block">{(availableTime / 3600).toFixed(1)} hrs</span>
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800/80">
                <span className="text-[10px] text-cyan-400 block font-semibold">Customer Takt</span>
                <span className="text-cyan-300 text-sm font-bold">{taktTime.toFixed(1)}s</span>
                <span className="text-[10px] text-slate-500 block">{(taktTime / 60).toFixed(2)} min</span>
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800/80">
                <span className="text-[10px] text-amber-400 block font-semibold">Target Cycle Time</span>
                <span className="text-amber-300 text-sm font-bold">{targetCT.toFixed(1)}s</span>
                <span className="text-[10px] text-slate-500 block">-{formData.targetBufferPercent}% buffer</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
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
              <Check className="w-3.5 h-3.5" />
              Update Parameters
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
