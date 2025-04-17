import { type TriplitQueryBuilder } from "./handler/types";
import { or } from "@triplit/client" // Import or function
/**
 * Creates a query string builder for Triplit queries based on a function
 * that operates on the query builder object.
 * 
 * @param builderFn A function that builds the query using the query builder object
 * @returns A query object or string that can be used with Triplit
 */
export function queryBuilder(builderFn: (builder: TriplitQueryBuilder) => any): any {
  // Create a query builder object with methods that match Triplit's query API
  const builder: TriplitQueryBuilder = {
    eq: (field: string, value: any) => {
      return { field, operator: "=", value };
    },
    neq: (field: string, value: any) => {
      return { field, operator: "!=", value };
    },
    gt: (field: string, value: any) => {
      return { field, operator: ">", value };
    },
    gte: (field: string, value: any) => {
      return { field, operator: ">=", value };
    },
    lt: (field: string, value: any) => {
      return { field, operator: "<", value };
    },
    lte: (field: string, value: any) => {
      return { field, operator: "<=", value };
    },
    in: (field: string, value: any[]) => {
      return { field, operator: "in", value };
    },
    not_in: (field: string, value: any[]) => {
      return { field, operator: "not in", value };
    },
    contains: (field: string, value: any) => {
      return { field, operator: "contains", value };
    },
    notContains: (field: string, value: any) => {
      return { field, operator: "notContains", value };
    },
    and: (left: any, right: any) => {
      return { connector: "AND", left, right };
    },
    or: (left: any, right: any) => {
      return { connector: "OR", left, right };
    }
  };

  // Call the builder function with our builder object
  const queryObject = builderFn(builder);
  
  // Convert the query object to a Triplit-compatible format
  return convertQueryObject(queryObject);
}

/**
 * Converts the query object built by the query builder into a format
 * that can be used with Triplit's query methods.
 * 
 * @param queryObject The query object built by the query builder
 * @returns A query object compatible with Triplit
 */
function convertQueryObject(queryObject: any): any {
  // If queryObject is null, undefined, or a string, return as is
  if (!queryObject || typeof queryObject === 'string') {
    return queryObject;
  }

  // If queryObject has connector, it's a compound query (AND/OR)
  if (queryObject.connector) {
    const { connector, left, right } = queryObject;
    
    // Convert left and right sides
    const convertedLeft = convertQueryObject(left);
    const convertedRight = convertQueryObject(right);
    
    // Return a function that can be used to build the Triplit query
    return (query: any) => {
      // The function will receive a Triplit query and apply the conditions
      if (connector === "AND") {
        // For AND, apply both conditions
        return query.Where([convertedLeft, convertedRight]);
      } else if (connector === "OR") {
        // For OR, use the or() method from Triplit
        return query.Where(or([convertedLeft, convertedRight]));
      }
      return query;
    };
  }

  // If queryObject has field, operator, value - it's a simple condition
  if (queryObject.field && 'operator' in queryObject) {
    const { field, operator, value } = queryObject;
    
    // Return an array that can be used with Triplit's Where method
    return [field, operator, value];
  }

  // If it's an array, convert each item
  if (Array.isArray(queryObject)) {
    return queryObject.map(item => convertQueryObject(item));
  }

  // Default fallback
  return queryObject;
}