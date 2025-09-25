import React from 'react'

interface TrustIndicatorProps {
  overallScore: number
  trustworthiness: number
  redFlags: number
  fakeReviewRatio: number
  confidenceScore: number
}

export const TrustIndicator: React.FC<TrustIndicatorProps> = ({
  overallScore,
  trustworthiness,
  redFlags,
  fakeReviewRatio,
  confidenceScore
}) => {
  // Calculate overall trust level (scores are percentages 0-100)
  const calculateTrustLevel = () => {
    const avgScore = (overallScore + trustworthiness + (100 - redFlags)) / 3 / 100 // Convert to 0-1 scale
    const penaltyForFakes = Math.max(0, fakeReviewRatio * 0.5)
    const confidenceBonus = confidenceScore * 0.2
    
    const finalScore = Math.max(0, Math.min(1, avgScore - penaltyForFakes + confidenceBonus))
    
    if (finalScore >= 0.8) return { level: 'high', label: 'Highly Trustworthy', color: 'green' }
    if (finalScore >= 0.6) return { level: 'medium', label: 'Moderately Trustworthy', color: 'yellow' }
    return { level: 'low', label: 'Low Trustworthiness', color: 'red' }
  }

  const trust = calculateTrustLevel()

  const getTrustBadge = () => {
    switch (trust.color) {
      case 'green':
        return (
          <div className="flex items-center space-x-2 bg-green-100 text-green-800 px-4 py-2 rounded-full">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-semibold">{trust.label}</span>
          </div>
        )
      case 'yellow':
        return (
          <div className="flex items-center space-x-2 bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="font-semibold">{trust.label}</span>
          </div>
        )
      default:
        return (
          <div className="flex items-center space-x-2 bg-red-100 text-red-800 px-4 py-2 rounded-full">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="font-semibold">{trust.label}</span>
          </div>
        )
    }
  }

  const getRecommendation = () => {
    switch (trust.level) {
      case 'high':
        return "This business appears to have authentic, reliable reviews. You can trust the overall sentiment."
      case 'medium':
        return "This business has mostly reliable reviews, but consider reading individual reviews carefully."
      default:
        return "Exercise caution. This business shows signs of unreliable reviews or potential manipulation."
    }
  }

  const getQualityIndicators = () => {
    const indicators = []
    
    if (fakeReviewRatio < 0.05) {
      indicators.push({ text: 'Low fake review rate', positive: true })
    } else if (fakeReviewRatio > 0.15) {
      indicators.push({ text: 'High fake review rate detected', positive: false })
    }
    
    if (confidenceScore > 0.85) {
      indicators.push({ text: 'High analysis confidence', positive: true })
    } else if (confidenceScore < 0.6) {
      indicators.push({ text: 'Lower analysis confidence', positive: false })
    }
    
    if (redFlags < 0.2) {
      indicators.push({ text: 'Few red flags detected', positive: true })
    } else if (redFlags > 0.5) {
      indicators.push({ text: 'Multiple red flags present', positive: false })
    }
    
    return indicators
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-900">Trust Assessment</h3>
        {getTrustBadge()}
      </div>
      
      <p className="text-gray-700 mb-4">{getRecommendation()}</p>
      
      <div className="space-y-2">
        <h4 className="font-medium text-gray-900 mb-2">Quality Indicators:</h4>
        {getQualityIndicators().map((indicator, index) => (
          <div key={index} className="flex items-center space-x-2">
            {indicator.positive ? (
              <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            <span className={`text-sm ${indicator.positive ? 'text-green-700' : 'text-red-700'}`}>
              {indicator.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}