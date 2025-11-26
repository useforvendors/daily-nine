// netlify/functions/daily-articles.js
const Parser = require('rss-parser');
const parser = new Parser();

// Curated sources for high-quality long-form essays
const FEEDS = [
  'https://aeon.co/feed.rss',
  'https://www.theparisreview.org/blog/feed/',
  'https://nautil.us/feed/',
  'https://lithub.com/category/craftandcriticism/craft-and-advice/feed/',
  'https://www.lrb.co.uk/feeds/lrb'
];

// Enhanced scoring function focused on essay quality
function scoreArticle(article) {
  let score = 0;
  const title = article.title.toLowerCase();
  const content = (article.contentSnippet || '').toLowerCase();
  const fullText = title + ' ' + content;
  
  // FILTER OUT: Gift guides, weekly updates, listicles, non-essay content
  const excludePatterns = [
    'gift guide', 'gifts for', 'gift ideas',
    'weekly update', 'this week', 'week in',
    'roundup', 'round-up', 'recap',
    '10 things', '5 ways', 'best of', 'top 10', 'top 5',
    'listicle', 'must-read', 'must read',
    'trending', 'viral', 'hot take',
    'sponsored', 'partner content',
    'newsletter', 'briefing',
    'podcast', 'video', 'watch'
  ];
  
  const hasExcludedPattern = excludePatterns.some(pattern => title.includes(pattern));
  if (hasExcludedPattern) return -1000;
  
  // Exclude titles with exclamation marks
  if (title.includes('!')) return -1000;
  
  // Exclude very short titles (likely news headlines)
  if (article.title.length < 30) return -500;
  
  // 1. Recency score (0-30 points)
  const ageInHours = (Date.now() - article.pubDate.getTime()) / (1000 * 60 * 60);
  if (ageInHours < 24) score += 30;
  else if (ageInHours < 72) score += 25;
  else if (ageInHours < 168) score += 20;
  else if (ageInHours < 336) score += 15;
  else if (ageInHours < 720) score += 10;
  
  // 2. Essay indicators (0-50 points) - heavily weighted
  const essayWords = ['essay', 'reflection', 'meditation', 'contemplation', 'exploration', 'examination', 'perspective', 'thoughts on', 'thinking about', 'consider', 'reconsidering'];
  const essayCount = essayWords.filter(word => fullText.includes(word)).length;
  score += Math.min(essayCount * 12, 35);
  
  const longformWords = ['deep dive', 'in-depth', 'long read', 'comprehensive', 'understanding', 'meaning of', 'nature of'];
  const longformCount = longformWords.filter(phrase => fullText.includes(phrase)).length;
  score += Math.min(longformCount * 10, 15);
  
  // 3. Title quality (0-30 points)
  // Ideal length for thoughtful essays
  if (article.title.length >= 40 && article.title.length <= 120) score += 15;
  
  const clickbaitWords = ['shocking', 'unbelievable', 'you won\'t believe', 'this one trick', 'breaking', 'just in', 'developing'];
  const hasClickbait = clickbaitWords.some(word => title.includes(word));
  if (hasClickbait) score -= 30;
  
  const qualityWords = ['how', 'why', 'what if', 'understanding', 'rethinking', 'reimagining', 'reconsidering', 'beyond', 'after'];
  const qualityWordCount = qualityWords.filter(word => title.includes(word)).length;
  score += Math.min(qualityWordCount * 5, 10);
  
  // Colon titles are common in essays
  if (title.includes(':')) score += 5;
  
  // 4. Depth indicators (0-20 points)
  const depthWords = ['revolution', 'transformation', 'evolution', 'crisis', 'future of', 'history of', 'meaning of', 'nature of', 'question of', 'problem of'];
  const depthCount = depthWords.filter(word => fullText.includes(word)).length;
  score += Math.min(depthCount * 10, 20);
  
  return score;
}

async function fetchAllArticles() {
  const allArticles = [];

  for (const feedUrl of FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const articles = feed.items.slice(0, 30).map(item => ({
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

  return allArticles;
}

exports.handler = async function(event, context) {
  try {
    // Fetch all articles from all sources
    const allArticles = await fetchAllArticles();
    
    // Score all articles
    const scoredArticles = allArticles.map(article => ({
      ...article,
      score: scoreArticle(article)
    }));

    // Filter out excluded articles (score < 0)
    const validArticles = scoredArticles.filter(article => article.score > 0);

    // Sort by score
    validArticles.sort((a, b) => b.score - a.score);

    // Ensure source diversity - try to get variety
    const selectedArticles = [];
    const usedSources = new Set();
    
    // First pass: get top articles from different sources
    for (const article of validArticles) {
      if (selectedArticles.length >= 9) break;
      if (!usedSources.has(article.source) || selectedArticles.length >= 5) {
        selectedArticles.push({
          title: article.title,
          url: article.url
        });
        usedSources.add(article.source);
      }
    }
    
    // Second pass: fill remaining slots with best articles
    for (const article of validArticles) {
      if (selectedArticles.length >= 9) break;
      if (!selectedArticles.find(a => a.url === article.url)) {
        selectedArticles.push({
          title: article.title,
          url: article.url
        });
      }
    }

    // Return exactly 9 articles (or fewer if not enough available)
    const finalArticles = selectedArticles.slice(0, 9);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      },
      body: JSON.stringify(finalArticles)
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};