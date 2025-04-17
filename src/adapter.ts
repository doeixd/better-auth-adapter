import type { Adapter, AdapterInstance, BetterAuthOptions } from "better-auth";
import type { TriplitClient } from "@triplit/client";
import type { TriplitAdapterOptions } from "./types";
import { createTransform } from "./transform";

export type TriplitAdapter = (
  triplitClient: TriplitClient,
  config?: TriplitAdapterOptions,
) => AdapterInstance;

export const triplitAdapter: TriplitAdapter = (client, config = {}) => {
  function debugLog(message: any[]) {
    if (config.enable_debug_logs) {
      console.log(`[triplit-adapter]`, ...message);
    }
  }

  return (options: BetterAuthOptions): Adapter => {
    const {
      transformInput,
      filterInvalidOperators,
      db,
      transformOutput,
      transformWhereOperators,
    } = createTransform({
      config,
      options,
      client,
    });

    return {
      id: "triplit",
      create: async ({ data: values, model, select }) => {
        const start = Date.now();
        debugLog(["create", { model, values, select }]);
        const transformed = transformInput(values, model, "create");

        const res = await db({
          action: "insert",
          tableName: model,
          values: transformed,
        });
        
        let result: Record<string, any> | null = null;

        if (!select || select.length === 0) result = res;
        else {
          result = {};
          for (const key of select) {
            result[key] = res[key];
          }
        }
        result = result ? (transformOutput(result, model) as any) : result;
        debugLog([
          "create result",
          { result, duration: `${Date.now() - start}ms` },
        ]);
        return result as any;
      },
      
      findOne: async ({ model, where, select }) => {
        const start = Date.now();
        filterInvalidOperators(where);
        where = transformWhereOperators(where);
        debugLog(["findOne", { model, where, select }]);
        
        const res = await db({
          action: "queryOne",
          tableName: model,
          where: where,
        });

        let result: Record<string, any> | null = null;

        if (!select || select.length === 0) result = res;
        else {
          result = {};
          for (const key of select) {
            result[key] = res[key];
          }
        }
        result = result ? (transformOutput(result, model) as any) : result;
        debugLog([
          "findOne result",
          { result, duration: `${Date.now() - start}ms` },
        ]);
        return result as any;
      },
      
      findMany: async ({ model, where, limit, offset, sortBy }) => {
        const start = Date.now();
        filterInvalidOperators(where);
        where = transformWhereOperators(where);
        debugLog(["findMany", { model, where, limit, offset, sortBy }]);

        // Build query for Triplit
        let query = client.query(model);
        
        // Add where conditions if they exist
        if (where && where.length > 0) {
          where.forEach(condition => {
            // Handle different operators and connectors
            const field = condition.field;
            const value = condition.value;
            const operator = condition.operator || "=";
            
            // Map operator to Triplit's format
            const triplitOperator = mapOperatorToTriplit(operator);
            
            // Add the where condition
            query = query.Where(field, triplitOperator, value);
          });
        }
        
        // Add sorting if specified
        if (sortBy) {
          query = query.Order(sortBy.field, sortBy.direction.toLowerCase() as any);
        }
        
        // Add pagination if needed
        if (limit) {
          query = query.Limit(limit);
        }
        
        // Execute the query
        let results = await db({
          action: "query",
          tableName: model,
          query: query,
        });
        
        // Handle offset manually if needed
        if (offset && offset > 0) {
          results = results.slice(offset);
        }
        
        // Transform the results
        const transformedResults = results.map((x: any) => transformOutput(x, model));
        
        debugLog([
          "findMany result",
          { result: transformedResults, duration: `${Date.now() - start}ms` },
        ]);
        
        return transformedResults;
      },
      
      update: async ({ model, where, update }) => {
        const start = Date.now();
        filterInvalidOperators(where);
        where = transformWhereOperators(where);
        debugLog(["update", { model, where, update }]);

        const transformed = transformInput(update, model, "update");
        
        // First find the entity to update
        const entityToUpdate = await db({
          action: "queryOne",
          tableName: model,
          where: where,
        });
        
        if (!entityToUpdate) {
          return null;
        }
        
        // Perform the update
        const res = await db({
          action: "update",
          tableName: model,
          id: entityToUpdate.id,
          update: transformed,
        });
        
        const result = transformOutput(res, model) as any;
        debugLog([
          "update result",
          { result, duration: `${Date.now() - start}ms` },
        ]);
        return result;
      },
      
      updateMany: async ({ model, where, update }) => {
        const start = Date.now();
        filterInvalidOperators(where);
        where = transformWhereOperators(where);
        debugLog(["updateMany", { model, where, update }]);

        const transformed = transformInput(update, model, "update");
        
        // First find all entities to update
        const entitiesToUpdate = await db({
          action: "query",
          tableName: model,
          where: where,
        });
        
        // Perform batch update
        const updates = entitiesToUpdate.map(async (entity: any) => {
          return db({
            action: "update",
            tableName: model,
            id: entity.id,
            update: transformed,
          });
        });
        
        const updatedEntities = await Promise.all(updates);
        const result = updatedEntities.map(entity => transformOutput(entity, model));
        
        debugLog([
          "updateMany result", 
          { result, duration: `${Date.now() - start}ms` },
        ]);
        
        return result;
      },
      
      delete: async ({ model, where }) => {
        const start = Date.now();
        filterInvalidOperators(where);
        where = transformWhereOperators(where);
        debugLog(["delete", { model, where }]);

        // First find the entity to delete
        const entityToDelete = await db({
          action: "queryOne",
          tableName: model,
          where: where,
        });
        
        if (!entityToDelete) {
          return;
        }
        
        // Delete the entity
        await db({
          action: "delete",
          tableName: model,
          id: entityToDelete.id,
        });
        
        debugLog(["delete complete", { duration: `${Date.now() - start}ms` }]);
        return;
      },
      
      deleteMany: async ({ model, where }) => {
        const start = Date.now();
        filterInvalidOperators(where);
        where = transformWhereOperators(where);
        debugLog(["deleteMany", { model, where }]);

        // First find all entities to delete
        const entitiesToDelete = await db({
          action: "query",
          tableName: model,
          where: where,
        });
        
        // Perform batch delete
        const deleteOperations = entitiesToDelete.map(async (entity: any) => {
          return db({
            action: "delete",
            tableName: model,
            id: entity.id,
          });
        });
        
        await Promise.all(deleteOperations);
        const deletedCount = entitiesToDelete.length;
        
        debugLog([
          "deleteMany result",
          { result: deletedCount, duration: `${Date.now() - start}ms` },
        ]);
        
        return deletedCount;
      },
      
      count: async ({ model, where }) => {
        const start = Date.now();
        filterInvalidOperators(where);
        where = transformWhereOperators(where);
        
        // Query entities and count them
        const entities = await db({
          action: "query",
          tableName: model,
          where: where || [],
        });
        
        const count = entities.length;
        
        debugLog([
          "count result",
          { count, duration: `${Date.now() - start}ms` },
        ]);
        
        return count;
      },
    };
  };
};

// Helper function to map operators from Better-Auth to Triplit
function mapOperatorToTriplit(operator: string): string {
  const operatorMap: Record<string, string> = {
    "=": "=",
    "==": "=",
    "!=": "!=",
    ">": ">",
    ">=": ">=",
    "<": "<",
    "<=": "<=",
    "in": "in",
    "not_in": "not in",
    // Add other operator mappings as needed
  };
  
  return operatorMap[operator] || "=";
}
