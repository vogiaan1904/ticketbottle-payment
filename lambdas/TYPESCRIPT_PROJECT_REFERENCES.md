# TypeScript Project References - Solution Guide

## Problem We Solved

**Original Error**:
```
File '/Users/.../common/logger/index.ts' is not under 'rootDir'
'/Users/.../outbox-processor'. 'rootDir' is expected to contain all source files.
```

**Root Cause**: Each Lambda function's `tsconfig.json` had `rootDir: "."` but imported from `@/common/*` which is outside that directory.

## ✅ Solution: TypeScript Project References

We implemented **TypeScript Project References** - the proper TypeScript way to handle shared code in monorepos.

### What Changed

#### 1. Root `lambdas/tsconfig.json`
- Added `composite: true`
- Added `references` to all sub-projects
- Changed to use `files: []` (no direct compilation)

```json
{
  "compilerOptions": {
    "composite": true,
    // ... other options
  },
  "files": [],
  "references": [
    { "path": "./common" },
    { "path": "./payment-webhook-handler" },
    { "path": "./outbox-processor" },
    { "path": "./outbox-cleanup" }
  ]
}
```

#### 2. `common/tsconfig.json`
- Added `composite: true`
- Added `declaration: true` (required for composite)
- Added `declarationMap: true` (for better IDE support)

```json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    // ...
  }
}
```

#### 3. Each Lambda's `tsconfig.json`
- Added `references: [{ "path": "../common" }]`
- Tells TypeScript this project depends on the common project

```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "."
  },
  "references": [
    { "path": "../common" }
  ]
}
```

#### 4. `package.json` Scripts
- Changed from `tsc --project` to `tsc --build`
- Added useful build commands

```json
{
  "scripts": {
    "build": "tsc --build",
    "build:watch": "tsc --build --watch",
    "build:clean": "tsc --build --clean"
  }
}
```

## How It Works

### Project Structure
```
lambdas/
├── tsconfig.json           # Root config (references all)
├── common/
│   ├── tsconfig.json       # Common library (composite)
│   └── dist/               # Compiled common code
├── payment-webhook-handler/
│   ├── tsconfig.json       # References common
│   └── dist/               # Compiled handler code
├── outbox-processor/
│   ├── tsconfig.json       # References common
│   └── dist/
└── outbox-cleanup/
    ├── tsconfig.json       # References common
    └── dist/
```

### Build Order
When you run `tsc --build`:

1. ✅ Builds `common/` first (no dependencies)
2. ✅ Builds `payment-webhook-handler/` (depends on common)
3. ✅ Builds `outbox-processor/` (depends on common)
4. ✅ Builds `outbox-cleanup/` (depends on common)

TypeScript automatically handles the dependency order!

## Benefits

### ✅ **Incremental Builds**
```bash
# Only rebuilds changed projects
npm run build
```

### ✅ **Fast Rebuilds**
```bash
# Watch mode with incremental compilation
npm run build:watch
```

### ✅ **Clean Builds**
```bash
# Remove all build artifacts
npm run build:clean
```

### ✅ **Type Safety**
- Full type checking across projects
- Changes in `common/` types immediately reflected in Lambda functions
- IDE gets full IntelliSense across projects

### ✅ **Lambda Deployment Ready**
- Each Lambda compiles to its own `dist/` folder
- Clean separation for packaging
- Common code is in `common/dist/` for Lambda layer

## Usage

### Development Workflow

1. **First Time Setup**:
```bash
cd ticketbottle-payment/lambdas
npm install
npm run generate  # Generate Prisma client
npm run build     # Build all projects
```

2. **During Development**:
```bash
npm run build:watch  # Auto-rebuild on changes
```

3. **Clean Build**:
```bash
npm run build:clean  # Remove old artifacts
npm run build        # Fresh build
```

### Building Individual Projects

You can also build individual projects:

```bash
# Build just common
tsc --build common/tsconfig.json

# Build just webhook handler (will build common if needed)
tsc --build payment-webhook-handler/tsconfig.json
```

### IDE Support

Most modern IDEs (VS Code, WebStorm) understand project references:

- ✅ Go to definition works across projects
- ✅ Find all references works across projects
- ✅ Refactoring works across projects
- ✅ Auto-imports work correctly

## Verification

### Check Build Works
```bash
cd ticketbottle-payment/lambdas

# Dry run (shows what would be built)
npx tsc --build --dry

# Actual build
npm run build

# Verify output
ls -la common/dist/
ls -la payment-webhook-handler/dist/
ls -la outbox-processor/dist/
ls -la outbox-cleanup/dist/
```

### Check for Errors
```bash
# Type check without emitting files
npx tsc --build --dry

# Clean and rebuild
npm run build:clean
npm run build
```

## Troubleshooting

### "Cannot find module '@/common/...'"

**Solution**: Build the common project first
```bash
tsc --build common/tsconfig.json
```

### "Project references may not form a circular dependency"

**Solution**: Check that common doesn't import from Lambda functions. Dependencies should be one-way:
```
Lambda Functions → common ✅
common → Lambda Functions ❌
```

### "error TS6053: File '...' not in project"

**Solution**: Check your `include` and `exclude` patterns in tsconfig.json

### Build artifacts in wrong location

**Solution**:
- Check `outDir` in each tsconfig.json
- Run `npm run build:clean` and rebuild

## Performance

### Before (Without Project References)
- ❌ Had to compile common code with every Lambda function
- ❌ No incremental builds
- ❌ Long build times
- ❌ TypeScript errors due to rootDir issues

### After (With Project References)
- ✅ Common compiled once, reused by all Lambda functions
- ✅ Incremental builds (only rebuild changed projects)
- ✅ Fast rebuilds (TypeScript tracks dependencies)
- ✅ No TypeScript path errors

## Lambda Deployment

The build output is Lambda-ready:

```bash
# Build layers script uses these paths
npm run build:layers

# Creates:
build/
├── dependencies-layer.zip    # node_modules
├── common-layer.zip           # common/dist/
├── payment-webhook-handler.zip  # payment-webhook-handler/dist/
├── outbox-processor.zip       # outbox-processor/dist/
└── outbox-cleanup.zip         # outbox-cleanup/dist/
```

## Alternative Solutions (Not Chosen)

### ❌ Option 1: No rootDir
- Removes the error but output structure becomes messy
- Not suitable for Lambda deployment

### ❌ Option 2: Copy common code to each Lambda
- Duplicates code
- Hard to maintain
- Larger Lambda packages

### ❌ Option 3: Single tsconfig for all
- Can't build Lambdas independently
- All-or-nothing compilation

### ✅ Option 4: Project References (Chosen)
- Proper TypeScript pattern
- Incremental builds
- Type safety
- Lambda-ready output

## Resources

- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [TypeScript Build Mode](https://www.typescriptlang.org/docs/handbook/project-references.html#build-mode-for-typescript)
- [Composite Projects](https://www.typescriptlang.org/tsconfig#composite)

---

**Status**: ✅ Implemented and Working
**Last Updated**: 2025-11-25
**Tested With**: TypeScript 5.3.3, Node.js 20.x
