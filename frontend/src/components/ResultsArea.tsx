import React from 'react'
import { AnalysisResults } from '../../../shared/types'
import { VerdictScore } from './VerdictScore'
import { MetricCard } from './MetricCard'
import { CitationsSection } from './CitationsSection'
import { TrustIndicator } from './TrustIndicator'
import { ResultsSkeleton, LoadingSpinner } from './LoadingStates'

interface ResultsAreaProps {
  results?: AnalysisResults
  isLoading?: boolean
  error?: string
}

export const ResultsArea: React.FC<ResultsAreaProps> = ({ 
  results, 
  isLoading = false, 
  error 
}) => {
  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-red-600 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <h3 className="text-lg font-medium text-red-800">Analysis Failed</h3>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-center">
            <LoadingSpinner size="lg" className="mr-3 text-blue-600" />
            <span className="text-lg text-gray-600">Preparing analysis...</span>
          </div>
        </div>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8">
        <div className="text-center py-12">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to Analyze</h3>
          <p className="text-gray-500">Enter a Google URL above to start analyzing reviews</p>
        </div>
      </div>
    )
  }

  // Results display - comprehensive dashboard
  return (
    <div className="w-full max-w-6xl mx-auto mt-8 space-y-6 animate-fade-in">
      {/* Quick Summary Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Analysis Complete</h2>
            <p className="text-blue-100">
              Analyzed {results.sampling.totalReviews} reviews with {(results.analysis.confidenceScore * 100).toFixed(0)}% confidence
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{Math.round(results.verdict.overallScore * 100)}%</div>
            <div className="text-blue-100 text-sm">Overall Score</div>
          </div>
        </div>
      </div>

      {/* Verdict Scores Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
        <div className="flex items-center mb-6">
          <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full mr-4"></div>
          <h2 className="text-2xl font-bold text-gray-900">Analysis Verdict</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <VerdictScore
            title="Overall Impression"
            score={results.verdict.overallScore}
            description="Based on sentiment analysis and review authenticity"
          />
          <VerdictScore
            title="Trustworthiness"
            score={results.verdict.trustworthiness}
            description="Reliability of reviews and business reputation"
          />
          <VerdictScore
            title="Red Flags"
            score={results.verdict.redFlags}
            description="Potential issues detected in reviews"
            isInverted={true}
          />
        </div>
      </div>

      {/* Analysis Metrics Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
        <div className="flex items-center mb-4">
          <div className="w-1 h-6 bg-gradient-to-b from-green-500 to-green-600 rounded-full mr-4"></div>
          <h3 className="text-xl font-semibold text-gray-900">Analysis Overview</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Reviews"
            value={results.sampling.totalReviews.toString()}
            subtitle={results.sampling.samplingUsed ? "Intelligently sampled" : "All analyzed"}
            trend="neutral"
            highlight={results.sampling.totalReviews > 1000}
          />
          <MetricCard
            title="Fake Reviews"
            value={`${(results.analysis.fakeReviewRatio * 100).toFixed(1)}%`}
            subtitle="Detected by AI analysis"
            trend={results.analysis.fakeReviewRatio > 0.1 ? 'negative' : 'positive'}
          />
          <MetricCard
            title="Sentiment Mismatches"
            value={`${(results.analysis.sentimentMismatchRatio * 100).toFixed(1)}%`}
            subtitle="Rating vs text sentiment"
            trend={results.analysis.sentimentMismatchRatio > 0.15 ? 'negative' : 'positive'}
          />
          <MetricCard
            title="Confidence Score"
            value={`${(results.analysis.confidenceScore * 100).toFixed(0)}%`}
            subtitle="Analysis accuracy"
            trend={results.analysis.confidenceScore > 0.8 ? 'positive' : results.analysis.confidenceScore > 0.6 ? 'neutral' : 'negative'}
            highlight={results.analysis.confidenceScore > 0.9}
          />
        </div>
      </div>

      {/* Trust Assessment */}
      <TrustIndicator
        overallScore={results.verdict.overallScore}
        trustworthiness={results.verdict.trustworthiness}
        redFlags={results.verdict.redFlags}
        fakeReviewRatio={results.analysis.fakeReviewRatio}
        confidenceScore={results.analysis.confidenceScore}
      />

      {/* Sampling Information */}
      {results.sampling.samplingUsed && results.sampling.sampleBreakdown && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="flex items-center mb-3">
            <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full mr-4"></div>
            <h3 className="text-lg font-semibold text-blue-900">Sampling Methodology</h3>
          </div>
          <p className="text-blue-800 mb-4">
            Due to the large number of reviews ({results.sampling.totalReviews}), we used intelligent sampling:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-900">{results.sampling.sampleBreakdown.recent}</div>
              <div className="text-sm text-blue-700">Recent Reviews</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-900">{results.sampling.sampleBreakdown.fivestar}</div>
              <div className="text-sm text-blue-700">Five-Star Reviews</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-900">{results.sampling.sampleBreakdown.onestar}</div>
              <div className="text-sm text-blue-700">One-Star Reviews</div>
            </div>
          </div>
        </div>
      )}

      {/* Citations Section */}
      <CitationsSection citations={results.citations} />
    </div>
  )
}