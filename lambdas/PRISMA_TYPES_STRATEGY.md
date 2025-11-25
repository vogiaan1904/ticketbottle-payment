# Prisma Types Strategy for Lambda Functions

## The Problem You Encountered

When you ran `npm run generate`, Prisma generated the client to:
```
✔ Generated Prisma Client to ./../node_modules/@prisma/client
```

This generates to: `ticketbottle-payment/node_modules/@prisma/client`
But your Lambda code is in: `ticketbottle-payment/lambdas/`

When TypeScript tries to resolve `import { PaymentStatus } from '@prisma/client'`, it looks in:
- ❌ `ticketbottle-payment/lambdas/node_modules/@prisma/client` (doesn't exist)
- ✅ `ticketbottle-payment/node_modules/@prisma/client` (exists, but not in module resolution path)

## ✅ The Solution: Two-Tier Type Strategy

We use a **two-tier approach** that separates type definitions from runtime database access:

### Tier 1: TypeScript Type Definitions (Development)

**Location**: `lambdas/common/types/*.types.ts`

Define interfaces and enums that **mirror** your Prisma schema:

```typescript
// common/types/payment.types.ts

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentProvider {
  ZALOPAY = 'ZALOPAY',
  PAYOS = 'PAYOS',
  VNPAY = 'VNPAY',
}

export interface PaymentEntity {
  id: string;
  orderCode: string;
  amount: number;
  currency: string;
  provider: string;
  status: PaymentStatus;
  // ... other fields
}
```

**Purpose**:
- ✅ Type checking during development
- ✅ No dependency on Prisma generation
- ✅ Fast compilation
- ✅ Works in all environments

### Tier 2: Prisma Client (Runtime)

**Location**: Generated dynamically via `npm run generate`

The Prisma Client is used **only for database operations**, not type imports:

```typescript
// ✅ CORRECT: Use Prisma Client for database queries
import { getPrismaClient } from '@/common/database/prisma';

// ✅ CORRECT: Import types from our definitions
import { PaymentStatus } from '@/common/types/payment.types';

const prisma = getPrismaClient();
const payment = await prisma.payment.findUnique({
  where: { orderCode: 'ORDER123' }
});

// TypeScript knows the shape of 'payment' from Prisma
// But we use our enums for comparisons
if (payment.status === PaymentStatus.COMPLETED) {
  // ...
}
```

**Purpose**:
- ✅ Runtime database access
- ✅ Query building
- ✅ Type inference from queries
- ✅ Migrations

## Why This Approach?

### ❌ Alternative 1: Import Types from Prisma

```typescript
// ❌ AVOID THIS
import { PaymentStatus, Payment } from '@prisma/client';
```

**Problems**:
- Requires Prisma generation before TypeScript compilation
- Module resolution issues in monorepo
- Circular dependency between build steps
- Breaks IDE type checking

### ❌ Alternative 2: Duplicate Prisma in Lambda node_modules

```bash
# Generate Prisma in Lambda's node_modules
cd lambdas
prisma generate --schema=../prisma/schema.prisma
```

**Problems**:
- Duplicates Prisma Client code
- Larger Lambda packages
- Two sources of truth
- Sync issues between parent and lambda

### ✅ Our Solution: Separate Type Definitions

**Benefits**:
- ✅ No build-time dependency on Prisma generation
- ✅ Single source of truth (Prisma schema)
- ✅ Fast TypeScript compilation
- ✅ Clean module resolution
- ✅ Prisma Client available at runtime
- ✅ Smaller Lambda packages (types don't add runtime code)

## How to Maintain Consistency

### 1. Prisma Schema is Source of Truth

Your Prisma schema defines the actual database structure:

```prisma
// prisma/schema.prisma

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
  CANCELLED
}

model Payment {
  id                    String         @id @default(cuid())
  orderCode             String         @unique
  amount                Int
  currency              String
  provider              String
  status                PaymentStatus
  // ...
}
```

### 2. Mirror Types in TypeScript

Keep `common/types/payment.types.ts` synchronized with your Prisma schema:

```typescript
// Must match Prisma enum exactly
export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

// Must match Prisma model structure
export interface PaymentEntity {
  id: string;
  orderCode: string;
  amount: number;
  currency: string;
  provider: string;
  status: PaymentStatus;
  // ...
}
```

### 3. Verification

When you change the Prisma schema:

```bash
# 1. Update Prisma schema
vim ../prisma/schema.prisma

# 2. Update TypeScript types to match
vim common/types/payment.types.ts

# 3. Generate Prisma Client
npm run generate

# 4. Build Lambda functions
npm run build

# 5. Run tests to verify compatibility
npm test
```

## Usage Examples

### ✅ Correct Usage

```typescript
// In Lambda function code

// Import types from common
import { PaymentStatus, PaymentProvider } from '@/common/types/payment.types';
import { getPrismaClient } from '@/common/database/prisma';

export const handler = async (event: any) => {
  const prisma = getPrismaClient();

  // Query with Prisma Client
  const payment = await prisma.payment.findUnique({
    where: { orderCode: event.orderCode }
  });

  // Use our enum for comparison
  if (payment.status === PaymentStatus.PENDING) {
    // Update using our enum
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.COMPLETED }
    });
  }
};
```

### ❌ Incorrect Usage

```typescript
// ❌ DON'T DO THIS
import { PaymentStatus } from '@prisma/client';
// This will fail in Lambda environment

// ❌ DON'T DO THIS
import { Payment } from '@prisma/client';
// Use our PaymentEntity interface instead
```

## Build Process

### Development Build
```bash
npm run build
```

This compiles TypeScript using our type definitions. No Prisma generation required for type checking!

### Production Build (Lambda Layers)
```bash
npm run build:layers
```

This:
1. Installs dependencies (including Prisma)
2. Generates Prisma Client in the dependencies layer
3. Compiles TypeScript code
4. Packages everything for Lambda

## Runtime Behavior

At runtime in Lambda:

```
Lambda Function
│
├─ Code (your handlers)
│  └─ Uses PaymentStatus from @/common/types
│
├─ Dependencies Layer
│  └─ node_modules/@prisma/client (generated)
│
└─ Common Layer
   └─ common/types/payment.types.ts (compiled)
```

When your code runs:
- Type definitions are **compile-time only** (no runtime cost)
- Prisma Client is available from the dependencies layer
- Everything works seamlessly!

## Troubleshooting

### "Cannot find module '@prisma/client'"

**Cause**: Trying to import types from Prisma
**Solution**: Import from `@/common/types/payment.types` instead

### "Type mismatch between Prisma and our types"

**Cause**: Types are out of sync with Prisma schema
**Solution**: Update `common/types/*.types.ts` to match Prisma schema

### "Prisma Client not available at runtime"

**Cause**: Prisma not generated or not in dependencies layer
**Solution**:
```bash
npm run generate
npm run build:layers
```

## Summary

| Aspect | TypeScript Types | Prisma Client |
|--------|-----------------|---------------|
| **Location** | `common/types/*.types.ts` | `node_modules/@prisma/client` |
| **Purpose** | Type checking | Database queries |
| **When Used** | Compile time | Runtime |
| **Import From** | `@/common/types/...` | `@prisma/client` (only in `prisma.ts`) |
| **Updated When** | Schema changes | `npm run generate` |
| **In Lambda Package** | As compiled JS | In dependencies layer |

## Key Takeaway

> **Use our TypeScript types for type definitions**
> **Use Prisma Client for database operations**
> **Never import types directly from `@prisma/client` in Lambda code**

This separation keeps your code clean, maintainable, and deployable to Lambda! 🚀
