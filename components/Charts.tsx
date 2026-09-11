"use client";

import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export const PALETTE = ["#4B2882", "#6B3FA0", "#C0297A", "#00C48C", "#FF6B35", "#E63946", "#CC7A00", "#9A90A8"];

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-v/10 bg-white p-5">
      <div className="mb-4 text-[13px] font-semibold text-nb">{title}</div>
      <div className="relative h-[220px]">{children}</div>
    </div>
  );
}

export function DoughnutChart({ labels, data }: { labels: string[]; data: number[] }) {
  return (
    <Doughnut
      data={{
        labels,
        datasets: [{ data, backgroundColor: PALETTE, borderWidth: 0 }],
      }}
      options={{
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
      }}
    />
  );
}

export function BarChart({
  labels,
  data,
  color = "#4B2882",
}: {
  labels: string[];
  data: number[];
  color?: string;
}) {
  return (
    <Bar
      data={{
        labels,
        datasets: [{ data, backgroundColor: color, borderRadius: 4, maxBarThickness: 34 }],
      }}
      options={{
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { grid: { color: "#EEECF5" }, ticks: { font: { size: 10 } } },
        },
      }}
    />
  );
}
