import React from 'react'
import { AnalysisProgress } from '../../../shared/types'

interface ProgressIndicatorProps {
  progress: AnalysisProgress
  className?: string
}

const PHASE_LABELS = {
  scraping: 'Scraping Reviews',
  sampling: 'Filtering & Sampling',
  sentiment: 'Analyzing Sentiment',
  'fake-detection': 'Detecting Fake Reviews',
  verdict: 'Building Verdict'
} as const

const PHASE_DESCRIPTIONS = {
  scraping: 'Extracting reviews from Google Maps...',
  sampling: 'Intelligently sampling reviews for analysis...',
  sentiment: 'Analyzing sentiment with OpenAI...',
  'fake-detection': 'Detecting fake reviews with AI...',
  verdict: 'Generating final verdict and scores...'
} as const

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ 
  progress, 
  className = '' 
}) => {
  const phases = Object.keys(PHASE_LABELS) as Array<keyof typeof PHASE_LABELS>
  const currentPhaseIndex = phases.indexOf(progress.phase)
  
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Analysis in Progress
        </h3>
        <p className="text-sm text-gray-600">
          {progress.message || PHASE_DESCRIPTIONS[progress.phase]}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Progress</span>
          <span>{Math.round(progress.progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
      </div>

      {/* Phase Steps */}
      <div className="space-y-3">
        {phases.map((phase, index) => {
          const isCompleted = index < currentPhaseIndex
          const isCurrent = index === currentPhaseIndex
          // const isPending = index > currentPhaseIndex

          return (
            <div key={phase} className="flex items-center">
              {/* Step Icon */}
              <div className={`
                flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mr-3
                ${isCompleted 
                  ? 'bg-green-100 text-green-600' 
                  : isCurrent 
                    ? 'bg-blue-100 text-blue-600' 
                    : 'bg-gray-100 text-gray-400'
                }
              `}>
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : isCurrent ? (
                  <div className="w-2 h-2 bg-current rounded-full animate-pulse" />
                ) : (
                  <div className="w-2 h-2 bg-current rounded-full" />
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1">
                <div className={`
                  text-sm font-medium
                  ${isCompleted 
                    ? 'text-green-700' 
                    : isCurrent 
                      ? 'text-blue-700' 
                      : 'text-gray-500'
                  }
                `}>
                  {PHASE_LABELS[phase]}
                </div>
                {isCurrent && (
                  <div className="text-xs text-gray-500 mt-1">
                    {progress.message || PHASE_DESCRIPTIONS[phase]}
                  </div>
                )}
              </div>

              {/* Loading Spinner for Current Phase */}
              {isCurrent && (
                <div className="flex-shrink-0 ml-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}