import { tool } from "../../agent/tools";
import { z } from "zod";
import { readFile } from "fs/promises";

// ============================================================================
// Topic Modeling & Advanced Text Analysis Tools
// ============================================================================

/**
 * TF-IDF (Term Frequency-Inverse Document Frequency)
 * Finds the most important/distinctive terms in a document or corpus.
 */
export const text_tfidf = tool(
  "Calculate TF-IDF scores for documents. Identifies important/distinctive terms. Pass single text or array of documents.",
  async ({ texts, top_n, min_term_length }: { texts: string | string[]; top_n?: number; min_term_length?: number }) => {
    try {
      const natural = (await import("natural")).default;
      const TfIdf = natural.TfIdf;

      const documents = Array.isArray(texts) ? texts : [texts];
      const tfidf = new TfIdf();

      // Add all documents
      documents.forEach(doc => tfidf.addDocument(doc));

      const results = documents.map((_, docIndex) => {
        const terms: Array<{ term: string; score: number }> = [];

        tfidf.listTerms(docIndex).forEach((item: any) => {
          if (!min_term_length || item.term.length >= min_term_length) {
            terms.push({ term: item.term, score: item.tfidf });
          }
        });

        // Sort by score and take top N
        const topTerms = terms
          .sort((a, b) => b.score - a.score)
          .slice(0, top_n || 20);

        return {
          document_index: docIndex,
          document_preview: documents[docIndex].substring(0, 100) + "...",
          top_terms: topTerms,
        };
      });

      return JSON.stringify({
        status: "success",
        document_count: documents.length,
        results,
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "text_tfidf",
    zodSchema: z.object({
      texts: z.union([z.string(), z.array(z.string())]).describe("Single document or array of documents to analyze"),
      top_n: z.number().int().positive().optional().describe("Number of top terms to return per document (default: 20)"),
      min_term_length: z.number().int().positive().optional().describe("Minimum term length to include (default: 3)"),
    }),
  }
);

/**
 * Extract keywords/keyphrases from text using various methods.
 */
export const text_keywords = tool(
  "Extract important keywords and keyphrases from text. Uses multiple extraction methods.",
  async ({ text, max_keywords, method }: { text: string; max_keywords?: number; method?: string }) => {
    try {
      const natural = (await import("natural")).default;
      const tokenizer = new natural.WordTokenizer();
      const TfIdf = natural.TfIdf;

      // Tokenize
      const tokens = tokenizer.tokenize(text.toLowerCase()) || [];

      // Remove common stopwords
      const stopwords = new Set([
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
        "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "must", "shall", "can", "this", "that", "these",
        "those", "i", "you", "he", "she", "we", "they", "it", "its"
      ]);

      const filtered = tokens.filter(t =>
        t.length > 2 &&
        !stopwords.has(t) &&
        /^[a-z]+$/.test(t)
      );

      // Method 1: Frequency-based
      const freqMap: Record<string, number> = {};
      filtered.forEach(token => {
        freqMap[token] = (freqMap[token] || 0) + 1;
      });

      const freqKeywords = Object.entries(freqMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, max_keywords || 10)
        .map(([word, count]) => ({ keyword: word, score: count, method: "frequency" }));

      // Method 2: TF-IDF (treating as single document)
      const tfidf = new TfIdf();
      tfidf.addDocument(text);

      const tfidfKeywords: Array<{ keyword: string; score: number; method: string }> = [];
      tfidf.listTerms(0).forEach((item: any) => {
        if (item.term.length > 2 && !stopwords.has(item.term)) {
          tfidfKeywords.push({
            keyword: item.term,
            score: item.tfidf,
            method: "tfidf"
          });
        }
      });

      const topTfidf = tfidfKeywords
        .sort((a, b) => b.score - a.score)
        .slice(0, max_keywords || 10);

      // Method 3: Find bigrams (two-word phrases)
      const bigrams: Record<string, number> = {};
      for (let i = 0; i < filtered.length - 1; i++) {
        const bigram = `${filtered[i]} ${filtered[i + 1]}`;
        bigrams[bigram] = (bigrams[bigram] || 0) + 1;
      }

      const topBigrams = Object.entries(bigrams)
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.floor((max_keywords || 10) / 2))
        .map(([phrase, count]) => ({ phrase, count }));

      return JSON.stringify({
        status: "success",
        text_length: text.length,
        word_count: tokens.length,
        unique_words: Object.keys(freqMap).length,
        keywords_frequency: freqKeywords,
        keywords_tfidf: topTfidf,
        key_phrases: topBigrams,
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "text_keywords",
    zodSchema: z.object({
      text: z.string().describe("Text to extract keywords from"),
      max_keywords: z.number().int().positive().optional().describe("Maximum keywords to return (default: 10)"),
      method: z.enum(["frequency", "tfidf", "both"]).optional().describe("Extraction method (default: both)"),
    }),
  }
);

/**
 * Topic extraction from multiple documents using TF-IDF clustering.
 */
export const text_topics = tool(
  "Extract topics from a collection of documents. Groups related terms into topics using TF-IDF.",
  async ({ documents, num_topics, terms_per_topic }: { documents: string[]; num_topics?: number; terms_per_topic?: number }) => {
    try {
      if (documents.length < 2) {
        return JSON.stringify({
          error: "Need at least 2 documents for topic extraction"
        });
      }

      const natural = (await import("natural")).default;
      const TfIdf = natural.TfIdf;
      const tfidf = new TfIdf();

      // Add all documents
      documents.forEach(doc => tfidf.addDocument(doc));

      // Get top terms for each document
      const docTerms = documents.map((_, docIndex) => {
        const terms: Array<{ term: string; score: number }> = [];
        tfidf.listTerms(docIndex).forEach((item: any) => {
          if (item.term.length > 2) {
            terms.push({ term: item.term, score: item.tfidf });
          }
        });
        return terms.sort((a, b) => b.score - a.score).slice(0, 50);
      });

      // Aggregate term scores across all documents
      const globalTermScores: Record<string, number[]> = {};
      docTerms.forEach(terms => {
        terms.forEach(({ term, score }) => {
          if (!globalTermScores[term]) {
            globalTermScores[term] = [];
          }
          globalTermScores[term].push(score);
        });
      });

      // Calculate aggregate metrics for each term
      const termMetrics = Object.entries(globalTermScores).map(([term, scores]) => {
        const sum = scores.reduce((a, b) => a + b, 0);
        const avg = sum / scores.length;
        const max = Math.max(...scores);
        const docFreq = scores.length; // How many docs contain this term

        return {
          term,
          avg_score: avg,
          max_score: max,
          doc_frequency: docFreq,
          total_score: sum,
        };
      });

      // Sort by a combination of metrics to find important terms
      const importantTerms = termMetrics
        .sort((a, b) => {
          // Weight by both average score and document frequency
          const scoreA = a.avg_score * Math.log(1 + a.doc_frequency);
          const scoreB = b.avg_score * Math.log(1 + b.doc_frequency);
          return scoreB - scoreA;
        });

      // Create topics by grouping similar terms
      const topicsCount = Math.min(num_topics || 5, Math.floor(documents.length / 2));
      const termsPerTopic = terms_per_topic || 10;

      const topics = [];
      const termsPerTopicCalc = Math.ceil(importantTerms.length / topicsCount);

      for (let i = 0; i < topicsCount; i++) {
        const start = i * termsPerTopicCalc;
        const topicTerms = importantTerms
          .slice(start, start + termsPerTopicCalc)
          .slice(0, termsPerTopic)
          .map(t => ({
            term: t.term,
            score: parseFloat(t.avg_score.toFixed(3)),
            doc_freq: t.doc_frequency,
          }));

        if (topicTerms.length > 0) {
          topics.push({
            topic_id: i,
            label: topicTerms.slice(0, 3).map(t => t.term).join(", "),
            terms: topicTerms,
          });
        }
      }

      return JSON.stringify({
        status: "success",
        document_count: documents.length,
        total_unique_terms: Object.keys(globalTermScores).length,
        topics,
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "text_topics",
    zodSchema: z.object({
      documents: z.array(z.string()).describe("Array of documents to extract topics from"),
      num_topics: z.number().int().positive().optional().describe("Number of topics to extract (default: 5)"),
      terms_per_topic: z.number().int().positive().optional().describe("Number of terms per topic (default: 10)"),
    }),
  }
);

/**
 * Calculate similarity between documents using cosine similarity.
 */
export const text_similarity = tool(
  "Calculate similarity between documents using TF-IDF and cosine similarity. Returns similarity matrix.",
  async ({ documents, threshold }: { documents: string[]; threshold?: number }) => {
    try {
      if (documents.length < 2) {
        return JSON.stringify({
          error: "Need at least 2 documents to calculate similarity"
        });
      }

      const natural = (await import("natural")).default;
      const TfIdf = natural.TfIdf;
      const tfidf = new TfIdf();

      // Add all documents
      documents.forEach(doc => tfidf.addDocument(doc));

      // Build TF-IDF vectors for each document
      const vectors: Record<string, number>[] = documents.map((_, docIndex) => {
        const vector: Record<string, number> = {};
        tfidf.listTerms(docIndex).forEach((item: any) => {
          vector[item.term] = item.tfidf;
        });
        return vector;
      });

      // Calculate cosine similarity between all pairs
      const similarity: number[][] = [];
      const pairs: Array<{ doc1: number; doc2: number; similarity: number }> = [];

      for (let i = 0; i < documents.length; i++) {
        similarity[i] = [];
        for (let j = 0; j < documents.length; j++) {
          if (i === j) {
            similarity[i][j] = 1.0;
          } else if (j < i) {
            similarity[i][j] = similarity[j][i]; // Use already calculated value
          } else {
            const sim = cosineSimilarity(vectors[i], vectors[j]);
            similarity[i][j] = sim;

            if (threshold === undefined || sim >= threshold) {
              pairs.push({
                doc1: i,
                doc2: j,
                similarity: parseFloat(sim.toFixed(4)),
              });
            }
          }
        }
      }

      // Sort pairs by similarity
      pairs.sort((a, b) => b.similarity - a.similarity);

      return JSON.stringify({
        status: "success",
        document_count: documents.length,
        similarity_matrix: similarity.map(row =>
          row.map(val => parseFloat(val.toFixed(4)))
        ),
        similar_pairs: pairs.slice(0, 20), // Top 20 most similar pairs
        threshold_pairs: threshold ? pairs.filter(p => p.similarity >= threshold).length : undefined,
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "text_similarity",
    zodSchema: z.object({
      documents: z.array(z.string()).describe("Array of documents to compare"),
      threshold: z.number().min(0).max(1).optional().describe("Similarity threshold (0-1) for filtering pairs"),
    }),
  }
);

/**
 * Calculate cosine similarity between two TF-IDF vectors
 */
function cosineSimilarity(vec1: Record<string, number>, vec2: Record<string, number>): number {
  const terms = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);

  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  terms.forEach(term => {
    const val1 = vec1[term] || 0;
    const val2 = vec2[term] || 0;

    dotProduct += val1 * val2;
    mag1 += val1 * val1;
    mag2 += val2 * val2;
  });

  if (mag1 === 0 || mag2 === 0) return 0;

  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

/**
 * Classify text into predefined categories using simple keyword matching.
 */
export const text_classify = tool(
  "Classify text into predefined categories based on keyword matching and scoring.",
  async ({ text, categories }: { text: string; categories: Record<string, string[]> }) => {
    try {
      const natural = (await import("natural")).default;
      const tokenizer = new natural.WordTokenizer();
      const tokens = new Set(
        (tokenizer.tokenize(text.toLowerCase()) || [])
          .filter(t => t.length > 2)
      );

      const scores: Array<{ category: string; score: number; matches: string[] }> = [];

      Object.entries(categories).forEach(([category, keywords]) => {
        const matches: string[] = [];
        let score = 0;

        keywords.forEach(keyword => {
          const kw = keyword.toLowerCase();
          if (tokens.has(kw)) {
            matches.push(keyword);
            score += 1;
          } else if (text.toLowerCase().includes(kw)) {
            // Partial match (less weight)
            matches.push(`~${keyword}`);
            score += 0.5;
          }
        });

        if (score > 0) {
          scores.push({ category, score, matches });
        }
      });

      scores.sort((a, b) => b.score - a.score);

      return JSON.stringify({
        status: "success",
        text_length: text.length,
        predicted_category: scores[0]?.category || "unclassified",
        confidence: scores[0] ? scores[0].score / scores.reduce((sum, s) => sum + s.score, 0) : 0,
        all_scores: scores,
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "text_classify",
    zodSchema: z.object({
      text: z.string().describe("Text to classify"),
      categories: z.record(z.array(z.string())).describe("Categories with keyword lists, e.g., {tech: ['software', 'code'], sports: ['game', 'team']}"),
    }),
  }
);

// ============================================================================
// File-Based Variants (for large datasets from OpenMeasures, Loria, etc.)
// ============================================================================

/**
 * Analyze sentiment of text in a JSON file containing an array of objects with 'text' field.
 * Use this after om_search_content saves results >100 to a file.
 */
export const analyze_sentiment_from_file = tool(
  "Analyze sentiment (positive/negative/neutral) of texts stored in a JSON file. Expects array of objects with 'text' field. Use this for large result sets from social media searches.",
  async ({
    file_path,
    text_field,
    sample_size
  }: {
    file_path: string;
    text_field?: string;
    sample_size?: number;
  }) => {
    try {
      const natural = (await import("natural")).default;
      const Analyzer = natural.SentimentAnalyzer;
      const stemmer = natural.PorterStemmer;
      const analyzer = new Analyzer("English", stemmer, "afinn");

      // Read file
      const content = await readFile(file_path, 'utf-8');
      let data = JSON.parse(content);

      // Ensure it's an array
      if (!Array.isArray(data)) {
        throw new Error("File must contain a JSON array");
      }

      const fieldName = text_field || 'text';

      // Sample if dataset is very large
      if (sample_size && data.length > sample_size) {
        // Random sampling
        const sampled = [];
        const step = Math.floor(data.length / sample_size);
        for (let i = 0; i < data.length; i += step) {
          sampled.push(data[i]);
        }
        data = sampled.slice(0, sample_size);
      }

      // Analyze sentiment for each item
      const results = data.map((item, index) => {
        const text = item[fieldName];
        if (!text || typeof text !== 'string') {
          return null;
        }

        const tokenizer = new natural.WordTokenizer();
        const tokens = tokenizer.tokenize(text.toLowerCase()) || [];
        const score = analyzer.getSentiment(tokens);

        // Classify sentiment
        let sentiment = 'neutral';
        if (score > 0.1) sentiment = 'positive';
        else if (score < -0.1) sentiment = 'negative';

        return {
          index,
          id: item.id,
          sentiment,
          score: parseFloat(score.toFixed(3)),
          text_preview: text.slice(0, 100),
        };
      }).filter(r => r !== null);

      // Calculate aggregates
      const positive = results.filter(r => r!.sentiment === 'positive').length;
      const negative = results.filter(r => r!.sentiment === 'negative').length;
      const neutral = results.filter(r => r!.sentiment === 'neutral').length;
      const avgScore = results.reduce((sum, r) => sum + r!.score, 0) / results.length;

      return JSON.stringify({
        status: "success",
        file: file_path,
        total_analyzed: results.length,
        sentiment_distribution: {
          positive,
          negative,
          neutral,
          positive_pct: ((positive / results.length) * 100).toFixed(1),
          negative_pct: ((negative / results.length) * 100).toFixed(1),
          neutral_pct: ((neutral / results.length) * 100).toFixed(1),
        },
        average_score: parseFloat(avgScore.toFixed(3)),
        sample_results: results.slice(0, 10), // Show first 10
        most_positive: results.sort((a, b) => b!.score - a!.score).slice(0, 3),
        most_negative: results.sort((a, b) => a!.score - b!.score).slice(0, 3),
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "analyze_sentiment_from_file",
    zodSchema: z.object({
      file_path: z.string().describe("Path to JSON file containing array of objects"),
      text_field: z.string().optional().describe("Name of the text field to analyze (default: 'text')"),
      sample_size: z.number().int().positive().optional().describe("Sample size for very large files (default: analyze all)"),
    }),
  }
);

/**
 * Extract keywords from documents in a JSON file.
 */
export const extract_keywords_from_file = tool(
  "Extract important keywords from texts stored in a JSON file. Use this for analyzing large social media result sets.",
  async ({
    file_path,
    text_field,
    max_keywords,
    sample_size
  }: {
    file_path: string;
    text_field?: string;
    max_keywords?: number;
    sample_size?: number;
  }) => {
    try {
      const natural = (await import("natural")).default;
      const TfIdf = natural.TfIdf;
      const tfidf = new TfIdf();

      // Read file
      const content = await readFile(file_path, 'utf-8');
      let data = JSON.parse(content);

      if (!Array.isArray(data)) {
        throw new Error("File must contain a JSON array");
      }

      const fieldName = text_field || 'text';

      // Sample if needed
      if (sample_size && data.length > sample_size) {
        const step = Math.floor(data.length / sample_size);
        const sampled = [];
        for (let i = 0; i < data.length; i += step) {
          sampled.push(data[i]);
        }
        data = sampled.slice(0, sample_size);
      }

      // Concatenate all texts
      const allTexts = data
        .map(item => item[fieldName])
        .filter(text => text && typeof text === 'string')
        .join(' ');

      if (!allTexts) {
        throw new Error("No text content found in file");
      }

      // Add as single document
      tfidf.addDocument(allTexts);

      // Extract top keywords
      const stopwords = new Set([
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
        "be", "have", "has", "had", "do", "does", "did", "will", "would", "could"
      ]);

      const keywords: Array<{ keyword: string; score: number }> = [];
      tfidf.listTerms(0).forEach((item: any) => {
        if (item.term.length > 2 && !stopwords.has(item.term)) {
          keywords.push({ keyword: item.term, score: item.tfidf });
        }
      });

      const topKeywords = keywords
        .sort((a, b) => b.score - a.score)
        .slice(0, max_keywords || 20);

      return JSON.stringify({
        status: "success",
        file: file_path,
        total_documents: data.length,
        total_text_length: allTexts.length,
        top_keywords: topKeywords,
      }, null, 2);
    } catch (error: any) {
      throw error;
    }
  },
  {
    name: "extract_keywords_from_file",
    zodSchema: z.object({
      file_path: z.string().describe("Path to JSON file containing array of objects"),
      text_field: z.string().optional().describe("Name of the text field (default: 'text')"),
      max_keywords: z.number().int().positive().optional().describe("Number of keywords to extract (default: 20)"),
      sample_size: z.number().int().positive().optional().describe("Sample size for very large files (default: use all)"),
    }),
  }
);
