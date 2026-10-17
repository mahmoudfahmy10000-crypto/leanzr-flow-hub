/**
 * LEANZR FlowLab - Operating Parameters & Takt Time Calculator Modal
 */

import React, { useEffect, useId, useState } from 'react';
import { OperatingParameters } from '../types/flowlab.ts';
import { calculateAvailableTime, calculateTaktTime, calculateTargetCycleTime } from '../utils/engineering-math.ts';
import { Check, Calculator } from 'lucide-react';
import { Modal } from './Modal.tsx';
import { validateOperatingParameters } from '../utils/project-validation.ts';

interface OperatingParamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  params: OperatingParameters;
  onSaveParams: (params: OperatingParameters) => boolean | void;
  saveError?: string | null;
}

export const OperatingParamsModal: React.FC<OperatingParamsModalProps> = ({
  isOpen,
  onClose,
  params,
  onSaveParams,
  saveError,
}) => {
  const [formData, setFormData] = useState<OperatingParameters>({ ...params });
  const [errors, setErrors] = useState<string[]>([]);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const fieldId = useId();

  useEffect(() => {
    if (!isOpen) return;
    setFormData({ ...params });
    setErrors([]);
    setSubmissionFailed(false);
  }, [params, isOpen]);

  if (!isOpen) return null;

  // Live preview calculations
  const draftIssues = validateOperatingParameters(formData);
  const availableTime = draftIssues.length ? null : calculateAvailableTime(formData);
  const taktTime = draftIssues.length ? null : calculateTaktTime(formData);
  const targetCT = taktTime === null ? null : calculateTargetCycleTime(formData, taktTime);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setSubmissionFailed(false);
    if (draftIssues.length) {
      setErrors(draftIssues.map((issue) => issue.message));
      return;
    }
    if (onSaveParams({ ...formData }) === false) {
      setSubmissionFailed(true);
      return;
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Line Operating Parameters & Takt Time Settings" className="max-w-lg">
        {/* Form Body */}
        <form onSubmit={handleSubmit} onChangeCapture={() => { setSubmissionFailed(false); setErrors([]); }} className="p-5 space-y-4 overflow-y-auto">
          {submissionFailed && (
            <div role="alert" className="rounded-lg border border-rose-700 bg-rose-950/50 p-3 text-xs text-rose-200">
              <p className="font-semibold">Parameters were not saved.</p>
              <p>{saveError || 'The active project is unchanged. Your draft remains here; correct the problem and try saving again.'}</p>
            </div>
          )}
          {errors.length > 0 && (
            <div role="alert" className="rounded-lg border border-rose-700 bg-rose-950/50 p-3 text-xs text-rose-200">
              <p className="font-semibold">Parameters were not saved. Correct these issues:</p>
              <ul className="mt-1 list-disc pl-4">{errors.map((message, index) => <li key={index}>{message}</li>)}</ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${fieldId}-demand`} className="text-xs font-medium text-slate-300 block mb-1">
                Customer Demand (Units)
              </label>
              <input
                id={`${fieldId}-demand`}
                type="number"
                min="0"
                step="any"
                value={Number.isNaN(formData.demandUnitsPerPeriod) ? '' : formData.demandUnitsPerPeriod}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    demandUnitsPerPeriod: e.target.valueAsNumber,
                  })
                }
                required
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label htmlFor={`${fieldId}-period`} className="text-xs font-medium text-slate-300 block mb-1">
                Demand Period (Days)
              </label>
              <input
                id={`${fieldId}-period`}
                type="number"
                min="0"
                step="any"
                value={Number.isNaN(formData.demandPeriodDays) ? '' : formData.demandPeriodDays}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    demandPeriodDays: e.target.valueAsNumber,
                  })
                }
                required
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${fieldId}-shifts`} className="text-xs font-medium text-slate-300 block mb-1">
                Shifts per Day
              </label>
              <select
                id={`${fieldId}-shifts`}
                value={formData.shiftsPerDay}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    shiftsPerDay: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                <option value={1}>1 Shift (Single)</option>
                <option value={2}>2 Shifts (Double)</option>
                <option value={3}>3 Shifts (Continuous 24h)</option>
                {![1, 2, 3].includes(formData.shiftsPerDay) && <option value={formData.shiftsPerDay}>{formData.shiftsPerDay} Shifts (Current schedule)</option>}
              </select>
            </div>

            <div>
              <label htmlFor={`${fieldId}-hours`} className="text-xs font-medium text-slate-300 block mb-1">
                Gross Hours per Shift
              </label>
              <input
                id={`${fieldId}-hours`}
                type="number"
                step="any"
                min="0"
                max="24"
                value={Number.isNaN(formData.hoursPerShift) ? '' : formData.hoursPerShift}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    hoursPerShift: e.target.valueAsNumber,
                  })
                }
                required
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${fieldId}-downtime`} className="text-xs font-medium text-slate-300 block mb-1">
                Planned Downtime / Shift (min)
              </label>
              <input
                id={`${fieldId}-downtime`}
                type="number"
                min="0"
                step="any"
                value={Number.isNaN(formData.plannedDowntimeMinutesPerShift) ? '' : formData.plannedDowntimeMinutesPerShift}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    plannedDowntimeMinutesPerShift: e.target.valueAsNumber,
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
              <label htmlFor={`${fieldId}-buffer`} className="text-xs font-medium text-slate-300 block mb-1">
                Target Safety Buffer (%)
              </label>
              <input
                id={`${fieldId}-buffer`}
                type="number"
                min="0"
                max="100"
                step="any"
                value={Number.isNaN(formData.targetBufferPercent) ? '' : formData.targetBufferPercent}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    targetBufferPercent: e.target.valueAsNumber,
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
                <span className="text-[10px] text-slate-400 block">Available Time / Period</span>
                <span className="text-white font-bold">{availableTime === null ? '—' : `${availableTime.toLocaleString()}s`}</span>
                <span className="text-[10px] text-slate-500 block">{availableTime === null ? 'Enter valid parameters' : `${(availableTime / 3600).toFixed(1)} hrs`}</span>
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800/80">
                <span className="text-[10px] text-cyan-400 block font-semibold">Customer Takt</span>
                <span className="text-cyan-300 text-sm font-bold">{taktTime === null ? '—' : `${taktTime.toFixed(1)}s`}</span>
                <span className="text-[10px] text-slate-500 block">{taktTime === null ? 'Enter valid parameters' : `${(taktTime / 60).toFixed(2)} min`}</span>
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800/80">
                <span className="text-[10px] text-amber-400 block font-semibold">Target Cycle Time</span>
                <span className="text-amber-300 text-sm font-bold">{targetCT === null ? '—' : `${targetCT.toFixed(1)}s`}</span>
                <span className="text-[10px] text-slate-500 block">-{formData.targetBufferPercent}% buffer</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-400">Capacity uses net scheduled time before OEE losses. OEE is planning metadata; no good-output or resource-scheduling guarantee is implied.</p>

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
    </Modal>
  );
};
