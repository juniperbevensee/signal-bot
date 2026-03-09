/**
 * Data Wrangling Tools
 *
 * File-based data transformation tools that work directly with CSV and JSON files
 * on disk to avoid loading large datasets into memory.
 */

import { tool } from "../../agent/tools";
import { z } from "zod";
import { readFile, writeFile } from "fs/promises";

// ============================================================================
// Format Conversion
// ============================================================================

export const convert_data_format = tool(
  "Convert data between CSV and JSON formats. Works with files on disk to handle large datasets efficiently.",
  async ({
    input_file,
    output_file,
    input_format,
    output_format,
  }: {
    input_file: string;
    output_format: "json" | "csv";
    input_format?: "json" | "csv";
    output_file?: string;
  }) => {
    try {
      // Auto-detect input format from extension if not provided
      const detectedInputFormat = input_format ||
        (input_file.endsWith('.json') ? 'json' :
         input_file.endsWith('.csv') ? 'csv' : null);

      if (!detectedInputFormat) {
        throw new Error("Could not detect input format. Specify input_format or use .json/.csv extension");
      }

      // Read input file
      const content = await readFile(input_file, 'utf-8');

      let data: any[];

      // Parse input
      if (detectedInputFormat === 'json') {
        data = JSON.parse(content);
        if (!Array.isArray(data)) {
          throw new Error("JSON file must contain an array of objects");
        }
      } else {
        // Parse CSV
        const lines = content.trim().split('\n');
        if (lines.length < 2) {
          throw new Error("CSV file must have at least a header row and one data row");
        }

        const headers = lines[0].split(',').map(h => h.trim());
        data = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const obj: any = {};
          headers.forEach((header, i) => {
            // Try to parse numbers
            const value = values[i];
            obj[header] = isNaN(Number(value)) ? value : Number(value);
          });
          return obj;
        });
      }

      // Format output
      let outputContent: string;
      const outputPath = output_file || input_file.replace(/\.(json|csv)$/, `.${output_format}`);

      if (output_format === 'json') {
        outputContent = JSON.stringify(data, null, 2);
      } else {
        // Convert to CSV
        if (data.length === 0) {
          throw new Error("Cannot convert empty dataset to CSV");
        }

        const headers = Object.keys(data[0]);
        const csvLines = [
          headers.join(','),
          ...data.map(row =>
            headers.map(h => {
              const value = row[h];
              // Quote strings with commas
              return typeof value === 'string' && value.includes(',')
                ? `"${value}"`
                : String(value ?? '');
            }).join(',')
          )
        ];
        outputContent = csvLines.join('\n');
      }

      // Write output file
      await writeFile(outputPath, outputContent, 'utf-8');

      return JSON.stringify({
        status: "success",
        input_file,
        output_file: outputPath,
        input_format: detectedInputFormat,
        output_format,
        rows: data.length,
        columns: data.length > 0 ? Object.keys(data[0]).length : 0,
      }, null, 2);
    } catch (error: any) {
      throw new Error(`Data format conversion failed: ${error.message}`);
    }
  },
  {
    name: "convert_data_format",
    zodSchema: z.object({
      input_file: z.string().describe("Path to input file (CSV or JSON)"),
      output_file: z.string().optional().describe("Path to output file (defaults to input with new extension)"),
      input_format: z.enum(["json", "csv"]).optional().describe("Input format (auto-detected from extension if not provided)"),
      output_format: z.enum(["json", "csv"]).describe("Output format to convert to"),
    }),
  }
);

// ============================================================================
// Data Cleaning
// ============================================================================

