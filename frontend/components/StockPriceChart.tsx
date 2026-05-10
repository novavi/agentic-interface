"use client";

import { useEffect, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

interface StockPriceChartProps {
  company: string;
  ticker: string;
  data: { month: string; price: number }[];
}

export default function StockPriceChart({ company, ticker, data }: StockPriceChartProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options: Highcharts.Options = {
    chart: {
      height: 350,
      backgroundColor: "#030712",
      style: { fontFamily: "inherit" },
    },
    title: {
      text: `${company} (${ticker})`,
      style: { color: "#f9fafb" },
    },
    xAxis: {
      type: "datetime",
      labels: { style: { color: "#9ca3af" } },
      gridLineColor: "#1f2937",
      lineColor: "#374151",
      tickColor: "#374151",
    },
    yAxis: {
      title: { text: "Price (USD)", style: { color: "#9ca3af" } },
      labels: { style: { color: "#9ca3af" } },
      gridLineColor: "#1f2937",
    },
    series: [
      {
        type: "line",
        name: ticker,
        color: "#3b82f6",
        data: data.map(({ month, price }) => {
          const [y, m] = month.split("-").map(Number);
          return [Date.UTC(y, m - 1, 1), price];
        }),
      },
    ],
    tooltip: {
      backgroundColor: "#111827",
      borderColor: "#374151",
      style: { color: "#f9fafb" },
      valuePrefix: "$",
      valueDecimals: 2,
    },
    legend: {
      itemStyle: { color: "#9ca3af" },
    },
    credits: { enabled: false },
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center text-gray-400 text-sm animate-pulse" style={{ height: 350 }}>
        Loading chart…
      </div>
    );
  }

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
