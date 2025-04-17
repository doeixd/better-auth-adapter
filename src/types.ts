import type { TriplitClient } from "@triplit/client";
import type { AdapterInstance } from 'better-auth'

export type TriplitAdapter = (
  triplitClient: TriplitClient,
  config?: TriplitAdapterOptions,
) => AdapterInstance;

export interface TriplitAdapterOptions {
  /**
   * Enable debug logs to help troubleshoot issues
   */
  enable_debug_logs?: boolean;
  
  /**
   * Custom collection naming function. If provided, this function will be used to map
   * Better-Auth table names to Triplit collection names.
   * 
   * @param tableName The table name from Better-Auth
   * @returns The collection name to use in Triplit
   */
  customCollectionName?: (tableName: string) => string;
  
  /**
   * Options for handling ID fields and transformations
   */
  id_options?: {
    /**
     * Field name to use for IDs in Triplit collections
     * @default "id"
     */
    field_name?: string;
    
    /**
     * Function to transform IDs before storing in Triplit
     */
    transform?: (id: string) => string;
  };
  
  /**
   * Field transformation options
   */
  field_options?: {
    /**
     * Custom field transformations for specific models
     * Example: { users: { email: (value) => value.toLowerCase() } }
     */
    transformers?: Record<string, Record<string, (value: any) => any>>;
  };
}

/**
 * Represents a condition in a WHERE clause
 */
export interface WhereCondition {
  /**
   * Field name to filter on
   */
  field: string;
  
  /**
   * Operator to use for comparison
   * @default "="
   */
  operator?: string;
  
  /**
   * Value to compare against
   */
  value: any;
  
  /**
   * Logical connector to use with previous condition
   * @default "AND"
   */
  connector?: "AND" | "OR";
}

/**
 * Query builder interface for constructing Triplit queries
 */
export interface TriplitQueryBuilder {
  /**
   * Equal to operator
   */
  eq: (field: string, value: any) => any;
  
  /**
   * Not equal to operator
   */
  neq: (field: string, value: any) => any;
  
  /**
   * Greater than operator
   */
  gt: (field: string, value: any) => any;
  
  /**
   * Greater than or equal to operator
   */
  gte: (field: string, value: any) => any;
  
  /**
   * Less than operator
   */
  lt: (field: string, value: any) => any;
  
  /**
   * Less than or equal to operator
   */
  lte: (field: string, value: any) => any;
  
  /**
   * In operator (value is in array)
   */
  in: (field: string, value: any[]) => any;
  
  /**
   * Not in operator (value is not in array)
   */
  not_in: (field: string, value: any[]) => any;
  
  /**
   * Contains operator (for arrays and strings)
   */
  contains: (field: string, value: any) => any;
  
  /**
   * Not contains operator (for arrays and strings)
   */
  notContains: (field: string, value: any) => any;
  
  /**
   * Logical AND operator
   */
  and: (left: any, right: any) => any;
  
  /**
   * Logical OR operator
   */
  or: (left: any, right: any) => any;
}