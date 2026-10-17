#!/usr/bin/env python3
"""Real Chromium regressions for Phase 1. Requires Python Playwright + Chromium.

Run from any directory with ``python3 tests/browser/phase1_regressions.py``.
The suite launches its own Vite server on an available loopback port and closes
only the browser, contexts and process group it owns. It installs nothing.
"""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import unittest
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[2]
ACTIVE_KEY = "leanzr_flowlab_active_project"
SAVED_KEY = "leanzr_flowlab_saved_projects"
RECOVERY_KEY = "leanzr_flowlab_protected_recovery_data"


def project_fixture():
    return {
        "id": "browser-regression-project",
        "name": "Browser regression line",
        "partNumber": "REG-001",
        "plantLocation": "Test facility",
        "lastModified": "2026-01-01T00:00:00.000Z",
        "operatingParams": {
            "demandUnitsPerPeriod": 60,
            "demandPeriodDays": 1,
            "shiftsPerDay": 1,
            "hoursPerShift": 1,
            "plannedDowntimeMinutesPerShift": 0,
            "oeeTargetPercent": 85,
            "targetBufferPercent": 10,
        },
        "stations": [
            {"id": "s1", "code": "ST-01", "name": "Preparation", "operatorCount": 1},
            {"id": "s2", "code": "ST-02", "name": "Machine cell", "operatorCount": 1},
        ],
        "tasks": [
            {
                "id": "t1", "code": "OP-010", "name": "Prepare fixture",
                "duration": 20, "category": "VA", "predecessors": [],
                "assignedStationId": "s1", "ergonomics": "low",
                "description": "Retain these work instructions.",
                "requiredSkills": ["ESD qualification", "Laser operator"],
                "toolsAndFixtures": ["Fixture A", "Gauge, calibrated"],
                "extensionMetadata": {"revision": 7, "owner": "engineering"},
            },
            {
                "id": "t2", "code": "OP-020", "name": "Machine dwell",
                "duration": 30, "category": "NVAR", "predecessors": ["t1"],
                "assignedStationId": "s2", "ergonomics": "moderate",
                "requiredSkills": ["Machine authorization"],
            },
        ],
        "scenarios": [],
        "extensionMetadata": {"source": "browser-regression"},
    }


