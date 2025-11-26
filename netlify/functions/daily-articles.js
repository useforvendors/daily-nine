// netlify/functions/daily-articles.js
const Parser = require('rss-parser');
const parser = new Parser();

// Essay-focused RSS feeds for each category
const FEEDS = {
  artsculture: [
    'https://www.thisiscolossal.com/feed/',
    'https://hyperallergic.com/feed/',
    'https://www.themarginalian.org/feed/',
    'https://aeon.co/feed.rss',
    'https://www.theparisreview.org/blog/feed/',
  ],
  literature: [
    'https://lithub.com/feed/',
    'https://www.theparisreview.org/blog/feed/',
    'https://www.themarginalian.org/feed/',
    'https://believermag.com/feed/',
    'https://onbeing.org/series/poetry-unbound/feed/',
  ],
  philosophy: [
    'https://aeon.co/philosophy/rss',
    'https://www.philosophynow.org/rss/articles.xml',
    'https://thepointmag.com/feed/',
    'https://hedgehogreview.com/blog/feed',
  ],
  politics: [
    'https://www.foreignaffairs.com/rss.xml',
    'https://www.theatlantic.com/feed/channel/politics/',
    'https://jacobin.com/feed/',
    'https://www.bostonreview.net/feed/',
    'https://www.dissentmagazine.org/feed',
    'https://time.com/feed/',
  ],
  science: [
    'https://www.quantamagazine.org/feed/',
    'https://nautil.us/feed/',
    'https://aeon.co/science/rss',
    'https://undark.org/feed/',
    'https://time.com/feed/',
  ],
  society: [
    'https://www.theatlantic.com/feed/all/',
    'https://www.newyorker.com/feed/everything',
    'https://www.bostonreview.net/feed/',
    'https://aeon.co/society/rss',
    'https://longreads.com/feed/',
    'https://time.com/feed/',
  ],
  sports: [
    'https://www.theringer.com/rss/index.xml',
    'https://www.sbnation.com/rss/current',
  ],
  technology: [
    'https://www.wired.com/feed/rss',
    'https://www.theverge.com/rss/index.xml',
    'https://restofworld.org/feed/latest/',
    'https://www.technologyreview.com/feed/',
    'https://time.com/feed/',
  ],
  theology: [
    'https://onbeing.org/series/podcast/feed/',
    'https://www.faith-theology.com/feeds/posts/default',
    'https://experimentaltheology.blogspot.com/feeds/posts/default',
    'https://afkimel.wordpress.com/feed/',
    'https://theotherjournal.com/feed/',
    'https://sojo.net/feeds/magazine.rss',
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

// Category-specific keywords for better matching
const CATEGORY_KEYWORDS = {
  artsculture: ['art', 'artist', 'gallery', 'museum', 'painting', 'sculpture', 'design', 'exhibition', 'culture', 'creative', 'visual', 'aesthetic', 'craft'],
  literature: ['book', 'author', 'novel', 'poetry', 'poem', 'writer', 'writing', 'literary', 'fiction', 'narrative', 'story', 'prose', 'verse'],
  philosophy: ['philosophy', 'philosophical', 'ethics', 'moral', 'metaphysics', 'epistemology', 'logic', 'existence', 'consciousness', 'reason', 'truth', 'knowledge'],
  politics: ['politics', 'political', 'policy', 'government', 'election', 'democracy', 'legislation', 'congress', 'parliament', 'vote', 'campaign', 'diplomatic'],
  science: ['science', 'scientific', 'research', 'study', 'biology', 'physics', 'chemistry', 'astronomy', 'evolution', 'experiment', 'discovery', 'theory'],
  society: ['society', 'social', 'community', 'culture', 'inequality', 'justice', 'economic', 'education', 'health', 'family', 'identity', 'class'],
  sports: ['sport', 'athlete', 'game', 'team', 'player', 'championship', 'olympic', 'coach', 'competition', 'football', 'basketball', 'baseball', 'soccer'],
  technology: ['technology', 'tech', 'software', 'hardware', 'digital', 'internet', 'computer', 'ai', 'artificial intelligence', 'robot', 'algorithm', 'data'],
  theology: ['god', 'faith', 'religion', 'theology', 'church', 'spiritual', 'belief', 'christian', 'biblical', 'sacred', 'divine', 'prayer', 'scripture']
};

// Simple in-memory cache for the current session
// This won't persist across function invocations, but that's okay - 
// the key goal is preventing duplicates within the same day/request
let sessionHistory = {
  articles: [],
  lastUpdated: null
};

// Enhanced scoring function for essays
function scoreArticle(article, categoryKey) {
  let score = 0;
  const title = article.title.toLowerCase();
  const content = (article.contentSnippet || '').toLowerCase();
  const fullText = title + ' ' + content;
  
  // 1. Recency score (0-30 points)
  const ageInHours = (Date.now() - article.pubDate.getTime()) / (1000 * 60 * 60);
  if (ageInHours < 24) score += 30;
  else if (ageInHours < 72) score += 25;
  else if (ageInHours < 168) score += 20;
  else if (ageInHours < 336) score += 15;
  else if (ageInHours < 720) score += 10;
  
  // 2. Essay indicators (0-40 points)
  const essayWords = ['essay', 'reflection', 'meditation', 'contemplation', 'exploration', 'examination', 'perspective', 'thoughts on', 'thinking about'];
  const essayCount = essayWords.filter(word => fullText.includes(word)).length;
  score += Math.min(essayCount * 10, 25);
  
  const longformWords = ['deep dive', 'in-depth', 'long read', 'comprehensive', 'complete guide', 'everything you need', 'understanding'];
  const longformCount = longformWords.filter(phrase => fullText.includes(phrase)).length;
  score += Math.min(longformCount * 8, 15);
  
  // 3. Category relevance (0-40 points)
  const categoryWords = CATEGORY_KEYWORDS[categoryKey];
  const matchCount = categoryWords.filter(word => fullText.includes(word)).length;
  score += Math.min(matchCount * 5, 40);
  
  // 4. Title quality (0-25 points)
  if (article.title.length >= 40 && article.title.length <= 150) score += 10;
  
  const clickbaitWords = ['shocking', 'unbelievable', 'you won\'t believe', 'this one trick', 'breaking', 'just in', 'developing'];
  const hasClickbait = clickbaitWords.some(word => title.includes(word));
  if (hasClickbait) score -= 25;
  
  const qualityWords = ['how', 'why', 'what if', 'understanding', 'rethinking', 'reimagining', 'reconsidering', 'beyond'];
  const qualityWordCount = qualityWords.filter(word => title.includes(word)).length;
  score += Math.min(qualityWordCount * 5, 10);
  
  if (title.includes(':')) score += 5;
  
  // 5. Depth indicators (0-15 points)
  const depthWords = ['revolution', 'transformation', 'evolution', 'crisis', 'future of', 'history of', 'meaning of', 'nature of'];
  const hasDepth = depthWords.some(word => fullText.includes(word));
  if (hasDepth) score += 15;
  
  return score;
}

async function fetchArticlesForCategory(categoryKey, usedUrls) {
  const feeds = FEEDS[categoryKey];
  const allArticles = [];

  for (const feedUrl of feeds) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const articles = feed.items.slice(0, 20).map(item => ({
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

  // Filter out articles already used in other categories today
  const availableArticles = allArticles.filter(article => !usedUrls.has(article.url));

  // Score all available articles
  const scoredArticles = availableArticles.map(article => ({
    ...article,
    score: scoreArticle(article, categoryKey)
  }));

  // Sort by score
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
      usedUrls.add(article.url);
    }
  }
  
  // Second pass: fill remaining slots
  for (const article of scoredArticles) {
    if (selectedArticles.length >= 9) break;
    if (!selectedArticles.includes(article)) {
      selectedArticles.push(article);
      usedUrls.add(article.url);
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
    const usedUrls = new Set(); // Track URLs used across categories today

    // Fetch articles for all categories sequentially to prevent duplicates
    for (const categoryKey of Object.keys(FEEDS)) {
      const articles = await fetchArticlesForCategory(categoryKey, usedUrls);
      data[categoryKey] = {
        name: CATEGORY_NAMES[categoryKey],
        gradient: GRADIENTS[categoryKey],
        articles: articles
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};