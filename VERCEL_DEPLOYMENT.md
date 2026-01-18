# Vercel Deployment Notes

## Limitations and Considerations

### WebSocket Support
**❌ Not Supported**: Vercel's serverless functions don't support persistent WebSocket connections. 

**Alternatives:**
1. **Vercel Edge Functions + WebSocket API**: For simple real-time features
2. **External WebSocket Service**: Use services like Pusher, Ably, or Socket.IO hosted elsewhere
3. **SSE (Server-Sent Events)**: For one-way real-time updates
4. **Polling**: For simple real-time updates

### Background Workers
**❌ Not Supported**: Long-running background processes don't work in serverless environments.

**Alternatives:**
1. **Vercel Cron Jobs**: For scheduled tasks
2. **External Queue Service**: Use Redis Queue with external worker processes
3. **Trigger-based Processing**: Process tasks on API calls instead of background

### Redis/Database Connections
**⚠️ Limited**: Each serverless function creates new connections, which can exhaust connection pools.

**Recommendations:**
1. Use connection pooling
2. Set short connection timeouts
3. Consider serverless-friendly databases (Vercel KV for Redis, MongoDB Atlas with pooling)

## Current Deployment Configuration

The `server-vercel.ts` file has been created with these modifications:
- Removed WebSocket initialization
- Removed background worker initialization  
- Added connection management for serverless environment
- Added connection pooling logic

## Environment Variables Required

Make sure to set these in Vercel dashboard:

```bash
MONGODB_URI=your_mongodb_connection_string
REDIS_URL=your_redis_connection_string
REDIS_PASSWORD=your_redis_password
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
ADMIN_API_KEY=your_admin_api_key
MAPBOX_ACCESS_TOKEN=your_mapbox_token
STREEFI_API_URL=your_streefi_api_url
STREEFI_API_KEY=your_streefi_api_key
STREEFI_CLIENT_ID=your_streefi_client_id
STREEFI_ADMIN_API_KEY=your_streefi_admin_api_key
ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://your-domain.com
NODE_ENV=production
```

## Deployment Steps

1. Build the project: `npm run vercel-build`
2. Deploy to Vercel: `vercel --prod`
3. Set environment variables in Vercel dashboard
4. Test all API endpoints

## Recommended Architecture for Full Features

For a production system with WebSockets and background workers:

1. **API Routes**: Deploy on Vercel (current setup)
2. **WebSocket Server**: Deploy on Railway, Render, or DigitalOcean 
3. **Background Workers**: Deploy on a container platform
4. **Frontend**: Deploy on Vercel

This hybrid approach gives you the best of both worlds.