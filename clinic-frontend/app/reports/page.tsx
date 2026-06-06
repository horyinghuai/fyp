"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Droplet,
  Loader2,
  RefreshCcw,
  Sparkles,
  Stethoscope,
  Syringe,
  Users,
  LineChart,
  PieChart,
} from "lucide-react";

type RawAppointment = {
  id: string;
  appt_id?: string;
  title?: string;
  patient_name?: string;
  start: string;
  end: string;
  patient_ic?: string;
  doctor?: string;
  doctor_ic?: string;
  type?: string;
  service?: string;
  items?: string[];
  dose?: string;
  total_doses?: number;
  reason?: string;
  status?: string;
  color?: string;
  cancel_reason?: string;
};

type Patient = {
  gender?: string | null;
  nationality?: string | null;
};

type Doctor = {
  ic_passport_number: string;
  name: string;
  specialization?: string | null;
  gender?: string | null;
  schedules?: any[];
};

type VaccineStock = {
  id: number;
  name: string;
  type?: string;
  stock_quantity: number;
  low_stock_threshold: number;
  price?: number;
  is_low_stock?: boolean;
};

type BloodTest = {
  id: number;
  name: string;
  test_type?: string;
  price?: number;
};

type AgentLog = {
  id?: number;
  action?: string;
  reasoning?: string;
  timestamp?: string;
};

type ChartItem = {
  label: string;
  value: number;
  color: string;
  note?: string;
};

const API = "http://127.0.0.1:8000";

