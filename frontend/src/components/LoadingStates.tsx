import React from 'react';
import { AnalysisProgress } from '../../../shared/types';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  return (
    <div className={`animate-spin rounded-full border-b-2 border-current ${sizeClasses[size]} ${className}`} />
  );
};

interface SkeletonProps {
  className?: string;
  lines?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', lines = 1 }) => {
  return (
    <div className={`animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={`bg-gray-200 rounded ${index > 0 ? 'mt-2' : ''} ${
            index === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'
          }`}
          style={{ height: '1rem' }}
        />
      ))}
    </div>
  );
};

interface ProgressBarProps {
  progress: number;
  className?: string;
  showPercentage?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ 
  progress, 
  className = '',
  showPercentage = false 
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between mb-1">
        {showPercentage && (
          <span className="text-sm font-medium text-gray-700">
            {Math.round(clampedProgress)}%
          </span>
        )}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
};

interface PhaseIndicatorProps {
  currentPhase: AnalysisProgress['phase'];
  progress: number;
  message: string;
  className?: string;
}

const phases = [
  { key: 'scraping', label: 'Scraping Reviews', icon: '🔍' },
  { key: 'sampling', label: 'Filtering & Sampling', icon: '📊' },
  { key: 'sentiment', label: 'Analyzing Sentiment', icon: '🧠' },
  { key: 'fake-detection', label: 'Detecting Fake Reviews', icon: '🔍' },
  { key: 'verdict', label: 'Building Verdict', icon: '⚖️' }
] as const;

export const PhaseIndicator: React.FC<PhaseIndicatorProps> = ({
  currentPhase,
  progress,
  message,
  className = ''
}) => {
  const currentPhaseIndex = phases.findIndex(phase => phase.key === currentPhase);

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-6 shadow-sm ${className}`}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Analysis in Progress</h3>
        <p className="text-sm text-gray-600">{message}</p>
      </div>

      <div className="space-y-4">
        {phases.map((phase, index) => {
          const isActive = index === currentPhaseIndex;
          const isCompleted = index < currentPhaseIndex;
          const isCurrent = phase.key === currentPhase;

          return (
            <div key={phase.key} className="flex items-center">
              <div className={`
                flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${isCompleted 
                  ? 'bg-green-100 text-green-800' 
                  : isActive 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-gray-100 text-gray-500'
                }
              `}>
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span>{phase.icon}</span>
                )}
              </div>
              
              <div className="ml-3 flex-1">
                <p className={`text-sm font-medium ${
                  isActive ? 'text-blue-900' : isCompleted ? 'text-green-900' : 'text-gray-500'
                }`}>
                  {phase.label}
                </p>
                
                {isCurrent && (
                  <div className="mt-1">
                    <ProgressBar progress={progress} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface ResultsSkeletonProps {
  className?: string;
}

export const ResultsSkeleton: React.FC<ResultsSkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`w-full max-w-6xl mx-auto space-y-6 ${className}`}>
      {/* Summary Banner Skeleton */}
      <div className="bg-gray-100 rounded-lg p-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="text-right">
            <Skeleton className="h-12 w-16 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>

      {/* Verdict Scores Skeleton */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 animate-pulse">
        <div className="flex items-center mb-6">
          <div className="w-1 h-8 bg-gray-200 rounded-full mr-4"></div>
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="text-center">
              <Skeleton className="h-16 w-16 rounded-full mx-auto mb-3" />
              <Skeleton className="h-6 w-32 mx-auto mb-2" />
              <Skeleton className="h-4 w-40 mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Metrics Skeleton */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 animate-pulse">
        <div className="flex items-center mb-4">
          <div className="w-1 h-6 bg-gray-200 rounded-full mr-4"></div>
          <Skeleton className="h-6 w-36" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="p-4 border border-gray-100 rounded-lg">
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-4 w-24 mb-1" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Citations Skeleton */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 animate-pulse">
        <div className="flex items-center mb-4">
          <div className="w-1 h-6 bg-gray-200 rounded-full mr-4"></div>
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton lines={3} className="mb-3" />
              <div className="flex space-x-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  progress?: number;
  className?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  message = 'Loading...',
  progress,
  className = ''
}) => {
  if (!isVisible) return null;

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${className}`}>
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mx-auto mb-4 text-blue-600" />
          <p className="text-lg font-medium text-gray-900 mb-2">{message}</p>
          {progress !== undefined && (
            <ProgressBar progress={progress} showPercentage className="mt-4" />
          )}
        </div>
      </div>
    </div>
  );
};