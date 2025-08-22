import React, { useState, useCallback } from 'react'

interface UrlInputProps {
  onSubmit: (url: string) => void
  isLoading?: boolean
  disabled?: boolean
}

interface ValidationResult {
  isValid: boolean
  error?: string
}

export const UrlInput: React.FC<UrlInputProps> = ({ 
  onSubmit, 
  isLoading = false, 
  disabled = false 
}) => {
  const [url, setUrl] = useState('')
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true })
  const [hasInteracted, setHasInteracted] = useState(false)

  const validateUrl = useCallback((inputUrl: string): ValidationResult => {
    if (!inputUrl.trim()) {
      return { isValid: false, error: 'Please enter a URL' }
    }

    try {
      const urlObj = new URL(inputUrl)
      
      // Check if it's a Google domain
      const googleDomains = ['google.com', 'maps.google.com', 'www.google.com']
      const isGoogleDomain = googleDomains.some(domain => 
        urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
      )

      if (!isGoogleDomain) {
        return { 
          isValid: false, 
          error: 'Please enter a valid Google URL (Google Maps, Google Search, etc.)' 
        }
      }

      // Check for review-related paths or parameters
      const hasReviewIndicators = 
        inputUrl.includes('reviews') ||
        inputUrl.includes('place') ||
        inputUrl.includes('maps') ||
        inputUrl.includes('search') ||
        inputUrl.includes('q=')

      if (!hasReviewIndicators) {
        return { 
          isValid: false, 
          error: 'URL should contain reviews or be a Google Maps/Search page' 
        }
      }

      return { isValid: true }
    } catch {
      return { 
        isValid: false, 
        error: 'Please enter a valid URL starting with http:// or https://' 
      }
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    setUrl(newUrl)
    
    if (hasInteracted) {
      setValidation(validateUrl(newUrl))
    }
  }

  const handleBlur = () => {
    setHasInteracted(true)
    setValidation(validateUrl(url))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setHasInteracted(true)
    
    const validationResult = validateUrl(url)
    setValidation(validationResult)
    
    if (validationResult.isValid) {
      onSubmit(url.trim())
    }
  }

  const showError = hasInteracted && !validation.isValid

  return (
    <div className="w-full max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="url-input" className="block text-sm font-medium text-gray-700 mb-2">
            Enter Google URL with Reviews
          </label>
          <div className="relative">
            <input
              id="url-input"
              type="text"
              value={url}
              onChange={handleInputChange}
              onBlur={handleBlur}
              disabled={disabled || isLoading}
              placeholder="https://maps.google.com/... or https://www.google.com/search?q=..."
              className={`
                w-full px-4 py-3 text-lg border rounded-lg shadow-sm
                focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                disabled:bg-gray-100 disabled:cursor-not-allowed
                ${showError 
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300'
                }
              `}
            />
            {isLoading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
          
          {showError && validation.error && (
            <p className="mt-2 text-sm text-red-600 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {validation.error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={disabled || isLoading || !validation.isValid}
          className={`
            w-full py-3 px-6 text-lg font-medium rounded-lg shadow-sm
            focus:outline-none focus:ring-2 focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            ${validation.isValid && !isLoading
              ? 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500'
              : 'bg-gray-300 text-gray-500'
            }
          `}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Analyzing Reviews...
            </span>
          ) : (
            'Analyze Reviews'
          )}
        </button>
      </form>

      {/* Example URLs */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="text-sm font-medium text-blue-900 mb-2">Example URLs:</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Google Maps: https://maps.google.com/place/...</li>
          <li>• Google Search: https://www.google.com/search?q=restaurant+reviews</li>
          <li>• Any Google page showing business reviews</li>
        </ul>
      </div>
    </div>
  )
}