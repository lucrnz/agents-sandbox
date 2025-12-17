# Bun FFI (Foreign Function Interface) Implementation Guide

## Overview

Bun provides a powerful built-in `bun:ffi` module that enables JavaScript/TypeScript code to efficiently call native libraries. This is significantly faster than Node.js FFI via Node-API (2-6x faster according to Bun's benchmarks).

**Status**: Experimental - not recommended for production use yet.

## When to Use Bun FFI

✅ **Good use cases:**
- Performance-critical operations (math, crypto, data processing)
- Integrating existing native libraries (SQLite, etc.)
- Interfacing with hardware or low-level system APIs
- Wrapping C/C++/Rust/Zig libraries
- Calling operating system APIs

❌ **Avoid for:**
- Production applications (use Node-API instead)
- Async operations (not yet supported)
- Complex object passing (stick to primitives and buffers)

## Basic API Reference

### Core Imports

```typescript
import { 
  dlopen, 
  FFIType, 
  suffix, 
  ptr, 
  toArrayBuffer, 
  read,
  CString,
  JSCallback
} from "bun:ffi";
```

### Dynamic Library Loading

```typescript
// Auto-detect platform suffix (.so, .dylib, .dll)
const lib = dlopen(`libsqlite3.${suffix}`, {
  // Function definitions
  sqlite3_libversion: {
    args: [],                    // Function arguments
    returns: FFIType.cstring,    // Return type
  },
});

console.log(`SQLite version: ${lib.symbols.sqlite3_libversion()}`);
```

### Supported Types

```typescript
FFIType: {
  // Numeric types
  i8, i16, i32, i64,           // Signed integers
  u8, u16, u32, u64,          // Unsigned integers
  f32, f64,                    // Floating point
  
  // Other types
  bool,                        // Boolean
  char,                        // Character
  cstring,                     // C string (null-terminated)
  ptr,                         // void pointer
  buffer,                      // TypedArray or DataView
  function,                    // Function pointer
}
```

## Implementation Examples

### Example 1: Basic Math Functions (Zig)

**Zig Code** (`math.zig`):
```zig
const std = @import("std");

export fn add(a: i32, b: i32) i32 {
    return a + b;
}

export fn multiply(a: f64, b: f64) f64 {
    return a * b;
}

export fn factorial(n: u32) u64 {
    var result: u64 = 1;
    var i: u32 = 1;
    while (i <= n) : (i += 1) {
        result *= i;
    }
    return result;
}
```

**Compile**:
```bash
zig build-lib math.zig -dynamic -OReleaseFast
# Outputs: libmath.so (Linux), libmath.dylib (macOS), libmath.dll (Windows)
```

**JavaScript Usage**:
```typescript
import { dlopen, FFIType, suffix } from "bun:ffi";

const lib = dlopen(`libmath.${suffix}`, {
  add: {
    args: [FFIType.i32, FFIType.i32],
    returns: FFIType.i32,
  },
  multiply: {
    args: [FFIType.f64, FFIType.f64],
    returns: FFIType.f64,
  },
  factorial: {
    args: [FFIType.u32],
    returns: FFIType.u64,
  },
});

console.log(lib.symbols.add(5, 3));           // 8
console.log(lib.symbols.multiply(2.5, 4));    // 10
console.log(lib.symbols.factorial(10));       // 3628800
```

### Example 2: String Processing (C)

**C Code** (`strings.c`):
```c
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

// Returns length of string
int string_length(const char* str) {
    return strlen(str);
}

// Converts string to uppercase (modifies in-place)
void string_uppercase(char* str) {
    for (int i = 0; str[i]; i++) {
        str[i] = toupper(str[i]);
    }
}

// Concatenates two strings (caller must free result)
char* string_concat(const char* a, const char* b) {
    size_t len_a = strlen(a);
    size_t len_b = strlen(b);
    char* result = malloc(len_a + len_b + 1);
    
    strcpy(result, a);
    strcat(result, b);
    return result;
}
```

**Compile**:
```bash
# Using zig as C compiler (or use gcc/clang)
zig cc -shared strings.c -o libstrings.so
```

**JavaScript Usage**:
```typescript
import { dlopen, FFIType, CString } from "bun:ffi";

const lib = dlopen(`libstrings.${suffix}`, {
  string_length: {
    args: [FFIType.cstring],
    returns: FFIType.i32,
  },
  string_uppercase: {
    args: [FFIType.cstring],
    returns: FFIType.void,
  },
  string_concat: {
    args: [FFIType.cstring, FFITypes.cstring],
    returns: FFIType.cstring,
  },
});

// String length
const len = lib.symbols.string_length("Hello World");
console.log(len); // 11

// Uppercase (using buffer)
const buffer = Buffer.from("hello world");
lib.symbols.string_uppercase(buffer);
console.log(buffer.toString()); // "HELLO WORLD"

// Concatenation (requires manual memory management)
const concatenatedPtr = lib.symbols.string_concat("Hello, ", "World!");
const result = new CString(concatenatedPtr);
console.log(result); // "Hello, World!"
// NOTE: In real C code, you'd need to free this memory
```

### Example 3: Callbacks from Native to JS

**C Code** (`callback.c`):
```c
typedef int (*callback_t)(int, int);

// Calls the provided callback with two numbers
int operate(callback_t cb, int a, int b) {
    return cb(a, b);
}
```

**Compile**:
```bash
zig cc -shared callback.c -o libcallback.so
```

**JavaScript Usage**:
```typescript
import { dlopen, FFIType, JSCallback } from "bun:ffi";

const lib = dlopen(`libcallback.${suffix}`, {
  operate: {
    args: [FFIType.function, FFIType.i32, FFIType.i32],
    returns: FFIType.i32,
  },
});

// Create a JavaScript callback
const multiply = new JSCallback((a, b) => {
  console.log(`Called with ${a}, ${b}`);
  return a * b;
}, {
  returns: FFIType.i32,
  args: [FFIType.i32, FFIType.i32],
});

// Call native function with JS callback
const result = lib.symbols.operate(multiply.ptr, 5, 3);
console.log(result); // 15

// Clean up
multiply.close();
```

### Example 4: Working with Buffers

**Rust Code** (`buffer.rs`):
```rust
#[no_mangle]
pub extern "C" fn sum_bytes(data: *const u8, len: usize) -> u32 {
    let slice = unsafe { std::slice::from_raw_parts(data, len) };
    slice.iter().map(|&b| b as u32).sum()
}

#[no_mangle]
pub extern "C" fn fill_buffer(data: *mut u8, len: usize) {
    let slice = unsafe { std::slice::from_raw_parts_mut(data, len) };
    for (i, byte) in slice.iter_mut().enumerate() {
        *byte = (i % 256) as u8;
    }
}
```

**Compile**:
```bash
rustc --crate-type cdylib buffer.rs
```

**JavaScript Usage**:
```typescript
import { dlopen, FFIType, ptr } from "bun:ffi";

const lib = dlopen(`libbuffer.${suffix}`, {
  sum_bytes: {
    args: [FFIType.ptr, FFIType.usize],
    returns: FFIType.u32,
  },
  fill_buffer: {
    args: [FFIType.ptr, FFIType.usize],
    returns: FFIType.void,
  },
});

// Sum bytes
const data = new Uint8Array([1, 2, 3, 4, 5]);
const sum = lib.symbols.sum_bytes(ptr(data), data.length);
console.log(sum); // 15

// Fill buffer
const buffer = new Uint8Array(10);
lib.symbols.fill_buffer(ptr(buffer), buffer.length);
console.log(buffer); // Uint8Array [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
```

## Advanced Techniques

### Memory Management

```typescript
import { ptr, toArrayBuffer, read } from "bun:ffi";

// Convert TypedArray to pointer
const myArray = new Uint8Array(32);
const myPtr = ptr(myArray);

// Read specific values from pointer
console.log(read.u8(myPtr, 0));   // Read uint8 at offset 0
console.log(read.u32(myPtr, 4));  // Read uint32 at offset 4
console.log(read.f64(myPtr, 8));  // Read float64 at offset 8

// Convert pointer back to TypedArray
const arrayBuffer = toArrayBuffer(myPtr, 0, 32);
const newArray = new Uint8Array(arrayBuffer);
```

### CString Handling

```typescript
import { CString } from "bun:ffi";

// Convert C string pointer to JS string
const cStringPtr = lib.symbols.get_string();
const jsString = new CString(cStringPtr);
console.log(jsString); // "Hello from C"

// CString is cloned, safe to use after freeing ptr
lib.symbols.free_string(cStringPtr);
console.log(jsString); // Still works: "Hello from C"

// Convert with known length
const sizedString = new CString(ptr, 0, byteLength);
```

### Thread-Safe Callbacks

```typescript
import { JSCallback } from "bun:ffi";

const threadsafeCallback = new JSCallback((data) => {
  console.log("Called from different thread:", data);
  return 42;
}, {
  returns: FFIType.i32,
  args: [FFIType.ptr],
  threadsafe: true, // Enable for multi-threaded scenarios
});

// Use with native code that runs on different threads
lib.symbols.process_async(threadsafeCallback.ptr, someData);
```

## Current Limitations (IMPORTANT)

⚠️ **Bun FFI is experimental and has known issues:**

1. **No Production Use**: Not recommended for production applications
2. **No Async Support**: Cannot call async functions from native code
3. **Manual Memory Management**: Must free memory manually to avoid leaks
4. **Limited Type Support**: Only basic C types supported
5. **Platform Differences**: Behavior may vary across platforms
6. **No Struct Support**: Cannot directly pass/return structs (use pointers)
7. **GC Integration**: FinalizationRegistry can be used but has edge cases

For production applications, use **Node-API** instead:
```bash
# Node-API is stable and production-ready
# Bun fully supports Node-API modules
npm install your-native-module
```

## Best Practices

### 1. Use TypeScript for Type Safety

```typescript
interface MathLib {
  symbols: {
    add: (a: number, b: number) => number;
    multiply: (a: number, b: number) => number;
  };
}

const lib = dlopen(`libmath.${suffix}`, {
  add: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  multiply: { args: [FFIType.f64, FFIType.f64], returns: FFIType.f64 },
}) as MathLib;
```

### 2. Error Handling

```typescript
try {
  const result = lib.symbols.risky_operation();
} catch (error) {
  console.error("FFI call failed:", error);
  // Handle error gracefully
}
```

### 3. Resource Cleanup

```typescript
class NativeWrapper {
  private callback: JSCallback | null = null;
  
  constructor() {
    this.callback = new JSCallback(this.handleNativeCall.bind(this), {
      returns: FFIType.void,
      args: [FFIType.ptr],
    });
  }
  
  cleanup() {
    if (this.callback) {
      this.callback.close();
      this.callback = null;
    }
  }
  
  handleNativeCall(data: Pointer) {
    // Handle callback
  }
}

// Use with try/finally
const wrapper = new NativeWrapper();
try {
  // Use wrapper
} finally {
  wrapper.cleanup();
}
```

### 4. Memory Ownership Documentation

```typescript
/**
 * Returns a new CString that must be freed by caller
 * @returns {Pointer} Pointer to C string (caller must free)
 */
function getNativeString(): Pointer {
  return lib.symbols.create_string();
}

// Usage with explicit cleanup
const strPtr = getNativeString();
try {
  const str = new CString(strPtr);
  console.log(str);
} finally {
  lib.symbols.free_string(strPtr); // Explicitly free
}
```

### 5. Performance Optimization

```typescript
// Reuse callbacks instead of creating new ones
const reusableCallback = new JSCallback((a, b) => a + b, {
  returns: FFIType.i32,
  args: [FFIType.i32, FFIType.i32],
});

// Batch operations when possible
function batchProcess(items: number[]) {
  const results: number[] = [];
  for (const item of items) {
    results.push(lib.symbols.process(item)); // Individual calls
  }
  return results;
}

// Better: Pass array pointer
function batchProcessOptimized(items: number[]) {
  const buffer = new Int32Array(items);
  const resultPtr = lib.symbols.process_batch(ptr(buffer), items.length);
  // Process results
}
```

## FFI vs Node-API Comparison

| Feature | Bun FFI | Node-API |
|---------|---------|----------|
| Status | Experimental | Stable |
| Performance | Very Fast (JIT) | Fast |
| Production Ready | ❌ No | ✅ Yes |
| Async Support | ❌ No | ✅ Yes |
| Memory Management | Manual | Automatic |
| Type Safety | Limited | Full |
| Documentation | Minimal | Extensive |
| Ecosystem | Small | Large |

**Recommendation**: Use Bun FFI for prototyping and performance experiments. Use Node-API for production code.

## Resources

- [Bun FFI Official Docs](https://bun.sh/docs/runtime/ffi)
- [Bun FFI Source Code](https://github.com/oven-sh/bun/blob/main/src/js/bun/ffi.ts)
- [Bun FFI Benchmarks](https://github.com/oven-sh/bun/tree/main/bench/ffi)
- [Node-API Documentation](https://nodejs.org/api/n-api.html)

## Example Project Structure

```
ffi-example/
├── src/
│   └── math.zig           # Native implementation
├── lib/
│   └── libmath.so         # Compiled library
├── src/
│   └── index.ts           # FFI bindings
├── build.ts               # Build script
└── package.json
```

**build.ts**:
```typescript
// Build native library before running
import { $ } from "bun";

await $`zig build-lib src/math.zig -dynamic -OReleaseFast -o lib/libmath.so`;
```

**package.json**:
```json
{
  "scripts": {
    "build:native": "bun run build.ts",
    "start": "bun run src/index.ts"
  }
}
```
