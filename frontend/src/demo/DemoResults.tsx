import React from 'react'
import { ResultsArea } from '../components/ResultsArea'
import { AnalysisResults, ReviewCitation } from '../../../shared/types'

// Demo data for testing the comprehensive results dashboard
const mockCitations: ReviewCitation[] = [
  {
    reviewId: '1',
    author: 'Sarah Johnson',
    rating: 5,
    text: 'Absolutely fantastic service! The staff was incredibly helpful and the food was delicious. Will definitely be coming back.',
    date: new Date('2023-12-15'),
    originalUrl: 'https://maps.google.com/review/1',
    sentiment: {
      reviewId: '1',
      sentiment: 'positive',
      confidence: 0.95,
      mismatchDetected: false
    },
    fakeAnalysis: {
      reviewId: '1',
      isFake: false,
      confidence: 0.92,
      reasons: []
    }
  },
  {
    reviewId: '2',
    author: 'Mike Chen',
    rating: 1,
    text: 'Great place, amazing atmosphere, loved everything about it!',
    date: new Date('2023-12-10'),
    originalUrl: 'https://maps.google.com/review/2',
    sentiment: {
      reviewId: '2',
      sentiment: 'positive',
      confidence: 0.88,
      mismatchDetected: true
    },
    fakeAnalysis: {
      reviewId: '2',
      isFake: false,
      confidence: 0.75,
      reasons: ['Sentiment-rating mismatch detected']
    }
  },
  {
    reviewId: '3',
    author: 'ReviewBot123',
    rating: 5,
    text: 'This place is good. Very good. I like this place. Good service. Good food. Recommend.',
    date: new Date('2023-12-08'),
    originalUrl: 'https://maps.google.com/review/3',
    sentiment: {
      reviewId: '3',
      sentiment: 'positive',
      confidence: 0.72,
      mismatchDetected: false
    },
    fakeAnalysis: {
      reviewId: '3',
      isFake: true,
      confidence: 0.85,
      reasons: ['Repetitive language patterns', 'Generic phrasing', 'Suspicious username']
    }
  }
]

const mockResults: AnalysisResults = {
  verdict: {
    overallScore: 0.78,
    trustworthiness: 0.82,
    redFlags: 0.25
  },
  sampling: {
    totalReviews: 1247,
    samplingUsed: true,
    sampleBreakdown: {
      recent: 100,
      fivestar: 100,
      onestar: 100
    }
  },
  analysis: {
    fakeReviewRatio: 0.08,
    sentimentMismatchRatio: 0.15,
    confidenceScore: 0.86
  },
  citations: mockCitations,
  transparencyReport: {
    samplingBreakdown: {
      totalOriginalReviews: 1247,
      samplingUsed: true,
      sampleBreakdown: {
        recent: 100,
        fivestar: 100,
        onestar: 100
      },
      samplingMethodology: 'Intelligent sampling with 100 recent, 100 five-star, and 100 one-star reviews'
    },
    analysisBreakdown: {
      totalAnalyzed: 300,
      fakeReviewCount: 24,
      fakeReviewRatio: 0.08,
      sentimentMismatchCount: 45,
      sentimentMismatchRatio: 0.15,
      averageConfidenceScore: 0.86
    },
    qualityMetrics: {
      citationAccuracy: 0.94,
      linkValidityRatio: 0.97,
      analysisCompleteness: 1.0
    }
  }
}

export const DemoResults: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Comprehensive Results Dashboard Demo
          </h1>
          <p className="text-lg text-gray-600">
            Showcasing the enhanced visual design and interactive features
          </p>
        </div>
        
        <ResultsArea results={mockResults} />
      </div>
    </div>
  )
}