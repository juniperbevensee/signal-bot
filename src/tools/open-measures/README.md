# Open Measures Integration for Cantrip

Search and monitor social media content across 30+ platforms including Telegram, Gab, Parler, 4chan, Discord, Truth Social, Bluesky, VK, Gettr, TikTok, WhatsApp, and more.

**Note:** Reddit is NOT available via Open Measures API.

## Overview

Open Measures provides access to:
- **Content Search**: Search posts, messages, and comments across platforms
- **Trend Analysis**: Track conversation volume over time
- **Actor Discovery**: Find influential users and channels
- **Media Access**: Download images and videos from posts
- **Monitoring**: Set up crawls to continuously monitor keywords and channels (Pro API)

## API Tiers

### Public API (No Authentication)
- Free, rate-limited access
- 6-month delayed data
- Basic search and trend analysis
- No API key required

### Pro API (Requires Authentication)
- Real-time data access
- Higher rate limits
- Actor search and crawl management
- AI-powered query generation
- Requires `OPEN_MEASURES_API_KEY`

## Installation

Open Measures is included in Cantrip. The client is provided via the GitHub package:
```json
"open-measures": "github:juniperbevensee/open-measures-ts"
```

## Setup

### Public API (No Auth)
```typescript
import { OpenMeasuresClient } from "open-measures";
import { openMeasuresTools, getOpenMeasuresClient } from "cantrip/openmeasures";

const client = new OpenMeasuresClient(); // No API key needed

const agent = new Agent({
  tools: openMeasuresTools,
  dependency_overrides: new Map([
    [getOpenMeasuresClient, () => client],
  ]),
});
```

### Pro API (With Auth)
```bash
export OPEN_MEASURES_API_KEY=your_api_key_here
```

```typescript
const client = new OpenMeasuresClient({
  apiKey: process.env.OPEN_MEASURES_API_KEY,
});
```

## Supported Platforms

### Content Sites (use with `om_search_content`)
- **Messaging**: Telegram (default), Discord, WhatsApp
- **Social**: Gab, Parler, Gettr, Truth Social, Bluesky, VK, MeWe, Minds
- **Forums**: 4chan, 8kun, Kiwi Farms, Poal, Win
- **Video**: TikTok, BitChute, Rumble, LBRY, Rutube
- **Other**: Fediverse, Disqus, and more

### Actor Sites (use with `om_search_actors`)
- User profiles: `telegram_user`, `gab_user`, `discord_user`, `bluesky_user`, etc.
- Channels/Groups: `telegram_channel`, `discord_channel`, `whatsapp_channel`, `gab_group`, etc.

## Tools

### Content Search Tools

#### `om_search_content`
Search for posts, comments, and messages across platforms.

**Features:**
- Boolean operators (AND, OR, NOT)
- Date filtering (since/until)
- Platform filtering
- Large result sets automatically saved to files

**Example:**
```typescript
await agent.query("Search Telegram for posts about 'bitcoin AND (price OR market)' from the last month");
```

**Parameters:**
- `term`: Search query (supports boolean operators)
- `site`: Platform(s) to search (default: telegram)
- `since`: Start date (ISO 8601)
- `until`: End date (ISO 8601)
- `limit`: Number of results (1-1000, default: 25)
- `sort_desc`: Sort newest first (default: false)

#### `om_timeseries`
Get aggregated post counts over time for trend analysis.

**Example:**
```typescript
await agent.query("Show me a weekly timeseries of posts about climate change over the last 3 months");
```

**Parameters:**
- `term`: Search query
- `site`: Platform (default: telegram)
- `interval`: Time bucket (hour, day, week, month, quarter, year)
- `since`/`until`: Date range
- `changepoint`: Detect significant trend changes (boolean)

#### `om_activity`
Find top users, channels, or groups posting about a topic.

**Example:**
```typescript
await agent.query("Who are the top 10 users posting about cryptocurrency on Gab?");
```

**Parameters:**
- `term`: Search query
- `site`: Platform (default: telegram)
- `agg_by`: Field to aggregate by (default: "actor.username")
  - Common: `actor.username` (who posted), `context.username` (channel/group)
- `size`: Number of results (1-100, default: 20)

#### `om_get_media`
Retrieve downloadable URLs for images and videos.

**Example:**
```typescript
await agent.query("Get the media for hash abc123def456");
```

**Parameters:**
- `media_hash`: Hash from search results
- `site`: Source platform
- `media_type`: "thumbnail" or "media" (default: "media")

### Pro API Tools (Require Authentication)

#### `om_search_actors`
Search for user profiles, channels, and groups.

