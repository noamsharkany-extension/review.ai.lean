-- Analysis Sessions Table
CREATE TABLE IF NOT EXISTS analysis_sessions (
    id TEXT PRIMARY KEY,
    google_url TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'scraping', 'sampling', 'analyzing', 'complete', 'error')),
    progress_phase TEXT,
    progress_percentage INTEGER DEFAULT 0,
    progress_message TEXT,
    error_message TEXT,
    error_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- Analysis Results Table
CREATE TABLE IF NOT EXISTS analysis_results (
    session_id TEXT PRIMARY KEY,
    overall_score REAL,
    trustworthiness_score REAL,
    red_flags_score REAL,
    total_reviews INTEGER,
    sampling_used BOOLEAN DEFAULT FALSE,
    recent_sample_count INTEGER,
    fivestar_sample_count INTEGER,
    onestar_sample_count INTEGER,
    fake_review_ratio REAL,
    sentiment_mismatch_ratio REAL,
    confidence_score REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES analysis_sessions (id) ON DELETE CASCADE
);

-- Reviews Table (for caching scraped reviews)
CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    author TEXT,
    rating INTEGER,
    text TEXT,
    date DATETIME,
    original_url TEXT,
    sentiment TEXT,
    sentiment_confidence REAL,
    is_fake BOOLEAN DEFAULT FALSE,
    fake_confidence REAL,
    fake_reasons TEXT, -- JSON array of reasons
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES analysis_sessions (id) ON DELETE CASCADE
);

-- Citations Table
CREATE TABLE IF NOT EXISTS citations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    review_id TEXT NOT NULL,
    citation_text TEXT,
    analysis_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES analysis_sessions (id) ON DELETE CASCADE,
    FOREIGN KEY (review_id) REFERENCES reviews (id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sessions_status ON analysis_sessions (status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON analysis_sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_session_id ON reviews (session_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews (rating);
CREATE INDEX IF NOT EXISTS idx_reviews_is_fake ON reviews (is_fake);
CREATE INDEX IF NOT EXISTS idx_citations_session_id ON citations (session_id);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_sessions_timestamp 
    AFTER UPDATE ON analysis_sessions
    FOR EACH ROW
    BEGIN
        UPDATE analysis_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;