import { lazy } from 'react';

// Single shared promise — all components resolve from the same chunk
const rechartsPromise = import('recharts');

export const LazyAreaChart = lazy(() => rechartsPromise.then(m => ({ default: m.AreaChart })));
export const LazyArea = lazy(() => rechartsPromise.then(m => ({ default: m.Area })));
export const LazyXAxis = lazy(() => rechartsPromise.then(m => ({ default: m.XAxis })));
export const LazyYAxis = lazy(() => rechartsPromise.then(m => ({ default: m.YAxis })));
export const LazyTooltip = lazy(() => rechartsPromise.then(m => ({ default: m.Tooltip })));
export const LazyResponsiveContainer = lazy(() => rechartsPromise.then(m => ({ default: m.ResponsiveContainer })));
export const LazyBarChart = lazy(() => rechartsPromise.then(m => ({ default: m.BarChart })));
export const LazyBar = lazy(() => rechartsPromise.then(m => ({ default: m.Bar })));
export const LazyRadarChart = lazy(() => rechartsPromise.then(m => ({ default: m.RadarChart })));
export const LazyRadar = lazy(() => rechartsPromise.then(m => ({ default: m.Radar })));
export const LazyPolarGrid = lazy(() => rechartsPromise.then(m => ({ default: m.PolarGrid })));
export const LazyPolarAngleAxis = lazy(() => rechartsPromise.then(m => ({ default: m.PolarAngleAxis })));
export const LazyPieChart = lazy(() => rechartsPromise.then(m => ({ default: m.PieChart })));
export const LazyPie = lazy(() => rechartsPromise.then(m => ({ default: m.Pie })));
export const LazyCell = lazy(() => rechartsPromise.then(m => ({ default: m.Cell })));
