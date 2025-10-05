# Review.ai - Smart Review Analyzer

A full-stack web application that analyzes Google Maps reviews to provide trustworthy business insights using AI-powered sentiment analysis and fake review detection.

## Features

- **Google Maps Review Scraping**: Automated extraction of reviews using Puppeteer headless browser
- **Adaptive Scraping Strategy**:
  - Strategy A: For ≤300 reviews, scrape all reviews
  - Strategy B: For >300 reviews, sample 100 reviews from each category (Newest, Lowest rating, Highest rating)
- **AI-Powered Sentiment Analysis**: Uses OpenAI GPT-4 to analyze review sentiment and detect patterns
- **Real-time Progress Updates**: WebSocket-based live progress tracking during scraping and analysis
- **Session Persistence**: SQLite database stores session data with better-sqlite3
- **Comprehensive Logging**: Detailed session logs for debugging and monitoring
- **RESTful API**: Express-based backend with well-defined endpoints
- **Modern Frontend**: React + Vite with TailwindCSS for responsive UI

## Project Structure

```
review.ai.lean/
├── frontend/                 # React frontend application
│   ├── src/                 # Source code
│   ├── public/              # Static assets
│   └── package.json         # Frontend dependencies (Vite, React, TailwindCSS)
├── backend/                 # Node.js backend API
│   ├── src/
│   │   ├── server.ts        # Express server entry point
│   │   └── services/
│   │       └── scraper.ts   # Google Maps review scraper
│   ├── data/                # SQLite database directory
│   └── package.json         # Backend dependencies (Express, Puppeteer, OpenAI)
├── shared/                  # Shared TypeScript types
│   ├── types/               # Type definitions
│   └── package.json         # Shared dependencies
├── logs-headless/           # Scraper session logs
└── package.json             # Root workspace configuration
```

## Tech Stack

### Backend
- **Node.js** with **TypeScript**
- **Express.js** - REST API server
- **Puppeteer** - Headless browser automation for scraping
- **better-sqlite3** - Persistent session storage
- **OpenAI API** - GPT-4 for sentiment analysis
- **ws** (WebSocket) - Real-time progress updates
- **tsx** - TypeScript execution with hot reload

### Frontend
- **React 18** with **TypeScript**
- **Vite** - Build tool and dev server
- **TailwindCSS** - Utility-first CSS framework
- **React Query** - Server state management

## Prerequisites

