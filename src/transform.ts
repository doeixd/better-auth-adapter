// transform.ts
import type { BetterAuthOptions } from "better-auth";
import type { TriplitClient } from "@triplit/client";
import type { TriplitAdapterOptions } from "./types";
import type { WhereCondition } from "./types";

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

  // Maps Better-Auth operators to Triplit operators. Returns a NEW array.
  function transformWhereOperators(where: WhereCondition[]): WhereCondition[] {
    return where.map(condition => {
      const newCondition = { ...condition }; // Clone the condition

      // Map operator if needed
      if (newCondition.operator) {
        switch (newCondition.operator) {
          case "==":
            newCondition.operator = "=";
            break;
          case "not_in":
            newCondition.operator = "not in";
            break;
          // Add other potential mappings from BetterAuth to Triplit here if needed
        }
      }
      // Ensure default operator is '=' if none specified, even after potential mapping
      if (!newCondition.operator) {
         newCondition.operator = "=";
      }

      return newCondition;
    });
  }

  // Validates that operators in the *mapped* conditions are supported by Triplit. Throws an error if not.
  function filterInvalidOperators(mappedWhere: WhereCondition[]): void {
    // Define operators explicitly supported by Triplit's Where clause (after mapping)
    // Refer to Triplit docs and mapOperatorToTriplit in adapter.ts for the exact list
    const supportedTriplitOperators = [
      "=", // Mapped from '==' or '='
      "!=",
      ">",
      ">=",
      "<",
      "<=",
      "in",
      "not in", // Mapped from 'not_in'
      "contains", // Assuming Triplit supports these - verify with docs/testing
      "not contains",
      // Add 'like', 'nlike', 'isDefined', 'has', '!has' if you map to them and Triplit supports them
    ];

    for (const condition of mappedWhere) {
      // Use the mapped operator. It should always exist after transformWhereOperators sets a default.
      const operator = condition.operator!;

      if (!supportedTriplitOperators.includes(operator)) {
        // Found an operator that, even after potential mapping, is not directly supported by Triplit's Where
        // It's hard to reliably get the *original* operator here without passing it separately,
        // so we report the problematic *mapped* operator.
         throw new Error(
           `Triplit adapter query error: The operator "${operator}" used in the 'where' clause is not supported by Triplit's 'Where' method.`
         );
      }
    }
    // If the loop completes, all operators are valid. This function doesn't filter, just validates.
  }


  /**
   * Database abstraction function to handle various operations
   * (This function remains unchanged)
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
    paginationOpts = null // Keep this parameter, although not used by Triplit adapter logic directly
  }: any) {
    const collectionName = getCollectionName(tableName);

    try {
      switch (action) {
        case "insert": {
          const result = await client.insert(collectionName, values);
          // Fetch the inserted record to return it fully populated (Triplit insert might return minimal info)
          // This assumes Triplit insert returns an object with an 'id' property.
          if(result?.id) {
             return await client.fetchById(collectionName, result.id);
          }
          return result; // Fallback if insert doesn't return id or fails
        }

        case "queryOne": {
          // Build query for single item
          let query = client.query(collectionName);

          // Add where conditions (assuming 'where' here is already mapped and validated)
          if (where.length > 0) {
             // Use array format for potentially multiple conditions
             const clauses = where.map((condition: WhereCondition) => [
                condition.field,
                condition.operator || '=', // Already defaulted, but safe fallback
                condition.value
             ]);
             query = query.Where(clauses as any);
          }

          // Execute query
          const result = await client.fetchOne(query);
          return result;
        }

        case "query": {
          // If a pre-built query object from adapter.ts is provided, use it
          if (query) {
            // Limit/Order should already be applied by the caller (adapter.ts findMany) onto the query object
            const results = await client.fetch(query);
            return results;
          }

          // Fallback: Build a simple query from parameters (less common if adapter builds the query)
          let builtQuery = client.query(collectionName);

          // Add where conditions (assuming 'where' here is already mapped and validated)
           if (where.length > 0) {
             const clauses = where.map((condition: WhereCondition) => [
                condition.field,
                condition.operator || '=',
                condition.value
             ]);
             builtQuery = builtQuery.Where(clauses as any);
          }

          // Add limit if provided directly to db (less ideal than applying to query object)
          if (limit) {
            builtQuery = builtQuery.Limit(limit);
          }

          // Add order if provided directly to db (less ideal)
          if (order && typeof order === 'string') { // Basic string format "field direction"
            const parts = order.split(' ');
            if (parts.length === 2) {
              builtQuery = builtQuery.Order(parts[0], parts[1].toUpperCase() as 'ASC' | 'DESC');
            }
          } else if(order && Array.isArray(order)) { // Array format [[field, direction], ...]
             builtQuery = builtQuery.Order(order as any);
          }

          // Execute query
          const results = await client.fetch(builtQuery);
          return results;
        }

        case "update": {
          // If id is provided, update by id is preferred
          if (id) {
            await client.update(collectionName, id, update);
            // Fetch the updated record to return it
            return await client.fetchById(collectionName, id);
          }

          // Otherwise, find the *first* entity matching 'where' and update it
          let findQuery = client.query(collectionName);
          if (where.length > 0) {
             const clauses = where.map((condition: WhereCondition) => [
                condition.field,
                condition.operator || '=',
                condition.value
             ]);
             findQuery = findQuery.Where(clauses as any);
          }

          // Find the first entity to update
          const entityToUpdate = await client.fetchOne(findQuery);

          if (entityToUpdate?.id) {
             await client.update(collectionName, entityToUpdate.id, update);
             // Fetch and return the updated entity
             return await client.fetchById(collectionName, entityToUpdate.id);
          }

          return null; // Indicate no entity was found/updated
        }

        case "delete": {
          // If id is provided, delete by id
          if (id) {
            await client.delete(collectionName, id);
            return true; // Indicate success
          }

          // Build query based on 'where'
          let deleteQuery = client.query(collectionName);
          if (where.length > 0) {
             const clauses = where.map((condition: WhereCondition) => [
                condition.field,
                condition.operator || '=',
                condition.value
             ]);
             deleteQuery = deleteQuery.Where(clauses as any);
          }

          // Find entities to delete
          const entitiesToDelete = await client.fetch(deleteQuery);

          if (deleteAll) {
            // Delete all matching entities
            let deletedCount = 0;
            if (entitiesToDelete.length > 0) {
                // Use Promise.all for potentially faster batch deletion (if underlying client supports concurrency)
                await Promise.all(
                    entitiesToDelete.map(entity => client.delete(collectionName, entity.id))
                );
                deletedCount = entitiesToDelete.length;
            }
            return deletedCount; // Return the count of deleted items
          } else {
            // Delete only the first matching entity
            if (entitiesToDelete.length > 0) {
              await client.delete(collectionName, entitiesToDelete[0].id);
              return true; // Indicate success (deleted one)
            }
            return false; // Indicate no entity found to delete
          }
        }

        case "count": {
          let countQuery = client.query(collectionName);

          // Add where conditions if provided
           if (where && where.length > 0) {
             const clauses = where.map((condition: WhereCondition) => [
                condition.field,
                condition.operator || '=',
                condition.value
             ]);
             countQuery = countQuery.Where(clauses as any);
          }

          // Execute query and count results
          // Note: Triplit doesn't have a direct count method, fetching and getting length is common
          const results = await client.fetch(countQuery);
          return results.length;
        }

        default:
          throw new Error(`Unsupported action: ${action}`);
      }
    } catch (error) {
      console.error(`[triplit-adapter] Error in db operation (${action} on ${collectionName}):`, error);
      // Re-throw the error so the calling adapter method can handle or log it
      throw error;
    }
  }

  return {
    transformInput,
    // Return the *validating* filter function
    filterInvalidOperators,
    db,
    transformOutput,
    // Return the mapping function
    transformWhereOperators,
  };
}
