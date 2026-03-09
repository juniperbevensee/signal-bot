/**
 * Simplified Open Measures tools
 * Factory functions that create tools with an injected client
 */

import { tool, type Tool } from "../../agent/tools";
import { z } from "zod";
import type { OpenMeasuresClient } from "open-measures";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

// Helper functions
function formatResult(data: Record<string, any>): string {
  return JSON.stringify(data, null, 2);
}

function formatError(action: string, error: any): never {
  const message = error?.message ?? String(error);
  const statusCode = error?.statusCode ? ` (HTTP ${error.statusCode})` : "";
  throw new Error(`${action} failed${statusCode}: ${message}`);
}

// Site enum
const SITES = [
  "4chan", "8kun", "bitchute_comment", "bitchute_video", "bluesky",
  "discord", "disqus", "fashfront", "fediverse", "gab", "gettr",
  "godwire", "kiwifarms", "lbry_comment", "lbry_video", "mewe",
  "mewe_chat", "minds", "ok", "parler", "poal", "rumble_comment",
  "rumble_video", "rutube_comment", "rutube_video", "skibidifarms",
  "telegram_channel", "telegram_user", "tiktok_user", "truthsocial_group",
  "truthsocial_user", "vk_group", "vk_user", "whatsapp_channel",
  "whatsapp_user", "wimkin_user", "win_user",
] as const;

const INTERVALS = ["hour", "day", "week", "month", "quarter", "year"] as const;

/**
 * Create Open Measures tools with the given client
 */
export function createOpenMeasuresTools(client: OpenMeasuresClient): Tool[] {
  const om_search = tool(
    "Search for posts, comments, and messages across 30+ social media platforms including Telegram (default), Gab, Parler, 4chan, Discord, Truth Social, Bluesky, VK, Gettr, TikTok, and more. Note: Reddit is NOT available. Supports boolean queries and date filtering.",
    async ({
      term,
      site,
      since,
      until,
      limit,
      sort_desc,
    }: {
      term: string;
      site?: string | string[];
      since?: string;
      until?: string;
      limit?: number;
      sort_desc?: boolean;
    }) => {
      try {
        const requestedLimit = limit ?? 25;

        const response = await client.content({
          term,
          site: site as any,
          since,
          until,
          limit: requestedLimit,
          sortdesc: sort_desc,
          standard_fields: true,
        });

        const results = response.results.map((hit) => ({
          id: hit._id,
          text: (hit._source as any).text?.slice(0, 500),
          created_at: (hit._source as any).created_at,
          platform: hit._index,
          actor: (hit._source as any).actor?.username,
          context: (hit._source as any).context?.username || (hit._source as any).context?.name,
        }));

        // For large result sets (>=50), write to file
        if (requestedLimit >= 50) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `om_search_${term.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}_${timestamp}.json`;

          const workspaceDir = process.env.WORKSPACE_DIR || join(process.cwd(), "workspace");
          const filepath = join(workspaceDir, "om-results", filename);
          const relativePath = join("om-results", filename);

          await mkdir(join(workspaceDir, "om-results"), { recursive: true });
          await writeFile(filepath, JSON.stringify(results, null, 2), 'utf-8');

          return formatResult({
            status: "success",
            total_hits: response.total_hits,
            returned: results.length,
            file: relativePath,
            sample: results.slice(0, 5),
            note: `Results saved to ${relativePath} in workspace. ${response.total_hits > requestedLimit ? `${response.total_hits - results.length} more results available.` : ''}`,
          });
        }

        return formatResult({
          status: "success",
          total_hits: response.total_hits,
          returned: results.length,
          results,
          search_after: response.search_after,
        });
      } catch (error) {
        formatError("om_search", error);
      }
    },
    {
      name: "om_search",
      zodSchema: z.object({
        term: z.string().describe("Search query. Supports boolean operators (AND, OR, NOT). Example: 'bitcoin AND (price OR market)'"),
        site: z.union([
          z.enum(SITES),
          z.array(z.enum(SITES)),
        ]).optional().describe("Platform(s) to search. Default: telegram. Examples: 'telegram', 'gab', ['telegram', 'gab']"),
        since: z.string().optional().describe("Start date filter (ISO 8601). Example: '2024-01-01'"),
        until: z.string().optional().describe("End date filter (ISO 8601). Example: '2024-06-01'"),
        limit: z.number().min(1).max(1000).optional().describe("Number of results (default: 25, max: 1000)"),
        sort_desc: z.boolean().optional().describe("Sort newest first (default: false)"),
      }),
    }
  );

  const om_timeseries = tool(
    "Get timeseries data (post counts over time) for a search query. Useful for trending analysis and activity patterns.",
    async ({
      term,
      site,
      since,
      until,
      interval,
    }: {
      term: string;
      site?: string | string[];
      since?: string;
      until?: string;
      interval?: string;
    }) => {
      try {
        const response = await client.timeseries({
          term,
          site: site as any,
          since,
          until,
          interval: interval as any,
          standard_fields: true,
        });

        return formatResult({
          status: "success",
          total_hits: (response as any).total_hits,
          datapoints: (response as any).timeseries?.length || 0,
          timeseries: (response as any).timeseries,
        });
      } catch (error) {
        formatError("om_timeseries", error);
      }
    },
    {
      name: "om_timeseries",
      zodSchema: z.object({
        term: z.string().describe("Search query"),
        site: z.union([z.enum(SITES), z.array(z.enum(SITES))]).optional().describe("Platform(s) to analyze"),
        since: z.string().optional().describe("Start date (ISO 8601)"),
        until: z.string().optional().describe("End date (ISO 8601)"),
        interval: z.enum(INTERVALS).optional().describe("Time interval: hour, day, week, month, quarter, year (default: day)"),
      }),
    }
  );

  const om_account_info = tool(
    "Get detailed information about a social media account/actor across platforms.",
    async ({
      username,
      site,
    }: {
      username: string;
      site?: string;
    }) => {
      try {
        const response = await client.actors({
          term: username,
          site: site as any,
          limit: 1,
          standard_fields: true,
        });

        if (response.results.length === 0) {
          return formatResult({
            status: "not_found",
            message: `No account found for username: ${username}`,
          });
        }

        const actor = response.results[0]._source as any;
        return formatResult({
          status: "success",
          account: {
            username: actor.username,
            display_name: actor.display_name,
            description: actor.description,
            followers_count: actor.followers_count,
            following_count: actor.following_count,
            post_count: actor.post_count,
            created_at: actor.created_at,
            verified: actor.verified,
            platform: response.results[0]._index,
          },
        });
      } catch (error) {
        formatError("om_account_info", error);
      }
    },
    {
      name: "om_account_info",
      zodSchema: z.object({
        username: z.string().describe("Username or account handle to look up"),
        site: z.enum(SITES).optional().describe("Platform to search (default: all)"),
      }),
    }
  );

  return [om_search, om_timeseries, om_account_info];
}
