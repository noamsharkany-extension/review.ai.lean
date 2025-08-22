# Implementation Plan

- [x] 1. Set up project structure and core interfaces
  - Create directory structure for frontend (React), backend (Node.js), and shared types
  - Initialize package.json files with required dependencies (React, Express, TypeScript, Puppeteer, OpenAI)
  - Define TypeScript interfaces for Review, AnalysisResults, and core data models
  - Set up basic build and development scripts
  - _Requirements: 8.1, 8.3_

- [x] 2. Implement Google URL validation and parsing
  - Create URL validation utility that checks for valid Google URLs that show reviews (Maps, Search results, etc.)
  - Write unit tests for URL validation with various valid and invalid formats
  - Implement URL parser that extracts place ID or location information from any Google review URL
  - _Requirements: 1.2, 3.3_

- [x] 3. Build web scraping foundation with Puppeteer
  - Set up Puppeteer configuration with appropriate browser settings and user agents
  - Implement basic Google page navigation and review section detection for Maps, Search, and other Google review pages
  - Create error handling for common scraping issues (timeouts, blocked requests, CAPTCHA)
  - Write unit tests with mocked Puppeteer responses
  - _Requirements: 1.1, 3.3_

- [x] 4. Implement review extraction and data parsing
  - Code review scraper that extracts author, rating, text, date, and review URL from any Google review page
  - Handle pagination to collect all available reviews from multiple pages
  - Implement data cleaning and normalization for extracted review content
  - Write integration tests with sample Google review pages (Maps, Search, etc.)
  - _Requirements: 1.1_

- [x] 5. Create intelligent sampling engine
  - Implement sampling logic that determines when to sample (>300 reviews)
  - Code sampling algorithm: 100 recent + 100 five-star + 100 one-star reviews
  - Create sampling report generator that explains methodology used
  - Write unit tests for various review count scenarios (under 300, over 300, edge cases)
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 6. Set up OpenAI integration for sentiment analysis
  - Configure OpenAI API client with proper authentication and error handling
  - Implement sentiment analysis function that processes review text and returns sentiment scores
  - Create sentiment-rating mismatch detection logic (e.g., 1-star with positive sentiment)
  - Write unit tests with mocked OpenAI responses and edge cases
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 7. Build fake review detection system
  - Implement OpenAI-powered fake review detection using language patterns and inconsistencies
  - Create confidence scoring system for fake review predictions
  - Code fake review exclusion logic for final scoring while maintaining transparency
  - Write unit tests with known fake and authentic review examples
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 8. Create analysis orchestration service
  - Build main analysis service that coordinates scraping, sampling, sentiment analysis, and fake detection
  - Implement progress tracking system that reports current phase and completion percentage
  - Create error recovery and retry logic for failed analysis steps
  - Write integration tests for complete analysis workflow
  - _Requirements: 3.1, 3.2, 8.1_

- [x] 9. Implement verdict generation and scoring
  - Code verdict calculator that generates overall impression, trustworthiness, and red flags scores
  - Create deterministic scoring algorithm based on sentiment analysis and fake review ratios
  - Implement confidence score calculation for analysis accuracy
  - Write unit tests for scoring logic with various analysis result combinations
  - _Requirements: 6.1, 6.3, 7.2_

- [x] 10. Build citation and transparency system
  - Implement citation generator that creates detailed references for each analyzed review
  - Create transparency report builder showing sampling breakdown, fake ratios, and mismatch counts
  - Code review linking system that maintains connections to original Google Maps reviews
  - Write unit tests for citation accuracy and link validation
  - _Requirements: 7.1, 7.3_

- [x] 11. Create backend API endpoints
  - Implement POST /analyze endpoint that accepts Google URL and initiates analysis
  - Create GET /analysis/:id endpoint for retrieving analysis results and progress
  - Build WebSocket endpoint for real-time progress updates during analysis
  - Write API integration tests for all endpoints with various input scenarios
  - _Requirements: 3.1, 3.2, 6.2_

