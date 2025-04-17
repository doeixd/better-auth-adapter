import type { TriplitClient } from "@triplit/client";

/**
 * Handler type definition for Triplit database operations
 */
export interface TriplitHandlerFunctions {
  /**
   * Main handler for Better-Auth operations
   */
  betterAuth: (request: any) => Promise<any>;
  
  /**
   * Query records from a Triplit collection
   */
  query: (options: {
    tableName: string;
    query?: any;
    where?: any[];
    limit?: number;
    order?: string;
    single?: boolean;
  }) => Promise<any>;
  
  /**
   * Insert a record into a Triplit collection
   */
  insert: (options: {
    tableName: string;
    values: Record<string, any>;
  }) => Promise<any>;
  
  /**
   * Update records in a Triplit collection
   */
  update: (options: {
    tableName: string;
    query?: any;
    where?: any[];
    update: Record<string, any>;
    id?: string;
  }) => Promise<any>;
  
  /**
   * Delete records from a Triplit collection
   */
  delete: (options: {
    tableName: string;
    query?: any;
    where?: any[];
    id?: string;
    deleteAll?: boolean;
  }) => Promise<any>;
  
  /**
   * Count records in a Triplit collection
   */
  count: (options: {
    tableName: string;
    query?: any;
    where?: any[];
  }) => Promise<number>;
}

export type TriplitHandlerReturnType = TriplitHandlerFunctions;

/**
 * Creates a handler for Triplit database operations with Better-Auth
 * 
 * @param client The Triplit client instance
 * @returns Object containing handler functions for database operations
 */
export function TriplitHandler(
  client: TriplitClient
): TriplitHandlerReturnType {
  /**
   * Main handler for Better-Auth operations
   */
  async function betterAuth(request: any): Promise<any> {
    try {
      const { action, options } = request;
      
      switch (action) {
        case "query":
          return await query(options);
        case "insert":
          return await insert(options);
        case "update":
          return await update(options);
        case "delete":
          return await delete_(options);
        case "count":
          return await count(options);
        default:
          throw new Error(`Unsupported action: ${action}`);
      }
    } catch (error) {
      console.error("[triplit-handler] Error in betterAuth handler:", error);
      throw error;
    }
  }

  /**
   * Query records from a Triplit collection
   */
  async function query(options: {
    tableName: string;
    query?: any;
    where?: any[];
    limit?: number;
    order?: string;
    single?: boolean;
  }): Promise<any> {
    const { tableName, query: customQuery, where = [], limit, order, single = false } = options;
    
    try {
      // Start with base query
      let query = client.query(tableName);
      
      // If a custom query object is provided, use it
      if (customQuery) {
        // Apply the custom query (this depends on your query format)
        if (typeof customQuery === 'function') {
          query = customQuery(query);
        } else {
          // Handle other query formats as needed
          console.warn("[triplit-handler] Unsupported custom query format");
        }
      } else {
        // Apply where conditions
        where.forEach(condition => {
          query = query.Where(condition[0], condition[1], condition[2]);
        });
      }
      
      // Apply order if provided
      if (order) {
        const [field, direction] = order.split(' ');
        query = query.Order(field, direction.toLowerCase() as any);
      }
      
      // Apply limit if provided
      if (limit) {
        query = query.Limit(limit);
      }
      
      // Execute query
      if (single) {
        return await client.fetchOne(query);
      } else {
        return await client.fetch(query);
      }
    } catch (error) {
      console.error(`[triplit-handler] Error querying collection ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Insert a record into a Triplit collection
   */
  async function insert(options: {
    tableName: string;
    values: Record<string, any>;
  }): Promise<any> {
    const { tableName, values } = options;
    
    try {
      // Insert the record
      const result = await client.insert(tableName, values);
      
      // Fetch the inserted record to return
      const insertedRecord = await client.fetchById(tableName, result.id);
      return insertedRecord;
    } catch (error) {
      console.error(`[triplit-handler] Error inserting into collection ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Update records in a Triplit collection
   */
  async function update(options: {
    tableName: string;
    query?: any;
    where?: any[];
    update: Record<string, any>;
    id?: string;
  }): Promise<any> {
    const { tableName, query: customQuery, where = [], update: updateValues, id } = options;
    
    try {
      // If ID is provided, update directly
      if (id) {
        await client.update(tableName, id, updateValues);
        return await client.fetchById(tableName, id);
      }
      
      // Otherwise, find records to update
      const recordsToUpdate = await query({
        tableName,
        query: customQuery,
        where,
        limit: 1,
        single: false
      });
      
      if (!recordsToUpdate.length) {
        return null;
      }
      
      // Update the first record found
      const recordId = recordsToUpdate[0].id;
      await client.update(tableName, recordId, updateValues);
      
      // Return the updated record
      return await client.fetchById(tableName, recordId);
    } catch (error) {
      console.error(`[triplit-handler] Error updating collection ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Delete records from a Triplit collection
   */
  async function delete_(options: {
    tableName: string;
    query?: any;
    where?: any[];
    id?: string;
    deleteAll?: boolean;
  }): Promise<any> {
    const { tableName, query: customQuery, where = [], id, deleteAll = false } = options;
    
    try {
      // If ID is provided, delete directly
      if (id) {
        await client.delete(tableName, id);
        return true;
      }
      
      // Find records to delete
      const recordsToDelete = await query({
        tableName,
        query: customQuery,
        where,
        single: false
      });
      
      if (!recordsToDelete.length) {
        return deleteAll ? 0 : false;
      }
      
      // Delete records
      if (deleteAll) {
        // Delete all matching records
        for (const record of recordsToDelete) {
          await client.delete(tableName, record.id);
        }
        return recordsToDelete.length;
      } else {
        // Delete only the first record
        await client.delete(tableName, recordsToDelete[0].id);
        return true;
      }
    } catch (error) {
      console.error(`[triplit-handler] Error deleting from collection ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Count records in a Triplit collection
   */
  async function count(options: {
    tableName: string;
    query?: any;
    where?: any[];
  }): Promise<number> {
    const { tableName, query: customQuery, where = [] } = options;
    
    try {
      // Find matching records
      const records = await query({
        tableName,
        query: customQuery,
        where,
        single: false
      });
      
      // Return count
      return records.length;
    } catch (error) {
      console.error(`[triplit-handler] Error counting records in collection ${tableName}:`, error);
      throw error;
    }
  }

  return {
    betterAuth,
    query,
    insert,
    update,
    delete: delete_,
    count
  };
}