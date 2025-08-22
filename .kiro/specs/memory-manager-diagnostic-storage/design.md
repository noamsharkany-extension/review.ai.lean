# Design Document

## Overview

This design addresses the critical missing `storeDiagnosticData` method in the `MemoryManager` class that is causing scraper failures. The solution implements a comprehensive diagnostic data storage system that integrates seamlessly with the existing memory management infrastructure while providing efficient storage, retrieval, and cleanup capabilities.

## Architecture

### Core Components

1. **DiagnosticDataStore**: In-memory storage with LRU eviction and priority-based retention
2. **DiagnosticEntry Interface**: Standardized data structure for all diagnostic information
3. **Storage Management**: Automatic cleanup and memory-efficient operations
4. **Query Interface**: Flexible retrieval methods for different use cases

### Integration Points

- **Existing MemoryManager**: Extends current class without breaking changes
- **Cleanup System**: Integrates with existing memory cleanup callbacks
- **Monitoring**: Works with current memory monitoring and thresholds

## Components and Interfaces

### DiagnosticEntry Interface

```typescript
interface DiagnosticEntry {
  id: string;
  url: string;
  data: any;
  priority: 'low' | 'medium' | 'high';
  timestamp: number;
  dataSize: number; // Estimated size in bytes
  lastAccessed: number;
}
```

### DiagnosticStorageConfig Interface

```typescript
interface DiagnosticStorageConfig {
  maxEntries: number;
  maxMemoryMB: number;
  retentionByPriority: {
    high: number;    // milliseconds
    medium: number;
    low: number;
  };
  compressionThreshold: number; // bytes
}
```

### Storage Implementation

The diagnostic storage will use a Map-based approach with the following characteristics:

- **Primary Storage**: `Map<string, DiagnosticEntry>` for O(1) access by ID
- **URL Index**: `Map<string, Set<string>>` for efficient URL-based queries
- **Priority Index**: `Map<string, Set<string>>` for priority-based queries
- **LRU Tracking**: Timestamp-based access tracking for eviction

### Memory Management Integration

The storage system integrates with existing memory management:

1. **Automatic Cleanup**: Registered as cleanup callback in existing system
2. **Memory Monitoring**: Contributes to overall memory usage calculations
3. **Threshold Compliance**: Respects existing memory thresholds
4. **Cleanup Triggers**: Participates in existing cleanup triggers

## Data Models

### Storage Structure

```typescript
class DiagnosticDataStore {
  private entries: Map<string, DiagnosticEntry>;
  private urlIndex: Map<string, Set<string>>;
  private priorityIndex: Map<'low' | 'medium' | 'high', Set<string>>;
  private config: DiagnosticStorageConfig;
  private currentMemoryUsage: number;
}
```

### Default Configuration

```typescript
const DEFAULT_CONFIG: DiagnosticStorageConfig = {
  maxEntries: 1000,
  maxMemoryMB: 50,
  retentionByPriority: {
    high: 24 * 60 * 60 * 1000,    // 24 hours
    medium: 6 * 60 * 60 * 1000,   // 6 hours
    low: 1 * 60 * 60 * 1000       // 1 hour
  },
  compressionThreshold: 10 * 1024 // 10KB
};
```

## Error Handling

### Storage Errors

1. **Memory Limit Exceeded**: Automatic LRU eviction before storing new entries
2. **Invalid Parameters**: Graceful handling with default values and logging
3. **Serialization Errors**: Fallback to string representation for complex objects
4. **Concurrent Access**: Thread-safe operations using proper locking mechanisms

### Recovery Strategies

1. **Partial Failure**: Continue operation even if some diagnostic data can't be stored
2. **Memory Pressure**: Aggressive cleanup of low-priority entries
3. **Corruption Detection**: Validate stored data and remove corrupted entries
4. **Fallback Storage**: Option to disable diagnostic storage if memory is critically low

## Testing Strategy

### Unit Tests

1. **Method Existence**: Verify `storeDiagnosticData` method exists and is callable
2. **Parameter Validation**: Test all parameter combinations and edge cases
3. **Memory Management**: Test automatic cleanup and eviction policies
4. **Concurrent Access**: Test thread safety with multiple simultaneous calls
5. **Error Handling**: Test graceful handling of invalid inputs and memory pressure

### Integration Tests

1. **Service Integration**: Test with all services that call `storeDiagnosticData`
2. **Memory Cleanup**: Test integration with existing cleanup system
3. **Performance Impact**: Measure impact on scraper performance
4. **Memory Monitoring**: Test integration with existing memory monitoring

### Performance Tests

1. **Storage Performance**: Measure storage and retrieval times
2. **Memory Efficiency**: Verify memory usage stays within limits
3. **Cleanup Performance**: Test cleanup operation efficiency
4. **Concurrent Performance**: Test performance under concurrent access

### Validation Tests

1. **Scraper Functionality**: Verify scraper works after implementing the fix
2. **Service Compatibility**: Test all dependent services work correctly
3. **Memory Health**: Verify memory health monitoring continues to work
4. **Diagnostic Retrieval**: Test all query methods return correct results

## Implementation Approach

### Phase 1: Core Method Implementation
- Add `storeDiagnosticData` method to `MemoryManager`
- Implement basic storage functionality
- Add parameter validation and error handling

### Phase 2: Storage Optimization
- Implement LRU eviction policy
- Add memory usage tracking
- Integrate with existing cleanup system

### Phase 3: Query Interface
- Add retrieval methods for different query patterns
- Implement filtering and search capabilities
- Add memory usage reporting

### Phase 4: Integration and Testing
- Test with all dependent services
- Verify scraper functionality restoration
- Performance optimization and monitoring

## Security Considerations

1. **Data Sanitization**: Ensure stored diagnostic data doesn't contain sensitive information
2. **Memory Limits**: Prevent diagnostic storage from consuming excessive memory
3. **Access Control**: Ensure diagnostic data access is properly controlled
4. **Data Lifecycle**: Implement proper data retention and cleanup policies