**Example:**
```typescript
await agent.query("Find Telegram channels with 'news' in their name");
```

**Parameters:**
- `term`: Search query for username/name
- `site`: Actor type (default: telegram_channel)
- `limit`: Number of results (1-1000, default: 25)
- `fullsearch`: Enable Lucene query syntax (boolean)

#### `om_quota`
Check your API quota usage and remaining requests.

**Example:**
```typescript
await agent.query("Check my API quota");
```

#### `om_generate_query`
Use AI to generate a search query from natural language.

**Example:**
```typescript
await agent.query("Generate a search query for posts about election fraud from verified accounts excluding retweets");
```

#### `om_augment_query`
Refine an existing query based on instructions.

**Example:**
```typescript
await agent.query("Take the query 'climate change' and add terms for renewable energy while excluding fossil fuels");
```

#### Crawl Management Tools

##### `om_get_crawl_requests`
List existing monitoring crawls.

**Crawl Types:** keyword, profile, telegram, whatsapp, channel

**Example:**
```typescript
await agent.query("List all my active keyword crawls");
```

##### `om_create_crawl_request`
Create a new monitoring crawl.

**Example:**
```typescript
await agent.query("Create a crawl to monitor the keyword 'AI ethics' on Telegram");
```

##### `om_update_crawl_request`
Enable/disable crawling or media collection.

**Example:**
```typescript
await agent.query("Disable crawl request ID abc123");
```

## Query Syntax

### Boolean Operators
```
bitcoin AND ethereum          # Both terms must be present
bitcoin OR ethereum          # Either term must be present
bitcoin NOT scam             # First term present, second absent
"exact phrase"               # Exact phrase match
(bitcoin OR ethereum) AND price  # Grouping with parentheses
```

### Date Formats
Use ISO 8601 format for dates:
```
2024-01-01                   # Specific day
2024-01-01T12:00:00Z         # With time
```

### Platform Selection
```typescript
site: "telegram"             // Single platform
site: ["telegram", "gab"]   // Multiple platforms
```

## Best Practices

1. **Start Broad**: Begin with general queries to understand available data, then refine.

2. **Use Date Ranges**: Always specify `since`/`until` to limit results to relevant time periods.

3. **Boolean Queries**: Use AND/OR/NOT for precise searches:
   ```
   "climate change" AND (renewable OR solar) NOT fossil
   ```

4. **Large Results**: For queries returning >100 results, data is automatically saved to files. Use the file path to access results.

5. **Timeseries for Trends**: Use `om_timeseries` instead of `om_search_content` when you need to understand volume trends over time.

6. **Actor Discovery**: Use `om_activity` to find influential accounts, then `om_search_actors` (Pro API) to get their full profiles.

7. **Crawl Management**: Set up monitoring crawls for ongoing topics of interest rather than running repeated searches.

## Rate Limits

- **Public API**: Rate-limited (exact limits not publicly documented)
- **Pro API**: Check your quota with `om_quota` tool
- **Best Practice**: Cache results and avoid redundant queries

## Data Freshness

- **Public API**: 6-month delayed data
- **Pro API**: Real-time data access

## Platform-Specific Notes

### Telegram
- Default platform if none specified
- Rich metadata (channel info, forwarding chains)
- High volume of data available

### Discord
- Requires channels to be indexed
- Not all Discord servers are available

### 4chan/8kun
- Anonymous posts (no persistent usernames)
- Use `context` field for board information

### Video Platforms (TikTok, BitChute, Rumble)
- Separate tools for video content vs. comments
- Use `om_get_media` to retrieve actual video URLs

## Examples

See `examples/openmeasures-example.ts` for a complete interactive example.

## Selective Tool Import

```typescript
import {
  openMeasuresPublicTools,  // Public API only
  openMeasuresProTools,      // Pro API only
  openMeasuresTools,         // All tools
} from "cantrip/openmeasures";
```

## Troubleshooting

### "OpenMeasuresClient not provided" Error
Make sure you're providing the client via dependency injection:
```typescript
dependency_overrides: new Map([
  [getOpenMeasuresClient, () => client],
])
```

### Rate Limiting
If you hit rate limits:
- Reduce query frequency
- Use more specific date ranges
- Consider upgrading to Pro API
- Check quota with `om_quota`

### No Results
- Try broader search terms
- Check date range (data may not be available for recent dates on Public API)
- Verify the platform has indexed data for your query
- Use `om_timeseries` to see if there's ANY data for your term

## Resources

- [Open Measures Documentation](https://www.openmeasures.io/docs)
- [Platform Coverage](https://www.openmeasures.io/platforms)
- [API Reference](https://www.openmeasures.io/api)