const COLORS = {
  blue: "#2563EB",
  purple: "#8B5CF6",
  red: "#EF4444",
  green: "#10B981",
  amber: "#F59E0B",
  slate: "#64748B",
  indigo: "#4F46E5",
  cyan: "#06B6D4",
  pink: "#EC4899",
  orange: "#F97316",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const capitalize = (str: string) =>
  str
    ? str
        .split(" ")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
        .join(" ")
    : "";

const normalizeStatus = (status?: string) => {
  const s = (status || "scheduled").toLowerCase().trim();
  if (s === "cancelled") return "canceled";
  if (s === "no_show" || s === "no show") return "no-show";
  return s;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatNumber = (n: number) => new Intl.NumberFormat().format(n);
const percent = (n: number) => `${n.toFixed(1)}%`;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function MetricCard({
  title,
  value,
  icon,
  note,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  note?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 text-slate-700">{icon}</div>
      </div>
    </motion.div>
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {icon ? <span className="text-slate-600">{icon}</span> : null}
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
          </div>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </motion.section>
  );
}

function HorizontalBarChart({
  data,
  suffix = "",
  barColor = COLORS.blue,
}: {
  data: ChartItem[];
  suffix?: string;
  barColor?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  if (!data.length) {
    return <div className="text-sm text-slate-500">No data available.</div>;
  }

  return (
    <div className="space-y-4">
      {data.map((item) => {
        const width = Math.max((item.value / max) * 100, item.value > 0 ? 8 : 0);
        const isLow = item.note?.toLowerCase().includes("low stock");
        return (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700">{item.label}</span>
              <span className={`font-semibold ${isLow ? "text-red-600" : "text-slate-900"}`}>
                {formatNumber(item.value)}
                {suffix}
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-100">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="h-3 rounded-full"
                style={{ backgroundColor: item.color || barColor }}
              />
            </div>
            {item.note ? <p className="mt-1 text-xs text-slate-500">{item.note}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({
  data,
  centerLabel,
}: {
  data: ChartItem[];
  centerLabel: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (!data.length || total === 0) {
    return <div className="text-sm text-slate-500">No data available.</div>;
  }

  let cumulative = 0;
  const gradient = data
    .map((item) => {
      const start = cumulative;
      const size = (item.value / total) * 100;
      cumulative += size;
      return `${item.color} ${start}% ${cumulative}%`;
    })
    .join(", ");

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-56 w-56">
        <div
          className="h-56 w-56 rounded-full"
          style={{ background: `conic-gradient(${gradient})` }}
        />
        <div className="absolute inset-0 m-auto flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white shadow-inner">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total
          </span>
          <span className="text-2xl font-bold text-slate-900">{formatNumber(total)}</span>
          <span className="text-xs text-slate-500">{centerLabel}</span>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="flex-1 text-sm text-slate-700">{item.label}</span>
            <span className="text-sm font-semibold text-slate-900">{formatNumber(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChartBox({
  data,
  labels,
  stroke = COLORS.blue,
}: {
  data: number[];
  labels: string[];
  stroke?: string;
}) {
  const max = Math.max(...data, 1);
  const width = 100;
  const height = 100;

  if (!data.length) {
    return <div className="text-sm text-slate-500">No data available.</div>;
  }

  const points = data
    .map((value, index) => {
      const x = data.length === 1 ? 0 : (index / (data.length - 1)) * width;
      const y = height - (value / max) * 85 - 5;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div>
      <svg viewBox="0 0 100 100" className="h-72 w-full overflow-visible">
        {[0, 25, 50, 75, 100].map((tick) => (
          <line
            key={tick}
            x1="0"
            x2="100"
            y1={100 - tick}
            y2={100 - tick}
            stroke="#E2E8F0"
            strokeDasharray="2 2"
          />
        ))}

        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          points={points}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {data.map((value, index) => {
          const x = data.length === 1 ? 0 : (index / (data.length - 1)) * width;
          const y = height - (value / max) * 85 - 5;
          return (
            <g key={`${labels[index]}-${index}`}>
              <circle cx={x} cy={y} r="2.4" fill={stroke} />
              <text x={x} y={y - 3} textAnchor="middle" fontSize="4" fill="#334155">
                {value}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 grid grid-cols-6 gap-2 text-center text-[11px] text-slate-500 sm:grid-cols-12">
        {labels.map((label) => (
          <div key={label} className="truncate">
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const router = useRouter();

  const [clinicId, setClinicId] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [appointmentsRaw, setAppointmentsRaw] = useState<RawAppointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [vaccines, setVaccines] = useState<VaccineStock[]>([]);
  const [bloodTests, setBloodTests] = useState<BloodTest[]>([]);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);

  useEffect(() => {
    const userStr = localStorage.getItem("aicas_user");
    if (!userStr) {
      router.push("/login");
      return;
    }

    try {
      const user = JSON.parse(userStr);
      if (user?.clinic_id) {
        setClinicId(user.clinic_id);
      } else {
        setErrorMsg("No clinic assigned to this session.");
        setLoading(false);
      }
    } catch {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!clinicId) return;

    const load = async () => {
      setLoading(true);
      setErrorMsg("");

      const [
        apptRes,
        patientRes,
        doctorRes,
        vaccineRes,
        packageRes,
        singleRes,
        logRes,
      ] = await Promise.all([
        fetchJson<RawAppointment[]>(`${API}/admin/appointments/${clinicId}`),
        fetchJson<Patient[]>(`${API}/admin/patients/${clinicId}`),
        fetchJson<Doctor[]>(`${API}/admin/doctors-all/${clinicId}`),
        fetchJson<VaccineStock[]>(`${API}/vaccines/${clinicId}`),
        fetchJson<BloodTest[]>(`${API}/blood-tests/${clinicId}/package`),
        fetchJson<BloodTest[]>(`${API}/blood-tests/${clinicId}/single`),
        fetchJson<AgentLog[]>(`${API}/admin/agent-logs/${clinicId}`), // safe fallback if route is not exposed yet
      ]);

      if (!apptRes) {
        setErrorMsg("Failed to load appointments from backend.");
        setLoading(false);
        return;
      }

      setAppointmentsRaw(Array.isArray(apptRes) ? apptRes : []);
      setPatients(Array.isArray(patientRes) ? patientRes : []);
      setDoctors(Array.isArray(doctorRes) ? doctorRes : []);
      setVaccines(Array.isArray(vaccineRes) ? vaccineRes : []);
      const mergedTests = [
        ...(Array.isArray(packageRes) ? packageRes : []),
        ...(Array.isArray(singleRes) ? singleRes : []),
      ];
      setBloodTests(mergedTests);
      setAgentLogs(Array.isArray(logRes) ? logRes : []);

      setLoading(false);
    };

    load().catch(() => {
      setErrorMsg("Failed to connect to backend.");
      setLoading(false);
    });
  }, [clinicId]);

  const appointmentGroups = useMemo(() => {
    const map = new Map<string, any>();

    for (const row of appointmentsRaw) {
      const key = row.appt_id || row.id;
      const start = new Date(row.start);
      const end = new Date(row.end);
      if (Number.isNaN(start.getTime())) continue;

      const normalizedStatus = normalizeStatus(row.status);
      const normalizedItems = Array.isArray(row.items)
        ? row.items.filter(Boolean).map((i) => String(i))
        : [];

      if (!map.has(key)) {
        map.set(key, {
          ...row,
          items: [...new Set(normalizedItems)],
          firstStart: start,
          latestStart: start,
          end,
          latestStatus: normalizedStatus,
          stages: [{ start, end, status: normalizedStatus }],
        });
      } else {
        const current = map.get(key);
        current.items = [...new Set([...(current.items || []), ...normalizedItems])];
        current.stages.push({ start, end, status: normalizedStatus });

        if (start.getTime() < current.firstStart.getTime()) {
          current.firstStart = start;
        }
        if (start.getTime() > current.latestStart.getTime()) {
          current.latestStart = start;
          current.latestStatus = normalizedStatus;
        }
        if (end.getTime() > new Date(current.end).getTime()) {
          current.end = end;
        }
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => a.firstStart.getTime() - b.firstStart.getTime()
    );
  }, [appointmentsRaw]);

  const report = useMemo(() => {
    const now = new Date();
    const thisYear = now.getFullYear();

    const totalAppointments = appointmentGroups.length;
    const totalVaccineAppointments = appointmentGroups.filter((a) => a.service === "Vaccine").length;
    const totalBloodTestAppointments = appointmentGroups.filter(
      (a) => a.service === "Blood Test"
    ).length;

    const completionCount = appointmentGroups.filter((a) => a.latestStatus === "completed").length;
    const cancellationCount = appointmentGroups.filter((a) =>
      ["canceled", "no-show"].includes(a.latestStatus)
    ).length;

    const todayAppointments = appointmentGroups.filter((a) =>
      a.stages.some((stage: any) => sameDay(stage.start, now))
    ).length;

    const completionRate = totalAppointments ? (completionCount / totalAppointments) * 100 : 0;
    const cancellationRate = totalAppointments ? (cancellationCount / totalAppointments) * 100 : 0;

    const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
      const count = appointmentGroups.filter(
        (a) => a.firstStart.getFullYear() === thisYear && a.firstStart.getMonth() === i
      ).length;
      return { label: MONTHS[i], value: count };
    });

    const serviceCounts = {
      Vaccine: appointmentGroups.filter((a) => a.service === "Vaccine").length,
      "Blood Test": appointmentGroups.filter((a) => a.service === "Blood Test").length,
      Consultation: appointmentGroups.filter((a) => a.service !== "Vaccine" && a.service !== "Blood Test").length,
    };

    const typeDistribution: ChartItem[] = [
      { label: "Vaccine", value: serviceCounts.Vaccine, color: COLORS.purple },
      { label: "Blood Test", value: serviceCounts["Blood Test"], color: COLORS.red },
      { label: "Consultation", value: serviceCounts.Consultation, color: COLORS.blue },
    ];

    const statusDistribution: ChartItem[] = [
      {
        label: "Scheduled",
        value: appointmentGroups.filter((a) => a.latestStatus === "scheduled").length,
        color: COLORS.amber,
      },
      {
        label: "Completed",
        value: appointmentGroups.filter((a) => a.latestStatus === "completed").length,
        color: COLORS.green,
      },
      {
        label: "Cancelled",
        value: appointmentGroups.filter((a) => ["canceled", "no-show"].includes(a.latestStatus)).length,
        color: COLORS.red,
      },
    ];

    const vaccineCounts = new Map<string, number>();
    appointmentGroups
      .filter((a) => a.service === "Vaccine")
      .forEach((a) => {
        const uniqueItems = [...new Set((a.items || []).filter(Boolean))] as string[];
        uniqueItems.forEach((item) => {
          vaccineCounts.set(item, (vaccineCounts.get(item) || 0) + 1);
        });
      });

    const topVaccines: ChartItem[] = [...vaccineCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({
        label,
        value,
        color: COLORS.purple,
      }));

    const bloodTestCounts = new Map<string, number>();
    appointmentGroups
      .filter((a) => a.service === "Blood Test")
      .forEach((a) => {
        const uniqueItems = [...new Set((a.items || []).filter(Boolean))] as string[];
        uniqueItems.forEach((item) => {
          bloodTestCounts.set(item, (bloodTestCounts.get(item) || 0) + 1);
        });
      });

    const topBloodTests: ChartItem[] = [...bloodTestCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({
        label,
        value,
        color: COLORS.red,
      }));

    const genderCounts = {
      Male: patients.filter((p) => (p.gender || "").toUpperCase() === "MALE").length,
      Female: patients.filter((p) => (p.gender || "").toUpperCase() === "FEMALE").length,
    };

    const nationalityCounts = {
      Malaysian: patients.filter((p) => (p.nationality || "").toUpperCase() === "MALAYSIA").length,
      Foreigners: patients.filter((p) => (p.nationality || "").toUpperCase() !== "MALAYSIA").length,
    };

    const doctorCounts = new Map<string, number>();
    appointmentGroups.forEach((a) => {
      const name = a.doctor || "Unassigned";
      doctorCounts.set(name, (doctorCounts.get(name) || 0) + 1);
    });

    const doctorWorkload: ChartItem[] = [...doctorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], idx) => ({
        label,
        value,
        color: [COLORS.blue, COLORS.purple, COLORS.cyan, COLORS.orange, COLORS.indigo][idx % 5],
      }));

    const weekdayCounts = Array.from({ length: 7 }, () => 0);
    appointmentGroups.forEach((a) => {
      const day = a.firstStart.getDay(); // 0 Sun ... 6 Sat
      const normalized = day === 0 ? 6 : day - 1; // Mon = 0 ... Sun = 6
      weekdayCounts[normalized] += 1;
    });

    const vaccineStock: ChartItem[] = vaccines
      .map((v) => ({
        label: v.name,
        value: Number(v.stock_quantity || 0),
        color:
          Number(v.stock_quantity || 0) <= Number(v.low_stock_threshold || 0)
            ? COLORS.red
            : COLORS.blue,
        note:
          Number(v.stock_quantity || 0) <= Number(v.low_stock_threshold || 0)
            ? "Low stock"
            : `Threshold: ${v.low_stock_threshold}`,
      }))
      .sort((a, b) => b.value - a.value);

    const agentActions = new Map<string, number>();
    agentLogs.forEach((log) => {
      const action = log.action || "Unknown";
      agentActions.set(action, (agentActions.get(action) || 0) + 1);
    });

    const agentActionChart: ChartItem[] = [...agentActions.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], idx) => ({
        label,
        value,
        color: [COLORS.purple, COLORS.cyan, COLORS.orange, COLORS.blue, COLORS.green][idx % 5],
      }));

    return {
      totalAppointments,
      totalVaccineAppointments,
      totalBloodTestAppointments,
      totalPatients: patients.length,
      totalDoctors: doctors.length,
      totalVaccines: vaccines.length,
      totalBloodTests: bloodTests.length,
      completionRate,
      cancellationRate,
      todayAppointments,
      monthlyTrend,
      typeDistribution,
      statusDistribution,
      topVaccines,
      topBloodTests,
      genderCounts,
      nationalityCounts,
      doctorWorkload,
      weekdayCounts,
      vaccineStock,
      agentActionChart,
    };
  }, [appointmentGroups, patients, doctors, vaccines, bloodTests, agentLogs]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm font-medium text-slate-600">Loading reports...</span>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="p-6">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <h1 className="text-lg font-bold">Reports Page Error</h1>
              <p className="mt-1 text-sm">{errorMsg}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/10 p-3">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold md:text-3xl">Reports Dashboard</h1>
                  <p className="mt-1 text-sm text-slate-300">
                    KPI cards, charts, stock monitoring, and AI agent activity overview.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="Total Appointments"
            value={formatNumber(report.totalAppointments)}
            icon={<ClipboardList className="h-5 w-5" />}
            note="Distinct bookings"
          />
          <MetricCard
            title="Total Vaccine Appointments"
            value={formatNumber(report.totalVaccineAppointments)}
            icon={<Syringe className="h-5 w-5" />}
            note="Vaccine bookings"
          />
          <MetricCard
            title="Total Blood Test Appointments"
            value={formatNumber(report.totalBloodTestAppointments)}
            icon={<Droplet className="h-5 w-5" />}
            note="Blood test bookings"
          />
          <MetricCard
            title="Total Patients"
            value={formatNumber(report.totalPatients)}
            icon={<Users className="h-5 w-5" />}
            note="Registered patients"
          />
          <MetricCard
            title="Total Doctors"
            value={formatNumber(report.totalDoctors)}
            icon={<Stethoscope className="h-5 w-5" />}
            note="Assigned doctors"
          />
          <MetricCard
            title="Total Vaccines Available"
            value={formatNumber(report.totalVaccines)}
            icon={<Syringe className="h-5 w-5" />}
            note="Clinic vaccine list"
          />
          <MetricCard
            title="Total Blood Tests Available"
            value={formatNumber(report.totalBloodTests)}
            icon={<Droplet className="h-5 w-5" />}
            note="Clinic test list"
          />
          <MetricCard
            title="Completion Rate"
            value={percent(report.completionRate)}
            icon={<Activity className="h-5 w-5" />}
            note="Based on latest stage status"
          />
          <MetricCard
            title="Cancellation Rate"
            value={percent(report.cancellationRate)}
            icon={<AlertTriangle className="h-5 w-5" />}
            note="Canceled + no-show"
          />
          <MetricCard
            title="Today's Appointments"
            value={formatNumber(report.todayAppointments)}
            icon={<CalendarDays className="h-5 w-5" />}
            note="Appointments with a stage today"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Monthly Appointment Trend"
            subtitle="Jan–Dec counts for the current year."
            icon={<LineChart className="h-5 w-5" />}
          >
            <LineChartBox data={report.monthlyTrend.map((m) => m.value)} labels={MONTHS} stroke={COLORS.blue} />
          </SectionCard>

          <SectionCard
            title="Appointment Type Distribution"
            subtitle="Vaccine vs Blood Test vs Consultation."
            icon={<PieChart className="h-5 w-5" />}
          >
            <DonutChart data={report.typeDistribution} centerLabel="appointment types" />
          </SectionCard>

          <SectionCard
            title="Appointment Status Distribution"
            subtitle="Scheduled, completed, and cancelled."
            icon={<Activity className="h-5 w-5" />}
          >
            <DonutChart data={report.statusDistribution} centerLabel="appointment status" />
          </SectionCard>

          <SectionCard
            title="Top 10 Most Popular Vaccines"
            subtitle="Based on booking count."
            icon={<Syringe className="h-5 w-5" />}
          >
            <HorizontalBarChart data={report.topVaccines} barColor={COLORS.purple} />
          </SectionCard>

          <SectionCard
            title="Top 10 Most Popular Blood Tests"
            subtitle="Based on booking count."
            icon={<Droplet className="h-5 w-5" />}
          >
            <HorizontalBarChart data={report.topBloodTests} barColor={COLORS.red} />
          </SectionCard>

          <SectionCard
            title="Patient Gender Distribution"
            subtitle="Male vs Female."
            icon={<Users className="h-5 w-5" />}
          >
            <DonutChart
              data={[
                { label: "Male", value: report.genderCounts.Male, color: COLORS.blue },
                { label: "Female", value: report.genderCounts.Female, color: COLORS.pink },
              ]}
              centerLabel="patients"
            />
          </SectionCard>

          <SectionCard
            title="Nationality Distribution"
            subtitle="Malaysian vs Foreigners."
            icon={<Users className="h-5 w-5" />}
          >
            <DonutChart
              data={[
                { label: "Malaysian", value: report.nationalityCounts.Malaysian, color: COLORS.green },
                { label: "Foreigners", value: report.nationalityCounts.Foreigners, color: COLORS.orange },
              ]}
              centerLabel="patients"
            />
          </SectionCard>

          <SectionCard
            title="Doctor Workload Analysis"
            subtitle="Number of appointments per doctor."
            icon={<Stethoscope className="h-5 w-5" />}
          >
            <HorizontalBarChart data={report.doctorWorkload} barColor={COLORS.cyan} />
          </SectionCard>

          <SectionCard
            title="Appointment Booking by Day of Week"
            subtitle="Monday to Sunday."
            icon={<CalendarDays className="h-5 w-5" />}
          >
            <HorizontalBarChart
              data={WEEKDAYS.map((day, index) => ({
                label: day,
                value: report.weekdayCounts[index],
                color: [COLORS.blue, COLORS.purple, COLORS.cyan, COLORS.orange, COLORS.green, COLORS.red, COLORS.slate][index],
              }))}
              barColor={COLORS.blue}
            />
          </SectionCard>

          <SectionCard
            title="Vaccine Stock Monitoring"
            subtitle="Current stock quantity and low-stock highlighting."
            icon={<AlertTriangle className="h-5 w-5" />}
            className="xl:col-span-2"
          >
            <HorizontalBarChart data={report.vaccineStock} />
          </SectionCard>

          <SectionCard
            title="AI Agent Activity Report"
            subtitle="From Agent_Logs table."
            icon={<Sparkles className="h-5 w-5" />}
            className="xl:col-span-2"
          >
            {report.agentActionChart.length > 0 ? (
              <HorizontalBarChart data={report.agentActionChart} barColor={COLORS.indigo} />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                No agent log data returned yet. If you expose an agent logs endpoint, this section will show
                actions like time rejection, intent extraction, load balancing, and rescheduling.
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}