class Phase1BrowserRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.logdir = tempfile.TemporaryDirectory(prefix="leanzr-browser-")
        cls.server_log_path = Path(cls.logdir.name) / "vite.log"
        cls.server_log = cls.server_log_path.open("w+")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        cls.base_url = f"http://127.0.0.1:{port}"
        cls.server = subprocess.Popen(
            ["npm", "run", "dev", "--", f"--port={port}", "--host=127.0.0.1", "--strictPort"],
            cwd=ROOT, env={**os.environ, "DISABLE_HMR": "true"},
            stdout=cls.server_log, stderr=subprocess.STDOUT, start_new_session=True,
        )
        cls.addClassCleanup(cls.stop_server)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if cls.server.poll() is not None:
                raise RuntimeError(f"Vite exited during startup:\n{cls.server_log_path.read_text()}")
            try:
                with urlopen(cls.base_url, timeout=1) as response:
                    if response.status == 200:
                        break
            except (URLError, TimeoutError):
                time.sleep(0.1)
        else:
            raise RuntimeError(f"Vite did not become ready:\n{cls.server_log_path.read_text()}")
        cls.playwright = sync_playwright().start()
        cls.addClassCleanup(cls.playwright.stop)
        executable = os.environ.get("CHROMIUM_EXECUTABLE") or shutil.which("chromium") or shutil.which("chromium-browser")
        if not executable and Path(cls.playwright.chromium.executable_path).is_file():
            executable = cls.playwright.chromium.executable_path
        if not executable:
            raise RuntimeError("Chromium is required. Set CHROMIUM_EXECUTABLE to the installed executable or provision a Playwright Chromium browser.")
        cls.browser = cls.playwright.chromium.launch(executable_path=executable, headless=True, args=["--no-sandbox"])
        cls.addClassCleanup(cls.browser.close)
        expect.set_options(timeout=8000)

    @classmethod
    def stop_server(cls):
        if cls.server.poll() is None:
            os.killpg(cls.server.pid, signal.SIGTERM)
            try:
                cls.server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(cls.server.pid, signal.SIGKILL)
                cls.server.wait(timeout=5)
        cls.server_log.close()
        cls.logdir.cleanup()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1600, "height": 1100}, accept_downloads=True)
        self.addCleanup(self.context.close)
        self.page = self.context.new_page()
        self.page.set_default_timeout(8000)
        self.page_errors = []
        self.page.on("pageerror", lambda error: self.page_errors.append(str(error)))

    def tearDown(self):
        self.assertEqual(self.page_errors, [], "The page raised uncaught runtime errors.")

    def load(self, project=None, *, raw=None):
        value = json.dumps(project if project is not None else project_fixture(), separators=(",", ":")) if raw is None else raw
        self.context.add_init_script(
            "if (!sessionStorage.getItem('phase1-regression-seeded')) {"
            f"localStorage.setItem({json.dumps(ACTIVE_KEY)}, {json.dumps(value)});"
            "sessionStorage.setItem('phase1-regression-seeded', 'true');}"
        )
        self.page.goto(self.base_url)
        expect(self.page.get_by_test_id("engineering-status")).to_be_visible()
        return value

    def raw_active(self):
        return self.page.evaluate("key => localStorage.getItem(key)", ACTIVE_KEY)

    def active_project(self):
        return json.loads(self.raw_active())

    def edit_first_task(self):
        self.page.get_by_role("button", name="Edit OP-010: Prepare fixture", exact=True).click()
        dialog = self.page.get_by_role("dialog", name="Edit Task: OP-010", exact=True)
        expect(dialog).to_be_visible()
        return dialog

    def open_params(self):
        self.page.get_by_text("Edit Params", exact=True).click()
        dialog = self.page.get_by_role("dialog", name="Line Operating Parameters & Takt Time Settings", exact=True)
        expect(dialog).to_be_visible()
        return dialog

    def import_file(self, name, content):
        self.page.locator("input[type=file]").set_input_files({
            "name": name, "mimeType": "application/json" if name.endswith(".json") else "text/csv",
            "buffer": content.encode(),
        })

    def assert_import_rejected(self, name, content, reason):
        before = self.raw_active()
        self.import_file(name, content)
        expect(self.page.get_by_test_id("workspace-error")).to_contain_text("Import rejected")
        expect(self.page.get_by_test_id("workspace-error")).to_contain_text(reason)
        expect(self.page.get_by_role("dialog")).to_have_count(0)
        self.assertEqual(self.raw_active(), before, "Rejected import changed serialized active project.")
        expect(self.page.get_by_role("button", name="Edit OP-010: Prepare fixture", exact=True)).to_be_visible()

    def open_report(self):
        self.page.get_by_role("button", name="Export / Reports", exact=True).click()
        self.page.get_by_role("button", name="Printable Audit Report", exact=True).click()
        expect(self.page.get_by_test_id("report-status")).to_be_visible()

    def assert_report(self, status, reason=None):
        expect(self.page.get_by_test_id("engineering-status")).to_have_attribute("data-status", status)
        if status != "valid":
            expect(self.page.get_by_test_id("engineering-status")).to_contain_text("takt attainment is unavailable")
            expect(self.page.get_by_text("Within Takt", exact=True)).to_have_count(0)
            expect(self.page.get_by_text("Meets Period Demand", exact=True)).to_have_count(0)
        self.open_report()
        expect(self.page.get_by_test_id("report-status")).to_have_attribute("data-status", status)
        report = self.page.get_by_role("region", name="Engineering validation and assumptions")
        expect(report).to_contain_text(f"Validation status: {status}")
        expect(report).to_contain_text("Engineering approval and physical line qualification have not been recorded")
        expect(report).to_contain_text("Model assumptions")
        expect(report).to_contain_text("Conservative sequential model")
        expect(report).to_contain_text("OEE target is informational and is not applied")
        if reason:
            expect(report).to_contain_text(reason)
        if status != "valid":
            expect(report).to_contain_text("Takt attainment is unavailable for this plan")
            expect(self.page.get_by_text("Within takt", exact=True)).to_have_count(0)
        self.assertNotRegex(self.page.locator("body").inner_text(), re.compile(r"\bCertified\b", re.I))

    def test_cyclic_predecessor_edit_is_rejected_without_dashboard_crash(self):
        self.load()
        before = self.raw_active()
        dialog = self.edit_first_task()
        dialog.get_by_role("checkbox", name=re.compile("OP-020")).check()
        dialog.get_by_role("button", name="Save Task", exact=True).click()
        expect(dialog.get_by_role("alert")).to_contain_text("Precedence cycle")
        expect(dialog.get_by_role("alert")).to_contain_text("OP-010")
        expect(dialog.get_by_role("alert")).to_contain_text("OP-020")
        expect(dialog).to_be_visible()
        self.assertEqual(self.raw_active(), before)
        self.page.keyboard.press("Escape")
        self.page.get_by_role("button", name="Precedence Network", exact=True).click()
        expect(self.page.get_by_role("heading", name=re.compile("Precedence"))).to_be_visible()
        self.page.get_by_role("button", name="Auto-Balance Line", exact=True).click()
        expect(self.page.get_by_role("dialog")).to_be_visible()

    def test_malformed_json_import_preserves_project(self):
        self.load()
        self.assert_import_rejected("broken.json", '{"tasks": [', "not valid JSON")

    def test_json_duplicate_ids_import_preserves_project(self):
        self.load()
        candidate = project_fixture()
        candidate["tasks"][1]["id"] = "t1"
        self.assert_import_rejected("duplicate.json", json.dumps(candidate), "duplicat")

    def test_json_nonfinite_numeric_import_preserves_project(self):
        self.load()
        candidate = project_fixture()
        candidate["tasks"][0]["duration"] = 1e999
        self.assert_import_rejected("infinite.json", json.dumps(candidate).replace("Infinity", "1e999"), "finite")

    def test_json_aggregate_numeric_overflow_import_preserves_project(self):
        self.load()
        candidate = project_fixture()
        for task in candidate["tasks"]:
            task["duration"] = 1e308
        self.assert_import_rejected("overflow.json", json.dumps(candidate), "supported calculation range")

    def test_json_nonfinite_extension_metadata_import_preserves_project(self):
        self.load()
        candidate = project_fixture()
        candidate["extensionMetadata"]["measurements"] = {"elapsedSeconds": 1e999}
        self.assert_import_rejected("metadata-overflow.json", json.dumps(candidate).replace("Infinity", "1e400"), "finite")
        expect(self.page.get_by_test_id("workspace-error")).to_contain_text("extensionMetadata.measurements.elapsedSeconds")

    def test_partial_invalid_csv_import_preserves_all_existing_tasks(self):
        self.load()
        self.assert_import_rejected(
            "partial.csv", "Code,Name,Duration_s,Station_Code\nNEW-01,Would be valid,10,ST-01\nNEW-02,Invalid row,nope,ST-02\n",
            "finite positive number",
        )

    def test_csv_unknown_predecessor_preserves_project(self):
        self.load()
        self.assert_import_rejected(
            "unknown-predecessor.csv", "Code,Name,Duration_s,Station_Code,Predecessors\nNEW-01,New operation,10,ST-01,DOES-NOT-EXIST\n",
            "Unknown predecessor",
        )

    def test_valid_import_requires_review_and_cancel_preserves_project(self):
        self.load()
        before = self.raw_active()
        candidate = project_fixture()
        candidate["name"] = "Reviewed replacement"
        self.import_file("replacement.json", json.dumps(candidate))
        dialog = self.page.get_by_role("dialog", name="Review project import", exact=True)
        expect(dialog).to_contain_text("passed structural and graph validation")
        expect(dialog).to_contain_text("not engineering approval")
        self.assertEqual(self.raw_active(), before)
        dialog.get_by_role("button", name="Cancel import", exact=True).click()
        self.assertEqual(self.raw_active(), before)
        self.import_file("replacement.json", json.dumps(candidate))
        self.page.get_by_role("dialog", name="Review project import", exact=True).get_by_role("button", name="Replace workspace", exact=True).click()
        expect(self.page.get_by_role("dialog")).to_have_count(0)
        self.assertEqual(self.active_project()["name"], "Reviewed replacement")
        previous = self.page.evaluate("() => JSON.parse(localStorage.getItem('leanzr_flowlab_previous_project'))")
        self.assertEqual(previous, json.loads(before))

    def test_valid_report_discloses_assumptions_and_no_approval(self):
        self.load()
        self.assert_report("valid")

    def test_infeasible_over_takt_report_has_no_attainment(self):
        candidate = project_fixture()
        candidate["tasks"][1]["duration"] = 90
        self.load(candidate)
        self.assert_report("infeasible", "exceeds customer takt")

    def test_infeasible_routing_report_has_no_attainment(self):
        candidate = project_fixture()
        candidate["tasks"][0]["assignedStationId"] = "s2"
        candidate["tasks"][1]["assignedStationId"] = "s1"
        self.load(candidate)
        self.assert_report("infeasible", "Sequence violation")

    def test_unsupported_multi_operator_report_and_no_false_acceleration(self):
        candidate = project_fixture()
        candidate["stations"][1]["operatorCount"] = 3
        candidate["tasks"][1]["duration"] = 90
        self.load(candidate)
        bar = self.page.get_by_test_id("yamazumi-bar").filter(has=self.page.get_by_role("button", name="Edit OP-020: Machine dwell", exact=True))
        expect(bar).to_have_attribute("data-seconds", "90")
        self.assert_report("unsupported", "Multi-operator scheduling is not modeled")

    def test_incomplete_report_and_separate_total_allocated_work(self):
        candidate = project_fixture()
        candidate["tasks"][1]["assignedStationId"] = None
        self.load(candidate)
        expect(self.page.get_by_text("50.0", exact=True)).to_be_visible()
        expect(self.page.get_by_text("20.0s (100% VA)", exact=True)).to_be_visible()
        self.assert_report("incomplete", "Assign 1 backlog task(s)")
        report_rows = self.page.get_by_role("row")
        work_row = report_rows.filter(has_text="Project Work / VA Ratio")
        expect(work_row).to_contain_text("50.0 sec / 40.0%")
        expect(work_row).to_contain_text("20.0 sec / 100.0%")

    def test_invalid_aggregate_numeric_range_report_has_no_attainment(self):
        candidate = project_fixture()
        for task in candidate["tasks"]:
            task["duration"] = 1e308
        self.load(candidate)
        self.assert_report("invalid", "supported calculation range")

    def test_period_capacity_is_not_mislabeled_as_daily(self):
        candidate = project_fixture()
        candidate["operatingParams"]["demandPeriodDays"] = 5
        candidate["operatingParams"]["demandUnitsPerPeriod"] = 300
        self.load(candidate)
        expect(self.page.get_by_text("120 u/d", exact=True)).to_be_visible()
        expect(self.page.get_by_text("Period (5d): 600 units", exact=True)).to_be_visible()
        self.open_report()
        expect(self.page.get_by_text("120 u/day", exact=True)).to_be_visible()
        expect(self.page.get_by_text("600 u/5-day period", exact=True)).to_be_visible()
        expect(self.page.get_by_role("row").filter(has_text="Daily Available Operating Time")).to_contain_text("3,600 sec")
        expect(self.page.get_by_role("row").filter(has_text="Period Available Operating Time")).to_contain_text("18,000 sec")

    def test_no_op_task_edit_preserves_qualifications_and_extension_metadata(self):
        fixture = project_fixture()
        self.load(fixture)
        self.edit_first_task().get_by_role("button", name="Save Task", exact=True).click()
        expect(self.page.get_by_role("dialog")).to_have_count(0)
        self.assertEqual(self.active_project()["tasks"], fixture["tasks"])
        self.assertEqual(self.active_project()["extensionMetadata"], fixture["extensionMetadata"])
        expect(self.page.get_by_test_id("save-status")).to_have_text("Saved locally")

    def assert_station_delete_add_preserves_tasks_and_csv_membership(self, deleted_index):
        candidate = project_fixture()
        candidate["stations"].append({"id": "s3", "code": "ST-03", "name": "Inspection", "operatorCount": 1})
        candidate["tasks"].append({
            "id": "t3", "code": "OP-030", "name": "Inspect completed part", "duration": 10,
            "category": "NVAR", "predecessors": ["t2"], "assignedStationId": "s3", "ergonomics": "low",
        })
        self.load(candidate)
        deleted = candidate["stations"][deleted_index]
        expected_tasks = copy.deepcopy(candidate["tasks"])
        for task in expected_tasks:
            if task["assignedStationId"] == deleted["id"]:
                task["assignedStationId"] = None
        self.page.get_by_title("Delete station (tasks move to backlog)", exact=True).nth(deleted_index).click()
        after_delete = self.active_project()
        self.assertEqual(after_delete["tasks"], expected_tasks, "Deleting a station must preserve every task and only move its assignments to backlog.")
        self.assertEqual(len(after_delete["stations"]), 2)
        self.page.get_by_role("button", name="Add Workstation", exact=True).click()
        after_add = self.active_project()
        self.assertEqual(after_add["tasks"], expected_tasks)
        self.assertEqual(len(after_add["stations"]), 3)
        codes = [station["code"].strip().upper() for station in after_add["stations"]]
        self.assertEqual(sorted(codes), ["ST-01", "ST-02", "ST-03"])
        self.assertEqual(len(set(codes)), len(codes), "Adding after deletion duplicated a surviving station code.")
        self.assertEqual(len({station["id"] for station in after_add["stations"]}), 3)
        self.page.get_by_role("button", name="Export / Reports", exact=True).click()
        with self.page.expect_download() as download_event:
            self.page.get_by_role("button", name="Export Tasks CSV", exact=True).click()
        csv_text = Path(download_event.value.path()).read_text()
        parsed = self.page.evaluate("""async ({csv, stations}) => {
            const {parseTasksCSV} = await import('/src/utils/export-import.ts');
            return parseTasksCSV(csv, stations);
        }""", {"csv": csv_text, "stations": after_add["stations"]})
        self.assertEqual(parsed["errors"], [])
        expected_membership = {task["code"]: task["assignedStationId"] for task in expected_tasks}
        parsed_membership = {task["code"]: task["assignedStationId"] for task in parsed["tasks"]}
        self.assertEqual(parsed_membership, expected_membership, "CSV export/reparse redirected tasks to a newly added station.")
        self.assertEqual(len(parsed["tasks"]), len(expected_tasks))

    def test_delete_first_station_then_add_keeps_unique_codes_and_csv_membership(self):
        self.assert_station_delete_add_preserves_tasks_and_csv_membership(0)

    def test_delete_middle_station_then_add_keeps_unique_codes_and_csv_membership(self):
        self.assert_station_delete_add_preserves_tasks_and_csv_membership(1)

    def test_failed_task_storage_write_keeps_dialog_and_previous_project(self):
        self.load()
        before = self.raw_active()
        self.page.evaluate("""() => {
            const originalSetItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function(key, value) {
                if (key === 'leanzr_flowlab_active_project') {
                    throw new DOMException('Injected browser storage quota failure', 'QuotaExceededError');
                }
                return originalSetItem.call(this, key, value);
            };
        }""")
        dialog = self.edit_first_task()
        dialog.get_by_label("Task Name / Operation", exact=True).fill("This failed edit must not replace the project")
        dialog.get_by_role("button", name="Save Task", exact=True).click()
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("alert")).to_contain_text("quota failure")
        expect(self.page.get_by_test_id("save-status")).to_contain_text("Save failed")
        self.assertEqual(self.raw_active(), before)
        self.page.keyboard.press("Escape")
        expect(self.page.get_by_role("button", name="Edit OP-010: Prepare fixture", exact=True)).to_be_visible()

    def test_modal_traps_focus_blocks_background_keyboard_and_returns_focus(self):
        self.load()
        before = self.raw_active()
        opener = self.page.get_by_role("button", name="Kaizen Playbook", exact=True)
        opener.click()
        dialog = self.page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        for key in ["Tab"] * 12 + ["Shift+Tab"] * 12:
            self.page.keyboard.press(key)
            self.assertTrue(self.page.evaluate("() => document.querySelector('dialog[open]').contains(document.activeElement)"), f"Focus escaped the modal with {key}.")
        self.page.locator('button[title="Delete task"]').first.evaluate("element => element.focus()")
        self.assertTrue(self.page.evaluate("() => document.querySelector('dialog[open]').contains(document.activeElement)"), "An inert background deletion control obtained keyboard focus.")
        self.page.keyboard.press("Delete")
        self.assertEqual(self.raw_active(), before)
        self.page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        expect(opener).to_be_focused()
        self.assertEqual(self.raw_active(), before)

    def test_modal_prevents_keyboard_activation_of_inert_background_delete(self):
        self.load()
        before = self.raw_active()
        self.edit_first_task()
        self.page.get_by_role("button", name="Close dialog", exact=True).focus()
        self.page.locator('button[title="Delete task"]').first.evaluate("element => element.focus()")
        expect(self.page.get_by_role("button", name="Close dialog", exact=True)).to_be_focused()
        # Enter must activate the modal close control, never the inert delete button.
        self.page.keyboard.press("Enter")
        expect(self.page.get_by_role("dialog")).to_have_count(0)
        self.assertEqual(self.raw_active(), before)
        expect(self.page.get_by_role("button", name="Edit OP-010: Prepare fixture", exact=True)).to_be_visible()

    def test_cancelled_parameter_draft_resets_on_reopen(self):
        self.load()
        before = self.raw_active()
        dialog = self.open_params()
        dialog.get_by_label("Customer Demand (Units)", exact=True).fill("999")
        self.page.keyboard.press("Escape")
        self.assertEqual(self.raw_active(), before)
        expect(self.open_params().get_by_label("Customer Demand (Units)", exact=True)).to_have_value("60")

    def test_project_switch_reloads_parameters_and_preserves_saved_project(self):
        self.load()
        dialog = self.open_params()
        dialog.get_by_label("Customer Demand (Units)", exact=True).fill("77")
        dialog.get_by_role("button", name="Update Parameters", exact=True).click()
        expect(self.page.get_by_role("dialog")).to_have_count(0)
        self.page.get_by_role("button", name="Browser regression line", exact=True).click()
        self.page.get_by_role("button", name=re.compile("Ambulatory Syringe Infusion Pump Model S-400")).click()
        expect(self.open_params().get_by_label("Customer Demand (Units)", exact=True)).to_have_value("180")
        self.page.keyboard.press("Escape")
        catalog = self.page.evaluate("key => JSON.parse(localStorage.getItem(key))", SAVED_KEY)
        original = next(item for item in catalog if item["id"] == "browser-regression-project")
        self.assertEqual(original["operatingParams"]["demandUnitsPerPeriod"], 77)
        self.page.reload()
        expect(self.open_params().get_by_label("Customer Demand (Units)", exact=True)).to_have_value("180")
        self.page.keyboard.press("Escape")
        self.page.get_by_role("button", name="Ambulatory Syringe Infusion Pump Model S-400", exact=True).click()
        self.page.get_by_role("button", name=re.compile("Browser regression line")).click()
        expect(self.open_params().get_by_label("Customer Demand (Units)", exact=True)).to_have_value("77")

    def test_scenario_activation_reloads_parameters(self):
        candidate = project_fixture()
        scenario = {
            "id": "scenario-distinct-demand", "name": "Distinct operating plan", "description": "Stale-parameter regression",
            "createdAt": "2026-01-01T00:00:00.000Z", "tasks": copy.deepcopy(candidate["tasks"]),
            "stations": copy.deepcopy(candidate["stations"]), "operatingParams": copy.deepcopy(candidate["operatingParams"]),
        }
        scenario["operatingParams"]["demandUnitsPerPeriod"] = 24
        scenario["operatingParams"]["demandPeriodDays"] = 3
        candidate["scenarios"].append(scenario)
        self.load(candidate)
        dialog = self.open_params()
        dialog.get_by_label("Customer Demand (Units)", exact=True).fill("999")
        self.page.keyboard.press("Escape")
        self.page.get_by_role("button", name="What-If Scenarios", exact=True).click()
        self.page.get_by_role("row").filter(has_text="Distinct operating plan").get_by_role("button", name="Activate", exact=True).click()
        dialog = self.open_params()
        expect(dialog.get_by_label("Customer Demand (Units)", exact=True)).to_have_value("24")
        expect(dialog.get_by_label("Demand Period (Days)", exact=True)).to_have_value("3")
        self.assertEqual(self.active_project()["activeScenarioId"], "scenario-distinct-demand")

    def test_chart_bars_segments_takt_and_baseline_match_real_geometry(self):
        candidate = project_fixture()
        candidate["tasks"][1]["duration"] = 90
        # Two segments in station 1 also verify stacking has no padding/min-height inflation.
        extra = copy.deepcopy(candidate["tasks"][0])
        extra.update({"id": "t3", "code": "OP-030", "name": "Small required step", "duration": 5, "category": "NVA"})
        candidate["tasks"].append(extra)
        self.load(candidate)
        plot = self.page.get_by_test_id("yamazumi-plot")
        plot_box = plot.bounding_box()
        max_seconds = float(plot.get_attribute("data-max-seconds"))
        self.assertAlmostEqual(plot_box["height"], 360, delta=0.1)
        baseline = plot_box["y"] + plot_box["height"]
        takt = self.page.get_by_test_id("yamazumi-takt-line")
        takt_box = takt.bounding_box()
        expected_takt_top = baseline - 60 / max_seconds * plot_box["height"]
        self.assertAlmostEqual(takt_box["y"], expected_takt_top, delta=0.1)
        for bar in self.page.get_by_test_id("yamazumi-bar").all():
            box = bar.bounding_box()
            seconds = float(bar.get_attribute("data-seconds"))
            self.assertAlmostEqual(box["height"], seconds / max_seconds * plot_box["height"], delta=0.1)
            self.assertAlmostEqual(box["y"] + box["height"], baseline, delta=0.1)
            segments = bar.get_by_role("button").all()
            self.assertAlmostEqual(sum(segment.bounding_box()["height"] for segment in segments), box["height"], delta=0.1)
            if seconds < 60:
                self.assertGreater(box["y"], takt_box["y"], "A below-takt bar renders above the takt line.")
            else:
                self.assertLess(box["y"], takt_box["y"], "An over-takt bar renders below the takt line.")
        self.page.get_by_role("button", name="% Takt", exact=True).click()
        self.page.get_by_role("button", name="By Lean Category", exact=True).click()
        for bar in self.page.get_by_test_id("yamazumi-bar").all():
            box = bar.bounding_box()
            self.assertAlmostEqual(box["y"] + box["height"], baseline, delta=0.1)
            self.assertAlmostEqual(sum(child.bounding_box()["height"] for child in bar.locator(":scope > div").all()), box["height"], delta=0.1)

    def test_corrupt_saved_payload_is_preserved_until_explicit_recovery(self):
        corrupt = '{"userData": "retain exactly", "tasks": ['
        self.load(raw=corrupt)
        expect(self.page.get_by_test_id("workspace-error")).to_contain_text("original data is preserved")
        self.assertEqual(self.raw_active(), corrupt)
        self.page.get_by_role("button", name="Add Workstation", exact=True).click()
        expect(self.page.get_by_test_id("workspace-error")).to_contain_text("needs recovery")
        self.assertEqual(self.raw_active(), corrupt)
        self.page.get_by_role("button", name="Start recovery workspace", exact=True).click()
        expect(self.page.get_by_test_id("save-status")).to_contain_text("Recovered workspace")
        protected = self.page.evaluate("key => JSON.parse(localStorage.getItem(key))", RECOVERY_KEY)
        self.assertEqual(protected["activeProjectRaw"], corrupt)
        self.assertIsInstance(self.active_project()["tasks"], list)
        expect(self.page.get_by_role("button", name="Download original recovery data", exact=True)).to_be_visible()


if __name__ == "__main__":
    unittest.main(verbosity=2)
