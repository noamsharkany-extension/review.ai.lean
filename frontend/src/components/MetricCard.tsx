import React from 'react'

interface MetricCardProps {
  title: string
  value: string
  subtitle: string
  icon?: React.ReactNode
  trend?: 'positive' | 'negative' | 'neutral'
  highlight?: boolean
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend = 'neutral',
  highlight = false
}) => {
  const getTrendColor = () => {
    switch (trend) {
      case 'positive': return 'text-green-600'
      case 'negative': return 'text-red-600'
      default: return 'text-gray-900'
    }
  }

  const getCardStyle = () => {
    if (highlight) {
      return 'bg-blue-50 border-2 border-blue-200 shadow-md'
    }
    return 'bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors duration-200'
  }

  const getDefaultIcon = () => {
    if (title.toLowerCase().includes('reviews')) {
      return (
        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
    if (title.toLowerCase().includes('fake')) {
      return (
        <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
        </svg>
      )
    }
    if (title.toLowerCase().includes('sentiment')) {
      return (
        <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      )
    }
    if (title.toLowerCase().includes('confidence')) {
      return (
        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )
    }
    return (
      <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
      </svg>
    )
  }

  return (
    <div className={`rounded-lg p-4 text-center ${getCardStyle()}`}>
      <div className="flex items-center justify-center mb-2">
        {icon || getDefaultIcon()}
        <h4 className="text-sm font-medium text-gray-600 ml-2">{title}</h4>
      </div>
      <div className={`text-2xl font-bold mb-1 ${getTrendColor()}`}>{value}</div>
      <p className="text-xs text-gray-500 leading-relaxed">{subtitle}</p>
    </div>
  )
}