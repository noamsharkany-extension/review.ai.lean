import React from 'react'

interface VerdictScoreProps {
  title: string
  score: number
  description: string
  isInverted?: boolean
}

export const VerdictScore: React.FC<VerdictScoreProps> = ({
  title,
  score,
  description,
  isInverted = false
}) => {
  // Score is already a percentage (0-100), just round it
  const percentage = Math.round(score)
  
  // Determine color based on score (percentage 0-100) and whether it's inverted
  const getScoreColor = (score: number, inverted: boolean) => {
    const effectiveScore = inverted ? 100 - score : score
    if (effectiveScore >= 80) return 'text-green-600'
    if (effectiveScore >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getProgressColor = (score: number, inverted: boolean) => {
    const effectiveScore = inverted ? 100 - score : score
    if (effectiveScore >= 80) return 'bg-green-500'
    if (effectiveScore >= 60) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getBackgroundColor = (score: number, inverted: boolean) => {
    const effectiveScore = inverted ? 100 - score : score
    if (effectiveScore >= 80) return 'bg-green-50 border-green-200'
    if (effectiveScore >= 60) return 'bg-yellow-50 border-yellow-200'
    return 'bg-red-50 border-red-200'
  }

  const getTrustIcon = (score: number, inverted: boolean) => {
    const effectiveScore = inverted ? 100 - score : score
    if (effectiveScore >= 80) {
      return (
        <svg className="w-6 h-6 text-green-600 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )
    }
    if (effectiveScore >= 60) {
      return (
        <svg className="w-6 h-6 text-yellow-600 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      )
    }
    return (
      <svg className="w-6 h-6 text-red-600 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    )
  }

  const scoreColor = getScoreColor(score, isInverted)
  const progressColor = getProgressColor(score, isInverted)
  const backgroundColorClass = getBackgroundColor(score, isInverted)
  const trustIcon = getTrustIcon(score, isInverted)

  return (
    <div className={`text-center p-6 rounded-lg border-2 ${backgroundColorClass} transition-all duration-300 hover:shadow-md`}>
      {trustIcon}
      <h4 className="text-lg font-semibold text-gray-900 mb-2">{title}</h4>
      <div className={`text-4xl font-bold mb-3 ${scoreColor}`}>
        {percentage}%
      </div>
      
      {/* Enhanced progress bar with animation */}
      <div className="w-full bg-gray-200 rounded-full h-4 mb-3 shadow-inner">
        <div
          className={`h-4 rounded-full transition-all duration-1000 ease-out ${progressColor} relative overflow-hidden`}
          style={{ width: `${percentage}%` }}
        >
          {/* Animated shine effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>
        </div>
      </div>
      
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  )
}