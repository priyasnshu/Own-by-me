import axios from 'axios';
import { env } from '../config/env';
import { errorMessage, logger, withRetry } from '../config/logger';
import type { DiagramSpec } from '../types';

interface QuickChartCreateResponse {
  success: boolean;
  url?: string;
}

function createChartConfig(spec: DiagramSpec): Record<string, unknown> {
  const labels = spec.labels.length > 0 ? spec.labels : spec.xValues.map((value) => String(value));
  const data = spec.yValues;
  const type = spec.kind === 'BAR_GRAPH' ? 'bar' : spec.kind === 'SCATTER_GRAPH' || spec.kind === 'GEOMETRY' || spec.kind === 'CIRCUIT' ? 'scatter' : 'line';

  if (type === 'scatter') {
    const points = spec.xValues.map((x, index) => ({ x, y: data[index] ?? 0 }));
    return {
      type,
      data: { datasets: [{ label: spec.seriesLabel, data: points, showLine: spec.kind !== 'SCATTER_GRAPH' }] },
      options: {
        plugins: { title: { display: true, text: spec.title } },
        scales: { x: { type: 'linear', title: { display: true, text: 'x' } }, y: { title: { display: true, text: 'y' } } }
      }
    };
  }

  return {
    type,
    data: { labels, datasets: [{ label: spec.seriesLabel, data }] },
    options: { plugins: { title: { display: true, text: spec.title } }, scales: { y: { beginAtZero: false } } }
  };
}

export async function createDiagramUrl(spec: DiagramSpec): Promise<string> {
  const payload = {
    width: 900,
    height: 520,
    format: 'png',
    version: '4',
    ...(env.QUICKCHART_API_KEY ? { key: env.QUICKCHART_API_KEY } : {}),
    chart: createChartConfig(spec)
  };

  return withRetry('quickchart-create-short-url', async () => {
    try {
      const response = await axios.post<QuickChartCreateResponse>('https://quickchart.io/chart/create', payload, {
        timeout: 20000,
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.data.success || !response.data.url) throw new Error('QuickChart did not return a public chart URL.');
      return response.data.url;
    } catch (error) {
      logger.error('QuickChart request failed', { error: errorMessage(error), spec });
      throw error;
    }
  }, 3, 1000);
}
