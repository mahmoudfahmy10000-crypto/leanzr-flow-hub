/**
 * LEANZR FlowLab - Industrial Engineering & Lean Manufacturing Domain Models
 */

export type TaskCategory = 'VA' | 'NVAR' | 'NVA';
// VA = Value-Add (Direct transformation)
// NVAR = Non-Value-Add Required (Type 1 Waste / Incidental work: inspection, unwrapping, clamping)
// NVA = Non-Value-Add (Type 2 Waste: searching, excess walking, rework, waiting)

export type ErgonomicRating = 'low' | 'moderate' | 'high';

export interface Task {
  id: string;
  code: string; // e.g. "OP-010"
  name: string;
  description?: string;
  duration: number; // in seconds
  category: TaskCategory;
  predecessors: string[]; // task IDs that must complete before this task
  assignedStationId: string | null; // null = in unassigned backlog
  ergonomics: ErgonomicRating;
  requiredSkills?: string[];
  toolsAndFixtures?: string[];
}

export interface Workstation {
  id: string;
  name: string; // e.g. "Station 1: Cell Prep & QA"
  code: string; // e.g. "ST-01"
  operatorCount: number; // typically 1, or 2 for shared cells
  maxWorkplaceCapacity?: number; // max allowable operators or limit
  description?: string;
}

export interface OperatingParameters {
  demandUnitsPerPeriod: number; // e.g. 450 units
  demandPeriodDays: number; // typically 1 day
  shiftsPerDay: number; // e.g. 2 shifts
  hoursPerShift: number; // e.g. 8.0 hours
  plannedDowntimeMinutesPerShift: number; // e.g. 40 minutes (lunch, 2x 10m breaks, 10m 5S)
  oeeTargetPercent: number; // e.g. 85%
  targetBufferPercent: number; // e.g. 10% safety margin under takt
}

export interface StationCalculation {
  station: Workstation;
  tasks: Task[];
  totalWorkContent: number; // sum of task times
  stationCycleTime: number; // Conservative sequential elapsed time; extra labor does not accelerate work
  vaTime: number;
  nvarTime: number;
  nvaTime: number;
  isBottleneck: boolean;
  isOverTakt: boolean;
  isOverTarget: boolean;
  idleTimeSeconds: number; // max(0, taktTime - stationCycleTime)
  utilizationPercent: number; // (stationCycleTime / taktTime) * 100
}

export type EngineeringStatus = 'valid' | 'invalid' | 'incomplete' | 'infeasible' | 'unsupported';

export interface EngineeringReason {
  code: string;
  message: string;
  status: Exclude<EngineeringStatus, 'valid'>;
}

export interface EngineeringAssessment {
  status: EngineeringStatus;
  reasons: EngineeringReason[];
  assumptions: string[];
}

export interface LineCalculations {
  assessment: EngineeringAssessment;
  availableTimeSecondsPerDay: number;
  availableTimeSecondsPerPeriod: number;
  taktTimeSeconds: number;
  targetCycleTimeSeconds: number;
  totalWorkContentSeconds: number;
  allocatedWorkContentSeconds: number;
  allocatedVaRatioPercent: number;
  bottleneckStationId: string | null;
  bottleneckCycleTime: number;
  theoreticalMinWorkstations: number; // Legacy alias of theoreticalMinOperators; not a physical station minimum
  theoreticalMinOperators: number;
  actualWorkstationsCount: number;
  actualOperatorsCount: number;
  lineBalancingEfficiencyPercent: number; // Sum(t_i) / (N * Bottleneck) * 100
  balancingLossPercent: number; // 100 - Efficiency
  smoothnessIndex: number; // sqrt(Sum((maxCT - CT_i)^2))
  hourlyProductionCapacity: number; // 3600 / Bottleneck
  dailyProductionCapacity: number; // (AvailableTime / Bottleneck)
  periodProductionCapacity: number;
  taktAttainmentAchieved: boolean; // Bottleneck <= TaktTime
  vaRatioPercent: number; // (Sum(VA) / Sum(Total)) * 100
  stationCalculations: StationCalculation[];
  unassignedTasks: Task[];
  precedenceErrors: {
    taskId: string;
    taskCode: string;
    predecessorId: string;
    predecessorCode: string;
    message: string;
  }[];
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  stations: Workstation[];
  tasks: Task[];
  operatingParams: OperatingParameters;
}

export interface FlowProject {
  id: string;
  name: string;
  partNumber: string;
  plantLocation: string;
  lastModified: string;
  operatingParams: OperatingParameters;
  stations: Workstation[];
  tasks: Task[];
  scenarios: Scenario[];
  activeScenarioId?: string;
}