Before setting up the project, ensure you have:

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** - [Download here](https://git-scm.com/)
- **OpenAI API Key** - [Get one here](https://platform.openai.com/api-keys)

## Quick Start

1. **Clone the repository:**
```bash
git clone <repository-url>
cd review.ai.lean
```

2. **Install all dependencies:**
```bash
npm run install:all
```

3. **Set up environment variables:**
```bash
# Copy the example environment file
cp backend/.env.example backend/.env

# Edit the .env file and add your OpenAI API key
# OPENAI_API_KEY=your-openai-api-key-here
```

4. **Start the development servers:**
```bash
npm run dev
```

This will start:
- Frontend on http://localhost:5174
- Backend API on http://localhost:3001

5. **Open your browser:**
   - Frontend: http://localhost:5174
   - Backend API: http://localhost:3001/api
   - Health Check: http://localhost:3001/api/health

## Development Scripts

### Root Level Scripts
```bash
# Start both frontend and backend
npm run dev

# Install all dependencies
npm run install:all

# Build all packages
npm run build

# Run all tests
npm test
```

### Backend Scripts
```bash
cd backend

# Development with hot reload
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Scrape a single Google Maps URL (for testing)
npm run scrape-single <google-maps-url>

# E2E analysis test with OpenAI
npm run e2e:analyze -- "<google-maps-url>"

# Database cleanup (remove old sessions)
npm run db:cleanup
```

### Frontend Scripts
```bash
cd frontend

# Development server on port 5174
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## API Endpoints

### Health Check
```
GET /api/health
```
Returns server status and configuration.

### Create Analysis Session
```
POST /api/sessions
Content-Type: application/json

{
  "url": "https://www.google.com/maps/place/..."
}
```
Creates a new analysis session and returns a session ID.

### Get Session Status
```
GET /api/sessions/:sessionId
```
Returns the current status and progress of a session.

### WebSocket Connection
```
ws://localhost:3001
```
Real-time updates for scraping and analysis progress.

## How It Works

### 1. URL Input
User provides a Google Maps business URL with reviews.

### 2. Review Scraping
The scraper:
- Navigates to the Google Maps URL using Puppeteer
- Clicks the Reviews tab to open the reviews panel
- Detects the total number of reviews
- Chooses scraping strategy:
  - **Strategy A** (≤300 reviews): Scrapes all reviews by clicking "More" buttons
  - **Strategy B** (>300 reviews):
    - Scrapes 100 newest reviews (default sort)
    - Switches to "Lowest rating" and scrapes 100 reviews
    - Switches to "Highest rating" and scrapes 100 reviews

### 3. Session Logging
All scraping activity is logged to `logs-headless/` directory with detailed information:
- Button click events
- Review extraction counts
- DOM query results
- Error messages

Log file naming format:
```
<sanitized-url>__<session-id>__<timestamp>.log
```

### 4. AI Analysis
Extracted reviews are sent to OpenAI GPT-4 for:
- Sentiment analysis
- Pattern detection
- Fake review detection
- Summary generation

### 5. Results Display
Frontend displays:
- Overall sentiment score
- Key insights and patterns
- Individual review citations
- Detected fake reviews

## Performance Optimizations

- **Headless Browser**: Puppeteer runs in headless mode for faster scraping
- **Adaptive Strategies**: Different approaches for small vs large review sets
- **WebSocket Updates**: Real-time progress without polling
- **SQLite Persistence**: Fast local database for session data
- **Hot Module Reload**: tsx watch for instant backend updates

## Logging

Session logs are automatically created in `logs-headless/` with comprehensive details:

- **Navigation events**: URL loading, page transitions
- **DOM queries**: Button searches, element counts
- **User interactions**: Clicks, scrolls, sort changes
- **Review extraction**: Count of reviews found per batch
- **Errors**: Failed operations, timeouts, unexpected states

Example log snippet:
```
[REVIEWS_TAB] Looking for Reviews tab button...
[REVIEWS_TAB] Found 3 candidate buttons
[REVIEWS_TAB] Reviews panel opened: 1,888 reviews (english)
[MORE_BUTTON] Found 32 "more" button candidates
[MORE_BUTTON] Clicking More button 1/32...
[EXTRACT] Extracted 10 reviews this round
```

## Troubleshooting

### Port Already in Use
```bash
# Kill processes on ports 3001 and 5174
npx kill-port 3001 5174
```

### OpenAI API Key Issues
- Verify your API key is valid
- Check your OpenAI account has credits
- Ensure the key is properly set in `backend/.env`

### Scraper Not Finding Reviews
- Check `logs-headless/` for detailed error logs
- Verify the Google Maps URL contains reviews
- Google Maps DOM structure may have changed (update selectors in `scraper.ts`)

### Database Issues
- Ensure `backend/data/` directory exists and is writable
- Run `npm run db:cleanup` to remove old sessions

### Module Not Found Errors
```bash
# Clean install all dependencies
rm -rf node_modules frontend/node_modules backend/node_modules shared/node_modules
npm run install:all
```

## Development Workflow

1. **Making Changes:**
   - Frontend changes auto-reload at http://localhost:5174
   - Backend changes auto-reload with `tsx watch`
   - Check logs in `logs-headless/` for scraper debugging

2. **Testing Scraper:**
```bash
cd backend
npm run scrape-single "https://www.google.com/maps/place/..."
```

3. **Viewing Logs:**
```bash
# Watch logs in real-time
tail -f logs-headless/<latest-log-file>.log
```

## Architecture Decisions

### Why SQLite?
- Zero configuration for local development
- Fast read/write for session data
- Easy backup and portability
- Can migrate to PostgreSQL for production if needed

### Why Puppeteer?
- Full browser automation for dynamic content
- Handles Google Maps infinite scroll and lazy loading
- Supports clicking buttons and changing sort orders
- Headless mode for performance

### Why Adaptive Strategy?
- Small businesses (≤300 reviews): Get complete picture
- Large businesses (>300 reviews): Representative sample from newest, worst, and best reviews
- Balances data quality with scraping time

## License

Private project - All rights reserved
