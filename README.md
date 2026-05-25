# PDGA Ratings Calculator

A static website for analyzing disc golf player ratings. Enter a PDGA player number to see:
- Overall average rating (last 12 months)
- Tour average rating (Elite Series, Majors, National Tour only)
- Golf handicap equivalent rating (World Handicap System formula applied to PDGA rounds)
- Last 20 tournament rounds with details

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript + Tailwind CSS
- **Backend**: Netlify serverless function (Node.js)
- **Scraping**: Cheerio HTML parser
- **Hosting**: Netlify (free tier)

## Local Testing

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
npm install
```

### Run Local Dev Server

```bash
npm run dev
```

This starts the Netlify dev server on a local port (typically `http://localhost:8888` or similar).

### Test in Browser

1. Open `http://localhost:8888` in your browser
2. Enter a PDGA player number (e.g., `75412` for an active pro player)
3. Click Search
4. View the player profile, three rating metrics, and recent round history

### Test a Known Player

Player #75412 (Rich Ott) has recent tournament data:
- Current rating: 1061
- Location: Urbandale, Iowa
- Many recent Elite Series events with ratings

### Expected Output

```json
{
  "name": "Rich Ott #75412",
  "pdgaNumber": 75412,
  "currentRating": 1061,
  "location": "Urbandale, Iowa, United States",
  "rounds": [
    {
      "date": "24-Apr to 26-Apr-2026",
      "event": "DGPT - GRIPeq 44th Kansas City Wide Open presented by Nexus Disc Golf",
      "tier": "ES",
      "rating": 1059
    },
    ...
  ]
}
```

### Calculations Explained

**Overall Average**: Sum of all ratings from last 12 months / count

**Tour Average**: Sum of Elite Series + Majors + National Tour ratings from last 12 months / count

**Golf Handicap Equivalent** (World Handicap System):
1. Take last 20 tournament rounds from any time period
2. Calculate "score differential" = 1000 - round_rating
3. Sort differentials, select best (lowest) 8
4. Average those 8, multiply by 0.96
5. Convert back: 1000 - result = handicap equivalent rating

This gives a "potential" rating similar to golf handicap index.

## Deployment to Netlify

1. Push to GitHub (you handle git)
2. Go to https://netlify.com
3. Click "New site from Git"
4. Select your repository
5. Leave build settings default (Netlify auto-detects)
6. Deploy

The site will be live at a `*.netlify.app` URL.

## How It Works

### Frontend (`index.html` + `js/main.js`)

- User enters PDGA number and clicks search
- Frontend calls `/api/player?pdga={number}` 
- Displays results with color-coded tier badges (tour rounds in indigo, general rounds in gray)
- Responsive grid layout for mobile/tablet/desktop

### Backend (`netlify/functions/player.js`)

- Receives PDGA number from frontend
- Fetches player profile and details pages from pdga.com server-side
- Parses HTML with Cheerio:
  - **Profile page**: Extracts name, current rating, location from structured lists
  - **Details page**: Extracts round-by-round ratings from results table, discovers column indices dynamically
- Returns structured JSON with player data and all rounds
- Caches responses for 1 hour

### Parsing Strategy

The scraper uses intelligent fallbacks to survive HTML changes:
- Looks for specific CSS classes first (`li.current-rating`, `li.location`, `#player-results-details`)
- Falls back to text-based regex matching if classes change
- Dynamically discovers table column indices instead of hardcoding positions
- Tier extraction handles both dedicated cells and inline badges

## Troubleshooting

**"No data available" or empty rounds**

Some PDGA players have old or no rating data. Try #75412 (Rich Ott - active pro).

**Server won't start**

Check you're in the correct directory and `npm install` completed:
```bash
ls netlify.toml package.json
```

**Function timeout (8 seconds)**

PDGA.com sometimes returns slowly. The timeout is 8 seconds; function timeout is 10 seconds (gives 2s buffer).

**Parsing not working**

The PDGA website may have changed HTML structure. Check `/api/player?pdga=75412&debug=1` to see raw HTML and inspect class names.

## File Structure

```
ratings-calculator/
├── index.html              # Static page
├── js/main.js              # Frontend logic
├── netlify.toml            # Netlify config + redirects
├── package.json            # Dependencies
└── netlify/
    └── functions/
        └── player.js       # Backend scraper
```

## Environment Variables

None required for local dev. No secrets needed (this scrapes public PDGA data).

## Notes

- Dates are parsed from PDGA format: "24-Apr-2026" or "24-Apr to 26-Apr-2026"
- Tour tiers: ES (Elite Series), M (Major), NT (National Tour)
- Last 12 months calculation uses current date minus 365 days
- Handicap equivalent requires minimum 3 rounds in last 20 to display
