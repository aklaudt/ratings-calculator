const cheerio = require('cheerio');

const BASE_URL = 'https://www.pdga.com';
const TOUR_TIERS = new Set(['ES', 'M', 'NT']);
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://www.pdga.com/'
};

async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      redirect: 'follow'
    });

    if (!response.ok) {
      const err = new Error(`PDGA returned ${response.status}`);
      err.status = response.status === 404 ? 404 : 502;
      throw err;
    }

    return response.text();
  } catch (err) {
    if (err.message.includes('timeout')) {
      throw new Error('Request to PDGA timed out');
    }
    throw err;
  }
}

exports.handler = async function(event, context) {
  const pdgaNumber = event.queryStringParameters?.pdga;
  const debug = event.queryStringParameters?.debug === '1';

  if (!pdgaNumber || !/^\d{1,7}$/.test(pdgaNumber)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid or missing PDGA number' })
    };
  }

  try {
    console.log(`Fetching data for player ${pdgaNumber}`);

    const [profileHtml, detailsHtml] = await Promise.all([
      fetchPage(`${BASE_URL}/player/${pdgaNumber}`),
      fetchPage(`${BASE_URL}/player/${pdgaNumber}/details`)
    ]);

    console.log(`Got profile HTML: ${profileHtml.length} bytes`);
    console.log(`Got details HTML: ${detailsHtml.length} bytes`);

    if (debug) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          debug: true,
          profileHtml: profileHtml.substring(0, 5000),
          detailsHtml: detailsHtml.substring(0, 5000)
        })
      };
    }

    console.log('Parsing profile...');
    const profile = parseProfile(profileHtml);
    console.log('Profile parsed:', profile);

    console.log('Parsing rounds...');
    const rounds = parseRounds(detailsHtml);
    console.log(`Parsed ${rounds.length} rounds`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      },
      body: JSON.stringify({
        name: profile.name,
        pdgaNumber: parseInt(pdgaNumber, 10),
        currentRating: profile.currentRating,
        location: profile.location,
        rounds
      })
    };
  } catch (err) {
    console.error('Error in player function:', err);
    const status = err.status || 500;
    let message = err.message;

    // User-friendly error messages
    if (message.includes('404') || message.includes('Player not found')) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Player not found. Check the PDGA number.' })
      };
    }

    if (message.includes('502') || message.includes('blocked') || message.includes('429')) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'PDGA website unavailable or blocking requests. Please try again later.' })
      };
    }

    return {
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message || 'Unknown error fetching player data' })
    };
  }
};

async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      redirect: 'follow'
    });

    if (!response.ok) {
      const err = new Error(`PDGA returned ${response.status}`);
      err.status = response.status === 404 ? 404 : 502;
      throw err;
    }

    return response.text();
  } catch (err) {
    if (err.message.includes('timeout')) {
      throw new Error('Request to PDGA timed out');
    }
    throw err;
  }
}

function parseProfile(html) {
  const $ = cheerio.load(html);

  const name = (
    $('h1.title').first().text().trim() ||
    $('h1').first().text().trim() ||
    $('title').text().replace(/\s*\|.*$/, '').trim()
  );

  let currentRating = null;

  // Try li.current-rating first
  const ratingLi = $('li.current-rating');
  if (ratingLi.length) {
    const text = ratingLi.text();
    const match = text.match(/(\d{3,4})/);
    if (match) currentRating = parseInt(match[1], 10);
  }

  // Fallback: search all li elements
  if (!currentRating) {
    $('li').each((i, el) => {
      const text = $(el).text();
      const match = text.match(/Current\s+Rating[:\s]+(\d{3,4})/i);
      if (match) {
        currentRating = parseInt(match[1], 10);
      }
    });
  }

  // Final fallback: search body text
  if (!currentRating) {
    const bodyText = $('body').text();
    const m = bodyText.match(/Current\s+Rating[:\s]+(\d{3,4})/i);
    if (m) currentRating = parseInt(m[1], 10);
  }

  let location = '';

  // Try li.location first
  const locationLi = $('li.location');
  if (locationLi.length) {
    const link = locationLi.find('a').first().text().trim();
    if (link) {
      location = link;
    } else {
      const text = locationLi.text();
      const m = text.match(/Location:\s*(.+?)(?:\n|<|$)/);
      if (m) location = m[1].trim();
    }
  }

  // Fallback: search all li elements
  if (!location) {
    $('li').each((i, el) => {
      const text = $(el).text();
      if (text.includes('Location')) {
        const m = text.match(/Location:\s*(.+?)(?:\n|,\s*\d|$)/);
        if (m) {
          location = m[1].trim();
        }
      }
    });
  }

  return { name, currentRating, location };
}

function parseRounds(html) {
  const $ = cheerio.load(html);
  const rounds = [];

  // Find the ratings table (player-results-details or similar)
  let ratingsTable = $('#player-results-details').length ? $('#player-results-details')[0] : null;

  if (!ratingsTable) {
    // Fallback: look for table with Rating in headers
    $('table').each((i, table) => {
      const headerText = $(table).find('th').map((j, th) => $(th).text().trim()).get().join('|');
      if (/Rating/i.test(headerText) && (/Tournament/i.test(headerText) || /Event/i.test(headerText))) {
        ratingsTable = table;
        return false;
      }
    });
  }

  if (!ratingsTable) return rounds;

  // Discover column indices from headers
  let dateIdx = -1, eventIdx = -1, tierIdx = -1, ratingIdx = -1;
  $(ratingsTable).find('th').each((j, th) => {
    const text = $(th).text().trim().toLowerCase();
    if (text.includes('date')) dateIdx = j;
    else if (text.includes('tournament') || text.includes('event')) eventIdx = j;
    else if (text.includes('tier')) tierIdx = j;
    else if (text.includes('round-rating') || text === 'rating') ratingIdx = j;
  });

  // If no rating column found, try by class name
  if (ratingIdx === -1) {
    $(ratingsTable).find('th').each((j, th) => {
      if ($(th).hasClass('round-rating')) ratingIdx = j;
    });
  }

  if (ratingIdx === -1) return rounds;

  $(ratingsTable).find('tbody tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length <= ratingIdx) return;

    const rating = parseInt($(cells[ratingIdx]).text().trim(), 10);
    if (isNaN(rating)) return;

    const date = dateIdx >= 0 ? $(cells[dateIdx]).text().trim() : '';
    const event = eventIdx >= 0 ? $(cells[eventIdx]).text().trim() : '';

    let tier = '';
    if (tierIdx >= 0) {
      tier = $(cells[tierIdx]).text().trim();
    } else if (eventIdx >= 0) {
      const badge = $(cells[eventIdx]).find('abbr, .tier, [class*="tier"]').first().text().trim();
      tier = badge || '';
    }

    rounds.push({ date, event, tier, rating });
  });

  return rounds;
}