- [x] 12. Build React frontend foundation
  - Set up React application with TypeScript, Tailwind CSS, and React Query
  - Create main layout component with header, input section, and results area
  - Implement URL input field with real-time validation and error display
  - Write component unit tests for user interactions and validation
  - _Requirements: 1.2, 3.3_

- [x] 13. Implement real-time progress tracking UI
  - Create progress indicator component that shows current analysis phase
  - Build WebSocket client that connects to backend for live progress updates
  - Implement progress bar and status messages for each analysis phase
  - Write tests for WebSocket connection handling and progress display
  - _Requirements: 3.1, 3.2_

- [x] 14. Build comprehensive results dashboard
  - Create results display component showing verdict scores, sampling info, and analysis metrics
  - Implement interactive citations section with expandable review details
  - Build trust indicators and visual score representations (charts, progress bars)
  - Write component tests for results rendering and user interactions
  - _Requirements: 6.1, 6.2, 7.1_

- [x] 15. Add error handling and user feedback
  - Implement comprehensive error display for scraping failures, API errors, and network issues
  - Create retry functionality for failed analyses with clear user guidance
  - Add loading states and skeleton screens for better user experience
  - Write tests for error scenarios and recovery flows
  - _Requirements: 1.2, 3.3_

- [x] 16. Integrate frontend and backend systems
  - Connect React frontend to backend API endpoints with proper error handling
  - Implement end-to-end analysis flow from URL input to results display
  - Add proper state management for analysis sessions and results caching
  - Write end-to-end tests for complete user workflows
  - _Requirements: 1.1, 1.3, 6.1_

- [x] 17. Add production optimizations and deployment setup
  - Implement request caching and rate limiting for API endpoints
  - Add database persistence for analysis sessions and results
  - Create production build configuration and environment variable management
  - Write performance tests and optimize for large review datasets
  - _Requirements: 8.3_

- [x] 18. Set up local development environment and run complete system
  - Create comprehensive local setup documentation with prerequisites and installation steps
  - Set up environment variables and configuration files for local development
  - Create development scripts to run both frontend and backend simultaneously
  - Test complete end-to-end workflow locally from URL input to analysis results
  - Verify all features work together: scraping, analysis, real-time updates, and results display
  - _Requirements: 1.1, 1.2, 1.3, 8.1_

- [x] 19. Fix WebSocket connection issues and proxy errors
  - Diagnose and resolve WebSocket proxy errors between frontend and backend (EPIPE, ECONNRESET)
  - Fix Vite proxy configuration for WebSocket connections to ensure stable real-time communication
  - Implement proper WebSocket connection handling with reconnection logic and error recovery
  - Add WebSocket connection status indicators and fallback mechanisms for failed connections
  - Test WebSocket stability under various network conditions and connection interruptions
  - _Requirements: 3.1, 3.2_

- [x] 20. Resolve WebSocket proxy ECONNREFUSED errors and improve development workflow
  - Fix ECONNREFUSED errors when frontend tries to connect to backend WebSocket server
  - Implement proper development server startup sequence to ensure backend is running before frontend proxy attempts
  - Add backend server health checks and retry logic in Vite proxy configuration
  - Create development scripts that start backend and frontend in correct order with dependency checking
  - Implement graceful WebSocket connection handling when backend server is not available
  - Add clear error messages and recovery instructions for development environment issues
  - _Requirements: 3.1, 3.2, 8.1_

- [x] 21. Fix and test the integrated development startup script
  - Debug and fix the dev-start.js script to ensure it properly starts backend before frontend
  - Add missing dependencies (node-fetch) and fix ES module import issues in the startup script
  - Test the integrated npm run dev command to verify it eliminates WebSocket connection errors
  - Implement proper error handling and process cleanup in the development script
  - Add fallback mechanisms when the integrated script fails (manual startup instructions)
  - Verify that the script works across different operating systems and Node.js versions
  - _Requirements: 8.1_

