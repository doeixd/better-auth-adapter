# Triplit Adapter for Better-Auth

This adapter allows you to use [Triplit](https://triplit.dev) as a database backend for [Better-Auth](https://better-auth-kit.com).

## Installation

```bash
npm install @better-auth-kit/triplit
```

## Getting Started

### 1. Configure the Triplit Adapter

Initialize Better-Auth with the Triplit adapter:

```typescript
import { betterAuth } from "better-auth";
import { triplitAdapter } from "@better-auth-kit/triplit";
import { createClient } from "@triplit/client";

// Create a Triplit client
const triplitClient = createClient({
  serverUrl: process.env.TRIPLIT_SERVER_URL,
  token: process.env.TRIPLIT_TOKEN,
});

// Initialize Better-Auth with Triplit adapter
export const auth = betterAuth({
  database: triplitAdapter(triplitClient),
  plugins: [
    // Your plugins here
  ],
  // Other Better-Auth options
});
```

### 2. Set Up Triplit Handler (Optional, but recommended)

Create a new file in your project to handle Triplit-specific operations for Better-Auth:

```typescript
// triplit-handler.ts
import { createClient } from "@triplit/client";
import { TriplitHandler } from "@better-auth-kit/triplit/handler";

// Create client with your Triplit configuration
const client = createClient({
  serverUrl: process.env.TRIPLIT_SERVER_URL,
  token: process.env.TRIPLIT_TOKEN,
});

// Create handler functions
const { betterAuth, query, insert, update, delete: delete_, count } = TriplitHandler(client);

// Export handler functions
export { betterAuth, query, insert, update, delete_, count };
```

## Configuration Options

The Triplit adapter accepts the following options:

```typescript
interface TriplitAdapterOptions {
  // Enable debug logs to help troubleshoot issues
  enable_debug_logs?: boolean;
  
  // Custom collection naming function
  customCollectionName?: (tableName: string) => string;
  
  // Options for handling ID fields
  id_options?: {
    field_name?: string;
    transform?: (id: string) => string;
  };
  
  // Field transformation options
  field_options?: {
    transformers?: Record<string, Record<string, (value: any) => any>>;
  };
}
```

## Example Usage

Here's a complete example of using Better-Auth with the Triplit adapter in a Next.js API route:

```typescript
import { betterAuth } from "better-auth";
import { triplitAdapter } from "@better-auth-kit/triplit";
import { createClient } from "@triplit/client";

// Create a Triplit client
const triplitClient = createClient({
  serverUrl: process.env.TRIPLIT_SERVER_URL,
  token: process.env.TRIPLIT_TOKEN,
});

// Initialize Better-Auth with Triplit adapter
const auth = betterAuth({
  database: triplitAdapter(triplitClient, {
    enable_debug_logs: process.env.NODE_ENV !== "production",
    customCollectionName: (tableName) => `better_auth_${tableName}`,
  }),
  plugins: [
    // Your plugins here
  ],
});

export default async function handler(req, res) {
  // Initialize auth for this request
  await auth.init(req, res);
  
  // Example: Register a new user
  if (req.method === "POST" && req.url === "/api/auth/register") {
    try {
      const result = await auth.register({
        email: req.body.email,
        password: req.body.password,
        data: {
          name: req.body.name,
        },
      });
      
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
  
  // Other auth endpoints...
}
```

## Schema Creation

Triplit uses a schema system to define your data models. Here's an example of creating the necessary schemas for Better-Auth:

```typescript
import { Schema } from "@triplit/client";

// Define schemas for Better-Auth collections
const authSchema = {
  users: {
    schema: Schema.Schema({
      id: Schema.Id(),
      email: Schema.String({ unique: true }),
      password: Schema.String(),
      emailVerified: Schema.Boolean({ default: false }),
      createdAt: Schema.Date(),
      updatedAt: Schema.Date(),
      profile: Schema.Record({
        name: Schema.String({ optional: true }),
        avatar: Schema.String({ optional: true }),
      }),
    }),
  },
  sessions: {
    schema: Schema.Schema({
      id: Schema.Id(),
      userId: Schema.String(),
      expiresAt: Schema.Date(),
      createdAt: Schema.Date(),
      updatedAt: Schema.Date(),
      data: Schema.Record({}),
    }),
  },
  // Add other collections as needed for your plugins
};

// Apply schemas to your Triplit client
export async function initializeSchemas(client) {
  for (const [collection, definition] of Object.entries(authSchema)) {
    await client.createCollection(collection, definition.schema);
  }
}
```

## Performance Considerations

This adapter is optimized for use with Triplit, but there are a few things to consider:

1. **Query Performance**: Triplit's query system is designed for flexibility. The adapter translates Better-Auth's query format to Triplit's query system.

2. **Pagination**: For large datasets, consider using the `limit` and `offset` parameters to paginate results.

3. **Field Transformations**: Use the `field_options.transformers` configuration to handle special field transformations.

## Limitations

- Some advanced query operators might not be fully supported if they don't have direct equivalents in Triplit.
- Complex sorting with multiple fields may have performance implications.

## Troubleshooting

If you encounter issues:

1. Enable debug logs by setting `enable_debug_logs: true` in the adapter options.
2. Check your Triplit configuration, ensuring the correct server URL and token.
3. Verify your schema definitions match the expectations of Better-Auth.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT