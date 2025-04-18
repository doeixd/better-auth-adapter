export { triplitAdapter } from './adapter';


export type {
  TriplitAdapter,
  TriplitAdapterOptions,
  WhereCondition, // Exported from types.ts now
  TriplitQueryBuilder // Exported from types.ts now
} from './types'; // Assuming WhereCondition and TriplitQueryBuilder are moved/re-exported from types.ts

// Optional: Re-export query builder utility if users might need it directly
export { queryBuilder } from './queryBuilder';
