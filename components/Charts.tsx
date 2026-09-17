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

// Ordre imposé par la charte graphique v6.3 (section 3.9) pour les six
// premiers rangs — violet, bleu, lagon, corail, lavande, or, dans cet
// ordre, sans en sauter. Les deux teintes suivantes ne sont pas couvertes
// par la charte (elle recommande de regrouper au-delà de 6 séries sous
// « Autres ») ; elles restent ici en dépannage pour les graphiques à plus
// de 6 catégories, dans des tons neutres proches de la palette.
export const PALETTE = [
  "#6759A2",
  "#1668A8",
  "#0B7D7B",
  "#C24A2E",
  "#A99FD0",
  "#8A6D24",
  "#2C7FC0",
  "#4A4660",
];

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
  color = "#6759A2",
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
          y: { grid: { color: "#EDEAF6" }, ticks: { font: { size: 10 } } },
        },
      }}
    />
  );
}
