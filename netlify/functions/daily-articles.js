// netlify/functions/daily-articles.js
// This serverless function fetches articles from RSS feeds

const Parser = require('rss-parser');
const parser = new Parser();

// Free RSS feeds for each category
const FEEDS = {
  artsculture: [
    'https://www.theguardian.com/artanddesign/rss',
    'https://hyperallergic.com/feed/',
  ],
  literature: [
    'https://lithub.com/feed/',
    'https://www.theguardian.com/books/rss',
  ],
  philosophy: [
    'https://aeon.co/feed.rss',
    'https://dailynous.com/feed/',
  ],
  politics: [
    'https://www.theguardian.com/politics/rss',
    'https://foreignpolicy.com/feed/',
  ],
  science: [
    'https://www.sciencedaily.com/rss/all.xml',
    'https://www.theguardian.com/science/rss',
  ],
  society: [
    'https://www.theguardian.com/society/rss',
    'https://www.theatlantic.com/feed/channel/health/',
  ],
  sports: [
    'https://www.theguardian.com/sport/rss',
    'https://www.theatlantic.com/feed/channel/health/',
  ],
  technology: [
    'https://techcrunch.com/feed/',
    'https://www.theverge.com/rss/index.xml',
  ],
  theology: [
  'https://www.christianitytoday.com/ct.rss',
  'https://religionnews.com/feed/',
]

};

const GRADIENTS = {
  artsculture: "linear-gradient(135deg, #b71c1c 0%, #ff6b6b 100%)",
  literature: "linear-gradient(135deg, #e65100 0%, #ffb74d 100%)",
  philosophy: "linear-gradient(135deg, #f57f17 0%, #fff176 100%)",
  politics: "linear-gradient(135deg, #1b5e20 0%, #81c784 100%)",
  science: "linear-gradient(135deg, #01579b 0%, #4fc3f7 100%)",
  society: "linear-gradient(135deg, #4a148c 0%, #9c27b0 100%)",
  sports: "linear-gradient(135deg, #880e4f 0%, #f06292 100%)",
  technology: "linear-gradient(135deg, #1a237e 0%, #5c6bc0 100%)",
  theology: "linear-gradient(135deg, #880e4f 0%, #ec407a 100%)"
};

const CATEGORY_NAMES = {
  artsculture: "Arts & Culture",
  literature: "Literature",
  philosophy: "Philosophy",
  politics: "Politics",
  science: "Science",
  society: "Society",
  sports: "Sports",
  technology: "Technology",
  theology: "Theology"
};

// Quality scoring function
function scoreArticle(article, categoryKey) {
  let score = 0;
  
  // 1. Recency score (0-40 points)
  const ageInHours = (Date.now() - article.pubDate.getTime()) / (1000 * 60 * 60);
  if (ageInHours < 24) score += 40;
  else if (ageInHours < 48) score += 30;
  else if (ageInHours < 72) score += 20;
  else if (ageInHours < 168) score += 10; // Within a week
  
  // 2. Title quality (0-30 points)
  const title = article.title.toLowerCase();
  
  // Longer, substantive titles (50-120 chars ideal)
  if (article.title.length >= 50 && article.title.length <= 120) score += 10;
  
  // Avoid clickbait patterns
  const clickbaitWords = ['shocking', 'unbelievable', 'you won\'t believe', 'this one trick', 'hate him'];
  const hasClickbait = clickbaitWords.some(word => title.includes(word));
  if (hasClickbait) score -= 15;
  
  // Prefer analytical/thoughtful language
  const qualityWords = ['how', 'why', 'understanding', 'perspective', 'analysis', 'exploring', 'behind', 'future of'];
  const qualityWordCount = qualityWords.filter(word => title.includes(word)).length;
  score += Math.min(qualityWordCount * 5, 15);
  
  // Question titles tend to be engaging
  if (title.includes('?')) score += 5;
  
  // 3. Source diversity (0-15 points)
  // Prefer diversity across sources (handled in selection logic)
  
  // 4. Content depth indicators (0-15 points)
  const depthWords = ['revolution', 'transformation', 'evolution', 'rethinking', 'reimagining', 'unprecedented'];
  const hasDepth = depthWords.some(word => title.includes(word));
  if (hasDepth) score += 10;
  
  // Long-form indicators
  const longformWords = ['deep dive', 'comprehensive', 'complete guide', 'everything you need'];
  const isLongform = longformWords.some(phrase => title.includes(phrase));
  if (isLongform) score += 5;
  
  return score;
}

async function fetchArticlesForCategory(categoryKey) {
  const feeds = FEEDS[categoryKey];
  const allArticles = [];

  for (const feedUrl of feeds) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const articles = feed.items.slice(0, 10).map(item => ({
        title: item.title,
        url: item.link,
        pubDate: new Date(item.pubDate || item.isoDate),
        source: feedUrl,
        contentSnippet: item.contentSnippet || item.content || ''
      }));
      allArticles.push(...articles);
    } catch (error) {
      console.error(`Error fetching ${feedUrl}:`, error.message);
    }
  }

  // Score all articles
  const scoredArticles = allArticles.map(article => ({
    ...article,
    score: scoreArticle(article, categoryKey)
  }));

  // Sort by score (higher is better)
  scoredArticles.sort((a, b) => b.score - a.score);

  // Ensure source diversity in top picks
  const selectedArticles = [];
  const usedSources = new Set();
  
  // First pass: pick top articles from different sources
  for (const article of scoredArticles) {
    if (selectedArticles.length >= 9) break;
    if (!usedSources.has(article.source) || selectedArticles.length >= 6) {
      selectedArticles.push(article);
      usedSources.add(article.source);
    }
  }
  
  // Second pass: fill remaining slots with best remaining articles
  for (const article of scoredArticles) {
    if (selectedArticles.length >= 9) break;
    if (!selectedArticles.includes(article)) {
      selectedArticles.push(article);
    }
  }

  // Mark the highest scored one as featured
  return selectedArticles.slice(0, 9).map((article, index) => ({
    title: article.title,
    url: article.url,
    featured: index === 0
  }));
}

exports.handler = async function(event, context) {
  try {
    const data = {};

    // Fetch articles for all categories in parallel
    const categoryPromises = Object.keys(FEEDS).map(async (categoryKey) => {
      const articles = await fetchArticlesForCategory(categoryKey);
      data[categoryKey] = {
        name: CATEGORY_NAMES[categoryKey],
        gradient: GRADIENTS[categoryKey],
        articles: articles
      };
    });

    await Promise.all(categoryPromises);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};