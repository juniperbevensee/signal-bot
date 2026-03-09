# Data Science Tools for Cantrip

Comprehensive data analysis, visualization, and NLP tools for Cantrip agents.

## Overview

The data science module provides tools for:
- **Statistics**: Summary statistics, correlation, regression, moving averages
- **Visualization**: Line charts, bar charts, scatter plots, pie charts, histograms
- **Text Analysis**: Sentiment analysis, frequency analysis, TF-IDF, keyword extraction
- **NLP**: Topic modeling, document similarity, text classification
- **Data Wrangling**: Format conversion, missing value handling, filtering, aggregation

All tools are designed to work efficiently with both in-memory data and file-based operations for large datasets.

## Installation

The data science tools are included in Cantrip with the following dependencies:
- `simple-statistics`: Statistical calculations
- `chart.js` + `chartjs-node-canvas`: Chart generation
- `natural`: NLP and text processing
- `sentiment`: Sentiment analysis

## Usage

```typescript
import { Agent, ChatLMStudio } from "cantrip";
import { dataScienceTools } from "cantrip/datascience";

const agent = new Agent({
  llm: new ChatLMStudio({ model: "openai/gpt-oss-20b" }),
  tools: dataScienceTools,
});

// Now the agent can perform data analysis
await agent.query("Calculate summary statistics for [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]");
await agent.query("Create a line chart of monthly sales and save to ./charts/sales.png");
await agent.query("Analyze sentiment of this customer review: The product works great!");
```

## Tool Categories

### Statistics Tools

#### `stats_summary`
Calculate comprehensive summary statistics for a dataset.

**Returns:** mean, median, std, variance, min, max, range, Q1, Q3, IQR, skewness

**Example:**
```typescript
await agent.query("Calculate summary statistics for [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]");
```

#### `stats_correlation`
Calculate Pearson correlation coefficient between two datasets.

**Example:**
```typescript
await agent.query("Calculate correlation between sales [100, 120, 130] and advertising [10, 15, 18]");
```

#### `stats_regression`
Perform linear regression with optional predictions.

**Returns:** slope, intercept, R², RMSE, equation

**Example:**
```typescript
await agent.query("Run linear regression on x=[1,2,3,4,5] y=[2,4,5,7,9] and predict for x=6,7,8");
```

#### `stats_moving_average`
Calculate simple or exponential moving averages for time series.

**Example:**
```typescript
await agent.query("Calculate 7-day moving average for daily prices");
```

### Chart Tools

All charts are saved as PNG files. Supports both inline data and loading from JSON files.

#### `chart_line`
Create line charts with single or multiple datasets.

**Example:**
```typescript
await agent.query("Create a line chart with two series: revenue [100,120,150] and costs [80,90,100], labels Q1-Q3, save to revenue.png");
```

#### `chart_bar`
Create vertical or horizontal bar charts.

**Example:**
```typescript
await agent.query("Create a bar chart of product sales: iPhone:1000, Samsung:800, Google:600");
```

#### `chart_scatter`
Create scatter plots with optional regression line.

**Example:**
```typescript
await agent.query("Create a scatter plot of height vs weight with regression line");
```

#### `chart_pie`
Create pie or doughnut charts.

**Example:**
```typescript
await agent.query("Create a pie chart of market share: Apple 30%, Samsung 25%, Others 45%");
```

#### `chart_histogram`
Create histograms from raw data.

**Example:**
```typescript
await agent.query("Create a histogram of test scores with 10 bins");
```

### Text Analysis & NLP Tools

#### `text_sentiment`
Analyze sentiment of text with polarity scoring.

**Returns:** score, comparative score, classification (positive/negative/neutral), positive/negative words

**Example:**
```typescript
await agent.query("Analyze sentiment: The product is amazing and works perfectly!");
```

#### `text_frequency`
Count word frequencies with optional stopword filtering.

**Example:**
```typescript
await agent.query("Find the top 10 most common words in this document, excluding stopwords");
```

#### `text_tfidf`
Calculate TF-IDF scores to identify important terms in documents.

**Example:**
```typescript
await agent.query("Calculate TF-IDF scores for these 3 customer reviews");
```

#### `text_keywords`
Extract keywords and keyphrases using multiple methods.

**Returns:** Keywords by frequency and TF-IDF, plus common bigrams

**Example:**
```typescript
await agent.query("Extract the top 10 keywords from this article");
```

#### `text_topics`
Extract topics from a collection of documents using TF-IDF clustering.

**Example:**
```typescript
await agent.query("Extract 5 topics from these 20 customer feedback messages");
```

#### `text_similarity`
Calculate similarity between documents using cosine similarity.

**Example:**
```typescript
await agent.query("Calculate similarity between these 3 product descriptions");
```

### Data Wrangling Tools

File-based tools for handling large datasets efficiently.

#### `convert_data_format`
Convert between CSV and JSON formats.

**Example:**
```typescript
await agent.query("Convert data.csv to JSON format");
```

#### `fill_missing_values`
Handle missing values using various strategies.

**Strategies:**
- `mean`: Fill with column mean
- `median`: Fill with column median
- `mode`: Fill with most common value
- `forward_fill`: Use previous value
- `backward_fill`: Use next value
- `constant`: Fill with specified value

**Example:**
```typescript
await agent.query("Fill missing values in data.csv using mean strategy");
```

#### `filter_data`
Filter rows by conditions and select/drop columns.

**Operators:** `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `not_contains`, `starts_with`, `ends_with`

**Example:**
```typescript
await agent.query("Filter data.csv where price > 100 and category contains 'electronics'");
```

#### `aggregate_data`
Group by columns and apply aggregation functions.

**Functions:** `sum`, `mean`, `count`, `min`, `max`, `first`, `last`

**Example:**
```typescript
await agent.query("Aggregate sales.csv by region, calculate sum of revenue and count of transactions");
```

## Best Practices

1. **Large Datasets**: Use `data_file` parameters to load data from files instead of passing large arrays inline.

2. **Chart Organization**: Create a dedicated charts directory for your visualizations.

3. **Data Pipeline**: Use the wrangling tools in sequence:
   ```
   CSV → filter → fill missing values → aggregate → convert to JSON → analyze
   ```

4. **NLP Workflows**: For text analysis:
   - Start with `text_sentiment` or `text_frequency` for quick insights
   - Use `text_keywords` and `text_tfidf` to identify important terms
   - Apply `text_topics` to large document collections
   - Use `text_similarity` to find related documents

5. **Memory Management**: For datasets >100 rows, results are automatically saved to files to avoid memory issues.

## Examples

See `examples/datascience-example.ts` for a complete interactive example.

## Selective Tool Import

You can import specific tool categories:

```typescript
import {
  statsTools,      // Statistics only
  chartTools,      // Charts only
  textTools,       // Text analysis + NLP
  nlpTools,        // NLP only
  dataWranglingTools // Data wrangling only
} from "cantrip/datascience";
```
