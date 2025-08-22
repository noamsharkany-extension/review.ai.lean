# Review.ai - Smart Review Analyzer

A full-stack web application that analyzes Google Reviews to provide trustworthy business insights using AI-powered sentiment analysis and fake review detection.

## Project Structure

```
review-analyzer/
├── frontend/           # React frontend application
│   ├── src/           # Source code
│   ├── public/        # Static assets
│   └── package.json   # Frontend dependencies
├── backend/           # Node.js backend API
│   ├── src/           # Source code
│   │   └── services/  # Business logic services
│   └── package.json   # Backend dependencies
├── shared/            # Shared TypeScript types
│   ├── types/         # Type definitions
│   └── package.json   # Shared dependencies
└── package.json       # Root workspace configuration
```

## Local Development Setup

### Prerequisites

Before setting up the project, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js) or **yarn**
- **Git** - [Download here](https://git-scm.com/)
- **OpenAI API Key** - [Get one here](https://platform.openai.com/api-keys)

Optional for production deployment:
- **Docker** and **Docker Compose** - [Download here](https://www.docker.com/)
- **PostgreSQL** (if not using Docker) - [Download here](https://www.postgresql.org/)
- **Redis** (if not using Docker) - [Download here](https://redis.io/)

### Quick Start

1. **Clone the repository:**
```bash
git clone <repository-url>
cd review-analyzer
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

This will start both backend and frontend servers in the correct order, ensuring WebSocket connections work properly.

5. **Open your browser:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001

For detailed development setup and troubleshooting, see [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md).

3. **Set up environment variables:**
```bash
cp backend/.env.example backend/.env
```

4. **Edit the environment file:**
Open `backend/.env` and add your OpenAI API key:
```bash
OPENAI_API_KEY=your_actual_openai_api_key_here
```

5. **Start the development servers:**
```bash
npm run dev
```

6. **Open your browser:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001/api
- Health Check: http://localhost:3001/api/health

### Detailed Setup Instructions

#### 1. Environment Configuration

The backend requires several environment variables. Copy the example file and customize:

```bash
cp backend/.env.example backend/.env
```

**Required Variables:**
- `OPENAI_API_KEY`: Your OpenAI API key (required for sentiment analysis)
- `NODE_ENV`: Set to `development` for local development
- `PORT`: Backend server port (default: 3001)

**Optional Variables (with defaults):**
- `DATABASE_URL`: SQLite database path (default: `sqlite:./data/reviews.db`)
- `CORS_ORIGIN`: Frontend URL (default: `http://localhost:5173`)
- `RATE_LIMIT_MAX_REQUESTS`: API rate limit (default: 10 per 15 minutes)

#### 2. Database Setup

For local development, the application uses SQLite by default (no additional setup required). The database file will be created automatically at `backend/data/reviews.db`.

For PostgreSQL (optional):
1. Install PostgreSQL locally or use Docker
2. Create a database named `reviews`
3. Update `DATABASE_URL` in your `.env` file:
```bash
DATABASE_URL=postgresql://username:password@localhost:5432/reviews
```

#### 3. Development Scripts

The project includes several npm scripts for development:

**Root Level Scripts:**
```bash
# Start both frontend and backend
npm run dev

# Start frontend only (http://localhost:5173)
npm run dev:frontend

# Start backend only (http://localhost:3001)
npm run dev:backend

# Install all dependencies
npm run install:all

# Build all packages
npm run build

# Run all tests
npm test
```

**Backend Scripts:**
```bash
cd backend

# Development with hot reload
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run performance tests
npm run perf:test

# Database cleanup (remove old sessions)
npm run db:cleanup
```

**Frontend Scripts:**
```bash
cd frontend

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm test

# Lint code
npm run lint
```

#### 4. Testing the Complete System

After starting the development servers, test the complete workflow:

1. **Verify Backend Health:**
```bash
curl http://localhost:3001/api/health
```

2. **Test Frontend:**
Open http://localhost:5173 in your browser

3. **Test Analysis Workflow:**
   - Enter a Google Maps URL with reviews
   - Watch real-time progress updates
   - Verify results display with citations

#### 5. Troubleshooting

**Common Issues:**

1. **Port Already in Use:**
```bash
# Kill processes on ports 3001 and 5173
npx kill-port 3001 5173
```

2. **OpenAI API Key Issues:**
   - Verify your API key is valid
   - Check your OpenAI account has credits
   - Ensure the key is properly set in `.env`

3. **Database Connection Issues:**
   - Check if `backend/data/` directory exists
   - Verify database permissions
   - For PostgreSQL, ensure the service is running

4. **Module Not Found Errors:**
```bash
# Clean install all dependencies
rm -rf node_modules frontend/node_modules backend/node_modules shared/node_modules
npm run install:all
```

5. **Build Failures:**
```bash
# Clean build directories
npm run clean
npm run build
```

### Development Workflow

1. **Making Changes:**
   - Frontend changes auto-reload at http://localhost:5173
   - Backend changes auto-reload with `tsx watch`
   - Shared type changes require rebuilding: `cd shared && npm run build`

2. **Running Tests:**
```bash
# Run all tests
npm test

# Run specific test suites
cd backend && npm test
cd frontend && npm test

# Run tests in watch mode
cd backend && npm test -- --watch
cd frontend && npm test -- --watch
```

3. **Code Quality:**
```bash
# Lint all code
cd backend && npm run lint
cd frontend && npm run lint

# Fix linting issues
cd backend && npm run lint:fix
cd frontend && npm run lint:fix
```

### Building and Testing

Build all packages:
```bash
npm run build
```

Run all tests:
```bash
npm test
```

Run performance tests:
```bash
cd backend && npm run perf:test
```

## Architecture

The application follows a modular architecture with clear separation of concerns:

- **Frontend**: React with TypeScript, Tailwind CSS, and React Query
- **Backend**: Express.js with TypeScript, Puppeteer for scraping, OpenAI for analysis
- **Shared**: Common TypeScript interfaces and types

## Features (Planned)

- Google Maps review scraping
- Intelligent review sampling for large datasets
- AI-powered sentiment analysis
- Fake review detection
- Real-time progress tracking
- Comprehensive results dashboard with citations
- Transparent analysis methodology

## License

Private project - All rights reserved