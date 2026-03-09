import { tool } from "../../agent/tools";
import { z } from "zod";
import * as ss from "simple-statistics";
import { promises as fs } from "fs";
import path from "path";

// ============================================================================
// Statistics Tools
// ============================================================================

export const stats_summary = tool(
  "Calculate summary statistics for a dataset. Returns mean, median, std, min, max, quartiles, and count.",
  async ({ data }: { data: number[] }) => {
    try {
      if (!data || data.length === 0) {
        throw new Error("Empty dataset");
      }

      const sorted = [...data].sort((a, b) => a - b);

      return JSON.stringify({
        status: "success",
        count: data.length,
        mean: ss.mean(data),
        median: ss.median(sorted),
        std: ss.standardDeviation(data),
        variance: ss.variance(data),
        min: ss.min(data),
        max: ss.max(data),
        range: ss.max(data) - ss.min(data),
        q1: ss.quantile(sorted, 0.25),
        q3: ss.quantile(sorted, 0.75),
        iqr: ss.interquartileRange(sorted),
        skewness: ss.sampleSkewness(data),
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "stats_summary",
    zodSchema: z.object({
      data: z.array(z.number()).describe("Array of numbers to analyze"),
    }),
  }
);

export const stats_correlation = tool(
  "Calculate correlation between two datasets. Returns Pearson correlation coefficient.",
  async ({ x, y }: { x: number[]; y: number[] }) => {
    try {
      if (x.length !== y.length) {
        throw new Error("Arrays must have same length");
      }
      if (x.length < 2) {
        throw new Error("Need at least 2 data points");
      }

      const correlation = ss.sampleCorrelation(x, y);
      const covariance = ss.sampleCovariance(x, y);

      // Interpret correlation strength
      const absCorr = Math.abs(correlation);
      let interpretation = "no correlation";
      if (absCorr >= 0.9) interpretation = "very strong";
      else if (absCorr >= 0.7) interpretation = "strong";
      else if (absCorr >= 0.5) interpretation = "moderate";
      else if (absCorr >= 0.3) interpretation = "weak";
      else if (absCorr > 0) interpretation = "very weak";

      return JSON.stringify({
        status: "success",
        correlation,
        covariance,
        interpretation: `${interpretation} ${correlation >= 0 ? "positive" : "negative"}`,
        n: x.length,
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "stats_correlation",
    zodSchema: z.object({
      x: z.array(z.number()).describe("First array of numbers"),
      y: z.array(z.number()).describe("Second array of numbers (same length as x)"),
    }),
  }
);

export const stats_regression = tool(
  "Perform linear regression on x,y data. Returns slope, intercept, R², and prediction function.",
  async ({ x, y, predict_x }: { x: number[]; y: number[]; predict_x?: number[] }) => {
    try {
      if (x.length !== y.length) {
        throw new Error("Arrays must have same length");
      }
      if (x.length < 2) {
        throw new Error("Need at least 2 data points");
      }

      // Combine into pairs for simple-statistics
      const pairs: [number, number][] = x.map((xi, i) => [xi, y[i]]);

      const regression = ss.linearRegression(pairs);
      const regressionLine = ss.linearRegressionLine(regression);
      const rSquared = ss.rSquared(pairs, regressionLine);

      // Calculate RMSE
      const predictions = x.map(regressionLine);
      const residuals = y.map((yi, i) => yi - predictions[i]);
      const rmse = Math.sqrt(ss.mean(residuals.map(r => r * r)));

      const result: any = {
        status: "success",
        slope: regression.m,
        intercept: regression.b,
        r_squared: rSquared,
        rmse,
        equation: `y = ${regression.m.toFixed(4)}x + ${regression.b.toFixed(4)}`,
        n: x.length,
      };

      // Make predictions if requested
      if (predict_x && predict_x.length > 0) {
        result.predictions = predict_x.map(xi => ({
          x: xi,
          predicted_y: regressionLine(xi),
        }));
      }

      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "stats_regression",
    zodSchema: z.object({
      x: z.array(z.number()).describe("Independent variable values"),
      y: z.array(z.number()).describe("Dependent variable values"),
      predict_x: z.array(z.number()).optional().describe("X values to predict Y for"),
    }),
  }
);

export const stats_moving_average = tool(
  "Calculate moving average for time series data. Useful for smoothing price data.",
  async ({ data, window_size, type }: { data: number[]; window_size: number; type?: string }) => {
    try {
      if (window_size > data.length) {
        throw new Error("Window size larger than data length");
      }
      if (window_size < 1) {
        throw new Error("Window size must be at least 1");
      }

      const maType = type || "simple";
      const result: number[] = [];

      if (maType === "simple" || maType === "sma") {
        // Simple Moving Average
        for (let i = window_size - 1; i < data.length; i++) {
          const window = data.slice(i - window_size + 1, i + 1);
          result.push(ss.mean(window));
        }
      } else if (maType === "exponential" || maType === "ema") {
        // Exponential Moving Average
        const multiplier = 2 / (window_size + 1);
        result.push(ss.mean(data.slice(0, window_size))); // First EMA is SMA
        for (let i = window_size; i < data.length; i++) {
          const ema = (data[i] - result[result.length - 1]) * multiplier + result[result.length - 1];
          result.push(ema);
        }
      }

      return JSON.stringify({
        status: "success",
        type: maType,
        window_size,
        input_length: data.length,
        output_length: result.length,
        values: result,
        latest: result[result.length - 1],
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "stats_moving_average",
    zodSchema: z.object({
      data: z.array(z.number()).describe("Time series data"),
      window_size: z.number().int().positive().describe("Window size for moving average"),
      type: z.enum(["simple", "sma", "exponential", "ema"]).optional().describe("Type of moving average (default: simple)"),
    }),
  }
);

// ============================================================================
// Chart Tools
// ============================================================================

// Lazy load chartjs-node-canvas to avoid startup cost
let ChartJSNodeCanvas: any = null;
async function getChartRenderer(width = 800, height = 600) {
  if (!ChartJSNodeCanvas) {
    const mod = await import("chartjs-node-canvas");
    ChartJSNodeCanvas = mod.ChartJSNodeCanvas;
  }
  return new ChartJSNodeCanvas({ width, height, backgroundColour: "white" });
}

export const chart_line = tool(
  "Create a line chart and save as PNG. Supports multiple datasets. Use data_file to load data from a JSON file (format: {labels: string[], datasets: [{label, data, color?}]}).",
  async ({
    datasets,
    labels,
    data_file,
    title,
    x_label,
    y_label,
    output_path,
    width,
    height,
  }: {
    datasets?: Array<{ label: string; data: number[]; color?: string }>;
    labels?: string[];
    data_file?: string;
    title?: string;
    x_label?: string;
    y_label?: string;
    output_path: string;
    width?: number;
    height?: number;
  }) => {
    try {
      let chartLabels = labels;
      let chartDatasets = datasets;

      // Load from file if provided
      if (data_file) {
        const fileContent = await fs.readFile(data_file, "utf8");
        const fileData = JSON.parse(fileContent);
        chartLabels = fileData.labels || chartLabels;
        chartDatasets = fileData.datasets || chartDatasets;
      }

      if (!chartLabels || !chartDatasets) {
        throw new Error("Must provide labels and datasets, either inline or via data_file");
      }

      const chart = await getChartRenderer(width || 800, height || 600);

      const colors = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#0891b2"];

      const config = {
        type: "line" as const,
        data: {
          labels: chartLabels,
          datasets: chartDatasets.map((ds, i) => ({
            label: ds.label,
            data: ds.data,
            borderColor: ds.color || colors[i % colors.length],
            backgroundColor: (ds.color || colors[i % colors.length]) + "20",
            fill: false,
            tension: 0.1,
          })),
        },
        options: {
          responsive: false,
          plugins: {
            title: { display: !!title, text: title },
            legend: { display: chartDatasets.length > 1 },
          },
          scales: {
            x: { title: { display: !!x_label, text: x_label } },
            y: { title: { display: !!y_label, text: y_label } },
          },
        },
      };

      const buffer = await chart.renderToBuffer(config);

      // Ensure directory exists
      const outputDir = path.dirname(output_path);
      if (outputDir && outputDir !== '.') {
        await fs.mkdir(outputDir, { recursive: true });
      }
      await fs.writeFile(output_path, buffer);

      return JSON.stringify({
        status: "success",
        output_path,
        width: width || 800,
        height: height || 600,
        datasets_count: chartDatasets.length,
        points_count: chartLabels.length,
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "chart_line",
    zodSchema: z.object({
      datasets: z.array(z.object({
        label: z.string().describe("Dataset label"),
        data: z.array(z.number()).describe("Y values"),
        color: z.string().optional().describe("Line color (hex)"),
      })).optional().describe("One or more datasets to plot (or use data_file)"),
      labels: z.array(z.string()).optional().describe("X-axis labels (or use data_file)"),
      data_file: z.string().optional().describe("Path to JSON file with {labels, datasets} structure"),
      title: z.string().optional().describe("Chart title"),
      x_label: z.string().optional().describe("X-axis label"),
      y_label: z.string().optional().describe("Y-axis label"),
      output_path: z.string().describe("Output PNG file path"),
      width: z.number().optional().describe("Chart width in pixels (default: 800)"),
      height: z.number().optional().describe("Chart height in pixels (default: 600)"),
    }),
  }
);

export const chart_bar = tool(
  "Create a bar chart and save as PNG. Use data_file to load data from a JSON file (format: {labels: string[], datasets: [{label, data, color?}]}).",
  async ({
    datasets,
    labels,
    data_file,
    title,
    x_label,
    y_label,
    output_path,
    horizontal,
    width,
    height,
  }: {
    datasets?: Array<{ label: string; data: number[]; color?: string }>;
    labels?: string[];
    data_file?: string;
    title?: string;
    x_label?: string;
    y_label?: string;
    output_path: string;
    horizontal?: boolean;
    width?: number;
    height?: number;
  }) => {
    try {
      let chartLabels = labels;
      let chartDatasets = datasets;

      // Load from file if provided
      if (data_file) {
        const fileContent = await fs.readFile(data_file, "utf8");
        const fileData = JSON.parse(fileContent);
        chartLabels = fileData.labels || chartLabels;
        chartDatasets = fileData.datasets || chartDatasets;
      }

      if (!chartLabels || !chartDatasets) {
        throw new Error("Must provide labels and datasets, either inline or via data_file");
      }

      const chart = await getChartRenderer(width || 800, height || 600);

      const colors = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#0891b2"];

      const config = {
        type: "bar" as const,
        data: {
          labels: chartLabels,
          datasets: chartDatasets.map((ds, i) => ({
            label: ds.label,
            data: ds.data,
            backgroundColor: ds.color || colors[i % colors.length],
          })),
        },
        options: {
          indexAxis: horizontal ? ("y" as const) : ("x" as const),
          responsive: false,
          plugins: {
            title: { display: !!title, text: title },
            legend: { display: chartDatasets.length > 1 },
          },
          scales: {
            x: { title: { display: !!x_label, text: x_label } },
            y: { title: { display: !!y_label, text: y_label } },
          },
        },
      };

      const buffer = await chart.renderToBuffer(config);
      const outputDir = path.dirname(output_path);
      if (outputDir && outputDir !== '.') {
        await fs.mkdir(outputDir, { recursive: true });
      }
      await fs.writeFile(output_path, buffer);

      return JSON.stringify({
        status: "success",
        output_path,
        type: horizontal ? "horizontal bar" : "bar",
        datasets_count: chartDatasets.length,
        categories: chartLabels.length,
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "chart_bar",
    zodSchema: z.object({
      datasets: z.array(z.object({
        label: z.string().describe("Dataset label"),
        data: z.array(z.number()).describe("Values"),
        color: z.string().optional().describe("Bar color (hex)"),
      })).optional().describe("One or more datasets (or use data_file)"),
      labels: z.array(z.string()).optional().describe("Category labels (or use data_file)"),
      data_file: z.string().optional().describe("Path to JSON file with {labels, datasets} structure"),
      title: z.string().optional().describe("Chart title"),
      x_label: z.string().optional().describe("X-axis label"),
      y_label: z.string().optional().describe("Y-axis label"),
      output_path: z.string().describe("Output PNG file path"),
      horizontal: z.boolean().optional().describe("Horizontal bar chart"),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  }
);

export const chart_scatter = tool(
  "Create a scatter plot and save as PNG. Optionally include regression line. Use data_file to load data from a JSON file (format: {x: number[], y: number[]}).",
  async ({
    x,
    y,
    data_file,
    title,
    x_label,
    y_label,
    output_path,
    show_regression,
    point_color,
    width,
    height,
  }: {
    x?: number[];
    y?: number[];
    data_file?: string;
    title?: string;
    x_label?: string;
    y_label?: string;
    output_path: string;
    show_regression?: boolean;
    point_color?: string;
    width?: number;
    height?: number;
  }) => {
    try {
      let chartX = x;
      let chartY = y;

      // Load from file if provided
      if (data_file) {
        const fileContent = await fs.readFile(data_file, "utf8");
        const fileData = JSON.parse(fileContent);
        chartX = fileData.x || chartX;
        chartY = fileData.y || chartY;
      }

      if (!chartX || !chartY) {
        throw new Error("Must provide x and y arrays, either inline or via data_file");
      }

      if (chartX.length !== chartY.length) {
        throw new Error("x and y must have same length");
      }

      const chart = await getChartRenderer(width || 800, height || 600);

      const points = chartX.map((xi, i) => ({ x: xi, y: chartY![i] }));

      const datasets: any[] = [{
        label: "Data",
        data: points,
        backgroundColor: point_color || "#2563eb",
        pointRadius: 5,
      }];

      // Add regression line if requested
      if (show_regression && chartX.length >= 2) {
        const pairs: [number, number][] = chartX.map((xi, i) => [xi, chartY![i]]);
        const regression = ss.linearRegression(pairs);
        const line = ss.linearRegressionLine(regression);

        const minX = Math.min(...chartX);
        const maxX = Math.max(...chartX);

        datasets.push({
          label: `y = ${regression.m.toFixed(2)}x + ${regression.b.toFixed(2)}`,
          data: [{ x: minX, y: line(minX) }, { x: maxX, y: line(maxX) }],
          type: "line",
          borderColor: "#dc2626",
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        });
      }

      const config = {
        type: "scatter" as const,
        data: { datasets },
        options: {
          responsive: false,
          plugins: {
            title: { display: !!title, text: title },
          },
          scales: {
            x: { title: { display: !!x_label, text: x_label } },
            y: { title: { display: !!y_label, text: y_label } },
          },
        },
      };

      const buffer = await chart.renderToBuffer(config);
      const outputDir = path.dirname(output_path);
      if (outputDir && outputDir !== '.') {
        await fs.mkdir(outputDir, { recursive: true });
      }
      await fs.writeFile(output_path, buffer);

      return JSON.stringify({
        status: "success",
        output_path,
        points: chartX.length,
        regression_shown: show_regression || false,
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "chart_scatter",
    zodSchema: z.object({
      x: z.array(z.number()).optional().describe("X values (or use data_file)"),
      y: z.array(z.number()).optional().describe("Y values (or use data_file)"),
      data_file: z.string().optional().describe("Path to JSON file with {x, y} arrays"),
      title: z.string().optional().describe("Chart title"),
      x_label: z.string().optional().describe("X-axis label"),
      y_label: z.string().optional().describe("Y-axis label"),
      output_path: z.string().describe("Output PNG file path"),
      show_regression: z.boolean().optional().describe("Show regression line"),
      point_color: z.string().optional().describe("Point color (hex)"),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  }
);

export const chart_pie = tool(
  "Create a pie or doughnut chart and save as PNG. Use data_file to load data from a JSON file (format: {values: number[], labels: string[]}).",
  async ({
    values,
    labels,
    data_file,
    title,
    output_path,
    doughnut,
    colors,
    width,
    height,
  }: {
    values?: number[];
    labels?: string[];
    data_file?: string;
    title?: string;
    output_path: string;
    doughnut?: boolean;
    colors?: string[];
    width?: number;
    height?: number;
  }) => {
    try {
      let chartValues = values;
      let chartLabels = labels;

      // Load from file if provided
      if (data_file) {
        const fileContent = await fs.readFile(data_file, "utf8");
        const fileData = JSON.parse(fileContent);
        chartValues = fileData.values || chartValues;
        chartLabels = fileData.labels || chartLabels;
      }

      if (!chartValues || !chartLabels) {
        throw new Error("Must provide values and labels, either inline or via data_file");
      }

      if (chartValues.length !== chartLabels.length) {
        throw new Error("values and labels must have same length");
      }

      const chart = await getChartRenderer(width || 600, height || 600);

      const defaultColors = [
        "#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea",
        "#0891b2", "#be185d", "#ea580c", "#4f46e5", "#059669"
      ];

      const config = {
        type: doughnut ? ("doughnut" as const) : ("pie" as const),
        data: {
          labels: chartLabels,
          datasets: [{
            data: chartValues,
            backgroundColor: colors || defaultColors.slice(0, chartValues.length),
          }],
        },
        options: {
          responsive: false,
          plugins: {
            title: { display: !!title, text: title },
            legend: { position: "right" as const },
          },
        },
      };

      const buffer = await chart.renderToBuffer(config);
      const outputDir = path.dirname(output_path);
      if (outputDir && outputDir !== '.') {
        await fs.mkdir(outputDir, { recursive: true });
      }
      await fs.writeFile(output_path, buffer);

      const total = chartValues.reduce((a, b) => a + b, 0);
      return JSON.stringify({
        status: "success",
        output_path,
        type: doughnut ? "doughnut" : "pie",
        slices: chartValues.length,
        total,
        percentages: chartValues.map((v, i) => ({
          label: chartLabels![i],
          value: v,
          percent: ((v / total) * 100).toFixed(1) + "%",
        })),
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "chart_pie",
    zodSchema: z.object({
      values: z.array(z.number()).optional().describe("Numeric values for each slice (or use data_file)"),
      labels: z.array(z.string()).optional().describe("Labels for each slice (or use data_file)"),
      data_file: z.string().optional().describe("Path to JSON file with {values, labels} structure"),
      title: z.string().optional().describe("Chart title"),
      output_path: z.string().describe("Output PNG file path"),
      doughnut: z.boolean().optional().describe("Use doughnut style instead of pie"),
      colors: z.array(z.string()).optional().describe("Custom colors (hex)"),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  }
);

export const chart_histogram = tool(
  "Create a histogram from raw data and save as PNG. Use data_file to load data from a JSON file (format: {data: number[]}).",
  async ({
    data,
    data_file,
    bins,
    title,
    x_label,
    y_label,
    output_path,
    color,
    width,
    height,
  }: {
    data?: number[];
    data_file?: string;
    bins?: number;
    title?: string;
    x_label?: string;
    y_label?: string;
    output_path: string;
    color?: string;
    width?: number;
    height?: number;
  }) => {
    try {
      let chartData = data;

      // Load from file if provided
      if (data_file) {
        const fileContent = await fs.readFile(data_file, "utf8");
        const fileData = JSON.parse(fileContent);
        chartData = fileData.data || chartData;
      }

      if (!chartData || chartData.length === 0) {
        throw new Error("Must provide data array, either inline or via data_file");
      }

      const numBins = bins || Math.ceil(Math.sqrt(chartData.length));
      const min = Math.min(...chartData);
      const max = Math.max(...chartData);
      const binWidth = (max - min) / numBins;

      // Create histogram bins
      const histogram: number[] = new Array(numBins).fill(0);
      const binLabels: string[] = [];

      for (let i = 0; i < numBins; i++) {
        const binStart = min + i * binWidth;
        const binEnd = binStart + binWidth;
        binLabels.push(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}`);
      }

      for (const value of chartData) {
        const binIndex = Math.min(Math.floor((value - min) / binWidth), numBins - 1);
        histogram[binIndex]++;
      }

      const chart = await getChartRenderer(width || 800, height || 600);

      const config = {
        type: "bar" as const,
        data: {
          labels: binLabels,
          datasets: [{
            label: "Frequency",
            data: histogram,
            backgroundColor: color || "#2563eb",
          }],
        },
        options: {
          responsive: false,
          plugins: {
            title: { display: !!title, text: title },
            legend: { display: false },
          },
          scales: {
            x: { title: { display: !!x_label, text: x_label || "Value" } },
            y: { title: { display: true, text: y_label || "Frequency" } },
          },
        },
      };

      const buffer = await chart.renderToBuffer(config);
      const outputDir = path.dirname(output_path);
      if (outputDir && outputDir !== '.') {
        await fs.mkdir(outputDir, { recursive: true });
      }
      await fs.writeFile(output_path, buffer);

      return JSON.stringify({
        status: "success",
        output_path,
        data_points: chartData.length,
        bins: numBins,
        bin_width: binWidth,
        histogram,
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "chart_histogram",
    zodSchema: z.object({
      data: z.array(z.number()).optional().describe("Raw data values (or use data_file)"),
      data_file: z.string().optional().describe("Path to JSON file with {data} array"),
      bins: z.number().int().positive().optional().describe("Number of bins (default: sqrt(n))"),
      title: z.string().optional().describe("Chart title"),
      x_label: z.string().optional().describe("X-axis label"),
      y_label: z.string().optional().describe("Y-axis label"),
      output_path: z.string().describe("Output PNG file path"),
      color: z.string().optional().describe("Bar color (hex)"),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  }
);

// ============================================================================
// Text Analysis Tools
// ============================================================================

export const text_sentiment = tool(
  "Analyze sentiment of text. Returns polarity score and classification.",
  async ({ text }: { text: string }) => {
    try {
      const Sentiment = (await import("sentiment")).default;
      const sentiment = new Sentiment();
      const result = sentiment.analyze(text);

      let classification = "neutral";
      if (result.comparative > 0.1) classification = "positive";
      else if (result.comparative < -0.1) classification = "negative";

      return JSON.stringify({
        status: "success",
        score: result.score,
        comparative: result.comparative,
        classification,
        positive_words: result.positive,
        negative_words: result.negative,
        word_count: result.tokens.length,
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "text_sentiment",
    zodSchema: z.object({
      text: z.string().describe("Text to analyze"),
    }),
  }
);

export const text_frequency = tool(
  "Count word frequencies in text. Returns top N most common words.",
  async ({ text, top_n, exclude_stopwords }: { text: string; top_n?: number; exclude_stopwords?: boolean }) => {
    try {
      const stopwords = new Set([
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
        "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "must", "shall", "can", "need", "it", "its",
        "this", "that", "these", "those", "i", "you", "he", "she", "we", "they",
        "what", "which", "who", "whom", "when", "where", "why", "how", "all",
        "each", "every", "both", "few", "more", "most", "other", "some", "such",
        "no", "not", "only", "same", "so", "than", "too", "very", "just", "also",
      ]);

      // Tokenize and clean
      const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 1);

      // Count frequencies
      const freq: Record<string, number> = {};
      for (const word of words) {
        if (exclude_stopwords && stopwords.has(word)) continue;
        freq[word] = (freq[word] || 0) + 1;
      }

      // Sort by frequency
      const sorted = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, top_n || 20);

      return JSON.stringify({
        status: "success",
        total_words: words.length,
        unique_words: Object.keys(freq).length,
        top_words: sorted.map(([word, count]) => ({
          word,
          count,
          percent: ((count / words.length) * 100).toFixed(2) + "%",
        })),
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "text_frequency",
    zodSchema: z.object({
      text: z.string().describe("Text to analyze"),
      top_n: z.number().int().positive().optional().describe("Number of top words to return (default: 20)"),
      exclude_stopwords: z.boolean().optional().describe("Exclude common stopwords"),
    }),
  }
);
