// Statistics tools
export {
  stats_summary,
  stats_correlation,
  stats_regression,
  stats_moving_average,
} from "./tools";

// Chart tools
export {
  chart_line,
  chart_bar,
  chart_scatter,
  chart_pie,
  chart_histogram,
} from "./tools";

// Text analysis tools
export {
  text_sentiment,
  text_frequency,
} from "./tools";

// NLP & Topic modeling tools
export {
  text_tfidf,
  text_keywords,
  text_topics,
  text_similarity,
  text_classify,
  // File-based variants for large datasets
  analyze_sentiment_from_file,
  extract_keywords_from_file,
} from "./nlp";

// Data wrangling tools (file-based)
export {
  convert_data_format,
  fill_missing_values,
  filter_data,
  aggregate_data,
} from "./wrangling";

// Re-import for arrays
import {
  stats_summary,
  stats_correlation,
  stats_regression,
  stats_moving_average,
  chart_line,
  chart_bar,
  chart_scatter,
  chart_pie,
  chart_histogram,
  text_sentiment,
  text_frequency,
} from "./tools";

import {
  text_tfidf,
  text_keywords,
  text_topics,
  text_similarity,
  text_classify,
  analyze_sentiment_from_file,
  extract_keywords_from_file,
} from "./nlp";

import {
  convert_data_format,
  fill_missing_values,
  filter_data,
  aggregate_data,
} from "./wrangling";

/**
 * Statistics tools for numerical analysis.
 */
export const statsTools = [
  stats_summary,
  stats_correlation,
  stats_regression,
  stats_moving_average,
];

/**
 * Chart tools for creating visualizations.
 * All charts are saved as PNG files.
 */
export const chartTools = [
  chart_line,
  chart_bar,
  chart_scatter,
  chart_pie,
  chart_histogram,
];

/**
 * Text analysis and NLP tools.
 */
export const textTools = [
  text_sentiment,
  text_frequency,
  text_tfidf,
  text_keywords,
  text_topics,
  text_similarity,
  text_classify,
  analyze_sentiment_from_file,
  extract_keywords_from_file,
];

/**
 * NLP and topic modeling tools specifically.
 */
export const nlpTools = [
  text_tfidf,
  text_keywords,
  text_topics,
  text_similarity,
  text_classify,
];

/**
 * Data wrangling tools for file-based data transformations.
 * These tools work directly with CSV/JSON files on disk to handle large datasets efficiently.
 */
export const dataWranglingTools = [
  convert_data_format,
  fill_missing_values,
  filter_data,
  aggregate_data,
];

/**
 * All data science tools.
 *
 * Usage:
 * ```typescript
 * import { Agent, ChatLMStudio } from "cantrip";
 * import { dataScienceTools } from "cantrip/datascience";
 *
 * const agent = new Agent({
 *   llm: new ChatLMStudio({ model: "openai/gpt-oss-20b" }),
 *   tools: dataScienceTools,
 * });
 *
 * // Statistics
 * await agent.query("Calculate summary statistics for [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]");
 *
 * // Charts
 * await agent.query("Create a line chart of monthly sales and save to ./charts/sales.png");
 *
 * // Text analysis
 * await agent.query("Analyze the sentiment of this customer review: ...");
 *
 * // Data wrangling
 * await agent.query("Convert data.csv to JSON and fill missing values with mean");
 * ```
 */
export const dataScienceTools = [
  ...statsTools,
  ...chartTools,
  ...textTools,
  ...dataWranglingTools,
];
