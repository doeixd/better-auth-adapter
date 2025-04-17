import type { BetterAuthOptions } from "better-auth";
import type { TriplitClient } from "@triplit/client";
import type { TriplitAdapterOptions } from "./types";
import type { WhereCondition } from "./handler/types";

interface TransformContext {
  config: TriplitAdapterOptions;
  options: BetterAuthOptions;
  client: TriplitClient;
}

export function createTransform({ config, options, client }: TransformContext) {
  function getCollectionName(tableName: string): string {
    if (config.customCollectionName) {
      return config.customCollectionName(tableName);
    }
    
    // Default collection naming
    return tableName;
  }

  function transformInput(
    data: Record<string, any>,
    model: string,
    operation: "create" | "update"
  ): Record<string, any> {
    const transformedData: Record<string, any> = { ...data };
    
    // Apply model-specific field transformers if configured
    const modelTransformers = config.field_options?.transformers?.[model];
    if (modelTransformers) {
      Object.entries(modelTransformers).forEach(([field, transformer]) => {
        if (transformedData[field] !== undefined) {
          transformedData[field] = transformer(transformedData[field]);
        }
      });
    }
    
    // Handle ID field transformation if needed
    const idField = config.id_options?.field_name || "id";
    if (transformedData[idField] && config.id_options?.transform) {
      transformedData[idField] = config.id_options.transform(transformedData[idField]);
    }
    
    // Add/modify timestamps for create operations
    if (operation === "create") {
      if (!transformedData.createdAt) {
        transformedData.createdAt = new Date();
      }
      if (!transformedData.updatedAt) {
        transformedData.updatedAt = new Date();
      }
    }
    
    // Update the updatedAt timestamp for update operations
    if (operation === "update") {
      transformedData.updatedAt = new Date();
    }
    
    return transformedData;
  }

  function transformOutput(data: Record<string, any>, model: string): Record<string, any> {
    // Return null if no data
    if (!data) return null;
    
    // Clone the data to avoid mutations
    const transformedData = { ...data };
    
    // Handle any special field transformations needed for Better-Auth
    
    // Ensure date objects are correctly formatted
    if (transformedData.createdAt && !(transformedData.createdAt instanceof Date)) {
      transformedData.createdAt = new Date(transformedData.createdAt);
    }
    
    if (transformedData.updatedAt && !(transformedData.updatedAt instanceof Date)) {
      transformedData.updatedAt = new Date(transformedData.updatedAt);
    }
    
    return transformedData;
  }

  function filterInvalidOperators(where: WhereCondition[]): void {
    // Filter out any operators not supported by Triplit
    const supportedOperators = [
      "=", "==", "!=", ">", ">=", "<", "<=", "in", "not_in", "contains", "notContains"
    ];
    
    // Remove conditions with unsupported operators
    where = where.filter(condition => {
      const operator = condition.operator || "=";
      return supportedOperators.includes(operator);
    });
  }

  function transformWhereOperators(where: WhereCondition[]): WhereCondition[] {
    // Map Better-Auth operators to Triplit operators
    return where.map(condition => {
      const newCondition = { ...condition };
      
      // Map operator if needed
      if (newCondition.operator) {
        switch (newCondition.operator) {
          case "==":
            newCondition.operator = "=";
            break;
          case "not_in":
            newCondition.operator = "not in";
            break;
          // Add other operator mappings as needed
        }
      }
      
      return newCondition;
    });
  }

  /**
   * Database abstraction function to handle various operations
   */
  async function db({ 
    action, 
    tableName, 
    values = {}, 
    where = [],
    query = null,
    id = null,
    update = {},
    limit = null,
    order = null,
    deleteAll = false,
    single = false,
    paginationOpts = null
  }: any) {
    const collectionName = getCollectionName(tableName);
    
    try {
      switch (action) {
        case "insert": {
          const result = await client.insert(collectionName, values);
          return result;
        }
        
        case "queryOne": {
          // Build query for single item
          let query = client.query(collectionName);
          
          // Add where conditions
          where.forEach((condition: WhereCondition) => {
            const field = condition.field;
            const value = condition.value;
            const op = condition.operator || "=";
            const triplitOp = op === "==" ? "=" : op;
            
            query = query.Where(field, triplitOp as any, value);
          });
          
          // Execute query
          const result = await client.fetchOne(query);
          return result;
        }
        
        case "query": {
          // If a pre-built query is provided, use it
          if (query) {
            // Add limit if provided
            if (limit) {
              query = query.Limit(limit);
            }
            
            // Add order if provided
            if (order) {
              const [field, direction] = order.split(' ');
              query = query.Order(field, direction as any);
            }
            
            const results = await client.fetch(query);
            return results;
          }
          
          // Otherwise, build a query from parameters
          let builtQuery = client.query(collectionName);
          
          // Add where conditions
          where.forEach((condition: WhereCondition) => {
            const field = condition.field;
            const value = condition.value;
            const op = condition.operator || "=";
            const triplitOp = op === "==" ? "=" : op;
            
            builtQuery = builtQuery.Where(field, triplitOp as any, value);
          });
          
          // Add limit if provided
          if (limit) {
            builtQuery = builtQuery.Limit(limit);
          }
          
          // Add order if provided
          if (order) {
            const [field, direction] = order.split(' ');
            builtQuery = builtQuery.Order(field, direction as any);
          }
          
          // Execute query
          const results = await client.fetch(builtQuery);
          return results;
        }
        
        case "update": {
          // If id is provided, update by id
          if (id) {
            const result = await client.update(collectionName, id, update);
            return result;
          }
          
          // Otherwise, need to find entities to update via query
          let updateQuery = client.query(collectionName);
          
          // Add where conditions
          where.forEach((condition: WhereCondition) => {
            const field = condition.field;
            const value = condition.value;
            const op = condition.operator || "=";
            const triplitOp = op === "==" ? "=" : op;
            
            updateQuery = updateQuery.Where(field, triplitOp as any, value);
          });
          
          // Find entities to update
          const entitiesToUpdate = await client.fetch(updateQuery);
          
          // Update first entity found (for single update)
          if (entitiesToUpdate.length > 0) {
            const result = await client.update(collectionName, entitiesToUpdate[0].id, update);
            return result;
          }
          
          return null;
        }
        
        case "delete": {
          // If id is provided, delete by id
          if (id) {
            await client.delete(collectionName, id);
            return true;
          }
          
          // If deleteAll flag is set, delete all matching entities
          if (deleteAll) {
            let deleteQuery = client.query(collectionName);
            
            // Add where conditions
            where.forEach((condition: WhereCondition) => {
              const field = condition.field;
              const value = condition.value;
              const op = condition.operator || "=";
              const triplitOp = op === "==" ? "=" : op;
              
              deleteQuery = deleteQuery.Where(field, triplitOp as any, value);
            });
            
            // Find entities to delete
            const entitiesToDelete = await client.fetch(deleteQuery);
            
            // Delete each entity
            for (const entity of entitiesToDelete) {
              await client.delete(collectionName, entity.id);
            }
            
            return entitiesToDelete.length;
          }
          
          // Otherwise, find and delete first matching entity
          let deleteQuery = client.query(collectionName);
          
          // Add where conditions
          where.forEach((condition: WhereCondition) => {
            const field = condition.field;
            const value = condition.value;
            const op = condition.operator || "=";
            const triplitOp = op === "==" ? "=" : op;
            
            deleteQuery = deleteQuery.Where(field, triplitOp as any, value);
          });
          
          // Find entities to delete
          const entitiesToDelete = await client.fetch(deleteQuery);
          
          // Delete first entity found
          if (entitiesToDelete.length > 0) {
            await client.delete(collectionName, entitiesToDelete[0].id);
            return true;
          }
          
          return false;
        }
        
        case "count": {
          let countQuery = client.query(collectionName);
          
          // Add where conditions if provided
          if (where && where.length > 0) {
            where.forEach((condition: WhereCondition) => {
              const field = condition.field;
              const value = condition.value;
              const op = condition.operator || "=";
              const triplitOp = op === "==" ? "=" : op;
              
              countQuery = countQuery.Where(field, triplitOp as any, value);
            });
          }
          
          // Execute query and count results
          const results = await client.fetch(countQuery);
          return results.length;
        }
        
        default:
          throw new Error(`Unsupported action: ${action}`);
      }
    } catch (error) {
      console.error(`[triplit-adapter] Error in db operation:`, error);
      throw error;
    }
  }

  return {
    transformInput,
    filterInvalidOperators,
    db,
    transformOutput,
    transformWhereOperators,
  };
}