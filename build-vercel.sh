#!/bin/bash

echo "🚀 Building Hocco Backend for Vercel..."

# Clean previous build
rm -rf dist/

# Build TypeScript
echo "📦 Compiling TypeScript..."
npx tsc -p tsconfig.json

# Copy any necessary static files
echo "📋 Copying static files..."
if [ -f "package.json" ]; then
    cp package.json dist/
fi

echo "✅ Build completed!"
echo "📂 Built files are in the 'dist' directory"
echo ""
echo "📝 Next steps:"
echo "1. Set up environment variables in Vercel dashboard"
echo "2. Deploy with: vercel --prod"
echo "3. Test your API endpoints"
echo ""
echo "🔗 Your API will be available at:"
echo "   - GET  /api/v1/auth/..."
echo "   - GET  /api/v1/carts/..."
echo "   - GET  /api/v1/ingest/..."
echo "   - GET  /api/v1/alerts/..."
echo "   - GET  /api/internal/..."
echo "   - GET  /health"
echo "   - GET  /ready"