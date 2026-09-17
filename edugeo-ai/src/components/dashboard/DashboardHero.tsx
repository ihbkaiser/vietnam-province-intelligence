"use client";

import type { ReactNode } from "react";

type HeroTheme = "morning" | "afternoon" | "evening";

const STARS = [
  { left: "8%", top: "18%", size: 6, delay: "0s" },
  { left: "16%", top: "9%", size: 4, delay: "-1.2s" },
  { left: "24%", top: "26%", size: 5, delay: "-2.4s" },
  { left: "34%", top: "12%", size: 3, delay: "-0.6s" },
  { left: "44%", top: "22%", size: 6, delay: "-3s" },
  { left: "55%", top: "8%", size: 4, delay: "-1.8s" },
  { left: "63%", top: "17%", size: 5, delay: "-0.3s" },
  { left: "72%", top: "6%", size: 3, delay: "-2.1s" },
  { left: "81%", top: "24%", size: 6, delay: "-1.5s" },
  { left: "90%", top: "14%", size: 4, delay: "-2.7s" },
  { left: "12%", top: "40%", size: 3, delay: "-3.4s" },
  { left: "68%", top: "38%", size: 4, delay: "-1s" }
];

export function DashboardHero({
  theme,
  greeting,
  subtitle,
  flag,
  children
}: {
  theme: HeroTheme;
  greeting: string;
  subtitle: string;
  flag: ReactNode;
  children?: ReactNode;
}) {
  const isNight = theme === "evening";
  return (
    <div className={`dash-hero ${theme}`}>
      <div className="dash-sky" aria-hidden="true">
        {isNight ? (
          <>
            {STARS.map((star, index) => (
              <span
                key={index}
                className="dash-star"
                style={{ left: star.left, top: star.top, width: star.size, height: star.size, animationDelay: star.delay }}
              />
            ))}
            <svg className="dash-moon" viewBox="0 0 64 64" width="58" height="58" aria-hidden="true">
              <path
                d="M41 6c-14 3-24 15-24 28s10 25 24 28c-7-4-12-12-12-21s5-17 12-21V6z"
                fill="#f6efc9"
                opacity="0.95"
              />
            </svg>
          </>
        ) : (
          <span className="dash-sun" aria-hidden="true" />
        )}
        <span className="dash-cloud c1" />
        <span className="dash-cloud c2" />
        <span className="dash-cloud c3" />
        <svg className="dash-hills" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 120 L0 84 L95 52 L150 72 L230 38 L300 66 L370 30 L460 70 L540 40 L640 74 L720 46 L820 78 L910 50 L1000 72 L1100 44 L1200 74 L1200 120 Z" className="hill back" />
          <path d="M0 120 L0 96 L80 70 L160 92 L260 62 L360 92 L470 66 L580 96 L700 74 L800 98 L900 78 L1020 96 L1120 78 L1200 94 L1200 120 Z" className="hill front" />
        </svg>
      </div>
      <div className="dash-hero-body">
        <div className="dash-hero-copy">
          {flag}
          <h1>{greeting}</h1>
          <p>{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