- [x] 22. Resolve scraping reliability and WebSocket stability issues
  - Fix scraper hanging issues during the scraping phase that cause analysis to get stuck indefinitely
  - Implement robust timeout handling and error recovery for Puppeteer browser operations
  - Add comprehensive logging and progress tracking throughout the scraping workflow
  - Fix WebSocket EPIPE errors and connection stability issues between frontend and backend
  - Implement fallback mechanisms when scraping fails (alternative scraping strategies)
  - Add real-time progress updates and error reporting to prevent silent failures
  - Test with various Google Maps URLs including international locations and different page layouts
  - Ensure analysis completes successfully or fails gracefully with clear error messages
  - Ensure you use only port 5174 for frontend
  - _Requirements: 1.1, 1.2, 2.1, 3.1, 3.2, 4.1, 4.2, 4.3, 5.1, 5.2, 6.1, 6.2, 7.1, 7.2, 8.1_

- [x] 23. Fix systematic review extraction failure - all Google Maps URLs failing
  - Diagnose and fix the universal "No reviews could be extracted from the page" error affecting ALL Google Maps URLs
  - Inspect the current Google Maps page DOM structure to identify how Google has changed their review elements
  - Completely overhaul the extractReviews method with updated selectors that work with Google's current page structure
  - Replace outdated selectors like `[data-review-id]` with current Google Maps review element selectors
  - Add multiple fallback selector strategies for different Google Maps layouts (desktop/mobile, different regions, different languages)
  - Implement dynamic selector detection that can adapt to Google's frequently changing page structure
  - Add comprehensive logging to show exactly which selectors are being tried and why they all fail
  - Test with multiple different Google Maps URLs to ensure the fix works universally, not just for specific locations
  - Add selector validation that checks if elements exist before attempting extraction
  - Implement graceful handling when no reviews are actually present vs when selectors are completely wrong
  - Add debugging mode that captures page screenshots and HTML dumps when extraction fails for analysis
  - Consider that Google may have implemented anti-scraping measures that require different extraction approaches
  - _Requirements: 1.1, 3.1, 3.2_
- 
- [x] 24. Fix multilingual review extraction for both English and Hebrew Google Maps interfaces
  - Diagnose and fix the universal review extraction failure affecting both English and Hebrew Google Maps pages
  - The scraper successfully navigates to pages but fails to extract review content due to language-specific DOM differences
  - **English Language Support:**
    - Update review tab detection to recognize "Reviews" text and English aria-labels
    - Implement English date pattern matching for "X months ago", "yesterday", "today", "a week ago" formats
    - Add English star rating extraction using "X star", "X out of 5", "rating: X" patterns
    - Support English author name extraction from standard Google Maps user display format
  - **Hebrew Language Support:**
    - Update review tab detection to recognize "ביקורות" (reviews) text and Hebrew aria-labels
    - Implement Hebrew date pattern matching for "לפני X חודשים" (X months ago), "לפני שבוע" (a week ago), etc.
    - Add Hebrew star rating extraction using "X כוכבים" (X stars), "X כוכב" (X star) patterns
    - Support Hebrew author name extraction with patterns like "Name Surname ממליץ מקומי" (Local Guide)
  - **Universal Improvements:**
    - Fix the `findAndClickReviewsSection` method to support multilingual tab text detection
    - Implement robust waiting mechanisms for dynamic content loading in different languages
    - Add comprehensive multilingual selector strategies with proper fallbacks
    - Update DOM element detection to work with Google's current international page structures
    - Add detailed logging to show which language patterns are being matched and why extraction fails
    - Test specifically with Hebrew URLs (קפה נינה) and English URLs (Jadis et Gourmande) to ensure both work
    - Implement language detection to apply appropriate extraction strategies automatically
    - Add validation to distinguish between "no reviews exist" vs "language-specific extraction failure"
  - _Requirements: 1.1, 3.1, 3.2_