# Validation evidence and regression strategy

Date: 2026-10-17. Source baseline: `fe7f9fa7b2d059f1f34c30bfd887dd638de2ae70`. Working directory for commands: `/workspace/leanzr-flow-hub`. The published environment was reused; no installation or environment configuration was repeated.

## Executed baseline checks

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm run lint` | Passed; TypeScript `tsc --noEmit` | Type compatibility for current source; this script is not an ESLint/static-security suite |
| `node --import tsx --test src/utils/*.test.ts` | Passed: 8 tests, 0 failed, 0 skipped | Five ordinary engineering cases and three small acyclic optimizer cases |
| `npm run build` | Passed; 1,676 modules transformed | Production assets build; Vite warns about future native-loader handling of `__dirname` |
| `npm run dev -- --strictPort` | Started on port3000 | Local development runtime available for audit checks |
| Isolated Chromium/Playwright dashboard navigation | Passed on unmodified sample | React rendered dashboard without baseline page errors |
| Ordinary UI cycle edit | **Defect reproduced** | OP-010 depending on OP-030 creates an indirect cycle; React root becomes empty with stack overflow |
| Project switch and parameter save | **Defect reproduced** | Syringe demand180 becomes250 and takt150s becomes208.8s after opening/saving stale EV parameters |
| Yamazumi browser geometry | **Defect reproduced** | Under-takt160s bar visually crosses208.8s takt; tall bars shrink and lose their common baseline |
| Keyboard interaction with open parameters modal | **Defect reproduced** | Background task deletion fires while modal remains visible |
| Targeted calculation and optimizer counterexamples | **Defects reproduced** | Incorrect units/validity, leveling output mismatch, station-ID collision, operator inconsistencies |
| CSV/storage function probes and synthetic hook-handler probes | **Defects reproduced** | Actual utility behavior plus specific handler transitions; hook probes are not full browser end-to-end tests |
| Deployed/plant workflow, statistical time study, dependency advisory scan | Not run | Outside available evidence; no claims of production qualification |

All eight existing assertions passed; the audit counterexamples are separate probes showing missing coverage, not failures in that eight-test suite. No application tests or assertions were changed or disabled. Browser checks used fresh contexts and did not edit a user's persistent browser profile. Temporary audit probes live outside the checkout and are not PR dependencies; reproducible core cases are included in the audit documents.

## Existing coverage and blind spots

| Area | Existing coverage | Missing meaningful regression checks |
| --- | --- | --- |
| Time/takt/buffer | One valid one-day example each | Multiple periods, nonfinite data, zero demand/time, loss basis, buffer limits |
| Metrics | Two stations, one operator each, all tasks assigned | Backlog totals, empty state, mixed operators, unknown station IDs, resource bottlenecks, per-day versus period output |
| Precedence | One reversed station dependency | Cycles, self-loops, dangling IDs, duplicate IDs/codes, same-station legal ordering, downstream incompleteness |
| RPW weights | Four-task diamond graph | Cycles, disconnected DAGs, deep/large graphs, repeated descendants, numeric/input bounds |
| RPW/LPT balance | Assigned count and maxCT for one small graph | Every edge's station ordering, task conservation, output IDs, oversize infeasibility, deterministic equality, multi-operator semantics |
| Leveling | None | Returned assignments versus claimed objective, precedence after every move, conservation, no mutation, empty stations |
| Import/export/storage | None | Atomic failure, round-trip data, migration/recovery, quota failures, active-project preservation |
| React workflows | None | Task edits, parameters after project switch, optimizer apply/cancel, import/reload, scenarios, print status, keyboard/mobile navigation |

The current LPT test is titled “deterministic” but runs the algorithm only once. The RPW test comment describes precedence checking, but the assertions only verify two station IDs are truthy; they do not compare the predecessor and successor station indices. See [line-balancing-optimizer.test.ts](../../src/utils/line-balancing-optimizer.test.ts), lines29–49. Rename or strengthen these checks in implementation work.

## Reproducible browser counterexample: P0-001

Start the existing app with `npm run dev -- --strictPort`, then run this from the cloud machine's available Python/Playwright runtime:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/chromium", headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"])
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:3000/", wait_until="networkidle")
    page.locator("[draggable=true]").filter(has_text="OP-010").first \
        .get_by_title("Edit task details").click()
    page.locator("label").filter(has_text="OP-030") \
        .locator("input[type=checkbox]").check()
    page.get_by_role("button", name="Save Task", exact=True).click()
    page.wait_for_timeout(300)
    print(page.locator("#root").evaluate("e => e.children.length"), errors)
    browser.close()
```

Observed: `0 ['Maximum call stack size exceeded']`. OP-030 already depends on OP-010 in the default benchmark; the new edge completes a cycle. Expected: saving is rejected with an actionable cycle path, prior project remains usable, and the closed optimizer performs no unsafe work. No optimizer action or precedence-tab visit is required to trigger the failure.

## UI-001: stale operating-parameter form

[OperatingParamsModal.tsx](../../src/components/OperatingParamsModal.tsx), line23 copies `params` into state once. [App.tsx](../../src/App.tsx), lines368–373 keeps the component mounted while project/scenario/import actions replace parameters. Unlike TaskModal's effect-based initialization, this form has no synchronization on open or project change.

Reproduce: fresh EV benchmark → switch to Ambulatory Syringe benchmark → “Edit Params” → “Update Parameters,” without changing any inputs. Browser-observed syringe parameters before save: demand180, one shift, downtime30min, OEE92, buffer10%; after save: demand250, two shifts, downtime45min, OEE88, buffer12%. Takt changes from150s to208.8s. A separate synthetic hook-handler probe with new demand999 displayed and resaved original demand250. Scenario/reset/import paths are source-confirmed; preset switching and cancel/reopen are browser-confirmed. Canceling a demand123 draft also leaves123 in the next opening. Expected: opening initializes a fresh draft from the active project, cancel discards it, and switching project cannot later write a previous project's settings. Tests must cover scenario activation and JSON import as well as preset switching.

## UI-002: inaccessible navigation at narrow widths

[TopNav.tsx](../../src/components/TopNav.tsx), line119 uses `hidden md:flex` for the only main navigation. No corresponding mobile navigation exists. Test at390px wide: users must still reach the precedence graph, scenarios, and Kaizen guidance. A responsive layout and keyboard-accessible alternative should be verified in the UI phase. This is a bounded workflow defect, not a claim about every mobile interaction.

Browser observation at390×844: all four primary tab/playbook controls were invisible; the document and header were650px wide. This confirms inaccessible primary views and horizontal overflow at that viewport.

## UI-003: Yamazumi geometry contradicts numeric cycle/takt comparisons

The chart's [360px plotting area](../../src/components/YamazumiChart.tsx#L167) also contains column headers, bars, station labels, and status content. Its [column flex layout](../../src/components/YamazumiChart.tsx#L207) permits [requested bar heights](../../src/components/YamazumiChart.tsx#L248) to shrink and puts their bottoms above the plotted zero. Numeric calculations are separate from this rendering defect.

Measured with a fresh EV benchmark in Chromium at1440×1000: scale maximum261s; plot height360px; takt208.8s line at y72px from plot top.

| Station | Numeric cycle | Requested bar height | Rendered height | Bar top / bottom versus plot |
| --- | --- | --- | --- | --- |
| ST-01 | 160s, below takt | 220.690px | 220.688px | Top66.813px, visually above takt; bottom72.5px above zero |
| ST-02 | 170s, below takt | 234.483px | 234.469px | Top53.031px, visually above takt; bottom72.5px above zero |
| ST-03 | 221s, above takt | 304.828px | 240.000px | Top45px, bottom75px above zero |
| ST-05 | 208s, below takt | 286.897px | 242.500px | Top45px, bottom72.5px above zero |

The central engineering visualization therefore implies false overloads and equalizes different station cycles. Reserve a common plot box for lines/bars, place labels outside it, and prevent height shrink. Acceptance: bars below/equal/above takt have the corresponding relative top positions, common bottoms, and proportional rendered heights at supported viewports. Verify browser geometry, not only inline style values.

To inspect the measured values, run this in the browser console against the fresh local page; it returns geometry without modifying project state:

```javascript
const chart = [...document.querySelectorAll('main h2')]
  .find(e => e.textContent.includes('Yamazumi')).closest('main > div');
const plot = chart.querySelector('.relative.flex-1');
const box = plot.getBoundingClientRect();
[...plot.querySelector('.justify-around').children].map(column => {
  const bar = column.children[1], r = bar.getBoundingClientRect();
  return {requested: bar.style.height, rendered: r.height,
          top: r.top - box.top, bottomOffset: r.bottom - box.bottom};
});
```

## UI-004: open modal permits destructive background keyboard actions

[OperatingParamsModal.tsx](../../src/components/OperatingParamsModal.tsx#L39) implements a visual overlay without focus trapping, inert background, dialog semantics, or initial/return-focus management. Browser observation: open modal has zero `role=dialog` elements, focus remains on BODY, and Escape does not close it. Starting from its first input, repeated Shift+Tab reaches a background button titled “Delete task.” Pressing Enter deletes a task while the modal remains visible; the isolated Syringe fixture changed from12 tasks to11. Tab count depends on the rendered project; use the active element's title to identify the dangerous target.

Expected: modal keyboard focus stays within its interactive controls; background actions cannot execute until it closes; Escape/cancel and focus return are defined. Add a shared accessible dialog primitive and a browser regression that attempts background keyboard actions. This concrete accidental data mutation should be fixed in Phase1, ahead of general accessibility polish.

## Regression fixtures for Phase 1

| Fixture | Oracle / acceptance |
| --- | --- |
| One day versus five-day equivalent demand | Same takt and daily output; period output scales by five, with explicit units |
| Assigned VA10s + backlog NVA90s | Project work100s/VA10%; allocated work10s shown separately; status incomplete |
| Reversed dependency A@S2 -> B@S1 | Routing invalid; cannot report a feasible/approved line |
| A↔B, self-loop, unknown predecessor | Structured graph error, no recursion crash or silent edge removal |
| Empty tasks or no stations | Explicit empty/incomplete result; no success status or NaN/Infinity presentation |
| Single fixed machine100s with extra worker | Cannot claim CT50s without declared duplicate resource or supported execution model |
| Minimal malformed JSON | Import rejected atomically; active persisted project remains recoverable |
| CSV with one good and one invalid row | No unreviewed partial replacement; row errors remain visible |
| Quota/storage exception | Unsaved status visible; in-memory project can still be exported |
| Unchanged task edit | Required skills, tools, descriptions, and identities preserved |

## Optimizer verification after the validity boundary

For every result, independently verify unique station/task IDs, conservation of tasks and durations, all prerequisite edges, assignment membership, supported resource assumptions, and target feasibility. Recompute displayed metrics with the canonical evaluator and assert they equal the preview summary. Compare objective values on tiny exhaustive DAG examples where an optimal solution can be enumerated, without requiring heuristics always to find that optimum.

Add deterministic repeated-run checks with explicit tie-breaking, immutability checks, disconnected DAG cases, oversize tasks, zero/negative/nonfinite targets, generated ID collisions, and leveling moves. A station count or efficiency improvement alone is not evidence of a valid balance. Test infeasible and incomplete outcomes as successful diagnostic behavior rather than coercing them into a valid result.

Use property tests or generated small DAGs to assert graph/order conservation. Bound deep traversals and input sizes from measured workloads; do not choose unsupported scale claims. Keep the 14-task EV benchmark as a smoke fixture, and add independent small cases so sample-data mistakes cannot define the oracle.

## Workflow acceptance and reporting

Use a fresh browser context for each import/project test. Exercise save/reload; export/import; snapshot/activate/delete; optimize/preview/apply/cancel; parameter open/edit/cancel after switching; storage failure; and print output for valid, incomplete, invalid, and infeasible projects. Print output must include validity status and the assumptions required to interpret capacity. Keyboard tests should cover dialog focus, escape/cancel, input associations, icon names, navigation, and non-drag task allocation.

In a later implementation PR, add a repository test command and CI that fails on type, build, regression, or browser errors and reports real executed counts. Preserve the underlying exit status when saving logs. Add the regressions alongside the corresponding fixes; this audit deliberately adds documentation rather than tests or code changes.

## Pull-request validation boundaries

Before committing this audit: verify exactly six added Markdown documents under `docs/audit/`, all internal file links resolve, `git diff --check` passes, and no source/test/manifest/lockfile changes are staged. Remote API access and Git read/write access are separate capabilities. A prepared branch and PR body do not prove that a hosted PR was created; report the actual remote result and URL only when confirmed.
