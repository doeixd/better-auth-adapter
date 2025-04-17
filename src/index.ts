// Main adapter export
export { triplitAdapter } from './adapter';
export type { TriplitAdapter, TriplitAdapterOptions } from './types';

// Optional: Re-export handler for direct integration
export { TriplitHandler } from './handler/triplit';
export type { TriplitHandlerFunctions, TriplitHandlerReturnType } from './handler/triplit';

// Optional: Re-export transform utilities
export { createTransform } from './transform';

// Optional: Re-export query builder
export { queryBuilder } from './queryBuilder';
export type { WhereCondition, TriplitQueryBuilder } from './handler/types';