import { apiFetch } from '../api';
import { useEffect, useState, useCallback, memo } from 'react';
import { LightbulbIcon, TrendingUpIcon, BarChart2Icon, PieChartIcon, RefreshCwIcon, DownloadIcon, SparklesIcon, ArrowUpRightIcon, ArrowDownRightIcon, BrainCircuitIcon, ZapIcon, AlertTriangleIcon, Loader2Icon } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';

const PIE_COLORS = [`#6366f1`, `#06b6d4`, `#8b5cf6`, `#10b981`, `#f59e0b`];

const iconMap: Record<string, typeof TrendingUpIcon> = {
  TrendingUpIcon, AlertTriangleIcon, BrainCircuitIcon, ZapIcon,
};

function Insights() {
  const [kpis, setKpis] = useState<any[]>([]);
  const [charts, setCharts] = useState<any>({});
  const [aiInsights, setAiInsights] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [activeReport, setActiveReport] = useState('performance');
  const [activePieIndex, setActivePieIndex] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/insights/kpis').then(r => r.json()),
      apiFetch('/api/insights/charts').then(r => r.json()),
      apiFetch('/api/insights/ai-insights').then(r => r.json()),
    ]).then(([kpisData, chartsData, insightsData]) => {
      setKpis(kpisData);
      setCharts(chartsData);
      if (Array.isArray(insightsData) && insightsData.length > 0) {
        setAiInsights(insightsData);
      }
    });
  }, []);

  const generateAIInsights = useCallback(async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await apiFetch('/api/insights/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.error) {
        setAiError(data.error);
      } else if (Array.isArray(data)) {
        setAiInsights(data);
      }
    } catch (e: any) {
      setAiError(e.message || 'AI analysis failed');
    } finally {
      setAiLoading(false);
    }
  }, []);

  const reports = [
    { id: 'performance', label: `性能分析` },
    { id: 'usage', label: `使用分析` },
    { id: 'quality', label: `质量评估` },
  ];

  return (
    <div data-cmp="Insights" className="flex flex-col h-full overflow-y-auto overflow-x-hidden scrollbar-thin p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-wiki-text">洞察分析</h1>
          <p className="text-wiki-text2 text-sm mt-1">智能体运行数据与知识质量深度分析</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveReport(r.id)}
                className="px-3 py-2 rounded-md text-xs font-medium transition-all"
                style={{
                  background: activeReport === r.id ? 'var(--wiki-text)' : 'transparent',
                  color: activeReport === r.id ? 'var(--wiki-bg)' : 'var(--wiki-text2)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }}>
            <RefreshCwIcon size={12} />
            <span>刷新</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
            <DownloadIcon size={12} />
            <span>导出报告</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="flex gap-4 mb-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex-1 p-4 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="text-xs text-wiki-text3 mb-2">{kpi.label}</div>
            <div className="text-xl font-bold text-wiki-text mb-1">{kpi.value}</div>
            <div className="flex items-center gap-1 text-xs" style={{ color: kpi.up ? '#10b981' : '#ef4444' }}>
              {kpi.up ? <ArrowUpRightIcon size={12} /> : <ArrowDownRightIcon size={12} />}
              <span>{kpi.change} 环比上月</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="flex gap-4 mb-4">
        {/* Bar Chart - 需求分类 */}
        <div className="flex-1 p-6 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-wiki-text">需求分类分布</h3>
              <p className="text-xs text-wiki-text3 mt-0.5">按业务分类统计</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={charts.barData || []}>
              <XAxis dataKey="name" tick={{ fill: 'var(--wiki-text3)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--wiki-text3)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'transparent', border: 'none', color: 'var(--wiki-text)', fontSize: 12 }} />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} activeBar={{ fill: '#6366f1' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="w-[280px] p-6 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-wiki-text">文档类型分布</h3>
            <p className="text-xs text-wiki-text3 mt-0.5">按文档类型统计</p>
          </div>
          <div className="flex items-center gap-2">
            <ResponsiveContainer width={120} height={140}>
              <PieChart>
                <Pie data={charts.pieData || []} cx="50%" cy="50%" innerRadius={30} outerRadius={activePieIndex !== null ? 60 : 55} dataKey="value" stroke="none" onMouseEnter={(_, index) => setActivePieIndex(index)} onMouseLeave={() => setActivePieIndex(null)}>
                  {(charts.pieData || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} style={{ filter: activePieIndex === index ? 'brightness(1.2)' : 'none', transition: 'all 0.2s' }} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'transparent', border: 'none', color: 'var(--wiki-text)', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {(charts.pieData || []).map((item: any, i: number) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i] }} />
                  <span className="text-xs text-wiki-text3">{item.name}</span>
                  <span className="text-xs font-medium text-wiki-text ml-auto">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* AI Insights */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <SparklesIcon size={14} style={{ color: 'var(--wiki-text)' }} />
          <h3 className="text-sm font-semibold text-wiki-text">AI 智能洞察</h3>
          {aiInsights.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>{aiInsights.length} 条新洞察</span>
          )}
        </div>

        {/* Generate button + loading */}
        {aiInsights.length === 0 && !aiLoading && !aiError && (
          <div className="p-8 rounded-lg text-center" style={{ background: 'var(--wiki-surface)', border: '1px dashed var(--wiki-border)' }}>
            <BrainCircuitIcon size={32} className="mx-auto mb-3" style={{ color: 'var(--wiki-text3)' }} />
            <p className="text-sm text-wiki-text2 mb-4">尚未生成 AI 洞察分析</p>
            <button
              onClick={generateAIInsights}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
              style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}
            >
              <SparklesIcon size={14} />
              <span>生成 AI 分析</span>
            </button>
          </div>
        )}

        {/* Loading state */}
        {aiLoading && (
          <div className="p-8 rounded-lg text-center" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <Loader2Icon size={32} className="mx-auto mb-3 animate-spin" style={{ color: 'var(--wiki-text2)' }} />
            <p className="text-sm text-wiki-text3">AI 正在分析项目数据...</p>
          </div>
        )}

        {/* Error state */}
        {aiError && (
          <div className="p-4 rounded-lg mb-4 flex items-center justify-between" style={{ background: '#ef444410', border: '1px solid #ef444430' }}>
            <div className="flex items-center gap-2">
              <AlertTriangleIcon size={14} style={{ color: '#ef4444' }} />
              <span className="text-xs" style={{ color: '#ef4444' }}>{aiError}</span>
            </div>
            <button
              onClick={generateAIInsights}
              className="text-xs font-medium px-3 py-1.5 rounded"
              style={{ background: '#ef4444', color: '#fff' }}
            >
              重试
            </button>
          </div>
        )}

        {/* Insight cards */}
        {aiInsights.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {aiInsights.map((insight, i) => {
              const Icon = iconMap[insight.icon] || TrendingUpIcon;
              return (
                <div
                  key={i}
                  className="p-5 rounded-lg transition-all duration-200 hover:border-indigo-500/30 cursor-pointer"
                  style={{ width: 'calc(50% - 6px)', background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: insight.bg }}>
                      <Icon size={16} style={{ color: insight.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-semibold text-wiki-text">{insight.title}</div>
                        <div className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: `${insight.color}15`, color: insight.color }}>
                          <TrendingUpIcon size={9} />
                          <span>置信度 {insight.score}%</span>
                        </div>
                      </div>
                      <div className="text-xs text-wiki-text2 leading-relaxed">{insight.desc}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Re-generate button */}
            <div
              className="p-5 rounded-lg flex items-center justify-center cursor-pointer transition-all hover:border-indigo-500/30"
              style={{ width: 'calc(50% - 6px)', background: 'var(--wiki-surface)', border: '1px dashed var(--wiki-border)' }}
              onClick={generateAIInsights}
            >
              <div className="flex items-center gap-2 text-xs text-wiki-text3">
                {aiLoading ? (
                  <Loader2Icon size={14} className="animate-spin" />
                ) : (
                  <RefreshCwIcon size={14} />
                )}
                <span>{aiLoading ? '分析中...' : '重新生成分析'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(Insights);
