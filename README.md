# Triplit Adapter for Better-Auth

This adapter allows you to use [Triplit](https://triplit.dev) as a database backend for [Better-Auth](https://better-auth-kit.com).

## Installation

```bash
npm install @better-auth-kit/triplit
# or
yarn add @better-auth-kit/triplit
# or
pnpm add @better-auth-kit/triplit
```

## Getting Started

Initialize Better-Auth with the Triplit adapter, providing your configured Triplit client instance:

```typescript
import { betterAuth } from "better-auth";
import { triplitAdapter } from "@better-auth-kit/triplit";
import { createClient } from "@triplit/client";

// Create a Triplit client (ensure schema is applied if necessary)
const triplitClient = createClient({
  serverUrl: process.env.TRIPLIT_SERVER_URL,
  token: process.env.TRIPLIT_TOKEN,
  // Optionally pass schema here or initialize it separately
});

// Initialize Better-Auth with Triplit adapter
export const auth = betterAuth({
  database: triplitAdapter(triplitClient, {
      // Optional adapter configurations
      enable_debug_logs: process.env.NODE_ENV !== "production",
      customCollectionName: (tableName) => `my_prefix_${tableName}`,
  }),
  plugins: [
    // Your plugins here
  ],
  // Other Better-Auth options
});
```

## Configuration Options

The Triplit adapter (`triplitAdapter`) accepts an optional second argument for configuration:

```typescript
interface TriplitAdapterOptions {
  /**
   * Enable detailed logs from the adapter for debugging.
   * @default false
   */
  enable_debug_logs?: boolean;

  /**
   * Provide a function to customize Triplit collection names based on
   * Better-Auth model names (e.g., 'users', 'sessions').
   * @example (tableName) => `auth_${tableName}`
   */
  customCollectionName?: (tableName: string) => string;

  /**
   * Configure how the adapter handles the primary ID field ('id').
   */
  id_options?: {
    /**
     * The actual field name used for the ID in your Triplit schema.
     * Use this if your ID field is not named 'id'.
     * @default "id"
     */
    field_name?: string;

    /**
     * An optional function to transform ID values before they are
     * used in queries or stored (rarely needed with Triplit's default IDs).
     */
    transform?: (id: string) => string;
  };

  /**
   * Apply custom transformations to specific fields before data is
   * sent to Triplit (on create/update).
   */
  field_options?: {
    /**
     * A map where keys are model names (e.g., 'users') and values are
     * objects mapping field names to transformer functions.
     * @example { users: { email: (value) => value.toLowerCase() } }
     */
    transformers?: Record<string, Record<string, (value: any) => any>>;
  };
}
```

## Example Usage (Next.js API Route)

Here's a complete example of using Better-Auth with the Triplit adapter in a Next.js API route:

```typescript
// pages/api/auth/[...betterAuth].ts (or your preferred auth route handler)

import { betterAuth } from "better-auth";
import { triplitAdapter } from "@better-auth-kit/triplit";
import { createClient, Schema } from "@triplit/client";

// Define your Triplit schema (ensure it matches Better-Auth requirements)
const authSchema = {
  // Example using default 'users' and 'sessions' names
  users: {
    schema: Schema.Schema({
      id: Schema.Id(), // Use Triplit's built-in ID type
      email: Schema.String({ unique: true }),
      password: Schema.String(), // Hashed password storage handled by Better-Auth
      emailVerified: Schema.Boolean({ default: false }),
      createdAt: Schema.Date(), // Timestamps managed by adapter/DB
      updatedAt: Schema.Date(), // Timestamps managed by adapter/DB
      // Add any custom user profile fields here
      name: Schema.String({ optional: true }),
    }),
  },
  sessions: {
    schema: Schema.Schema({
      id: Schema.Id(),
      userId: Schema.String(), // Foreign key to users collection
      expiresAt: Schema.Date(),
      createdAt: Schema.Date(),
      updatedAt: Schema.Date(),
      // Add other session fields if needed by plugins
    }),
  },
  // Add schemas for other models used by Better-Auth plugins
};

// Create a Triplit client instance
const triplitClient = createClient({
  serverUrl: process.env.TRIPLIT_SERVER_URL!,
  token: process.env.TRIPLIT_TOKEN!,
  schema: authSchema, // Pass schema to client
});

// Initialize Better-Auth
const auth = betterAuth({
  database: triplitAdapter(triplitClient, {
    enable_debug_logs: process.env.NODE_ENV !== "production",
    // Example: Use custom collection names if your schema uses them
    // customCollectionName: (tableName) => `auth_${tableName}`,
  }),
  plugins: [
    // Add Better-Auth plugins (e.g., Credentials, Email)
  ],
  // Add other Better-Auth configuration (secret, strategies, etc.)
  secret: process.env.AUTH_SECRET!,
});

// Export the handler for the API route
export default auth.handler; // Use the built-in handler or create a custom one

/*
// Example of custom handler logic (if not using auth.handler directly)
export default async function handler(req, res) {
  // Initialize auth for this request (might be needed depending on setup)
  // await auth.init(req, res); // Check Better-Auth docs for init usage

  // Example: Register a new user endpoint
  if (req.method === "POST" && req.url?.includes("/api/auth/register")) {
    try {
      const { email, password, name } = req.body;
      const result = await auth.register({ // Use Better-Auth's register method
        email,
        password,
        data: { name }, // Pass extra data to be stored in the 'users' collection
      });
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  // Fallback to Better-Auth's default handling for other routes (/api/auth/signin, etc.)
  return auth.handler(req, res);
}
*/
```

## Schema Creation

Triplit requires a defined schema. Ensure your schema includes the necessary collections and fields for Better-Auth core (`users`, `sessions`) and any plugins you use.

```typescript
import { Schema } from "@triplit/client";

// Minimal schema required for Better-Auth core
const minimalAuthSchema = {
  users: {
    schema: Schema.Schema({
      id: Schema.Id(), // Required by Triplit
      email: Schema.String({ unique: true }), // Required by Better-Auth
      password: Schema.String(), // Required for credentials plugin
      emailVerified: Schema.Boolean({ default: false }),
      createdAt: Schema.Date(), // Required for timestamp tracking
      updatedAt: Schema.Date(), // Required for timestamp tracking
      // Add custom fields as needed (e.g., name, avatar)
      // name: Schema.String({ optional: true }),
    }),
  },
  sessions: {
    schema: Schema.Schema({
      id: Schema.Id(), // Required by Triplit
      userId: Schema.String(), // Required by Better-Auth
      expiresAt: Schema.Date(), // Required by Better-Auth
      createdAt: Schema.Date(), // Required for timestamp tracking
      updatedAt: Schema.Date(), // Required for timestamp tracking
      // data: Schema.Record({}) // Optional: For storing arbitrary session data
    }),
  },
  // Add other collections if required by Better-Auth plugins
  // Example: verification_tokens for Email plugin
  // verification_tokens: {
  //   schema: Schema.Schema({
  //     id: Schema.Id(),
  //     identifier: Schema.String(),
  //     token: Schema.String({ unique: true }),
  //     expires: Schema.Date(),
  //     createdAt: Schema.Date(),
  //     updatedAt: Schema.Date(),
  //   })
  // }
};

// You typically pass the schema directly when creating the Triplit client:
// const client = createClient({ ..., schema: minimalAuthSchema });

// Or, if applying schemas dynamically (less common for static auth schemas):
export async function initializeAuthSchemas(client: TriplitClient) {
  for (const [collectionName, definition] of Object.entries(minimalAuthSchema)) {
    try {
      // Check if collection exists before creating (optional)
      // await client.getCollectionInfo(collectionName);
    } catch (e) {
      // Assuming error means collection doesn't exist
      console.log(`Creating collection: ${collectionName}`);
      await client.createCollection(collectionName, definition.schema);
    }
  }
}
```
*Note: The adapter automatically handles `createdAt` and `updatedAt` timestamps during create/update operations, but defining them in the schema is recommended.*

## Pagination with `After`

Triplit uses cursor-based pagination via the `After` method for efficiency with large datasets. The Better-Auth `offset` parameter in `findMany` is **ignored** by this adapter. Pagination must be implemented in your application logic using the following pattern:

1.  **Order:** You **must** use `Order()` on your query before paginating.
2.  **Limit:** Use `Limit()` to specify the page size.
3.  **Fetch:** Fetch the first page.
4.  **Cursor:** Get the *last entity* from the fetched results.
5.  **After:** For the next page, add `.After(lastEntity)` to your query *before* fetching again.

*Limitation: Currently, Triplit's `After` method only supports a cursor corresponding to the **first** `Order` clause.*

**Example Pagination Flow:**

```typescript
import { TriplitClient } from '@triplit/client'; // Import TriplitClient type

const PAGE_SIZE = 20;
let lastFetchedUser: any = null; // Store the last entity of the previous page

async function fetchNextUserPage(client: TriplitClient) {
  // Base query - apply necessary selections and ordering
  let query = client.query('users') // Use the actual collection name
    .Select(['id', 'name', 'createdAt'])
    .Order('createdAt', 'DESC') // MUST order before using After/Limit
    .Limit(PAGE_SIZE);

  // If we have a cursor from the previous page, apply it
  if (lastFetchedUser) {
    query = query.After(lastFetchedUser);
  }

  console.log(`Fetching users ${lastFetchedUser ? 'after ' + lastFetchedUser.id : 'from start'}...`);

  try {
    const { results: pageResults } = await client.fetch(query);

    if (pageResults && pageResults.length > 0) {
      // Update the cursor for the *next* fetch
      lastFetchedUser = pageResults[pageResults.length - 1];
      console.log(`Fetched ${pageResults.length} users. Last user ID: ${lastFetchedUser.id}`);
      return pageResults; // Return the current page's results
    } else {
      console.log("No more users found.");
      lastFetchedUser = null; // Reset cursor if no more results
      return []; // Return empty array for the current page
    }
  } catch (error) {
     console.error("Error fetching user page:", error);
     // Handle error appropriately
     throw error;
  }
}

// --- Example Usage ---
// Assuming 'triplitClient' is your initialized Triplit client instance
// const firstPage = await fetchNextUserPage(triplitClient);
// if (firstPage.length > 0) {
//   const secondPage = await fetchNextUserPage(triplitClient);
// }
// ... and so on
```

## Limitations

*   **Offset Ignored:** The `offset` parameter in Better-Auth's `findMany` is ignored. Use cursor-based pagination with `Order().Limit().After()` as described above.
*   **Advanced Operators:** Some advanced query operators specific to certain databases might not be directly supported if they don't have equivalents in Triplit's `Where` clause (e.g., complex full-text search). The adapter will throw an error for unsupported operators.
*   **Complex Joins:** While Triplit supports relations, complex multi-level joins or aggregations typical in SQL might require different approaches or direct Triplit queries.
*   **Sorting Performance:** Complex sorting involving multiple fields on very large datasets could have performance implications, depending on Triplit's indexing and query optimization.

## Troubleshooting

If you encounter issues:

1.  **Enable Debug Logs:** Set `enable_debug_logs: true` in the adapter options for detailed logs.
2.  **Check Triplit Config:** Verify your Triplit `serverUrl` and `token`. Ensure the Triplit server is running and accessible.
3.  **Verify Schema:** Double-check that your Triplit schema definitions match the requirements of Better-Auth core and any active plugins. Missing fields or incorrect types are common issues.
4.  **Pagination Order:** Ensure you are using `Order()` *before* using `Limit()` or attempting pagination with `After()`.
5.  **Operator Errors:** If you get errors about unsupported operators, review your `where` clauses and ensure they use operators compatible with Triplit (`=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `not in`, `contains`, `not contains`).

## Contributing

Contributions are welcome! Please feel free to submit Issues or Pull Requests to the repository.

## License

MIT

