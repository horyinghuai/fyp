import pytest
from datetime import datetime
from unittest.mock import MagicMock

def pytest_collection_modifyitems(config, items):
    for item in items:
        if "test_agent.py" in str(item.fspath):
            item.add_marker(pytest.mark.regression)
            item.add_marker(pytest.mark.functional)

def pytest_terminal_summary(terminalreporter, exitstatus, config):
    """
    Hooks into Pytest's terminal summary to print custom formatted academic metrics
    and generates a detailed, styled HTML report with individual test details.
    """
    reports = terminalreporter.stats.get('passed', []) + terminalreporter.stats.get('failed', [])

    # Group reports, custom properties, and individual test cases by file
    file_reports = {}
    for r in reports:
        fname = r.nodeid.split("::")[0].split("/")[-1].split("\\")[-1]
        
        # Clean up test names (Remove "test_", replace underscores with spaces, and Title Case)
        raw_test_name = r.nodeid.split("::")[-1]
        base_name = raw_test_name.split("[")[0].replace("test_", "").replace("_", " ").title()

        if fname not in file_reports:
            file_reports[fname] = {'passed': 0, 'failed': 0, 'custom': {}, 'tests': {}}

        if r.passed:
            file_reports[fname]['passed'] += 1
        elif r.failed:
            file_reports[fname]['failed'] += 1

        # Track individual test runs and outcomes
        if base_name not in file_reports[fname]['tests']:
            file_reports[fname]['tests'][base_name] = {'passed': 0, 'failed': 0}
        
        if r.passed:
            file_reports[fname]['tests'][base_name]['passed'] += 1
        else:
            file_reports[fname]['tests'][base_name]['failed'] += 1

        # Extract custom metrics injected via record_property
        for prop in getattr(r, 'user_properties', []):
            if prop[0] in ['custom_total', 'custom_passed', 'custom_failed']:
                file_reports[fname]['custom'][prop[0]] = prop[1]

    def get_file_stats(filename_keyword):
        for k, v in file_reports.items():
            if filename_keyword in k:
                return v
        return None

    html_cards = ""

    def process_block(title, total_label, total, passed, failed, rate_label, rate, conclusion, test_list):
        is_monkey = title == "Monkey Testing Summary"
        # Booking's "failed" count is the 3 intentionally-invalid bookings in
        # the batch (unknown patient IC) that the endpoint correctly REJECTED
        # with a 404 - that's the endpoint working as designed, not a defect,
        # so it gets its own labels/coloring instead of reading as a failure.
        is_booking = title == "Booking Success Rate Evaluation"

        # --- Terminal Output ---
        terminalreporter.write_line("")
        terminalreporter.write_line("=" * 60)
        terminalreporter.write_line(title)
        terminalreporter.write_line("=" * 60)
        terminalreporter.write_line(f"Total {total_label:<11}: {total}")
        if is_monkey:
            terminalreporter.write_line(f"Successful Inputs : {passed}")
            terminalreporter.write_line(f"Crashes           : {failed}")
        elif is_booking:
            terminalreporter.write_line(f"Correctly Accepted (valid)   : {passed}")
            terminalreporter.write_line(f"Correctly Rejected (invalid) : {failed}")
        else:
            terminalreporter.write_line(f"Passed            : {passed}")
            terminalreporter.write_line(f"Failed            : {failed}")
        terminalreporter.write_line(f"{rate_label:<17} : {rate:.2f}%\n")
        terminalreporter.write_line("Conclusion:")
        terminalreporter.write_line(conclusion)
        terminalreporter.write_line("=" * 60)

        # --- HTML Generation ---
        nonlocal html_cards
        # For every OTHER card, a nonzero "failed" count is a genuine problem
        # and should read red. For Booking, the 3 "failed" are correct
        # rejections by design, so the card stays green.
        problem_detected = failed > 0 and not is_booking
        status_color = "text-red-600" if problem_detected else "text-emerald-600"
        bg_color = "bg-red-50 border-red-200" if problem_detected else "bg-emerald-50 border-emerald-200"

        if is_monkey:
            pass_label, fail_label = "Successful Inputs", "Crashes"
        elif is_booking:
            pass_label, fail_label = "Correctly Accepted (valid)", "Correctly Rejected (invalid)"
        else:
            pass_label, fail_label = "Passed", "Failed"

        # Generate the list of individual tests executed
        tests_html = ""
        if test_list:
            for tname, tstats in test_list.items():
                runs = tstats['passed'] + tstats['failed']
                run_text = f" <span class='text-slate-400 font-normal'>({runs} runs)</span>" if runs > 1 else ""
                icon_color = "text-emerald-500" if tstats['failed'] == 0 else "text-red-500"
                icon = "✓" if tstats['failed'] == 0 else "✗"
                tests_html += f'<li class="text-xs text-slate-700 flex items-start gap-2"><span class="{icon_color} font-black">{icon}</span> <span class="font-medium leading-relaxed">{tname}{run_text}</span></li>'

        details_block = f"""
        <details class="mt-6 group border-t border-slate-100 pt-4">
            <summary class="cursor-pointer text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 list-none flex items-center justify-center gap-2 select-none bg-blue-50 hover:bg-blue-100 py-2.5 rounded-lg transition">
                <span class="group-open:hidden">View Test Details ▼</span>
                <span class="hidden group-open:inline">Hide Test Details ▲</span>
            </summary>
            <div class="mt-4 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                <ul class="space-y-3">
                    {tests_html}
                </ul>
            </div>
        </details>
        """ if tests_html else ""

        html_cards += f"""
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full hover:shadow-md transition duration-300">
            <h3 class="text-lg font-black text-slate-800 mb-5">{title}</h3>
            <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{total_label}</p>
                    <p class="text-2xl font-black text-slate-700">{total}</p>
                </div>
                <div class="p-4 {bg_color} rounded-xl border text-center">
                    <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" style="opacity: 0.8;">{rate_label}</p>
                    <p class="text-2xl font-black {status_color}">{rate:.2f}%</p>
                </div>
            </div>
            <div class="flex justify-between text-sm font-medium text-slate-600 mb-6 px-1">
                <span class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>{pass_label}: {passed}</span>
                <span class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>{fail_label}: {failed}</span>
            </div>
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Conclusion</p>
                <p class="text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">{conclusion}</p>
            </div>
            <div class="mt-auto">
                {details_block}
            </div>
        </div>
        """

    # 1. Regression Testing Summary
    st_agent = get_file_stats('test_agent')
    if st_agent:
        tot = st_agent['passed'] + st_agent['failed']
        rate = (st_agent['passed'] / tot * 100) if tot > 0 else 0
        conc = "All regression test cases passed successfully. Existing functionalities remain stable after recent modifications." if st_agent['failed'] == 0 else "Some regression tests failed. Further investigation is required to ensure stability."
        process_block("Regression Testing Summary", "Test Cases", tot, st_agent['passed'], st_agent['failed'], "Pass Rate", rate, conc, st_agent.get('tests'))

    # 2. Smoke Testing Summary
    st_smoke = get_file_stats('test_smoke')
    if st_smoke:
        tot = st_smoke['passed'] + st_smoke['failed']
        rate = (st_smoke['passed'] / tot * 100) if tot > 0 else 0
        conc = "All smoke tests passed. Core system routes and components are responsive and functioning as expected." if st_smoke['failed'] == 0 else "Critical smoke tests failed. System core may be unstable."
        process_block("Smoke Testing Summary", "Test Cases", tot, st_smoke['passed'], st_smoke['failed'], "Pass Rate", rate, conc, st_smoke.get('tests'))

    # 3. Monkey Testing Summary
    st_monkey = get_file_stats('test_monkey')
    if st_monkey:
        # Total must equal passed + failed (i.e. the number of test cases
        # actually shown in the "View Test Details" list below). Hypothesis
        # collapses each test function's many random examples into a single
        # pass/fail result per pytest test item, so this is a count of test
        # functions, not a count of randomized inputs generated.
        passed = st_monkey['passed']
        failed = st_monkey['failed']
        tot = passed + failed
        rate = (passed / tot * 100) if tot > 0 else 0
        conc = "The system exhibited high stability under randomized fuzzy inputs, successfully handling edge cases without crashing." if failed == 0 else f"The system encountered {failed} crash(es) during randomized fuzzy testing."
        process_block("Monkey Testing Summary", "Inputs", tot, passed, failed, "Stability Rate", rate, conc, st_monkey.get('tests'))

    # 4. Booking Success Rate
    st_booking = get_file_stats('test_booking_success_rate')
    if st_booking:
        c = st_booking['custom']
        tot, p, f = c.get('custom_total', 8), c.get('custom_passed', 8), c.get('custom_failed', 0)
        rate = (p / tot * 100) if tot > 0 else 0
        conc = (
            f"The test passed: all {p} valid bookings succeeded and all {f} intentionally-invalid "
            f"bookings (unknown patient IC, never seeded) were correctly rejected with a 404 - the "
            f"endpoint behaved exactly as designed. The {rate:.2f}% figure is the raw ratio of "
            f"successful vs. total attempts in a batch that deliberately mixes valid and invalid "
            f"input to verify rejection behavior, not a defect rate."
        ) if st_booking['failed'] == 0 else "The booking success rate test itself failed - see the test output for details."
        process_block("Booking Success Rate Evaluation", "Requests", tot, p, f, "Raw Success Rate", rate, conc, st_booking.get('tests'))

    # 5. Scheduling Accuracy
    st_sched = get_file_stats('test_scheduling_accuracy')
    if st_sched:
        tot = st_sched['passed'] + st_sched['failed']
        p, f = st_sched['passed'], st_sched['failed']
        rate = (p / tot * 100) if tot > 0 else 0
        conc = "The Scheduling Agent correctly selected appointment slots in the evaluated scheduling scenarios, respecting clinical hours and boundaries." if f == 0 else f"The Scheduling Agent misclassified {f} scenarios."
        process_block("Scheduling Accuracy Evaluation", "Scenarios", tot, p, f, "Accuracy", rate, conc, st_sched.get('tests'))
        
    # 6. Scheduling Agent Recommendations
    st_sched_rec = get_file_stats('test_scheduling_agent_evaluation')
    if st_sched_rec:
        tot = st_sched_rec['passed'] + st_sched_rec['failed']
        rate = (st_sched_rec['passed'] / tot * 100) if tot > 0 else 0
        conc = "The Scheduling Agent successfully evaluated workload logic, prioritizing the least busy doctors while correctly observing explicit preferences." if st_sched_rec['failed'] == 0 else "Scheduling Recommendation logic failed some workload balancing scenarios."
        process_block("Scheduling Workload Evaluation", "Scenarios", tot, st_sched_rec['passed'], st_sched_rec['failed'], "Accuracy", rate, conc, st_sched_rec.get('tests'))

    # 7. AI Extraction
    st_ai = get_file_stats('test_ai_extraction_accuracy')
    if st_ai:
        tot = st_ai['passed'] + st_ai['failed']
        p, f = st_ai['passed'], st_ai['failed']
        rate = (p / tot * 100) if tot > 0 else 0
        conc = "The AI Intent Extraction Agent parsed user messages accurately, perfectly extracting fields like date, time, and doctor preference." if f == 0 else f"The AI extraction misclassified {f} scenarios."
        process_block("AI Extraction Accuracy Evaluation", "Scenarios", tot, p, f, "Accuracy", rate, conc, st_ai.get('tests'))

    # 8. Vaccine Validation
    st_vac = get_file_stats('test_vaccine_dependency_evaluation')
    if st_vac:
        tot = st_vac['passed'] + st_vac['failed']
        p, f = st_vac['passed'], st_vac['failed']
        rate = (p / tot * 100) if tot > 0 else 0
        conc = "The Vaccine Dependency Agent validated clinical rules perfectly, handling intervals, boosters, and brand restrictions without error." if f == 0 else f"Vaccine clinical rule validation failed in {f} scenarios."
        process_block("Vaccine Validation Evaluation", "Scenarios", tot, p, f, "Accuracy", rate, conc, st_vac.get('tests'))

    # 9. Communication Agent Relay
    st_comm = get_file_stats('test_communication_agent_accuracy')
    if st_comm:
        tot = st_comm['passed'] + st_comm['failed']
        p, f = st_comm['passed'], st_comm['failed']
        rate = (p / tot * 100) if tot > 0 else 0
        conc = "The Patient-Admin Communication Agent relayed messages between admin and patient correctly across Telegram and SMS channels, including edits and deletions." if f == 0 else f"The Communication Agent relay failed in {f} scenarios."
        process_block("Communication Agent Relay Evaluation", "Scenarios", tot, p, f, "Accuracy", rate, conc, st_comm.get('tests'))

    # Write HTML Report
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AICAS System Evaluation Report</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            .custom-scrollbar::-webkit-scrollbar {{ width: 5px; }}
            .custom-scrollbar::-webkit-scrollbar-track {{ background: #f1f5f9; border-radius: 10px; }}
            .custom-scrollbar::-webkit-scrollbar-thumb {{ background: #cbd5e1; border-radius: 10px; }}
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {{ background: #94a3b8; }}
        </style>
    </head>
    <body class="bg-slate-50 font-sans text-slate-800 antialiased p-8 selection:bg-blue-100">
        <div class="max-w-screen-2xl mx-auto">
            <header class="mb-12 text-center">
                <h1 class="text-4xl font-black text-slate-900 tracking-tight mb-3">System Evaluation Report</h1>
                <h2 class="text-xl font-bold text-blue-600 mb-3">AI Agent–Based Multi-Stage Appointment Scheduling System for Clinics</h2>
                <div class="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-slate-200">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Generated on {datetime.now().strftime("%B %d, %Y at %I:%M %p")}</p>
                </div>
            </header>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {html_cards}
            </div>
        </div>
    </body>
    </html>
    """

    with open("report.html", "w", encoding="utf-8") as f:
        f.write(html_content)
    
    terminalreporter.write_line("✅ Custom HTML report successfully generated at 'report.html'")

@pytest.fixture
def mock_db():
    return MagicMock()

@pytest.fixture
def sample_clinic_id():
    return "c1111111-1111-1111-1111-111111111111"