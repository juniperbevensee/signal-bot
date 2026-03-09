/**
 * Browser Tools
 * Provides web fetching and content extraction capabilities
 */

import { z } from 'zod';
import { tool, Tool } from '../agent/tools';

// ============================================================================
// HTML to Text Conversion (simple)
// ============================================================================

function htmlToText(html: string): string {
  return html
    // Remove script and style tags with content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Convert common block elements to newlines
    .replace(/<\/(p|div|h[1-6]|li|tr|br)[^>]*>/gi, '\n')
    .replace(/<(br|hr)[^>]*>/gi, '\n')
    // Remove remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================================================
// Tools Factory
// ============================================================================

export function createBrowserTools(): Tool[] {
  const tools: Tool[] = [];

  // Fetch URL
  tools.push(
    tool(
      'Fetch content from a URL. Returns the page content as text (HTML stripped).',
      async (args) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const response = await fetch(args.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; SignalBot/1.0)',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (!response.ok) {
            return `Error: HTTP ${response.status} ${response.statusText}`;
          }

          const contentType = response.headers.get('content-type') || '';
          const text = await response.text();

          // If HTML, convert to plain text
          if (contentType.includes('html')) {
            const plainText = htmlToText(text);
            // Truncate if too long
            if (plainText.length > 50000) {
              return plainText.substring(0, 50000) + '\n\n... (truncated, content too long)';
            }
            return plainText;
          }

          // For other text content, return as-is
          if (contentType.includes('text') || contentType.includes('json')) {
            if (text.length > 50000) {
              return text.substring(0, 50000) + '\n\n... (truncated, content too long)';
            }
            return text;
          }

          return `Content-Type ${contentType} is not supported for text extraction`;
        } catch (error: any) {
          if (error.name === 'AbortError') {
            return 'Error: Request timed out after 30 seconds';
          }
          return `Error fetching URL: ${error.message}`;
        }
      },
      {
        name: 'browser_fetch',
        zodSchema: z.object({
          url: z.string().describe('The URL to fetch'),
        }),
      }
    )
  );

  // Fetch JSON
  tools.push(
    tool(
      'Fetch JSON data from a URL. Returns parsed JSON as a formatted string.',
      async (args) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const response = await fetch(args.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; SignalBot/1.0)',
              Accept: 'application/json',
            },
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (!response.ok) {
            return `Error: HTTP ${response.status} ${response.statusText}`;
          }

          const json = await response.json();
          const formatted = JSON.stringify(json, null, 2);

          if (formatted.length > 50000) {
            return formatted.substring(0, 50000) + '\n\n... (truncated, content too long)';
          }

          return formatted;
        } catch (error: any) {
          if (error.name === 'AbortError') {
            return 'Error: Request timed out after 30 seconds';
          }
          return `Error fetching JSON: ${error.message}`;
        }
      },
      {
        name: 'browser_fetch_json',
        zodSchema: z.object({
          url: z.string().describe('The URL to fetch JSON from'),
        }),
      }
    )
  );

  // Search (using DuckDuckGo HTML)
  tools.push(
    tool(
      'Search the web using DuckDuckGo. Returns search result summaries.',
      async (args) => {
        try {
          const query = encodeURIComponent(args.query);
          const url = `https://html.duckduckgo.com/html/?q=${query}`;

          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; SignalBot/1.0)',
            },
          });

          if (!response.ok) {
            return `Error: Search failed with HTTP ${response.status}`;
          }

          const html = await response.text();

          // Extract search results (simplified parsing)
          const results: string[] = [];
          const resultRegex = /<a class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
          const snippetRegex = /<a class="result__snippet"[^>]*>([^<]*)/gi;

          let match;
          const links: string[] = [];
          const titles: string[] = [];

          while ((match = resultRegex.exec(html)) !== null && links.length < 5) {
            links.push(match[1]);
            titles.push(htmlToText(match[2]));
          }

          const snippets: string[] = [];
          while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
            snippets.push(htmlToText(match[1]));
          }

          for (let i = 0; i < Math.min(links.length, 5); i++) {
            results.push(`${i + 1}. ${titles[i] || 'Untitled'}\n   ${links[i]}\n   ${snippets[i] || ''}`);
          }

          if (results.length === 0) {
            return 'No search results found';
          }

          return results.join('\n\n');
        } catch (error: any) {
          return `Error performing search: ${error.message}`;
        }
      },
      {
        name: 'browser_search',
        zodSchema: z.object({
          query: z.string().describe('The search query'),
        }),
      }
    )
  );

  return tools;
}
