.PHONY: all build-linux build-macos build-windows clean install-deps

# Default target
all: build

# Detect platform and build accordingly
build:
	@echo "Building for current platform..."
	@unameOut=$$(uname -s); \
	case "$${unameOut}" in \
		Linux*)     make build-linux ;; \
		Darwin*)    make build-macos ;; \
		CYGWIN*|MINGW*|MSYS*) make build-windows ;; \
		*)          echo "Unsupported platform: $${unameOut}" && exit 1 ;; \
	esac

# Build for Linux
build-linux:
	@echo "Building for Linux..."
	@go build -o libgo-lib-ffi.so -buildmode=c-shared main.go
	@echo "Linux library built: libgo-lib-ffi.so"

# Build for macOS
build-macos:
	@echo "Building for macOS..."
	@go build -o libgo-lib-ffi.dylib -buildmode=c-shared main.go
	@echo "macOS library built: libgo-lib-ffi.dylib"

# Build for Windows
build-windows:
	@echo "Building for Windows..."
	@GOOS=windows GOARCH=amd64 go build -o go-lib-ffi.dll -buildmode=c-shared main.go
	@echo "Windows library built: go-lib-ffi.dll"

# Build for all platforms
build-all: build-linux build-macos build-windows
	@echo "All platform libraries built successfully"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -f libgo-lib-ffi.so libgo-lib-ffi.dylib go-lib-ffi.dll
	@rm -f go-lib-ffi.h
	@echo "Clean complete"

# Copy libraries to TypeScript directory
install:
	@echo "Installing libraries to TypeScript directory..."
	@mkdir -p ../src/backend/agent/
	@cp -f libgo-lib-ffi.* ../src/backend/agent/ 2>/dev/null || true
	@cp -f go-lib-ffi.dll ../src/backend/agent/ 2>/dev/null || true
	@cp -f go-lib-ffi.h ../src/backend/agent/ 2>/dev/null || true
	@echo "Libraries installed to TypeScript directory"

# Install dependencies
deps:
	@echo "Installing Go dependencies..."
	@go mod download
	@go mod tidy
	@echo "Dependencies installed"

# Run tests (placeholder for when tests are added)
test:
	@echo "Running tests..."
	@go test ./...

# Show help
help:
	@echo "Available targets:"
	@echo "  build        - Build for current platform"
	@echo "  build-linux  - Build for Linux (.so)"
	@echo "  build-macos  - Build for macOS (.dylib)"
	@echo "  build-windows - Build for Windows (.dll)"
	@echo "  build-all    - Build for all platforms"
	@echo "  clean        - Remove build artifacts"
	@echo "  install      - Copy libraries to TypeScript directory"
	@echo "  deps         - Install Go dependencies"
	@echo "  test         - Run tests"
	@echo "  help         - Show this help"
