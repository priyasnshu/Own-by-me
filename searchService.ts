import axios from 'axios';
import { env } from '../config/env';
import { errorMessage, logger, withRetry } from '../config/logger';
import type { NewsArticle } from '../types';

interface GoogleCseItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
  pagemap?: {
    cse_image?: Array<{ src?: string }>;
    cse_thumbnail?: Array<{ src?: string }>;
  };
}

interface GoogleCseResponse {
  items?: GoogleCseItem[];
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchArticleText(url: string): Promise<string> {
  return withRetry('news-article-fetch', async () => {
    try {
      const response = await axios.get<string>(url, {
        timeout: 15000,
        responseType: 'text',
        maxContentLength: 2_000_000,
        headers: { 'User-Agent': 'Mozilla/5.0 JEE-News-Automation/1.0' }
      });
      return stripHtml(response.data).slice(0, 16000);
    } catch (error) {
      logger.warn('Article fetch failed; using search snippet', { url, error: errorMessage(error) });
      throw error;
    }
  }, 2, 800);
}

export async function searchJeeNews(query: string): Promise<NewsArticle[]> {
  const finalQuery = query.trim().length > 0 ? query.trim() : 'JEE Main updates NTA notification';
  const response = await withRetry<GoogleCseResponse>('google-custom-search', async () => {
    const result = await axios.get<GoogleCseResponse>('https://www.googleapis.com/customsearch/v1', {
      timeout: 15000,
      params: {
        key: env.GOOGLE_CSE_API_KEY,
        cx: env.GOOGLE_CSE_ID,
        q: `${finalQuery} JEE NTA`,
        num: 3,
        dateRestrict: 'd30',
        safe: 'active'
      }
    });
    return result.data;
  }, 3, 1000);

  const items = (response.items ?? []).filter((item): item is GoogleCseItem & { title: string; link: string } => Boolean(item.title && item.link)).slice(0, 3);
  const articles: NewsArticle[] = [];

  for (const item of items) {
    let rawText = item.snippet ?? '';
    try {
      rawText = await fetchArticleText(item.link);
    } catch {
      logger.info('Keeping CSE snippet after article fetch failure', { url: item.link });
    }
    const imageUrl = item.pagemap?.cse_image?.[0]?.src ?? item.pagemap?.cse_thumbnail?.[0]?.src;
    articles.push({
      title: item.title,
      url: item.link,
      snippet: item.snippet ?? '',
      imageUrl,
      sourceDomain: item.displayLink ?? new URL(item.link).hostname,
      rawText
    });
  }

  if (articles.length === 0) {
    throw new Error('No JEE news results were returned by Google Custom Search.');
  }
  return articles;
}
