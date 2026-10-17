import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FlowProject, Task, Workstation, OperatingParameters } from '../types/flowlab.ts';
import { calculateLineMetrics } from '../utils/engineering-math.ts';
import { PrintReportView } from './PrintReportView.tsx';
import { KPIRow } from './KPIRow.tsx';
import { ScenarioCompare } from './ScenarioCompare.tsx';
import { PrecedenceGraph } from './PrecedenceGraph.tsx';
import { YamazumiChart } from './YamazumiChart.tsx';

const params: OperatingParameters = {
  demandUnitsPerPeriod: 360,
  demandPeriodDays: 1,
  shiftsPerDay: 1,
  hoursPerShift: 1,
  plannedDowntimeMinutesPerShift: 0,
  oeeTargetPercent: 85,
  targetBufferPercent: 0,
};
const stations: Workstation[] = [{ id: 's1', code: 'ST-01', name: 'Assembly', operatorCount: 1 }];
const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'a', code: 'A', name: 'Operation A', duration: 10, category: 'VA',
  predecessors: [], assignedStationId: 's1', ergonomics: 'low', ...overrides,
});
const project = (tasks: Task[], overrides: Partial<FlowProject> = {}): FlowProject => ({
  id: 'p1', name: 'Engineering fixture', partNumber: 'P1', plantLocation: 'Test',
  lastModified: '2026-10-17T00:00:00.000Z', operatingParams: params, stations, tasks,
  scenarios: [], ...overrides,
});
const noop = () => {};

for (const [status, tasks, fixtureStations] of [
  ['valid', [task()], stations],
  ['invalid', [task({ predecessors: ['a'] })], stations],
  ['incomplete', [task({ assignedStationId: null })], stations],
  ['infeasible', [task({ duration: 20 })], stations],
  ['unsupported', [task()], [{ ...stations[0], operatorCount: 2 }]],
] as const) {
  test(`report records ${status} status and assumptions without creating approval`, () => {
    const fixture = project([...tasks], { stations: [...fixtureStations] });
    const metrics = calculateLineMetrics(fixture.stations, fixture.tasks, fixture.operatingParams);
    assert.equal(metrics.assessment.status, status);
    const report = renderToStaticMarkup(<PrintReportView project={fixture} metrics={metrics} onBack={noop} />);
    assert.match(report, new RegExp(`data-status="${status}"`));
    assert.match(report, /Engineering approval and physical line qualification have not been recorded/);
    assert.match(report, /Model assumptions/);
    assert.doesNotMatch(report, /Certified|CERTIFICATE/);
    if (status !== 'valid') {
      assert.match(report, /Takt attainment is unavailable/);
      assert.match(report, /diagnostic estimates/);
      for (const reason of metrics.assessment.reasons) {
        // Text rendering escapes arrows and apostrophes; rendering the reason independently gives its exact HTML.
        assert.ok(report.includes(renderToStaticMarkup(<>{reason.message}</>)));
      }
    }
  });
}

test('KPI uses period demand and discloses whole-project versus allocated work', () => {
  const periodParams = { ...params, demandPeriodDays: 5, demandUnitsPerPeriod: 1800 };
  const metrics = calculateLineMetrics(stations, [task()], periodParams);
  const html = renderToStaticMarkup(<KPIRow metrics={metrics} params={periodParams} onOpenParams={noop} />);
  assert.match(html, /Meets Period Demand/);
  assert.match(html, />360 u\/d</);
  assert.match(html, /Period \(5d\): 1800 units/);
  assert.match(html, /Labor lower bound/);
  const backlogMetrics = calculateLineMetrics(stations, [task(), task({ id: 'b', code: 'B', duration: 90, category: 'NVA', assignedStationId: null })], params);
  const backlogHtml = renderToStaticMarkup(<KPIRow metrics={backlogMetrics} params={params} onOpenParams={noop} />);
  assert.match(backlogHtml, />100\.0</);
  assert.match(backlogHtml, />10% VA</);
  assert.match(backlogHtml, /Allocated:/);
  assert.match(backlogHtml, /10\.0s \(100% VA\)/);
  assert.doesNotMatch(backlogHtml, /Meets Period Demand|Within Takt/);
});

test('scenario comparison normalizes day capacity and refuses success for unsupported model', () => {
  const current = project([task()]);
  current.scenarios = [{ id: 'five-day', name: 'Five day', description: '', createdAt: current.lastModified,
    stations, tasks: current.tasks, operatingParams: { ...params, demandPeriodDays: 5, demandUnitsPerPeriod: 1800 } },
  { id: 'multi', name: 'Multi operator', description: '', createdAt: current.lastModified,
    stations: [{ ...stations[0], operatorCount: 2 }], tasks: current.tasks, operatingParams: params }];
  const html = renderToStaticMarkup(<ScenarioCompare project={current}
    currentMetrics={calculateLineMetrics(stations, current.tasks, params)} onActivateScenario={noop}
    onCreateScenario={noop} onDeleteScenario={noop} />);
  assert.match(html, /\+0 u\/d/);
  assert.match(html, /1800 u\/5d/);
  assert.match(html, />unsupported</);
  assert.match(html, /Multi-operator scheduling is not modeled/);
  assert.equal((html.match(/Takt attained/g) ?? []).length, 2, 'Only the two valid models may attain takt');
});

test('precedence view rejects a cycle with an actionable path and renders deep DAG iteratively', () => {
  const cyclic = [task({ predecessors: ['b'] }), task({ id: 'b', code: 'B', predecessors: ['a'] })];
  const html = renderToStaticMarkup(<PrecedenceGraph tasks={cyclic} stations={stations} onSelectTask={noop} />);
  assert.match(html, /Invalid precedence graph/);
  assert.match(html, /Precedence cycle/);
  assert.match(html, /Remove or change a predecessor/);
  const deep = Array.from({ length: 2000 }, (_, index) => task({ id: String(index), code: `OP-${index}`, predecessors: index ? [String(index - 1)] : [] }));
  assert.doesNotThrow(() => renderToStaticMarkup(<PrecedenceGraph tasks={deep} stations={stations} onSelectTask={noop} />));
});

test('chart retains 360px plot and task fractions without dividing by operators', () => {
  const multi = [{ ...stations[0], operatorCount: 2 }];
  const tasks = [task({ duration: 6 }), task({ id: 'b', code: 'B', duration: 4 })];
  const html = renderToStaticMarkup(<YamazumiChart metrics={calculateLineMetrics(multi, tasks, params)} onSelectTask={noop} onOpenTaskModal={noop} />);
  assert.match(html, /data-testid="yamazumi-plot"[^>]*style="height:360px"/);
  assert.match(html, /data-testid="yamazumi-bar"[^>]*data-seconds="10"/);
  assert.match(html, /flex:0 0 60%/);
  assert.match(html, /flex:0 0 40%/);
});