export const fill_missing_values = tool(
  "Fill missing/null values in a dataset with a specified strategy. Works with CSV or JSON files.",
  async ({
    input_file,
    output_file,
    strategy,
    columns,
    fill_value,
  }: {
    input_file: string;
    output_file?: string;
    strategy: "mean" | "median" | "mode" | "forward_fill" | "backward_fill" | "constant";
    columns?: string[];
    fill_value?: number | string;
  }) => {
    try {
      // Read file
      const content = await readFile(input_file, 'utf-8');
      const isJson = input_file.endsWith('.json');

      let data: any[];
      if (isJson) {
        data = JSON.parse(content);
      } else {
        // Parse CSV
        const lines = content.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        data = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const obj: any = {};
          headers.forEach((header, i) => {
            const value = values[i];
            obj[header] = value === '' || value === 'null' ? null :
                         (isNaN(Number(value)) ? value : Number(value));
          });
          return obj;
        });
      }

      // Determine columns to process
      const targetColumns = columns || Object.keys(data[0] || {});
      const stats: any = {};

      // Calculate statistics for each column (if needed)
      if (strategy === "mean" || strategy === "median" || strategy === "mode") {
        for (const col of targetColumns) {
          const values = data
            .map(row => row[col])
            .filter(v => v !== null && v !== undefined && v !== '');

          const numericValues = values
            .map(v => Number(v))
            .filter(v => !isNaN(v));

          if (numericValues.length > 0) {
            if (strategy === "mean") {
              stats[col] = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
            } else if (strategy === "median") {
              const sorted = [...numericValues].sort((a, b) => a - b);
              const mid = Math.floor(sorted.length / 2);
              stats[col] = sorted.length % 2 === 0
                ? (sorted[mid - 1] + sorted[mid]) / 2
                : sorted[mid];
            } else if (strategy === "mode") {
              const counts: { [key: string]: number } = {};
              values.forEach(v => {
                const key = String(v);
                counts[key] = (counts[key] || 0) + 1;
              });
              const mode = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])[0]?.[0];
              stats[col] = isNaN(Number(mode)) ? mode : Number(mode);
            }
          }
        }
      }

      // Apply filling strategy
      let filledCount = 0;
      for (let i = 0; i < data.length; i++) {
        for (const col of targetColumns) {
          if (data[i][col] === null || data[i][col] === undefined || data[i][col] === '') {
            if (strategy === "constant") {
              data[i][col] = fill_value;
              filledCount++;
            } else if (strategy === "forward_fill" && i > 0) {
              data[i][col] = data[i - 1][col];
              filledCount++;
            } else if (strategy === "backward_fill" && i < data.length - 1) {
              data[i][col] = data[i + 1][col];
              filledCount++;
            } else if (stats[col] !== undefined) {
              data[i][col] = stats[col];
              filledCount++;
            }
          }
        }
      }

      // Write output
      const outputPath = output_file || input_file.replace(/\.(json|csv)$/, '_filled.$1');

      if (isJson) {
        await writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');
      } else {
        const headers = Object.keys(data[0]);
        const csvLines = [
          headers.join(','),
          ...data.map(row => headers.map(h => String(row[h] ?? '')).join(','))
        ];
        await writeFile(outputPath, csvLines.join('\n'), 'utf-8');
      }

      return JSON.stringify({
        status: "success",
        input_file,
        output_file: outputPath,
        strategy,
        columns_processed: targetColumns,
        filled_count: filledCount,
        total_rows: data.length,
      }, null, 2);
    } catch (error: any) {
      throw new Error(`Fill missing values failed: ${error.message}`);
    }
  },
  {
    name: "fill_missing_values",
    zodSchema: z.object({
      input_file: z.string().describe("Path to input CSV or JSON file"),
      output_file: z.string().optional().describe("Path to output file (defaults to input_filled.ext)"),
      strategy: z.enum(["mean", "median", "mode", "forward_fill", "backward_fill", "constant"])
        .describe("Strategy for filling missing values"),
      columns: z.array(z.string()).optional().describe("Columns to process (defaults to all)"),
      fill_value: z.union([z.number(), z.string()]).optional()
        .describe("Value to use for 'constant' strategy"),
    }),
  }
);

// ============================================================================
// Data Filtering
// ============================================================================

export const filter_data = tool(
  "Filter rows in a dataset based on conditions. Works with CSV or JSON files.",
  async ({
    input_file,
    output_file,
    conditions,
    keep_columns,
    drop_columns,
  }: {
    input_file: string;
    output_file?: string;
    conditions?: { column: string; operator: string; value: any }[];
    keep_columns?: string[];
    drop_columns?: string[];
  }) => {
    try {
      // Read file
      const content = await readFile(input_file, 'utf-8');
      const isJson = input_file.endsWith('.json');

      let data: any[];
      if (isJson) {
        data = JSON.parse(content);
      } else {
        // Parse CSV
        const lines = content.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        data = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const obj: any = {};
          headers.forEach((header, i) => {
            const value = values[i];
            obj[header] = isNaN(Number(value)) ? value : Number(value);
          });
          return obj;
        });
      }

      const originalCount = data.length;

      // Apply row filters
      if (conditions && conditions.length > 0) {
        data = data.filter(row => {
          return conditions.every(({ column, operator, value }) => {
            const cellValue = row[column];

            switch (operator) {
              case "==": return cellValue == value;
              case "!=": return cellValue != value;
              case ">": return Number(cellValue) > Number(value);
              case "<": return Number(cellValue) < Number(value);
              case ">=": return Number(cellValue) >= Number(value);
              case "<=": return Number(cellValue) <= Number(value);
              case "contains": return String(cellValue).includes(String(value));
              case "not_contains": return !String(cellValue).includes(String(value));
              case "starts_with": return String(cellValue).startsWith(String(value));
              case "ends_with": return String(cellValue).endsWith(String(value));
              default: return true;
            }
          });
        });
      }

      // Apply column filters
      if (keep_columns || drop_columns) {
        data = data.map(row => {
          const newRow: any = {};
          const columns = keep_columns || Object.keys(row).filter(k => !drop_columns?.includes(k));
          columns.forEach(col => {
            newRow[col] = row[col];
          });
          return newRow;
        });
      }

      // Write output
      const outputPath = output_file || input_file.replace(/\.(json|csv)$/, '_filtered.$1');

      if (isJson) {
        await writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');
      } else {
        const headers = Object.keys(data[0] || {});
        const csvLines = [
          headers.join(','),
          ...data.map(row => headers.map(h => String(row[h] ?? '')).join(','))
        ];
        await writeFile(outputPath, csvLines.join('\n'), 'utf-8');
      }

      return JSON.stringify({
        status: "success",
        input_file,
        output_file: outputPath,
        original_rows: originalCount,
        filtered_rows: data.length,
        rows_removed: originalCount - data.length,
        columns: Object.keys(data[0] || {}),
      }, null, 2);
    } catch (error: any) {
      throw new Error(`Data filtering failed: ${error.message}`);
    }
  },
  {
    name: "filter_data",
    zodSchema: z.object({
      input_file: z.string().describe("Path to input CSV or JSON file"),
      output_file: z.string().optional().describe("Path to output file (defaults to input_filtered.ext)"),
      conditions: z.array(z.object({
        column: z.string(),
        operator: z.enum(["==", "!=", ">", "<", ">=", "<=", "contains", "not_contains", "starts_with", "ends_with"]),
        value: z.any(),
      })).optional().describe("Conditions to filter rows"),
      keep_columns: z.array(z.string()).optional().describe("Columns to keep (exclude all others)"),
      drop_columns: z.array(z.string()).optional().describe("Columns to drop (keep all others)"),
    }),
  }
);

