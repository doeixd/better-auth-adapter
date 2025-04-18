// adapter.ts
import type { Adapter, AdapterInstance, BetterAuthOptions } from "better-auth";
import type { TriplitClient } from "@triplit/client";
import type { TriplitAdapterOptions } from "./types";
import { createTransform } from "./transform";
import type { WhereCondition } from "./types"; // Keep this import

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
    // Get the transformation and validation functions from createTransform
    const {
      transformInput,
      filterInvalidOperators, // The validator function
      db,
      transformOutput,
      transformWhereOperators, // The mapping function
    } = createTransform({
      config,
      options,
      client,
    });

    // Helper to process where clauses for each method
    const processWhere = (where: WhereCondition[] | undefined): WhereCondition[] => {
        let processedWhere: WhereCondition[] = where ? [...where] : []; // Clone
        processedWhere = transformWhereOperators(processedWhere); // Map operators first
        filterInvalidOperators(processedWhere); // Then validate the mapped operators
        return processedWhere;
    }

    return {
      id: "triplit",
      create: async ({ data: values, model, select }) => {
        const start = Date.now();
        debugLog(["create", { model, values, select }]);
        const transformed = transformInput(values, model, "create");

        // Call db helper with transformed data
        const res = await db({
          action: "insert",
          tableName: model,
          values: transformed,
        });

        // Process result for selection
        let result: Record<string, any> | null = null;
        if (res) { // Check if res is not null/undefined
            if (!select || select.length === 0) result = res;
            else {
                result = {};
                for (const key of select) {
                    if (key in res) {
                        result[key] = res[key];
                    }
                }
            }
            result = result ? (transformOutput(result, model) as any) : result;
        }

        debugLog([
          "create result",
          { result, duration: `${Date.now() - start}ms` },
        ]);
        return result as any;
      },

      findOne: async ({ model, where, select }) => {
        const start = Date.now();
        const processedWhere = processWhere(where); // Use helper
        debugLog(["findOne", { model, where: processedWhere, select }]);

        // Pass processed where to db helper
        const res = await db({
          action: "queryOne",
          tableName: model,
          where: processedWhere,
        });

        // Process result for selection
        let result: Record<string, any> | null = null;
        if (res) {
            if (!select || select.length === 0) result = res;
            else {
                result = {};
                for (const key of select) {
                    if (key in res) {
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
        const processedWhere = processWhere(where); // Use helper
        // Note: offset is intentionally ignored as pagination uses 'After'
        debugLog(["findMany", { model, where: processedWhere, limit, offsetIgnored: offset, sortBy }]);

        // Build the Triplit query object
        let query = client.query(model);

        // Add processed where conditions to the query object
        if (processedWhere.length > 0) {
          const triplitWhereClauses = processedWhere.map(condition => {
            // Operators are already mapped and validated
            return [condition.field, condition.operator!, condition.value];
          });
          query = query.Where(triplitWhereClauses as any);
        }

        // Add sorting to the query object
        if (sortBy) {
          // Assuming sortBy format [[field, direction], ...] or { field, direction }
           const sortClauses = Array.isArray(sortBy)
              ? sortBy.map(clause => [clause[0], clause[1].toUpperCase()]) // Ensure direction is uppercase
              : [[sortBy.field, sortBy.direction.toUpperCase()]];
          query = query.Order(sortClauses as any);
        }

        // Add limit to the query object
        if (limit) {
          query = query.Limit(limit);
        }

        // Execute the query using the db helper, passing the constructed query object
        let results = await db({
          action: "query",
          tableName: model, // Still needed for context if db helper uses it
          query: query, // Pass the Triplit query object
        });

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
        const processedWhere = processWhere(where); // Use helper
        debugLog(["update", { model, where: processedWhere, update }]);

        const transformedUpdate = transformInput(update, model, "update");

        // Use db helper, passing processed where
        const res = await db({
            action: "update",
            tableName: model,
            where: processedWhere, // Pass where to find the entity
            update: transformedUpdate,
            // db helper's 'update' action finds the first match based on where if no ID given
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
        const processedWhere = processWhere(where); // Use helper
        debugLog(["updateMany", { model, where: processedWhere, update }]);

        const transformedUpdate = transformInput(update, model, "update");

        // Step 1: Find all entities matching the processed where clause using db helper
        const entitiesToUpdate = await db({
          action: "query", // Use query action to find entities
          tableName: model,
          where: processedWhere,
        });

        // Step 2: Perform batch update using db helper for each found entity
        // Note: Triplit client doesn't have a native batch update, so we iterate.
        const updates = entitiesToUpdate.map(async (entity: any) => {
          if (!entity?.id) return null; // Skip if entity has no ID
          return db({
            action: "update",
            tableName: model,
            id: entity.id, // Pass ID for direct update by db helper
            update: transformedUpdate,
          });
        });

        const updatedEntities = (await Promise.all(updates)).filter(e => e !== null); // Filter out nulls if any skipped
        const result = updatedEntities.map(entity => transformOutput(entity, model));

        debugLog([
          "updateMany result",
          { result, duration: `${Date.now() - start}ms` },
        ]);

        return result;
      },

      delete: async ({ model, where }) => {
        const start = Date.now();
        const processedWhere = processWhere(where); // Use helper
        debugLog(["delete", { model, where: processedWhere }]);

        // Use db helper, passing processed where
        await db({
          action: "delete",
          tableName: model,
          where: processedWhere,
          // db helper's 'delete' action finds the first match based on where if no ID given
        });

        debugLog(["delete complete", { duration: `${Date.now() - start}ms` }]);
        return; // delete usually doesn't return anything
      },

      deleteMany: async ({ model, where }) => {
        const start = Date.now();
        const processedWhere = processWhere(where); // Use helper
        debugLog(["deleteMany", { model, where: processedWhere }]);

        // Use db helper with deleteAll flag
        const deletedCount = await db({
            action: "delete",
            tableName: model,
            where: processedWhere,
            deleteAll: true // Tell db helper to delete all matching entities
        });

        debugLog([
          "deleteMany result",
          { result: deletedCount, duration: `${Date.now() - start}ms` },
        ]);

        return deletedCount; // Return the number of deleted items
      },

      count: async ({ model, where }) => {
        const start = Date.now();
        const processedWhere = processWhere(where); // Use helper
        debugLog(["count", { model, where: processedWhere }])

        // Use db helper, passing processed where
        const count = await db({
          action: "count",
          tableName: model,
          where: processedWhere,
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

// Remove the mapOperatorToTriplit helper function as its logic is now in transform.ts
// function mapOperatorToTriplit(operator: string): string { ... }
