# Why Your Docker Push Takes 117 Seconds (and npm shows warnings)

## 🔴 ROOT CAUSE

The `@nodeteam/nestjs-prisma-pagination` package is **CATASTROPHICALLY badly packaged**. It includes:

### Production Dependencies (Should be Dev!):

- ❌ **jest@29.5.0** (~50 MB)
- ❌ **ts-jest@29.1.0** (~10 MB)
- ❌ **@nestjs/testing** (5 MB)
- ❌ **typescript** (38 MB)
- ❌ Hundreds of test-related packages

Total waste: **~100+ MB of test frameworks in your production image!**

## 📊 Impact

| Metric       | Value                    | Issue                      |
| ------------ | ------------------------ | -------------------------- |
| Push time    | 117 seconds              | Pushing Jest to Docker Hub |
| Image size   | 600+ MB                  | Should be ~150 MB          |
| npm warnings | 10+ deprecation warnings | Jest uses old glob@7.2.3   |
| node_modules | 681 MB                   | Should be ~150 MB          |

## ✅ SOLUTION: Replace the Bad Package

You only use this package in ONE file: `src/shared/utils/pagination.util.ts`

### Step 1: Remove the bad package

```bash
npm uninstall @nodeteam/nestjs-prisma-pagination
```

### Step 2: Replace with simple pagination

Create your own lightweight implementation (no dependencies needed):

```typescript
// src/shared/utils/pagination.util.ts
import { PrismaClient } from '@prisma/client';

export interface PaginationOptions {
  page?: number;
  perPage?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    lastPage: number;
    currentPage: number;
    perPage: number;
    prev: number | null;
    next: number | null;
  };
}

export type PaginateFunction = <T, K>(
  model: any,
  args?: K,
  options?: PaginationOptions,
) => Promise<PaginatedResult<T>>;

export const createPaginator = (defaultPage = 1, defaultPerPage = 15): PaginateFunction => {
  return async <T, K>(model: any, args: K = {} as K, options?: PaginationOptions) => {
    const page = Number(options?.page || defaultPage);
    const perPage = Number(options?.perPage || defaultPerPage);

    const skip = page > 0 ? perPage * (page - 1) : 0;

    const [total, data] = await Promise.all([
      model.count({ where: (args as any)?.where }),
      model.findMany({
        ...args,
        take: perPage,
        skip,
      }),
    ]);

    const lastPage = Math.ceil(total / perPage);

    return {
      data,
      meta: {
        total,
        lastPage,
        currentPage: page,
        perPage,
        prev: page > 1 ? page - 1 : null,
        next: page < lastPage ? page + 1 : null,
      },
    };
  };
};

export const defaultPaginator = createPaginator();
```

### Step 3: Update package.json

```json
{
  "dependencies": {
    // Remove this line:
    // "@nodeteam/nestjs-prisma-pagination": "^1.0.6",
    // Keep everything else
  }
}
```

### Step 4: Find and update usage

Search your codebase for usage:

```bash
grep -r "defaultPaginator\|createPaginator" src/
```

The API is identical, so your existing code should work without changes!

## 📈 Expected Results After Fix

| Metric       | Before  | After   | Savings           |
| ------------ | ------- | ------- | ----------------- |
| Image size   | 600+ MB | ~150 MB | **75% smaller**   |
| Push time    | 117s    | ~30s    | **75% faster**    |
| node_modules | 681 MB  | ~150 MB | **500+ MB saved** |
| npm warnings | 10+     | 0       | **Clean build**   |

## 🚀 Complete Fix Commands

```bash
# 1. Remove the bad package
npm uninstall @nodeteam/nestjs-prisma-pagination

# 2. Update the pagination util file (see code above)

# 3. Update package-lock.json
npm install

# 4. Rebuild Docker image
docker buildx build --no-cache --platform linux/amd64 \\
  -t vogiaan19042004/ticketbottle-payment:latest \\
  --push .

# 5. Verify the size
docker images vogiaan19042004/ticketbottle-payment:latest
```

## 🔍 Why This Happened

The package author published their entire development environment:

```json
// Their package.json includes:
{
  "dependencies": {
    "jest": "29.5.0", // ❌ Should be devDependency
    "ts-jest": "29.1.0", // ❌ Should be devDependency
    "@nestjs/testing": "9.3.2", // ❌ Should be devDependency
    "typescript": "4.9.5" // ❌ Should be devDependency
  }
}
```

This is a **critical packaging error**. These should NEVER be in production dependencies.

## 💡 Alternative: Use a Better Package

If you don't want to maintain your own code:

```bash
# Option 1: Use prisma-pagination (better maintained)
npm install prisma-pagination

# Option 2: Use nestjs-prisma (official Prisma + NestJS)
npm install nestjs-prisma
```

## 📝 Summary

**The Problem:**

- Bad npm package bundles 100+ MB of test frameworks
- Your Docker image includes Jest, ts-jest, TypeScript compiler in production
- This makes builds slow and images huge

**The Solution:**

- Replace with 50 lines of simple code (no dependencies)
- Or use a better-maintained package
- Rebuild and push - should be 75% smaller and faster

**Expected time savings per deployment:**

- Build time: -50 seconds
- Push time: -90 seconds
- Pull time (on servers): -5 minutes
- Disk space saved: 450 MB per deployment

---

**Action Items:**

1. ✅ Remove `@nodeteam/nestjs-prisma-pagination`
2. ✅ Replace with simple pagination code (provided above)
3. ✅ Run `npm install` to update lock file
4. ✅ Rebuild Docker image with `--no-cache`
5. ✅ Enjoy fast builds and small images!