// ============================================================================
// Data Aggregation
// ============================================================================

export const aggregate_data = tool(
  "Aggregate data by grouping rows and applying aggregation functions. Works with CSV or JSON files.",
  async ({
    input_file,
    output_file,
    group_by,
    aggregations,
  }: {
    input_file: string;
    output_file?: string;
    group_by: string | string[];
    aggregations: { [column: string]: "sum" | "mean" | "count" | "min" | "max" | "first" | "last" };
  }) => {
    try {
      // Read file
      const content = await readFile(input_file, 'utf-8');
      const isJson = input_file.endsWith('.json');

      let data: any[];
      if (isJson) {
        data = JSON.parse(content);
      } else {
        // Parse CSV
        const lines = content.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        data = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const obj: any = {};
          headers.forEach((header, i) => {
            const value = values[i];
            obj[header] = isNaN(Number(value)) ? value : Number(value);
          });
          return obj;
        });
      }

      const groupByColumns = Array.isArray(group_by) ? group_by : [group_by];

      // Group data
      const groups: { [key: string]: any[] } = {};
      data.forEach(row => {
        const key = groupByColumns.map(col => row[col]).join('|');
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(row);
      });

      // Aggregate groups
      const result: any[] = [];
      for (const [key, rows] of Object.entries(groups)) {
        const aggregated: any = {};

        // Add group keys
        groupByColumns.forEach((col, i) => {
          aggregated[col] = key.split('|')[i];
        });

        // Apply aggregations
        for (const [column, func] of Object.entries(aggregations)) {
          const values = rows.map(r => r[column]).filter(v => v !== null && v !== undefined);
          const numericValues = values.map(v => Number(v)).filter(v => !isNaN(v));

          switch (func) {
            case "sum":
              aggregated[`${column}_sum`] = numericValues.reduce((a, b) => a + b, 0);
              break;
            case "mean":
              aggregated[`${column}_mean`] = numericValues.length > 0
                ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length
                : null;
              break;
            case "count":
              aggregated[`${column}_count`] = values.length;
              break;
            case "min":
              aggregated[`${column}_min`] = numericValues.length > 0
                ? Math.min(...numericValues)
                : null;
              break;
            case "max":
              aggregated[`${column}_max`] = numericValues.length > 0
                ? Math.max(...numericValues)
                : null;
              break;
            case "first":
              aggregated[`${column}_first`] = values[0];
              break;
            case "last":
              aggregated[`${column}_last`] = values[values.length - 1];
              break;
          }
        }

        result.push(aggregated);
      }

      // Write output
      const outputPath = output_file || input_file.replace(/\.(json|csv)$/, '_aggregated.$1');

      if (isJson) {
        await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
      } else {
        const headers = Object.keys(result[0] || {});
        const csvLines = [
          headers.join(','),
          ...result.map(row => headers.map(h => String(row[h] ?? '')).join(','))
        ];
        await writeFile(outputPath, csvLines.join('\n'), 'utf-8');
      }

      return JSON.stringify({
        status: "success",
        input_file,
        output_file: outputPath,
        original_rows: data.length,
        aggregated_rows: result.length,
        group_by: groupByColumns,
        aggregations: Object.keys(aggregations),
      }, null, 2);
    } catch (error: any) {
      throw new Error(`Data aggregation failed: ${error.message}`);
    }
  },
  {
    name: "aggregate_data",
    zodSchema: z.object({
      input_file: z.string().describe("Path to input CSV or JSON file"),
      output_file: z.string().optional().describe("Path to output file (defaults to input_aggregated.ext)"),
      group_by: z.union([z.string(), z.array(z.string())]).describe("Column(s) to group by"),
      aggregations: z.record(z.enum(["sum", "mean", "count", "min", "max", "first", "last"]))
        .describe("Aggregation functions to apply to each column"),
    }),
  }
);

// ============================================================================
// Exports
// ============================================================================

export const dataWranglingTools = [
  convert_data_format,
  fill_missing_values,
  filter_data,
  aggregate_data,
];
