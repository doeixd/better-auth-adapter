import type { Adapter, AdapterInstance, BetterAuthOptions } from "better-auth";
import type { TriplitClient } from "@triplit/client";
import type { TriplitAdapterOptions } from "./types";
import { createTransform } from "./transform";
import { WhereCondition } from "./handler/types"; // Import WhereCondition type

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
          // Ensure res is not null before accessing properties
          if (res) {
            result = {};
            for (const key of select) {
              if (key in res) { // Check if key exists in res
                result[key] = res[key];
              }
            }
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
        let processedWhere: WhereCondition[] = where ? [...where] : []; // Clone to avoid modifying original
        filterInvalidOperators(processedWhere);
        processedWhere = transformWhereOperators(processedWhere);
        debugLog(["findOne", { model, where: processedWhere, select }]);

        const res = await db({
          action: "queryOne",
          tableName: model,
          where: processedWhere,
        });

        let result: Record<string, any> | null = null;

        if (res) { // Check if res is not null
          if (!select || select.length === 0) result = res;
          else {
            result = {};
            for (const key of select) {
              if (key in res) { // Check if key exists in res
                result[key] = res[key];
              }
            }
          }
          result = result ? (transformOutput(result, model) as any) : result;
        }

        debugLog([
          "findOne result",
          { result, duration: `${Date.now() - start}ms` },
        ]);
        return result as any;
      },

      findMany: async ({ model, where, limit, offset, sortBy }) => {
        const start = Date.now();
        let processedWhere: WhereCondition[] = where ? [...where] : []; // Clone to avoid modifying original
        filterInvalidOperators(processedWhere);
        processedWhere = transformWhereOperators(processedWhere);
        debugLog(["findMany", { model, where: processedWhere, limit, offset, sortBy }]);

        // Build query for Triplit
        let query = client.query(model);

        // Add where conditions if they exist
        if (processedWhere && processedWhere.length > 0) {
          // Use Triplit's array format for Where if multiple conditions
          const triplitWhereClauses = processedWhere.map(condition => {
            const field = condition.field;
            const value = condition.value;
            const operator = condition.operator || "=";
            const triplitOperator = mapOperatorToTriplit(operator);
            return [field, triplitOperator, value];
          });
          query = query.Where(triplitWhereClauses as any); // Cast needed for array form
        }

        // Add sorting if specified
        if (sortBy) {
          // Ensure sortBy is correctly formatted potentially as [[field, direction], ...]
          // For simplicity, assuming single sortBy { field: string, direction: 'asc' | 'desc' }
          // Triplit's Order method supports array of clauses for multi-sort
          const sortClauses = Array.isArray(sortBy) ? sortBy : [[sortBy.field, sortBy.direction.toUpperCase()]];
          query = query.Order(sortClauses as any); // Type assertion might be needed depending on exact sortBy type
        }

        // Add pagination limit if needed
        if (limit) {
          query = query.Limit(limit);
        }

        // Execute the query using the db helper which uses client.fetch
        let results = await db({
          action: "query",
          tableName: model,
          query: query, // Pass the constructed query object
          // We don't pass where, limit, order here as they are handled by the query object
        });

        // Transform the results
        const transformedResults = results.map((x: any) => transformOutput(x, model));

        // Note: The 'offset' parameter from BetterAuth is ignored by this adapter.
        // Pagination in Triplit should be handled using the 'After' method on the query
        // object in the application code, passing the last entity from the previous page.
        debugLog([
          "findMany result",
          { result: transformedResults, duration: `${Date.now() - start}ms` },
        ]);

        return transformedResults;
      },

      update: async ({ model, where, update }) => {
        const start = Date.now();
        let processedWhere: WhereCondition[] = where ? [...where] : []; // Clone to avoid modifying original
        filterInvalidOperators(processedWhere);
        processedWhere = transformWhereOperators(processedWhere);
        debugLog(["update", { model, where: processedWhere, update }]);

        const transformed = transformInput(update, model, "update");

        // Use the db helper function to find and update
        const res = await db({
            action: "update",
            tableName: model,
            where: processedWhere, // Pass where to find the entity
            update: transformed,
            single: true // Indicate we expect to update one based on 'where'
        });

        const result = res ? transformOutput(res, model) as any : null;
        debugLog([
          "update result",
          { result, duration: `${Date.now() - start}ms` },
        ]);
        return result;
      },

      updateMany: async ({ model, where, update }) => {
        const start = Date.now();
        let processedWhere: WhereCondition[] = where ? [...where] : []; // Clone to avoid modifying original
        filterInvalidOperators(processedWhere);
        processedWhere = transformWhereOperators(processedWhere);
        debugLog(["updateMany", { model, where: processedWhere, update }]);

        const transformed = transformInput(update, model, "update");

        // Use db helper to find entities
        const entitiesToUpdate = await db({
          action: "query",
          tableName: model,
          where: processedWhere,
        });

        // Perform batch update using db helper for each
        const updates = entitiesToUpdate.map(async (entity: any) => {
          // We need the ID for the update action in the db helper
          return db({
            action: "update",
            tableName: model,
            id: entity.id, // Pass ID for direct update
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
        let processedWhere: WhereCondition[] = where ? [...where] : []; // Clone to avoid modifying original
        filterInvalidOperators(processedWhere);
        processedWhere = transformWhereOperators(processedWhere);
        debugLog(["delete", { model, where: processedWhere }]);

        // Use db helper to find and delete one
        await db({
          action: "delete",
          tableName: model,
          where: processedWhere,
          single: true // Indicate we expect to delete one based on 'where'
        });

        debugLog(["delete complete", { duration: `${Date.now() - start}ms` }]);
        // BetterAuth delete doesn't typically return the deleted item, just confirms deletion
        return;
      },

      deleteMany: async ({ model, where }) => {
        const start = Date.now();
        let processedWhere: WhereCondition[] = where ? [...where] : []; // Clone to avoid modifying original
        filterInvalidOperators(processedWhere);
        processedWhere = transformWhereOperators(processedWhere);
        debugLog(["deleteMany", { model, where: processedWhere }]);

        // Use db helper to delete all matching
        const deletedCount = await db({
            action: "delete",
            tableName: model,
            where: processedWhere,
            deleteAll: true // Indicate we want to delete all matching entities
        });

        debugLog([
          "deleteMany result",
          { result: deletedCount, duration: `${Date.now() - start}ms` },
        ]);

        // BetterAuth deleteMany expects the count of deleted items
        return deletedCount;
      },

      count: async ({ model, where }) => {
        const start = Date.now();
        let processedWhere: WhereCondition[] = where ? [...where] : []; // Clone to avoid modifying original
        filterInvalidOperators(processedWhere);
        processedWhere = transformWhereOperators(processedWhere);
        debugLog(["count", { model, where: processedWhere }])

        // Use db helper for counting
        const count = await db({
          action: "count",
          tableName: model,
          where: processedWhere || [],
        });

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
// (Keep only operators supported by Triplit's Where clause)
function mapOperatorToTriplit(operator: string): string {
  const operatorMap: Record<string, string> = {
    "=": "=",
    "==": "=", // Map '==' to '='
    "!=": "!=",
    ">": ">",
    ">=": ">=",
    "<": "<",
    "<=": "<=",
    "in": "in",
    "not in": "not in", // Ensure 'not in' is used, not 'not_in'
    "not_in": "not in", // Map 'not_in' to 'not in'
    "contains": "contains",
    "notContains": "not contains", // Map 'notContains'
    // Add other mappings if Triplit supports more complex ones directly in Where
  };

  // Return the mapped operator or default to '=' if not found/supported
  return operatorMap[operator] || "=";
}
