import React, { useState } from 'react'
import { ReviewCitation } from '../../../shared/types'

interface CitationsSectionProps {
  citations: ReviewCitation[]
}

export const CitationsSection: React.FC<CitationsSectionProps> = ({ citations }) => {
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)

  const toggleReview = (reviewId: string) => {
    const newExpanded = new Set(expandedReviews)
    if (newExpanded.has(reviewId)) {
      newExpanded.delete(reviewId)
    } else {
      newExpanded.add(reviewId)
    }
    setExpandedReviews(newExpanded)
  }

  const displayedCitations = showAll ? citations : citations.slice(0, 10)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold text-gray-900">
          Review Citations ({citations.length})
        </h3>
        <div className="text-sm text-gray-500">
          Click any review to see detailed analysis
        </div>
      </div>

      <div className="space-y-4">
        {displayedCitations.map((citation) => (
          <ReviewCitationCard
            key={citation.reviewId}
            citation={citation}
            isExpanded={expandedReviews.has(citation.reviewId)}
            onToggle={() => toggleReview(citation.reviewId)}
          />
        ))}
      </div>

      {citations.length > 10 && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-4 py-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            {showAll ? 'Show Less' : `Show All ${citations.length} Reviews`}
          </button>
        </div>
      )}
    </div>
  )
}

interface ReviewCitationCardProps {
  citation: ReviewCitation
  isExpanded: boolean
  onToggle: () => void
}

const ReviewCitationCard: React.FC<ReviewCitationCardProps> = ({
  citation,
  isExpanded,
  onToggle
}) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600 bg-green-50'
      case 'negative': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getRatingStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <svg
        key={i}
        className={`w-4 h-4 ${i < rating ? 'text-yellow-400' : 'text-gray-300'}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ))
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center space-x-3">
            <div className="font-medium text-gray-900">{citation.author}</div>
            <div className="flex items-center space-x-1">
              {getRatingStars(citation.rating)}
            </div>
            <div className="text-sm text-gray-500">{formatDate(citation.date)}</div>
          </div>
          <div className="flex items-center space-x-2">
            {citation.fakeAnalysis.isFake && (
              <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                Potentially Fake
              </span>
            )}
            {citation.sentiment.mismatchDetected && (
              <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded">
                Sentiment Mismatch
              </span>
            )}
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <p className="text-gray-700 line-clamp-2">{citation.text}</p>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="space-y-4">
            {/* Full review text */}
            <div>
              <h5 className="font-medium text-gray-900 mb-2">Full Review</h5>
              <p className="text-gray-700">{citation.text}</p>
            </div>

            {/* Analysis details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Sentiment Analysis</h5>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Detected Sentiment:</span>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getSentimentColor(citation.sentiment.sentiment)}`}>
                      {citation.sentiment.sentiment.charAt(0).toUpperCase() + citation.sentiment.sentiment.slice(1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Confidence:</span>
                    <span className="text-sm font-medium">{(citation.sentiment.confidence * 100).toFixed(0)}%</span>
                  </div>
                  {citation.sentiment.mismatchDetected && (
                    <div className="text-sm text-orange-700 bg-orange-50 p-2 rounded">
                      ⚠️ Rating doesn't match text sentiment
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h5 className="font-medium text-gray-900 mb-2">Authenticity Check</h5>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Authenticity:</span>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      citation.fakeAnalysis.isFake ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {citation.fakeAnalysis.isFake ? 'Potentially Fake' : 'Likely Authentic'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Confidence:</span>
                    <span className="text-sm font-medium">{(citation.fakeAnalysis.confidence * 100).toFixed(0)}%</span>
                  </div>
                  {citation.fakeAnalysis.reasons.length > 0 && (
                    <div className="text-sm text-gray-600">
                      <div className="font-medium mb-1">Analysis Notes:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {citation.fakeAnalysis.reasons.map((reason, index) => (
                          <li key={index} className="text-xs">{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Original link */}
            <div className="pt-2 border-t border-gray-200">
              <a
                href={citation.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View Original Review
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}