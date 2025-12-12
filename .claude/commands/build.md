# Build and Test

Build and test the entire Spunk stack:

## Build Steps
1. Run `docker-compose build` to build all containers
2. Run `docker-compose up -d` to start the stack
3. Wait for all services to be healthy

## Test Steps
1. **ClickHouse**: Test connection on port 8123
   ```bash
   curl http://localhost:8123/ping
   ```

2. **Vector**: Check logs for successful startup
   ```bash
   docker-compose logs vector
   ```

3. **API**: Test health endpoint
   ```bash
   curl http://localhost:4000/health
   ```

4. **UI**: Check if Vite dev server or build is accessible
   ```bash
   curl http://localhost:3000
   ```

5. **Integration**: Send a test syslog message and verify it appears
   ```bash
   echo "<14>Test message from Spunk" | nc -u localhost 514
   ```

## Report
- List any build failures
- List any containers not starting
- List any connectivity issues
- Provide fix recommendations
