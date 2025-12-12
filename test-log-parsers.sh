#!/bin/bash
# Test script for Vector log parsers
# Sends various log formats to test the parsing pipeline

echo "Testing Vector Log Parsers..."
echo "=============================="
echo ""

# Wait a bit between messages to see them separately
DELAY=1

# Test 1: JSON Structured Log (Node.js style)
echo "1. Testing JSON structured log..."
echo '<14>{"level":"info","msg":"User logged in","service":"auth-service","user":"john.doe","timestamp":"2025-12-11T10:30:00Z"}' | nc -u localhost 514
sleep $DELAY

# Test 2: JSON Structured Log (Python style)
echo "2. Testing JSON structured log (Python)..."
echo '<14>{"level":"error","message":"Database connection failed","logger":"db.connector","timestamp":"2025-12-11T10:31:00Z","retry_count":3}' | nc -u localhost 514
sleep $DELAY

# Test 3: Apache/Nginx Combined Access Log
echo "3. Testing Apache/Nginx access log..."
echo '<14>192.168.1.100 - - [11/Dec/2025:10:32:00 -0700] "GET /api/users HTTP/1.1" 200 1234 "http://example.com/login" "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"' | nc -u localhost 514
sleep $DELAY

# Test 4: Nginx with response time
echo "4. Testing Nginx access log with response time..."
echo '<14>10.0.0.50 - admin [11/Dec/2025:10:33:00 -0700] "POST /api/orders HTTP/1.1" 201 567 "-" "curl/7.68.0" request_time=0.234' | nc -u localhost 514
sleep $DELAY

# Test 5: Key-Value Format (Firewall log style)
echo "5. Testing key-value log (firewall)..."
echo '<14>action=ALLOW src=192.168.1.50 dst=8.8.8.8 sport=54321 dport=53 proto=UDP bytes=128' | nc -u localhost 514
sleep $DELAY

# Test 6: Key-Value Format (Application log)
echo "6. Testing key-value log (application)..."
echo '<14>event=order_placed user=alice@example.com order_id=12345 amount=99.99 currency=USD status=success' | nc -u localhost 514
sleep $DELAY

# Test 7: Java Stack Trace
echo "7. Testing Java stack trace..."
echo '<14>java.lang.NullPointerException: Cannot invoke method on null object
    at com.example.UserService.getUser(UserService.java:42)
    at com.example.Controller.handleRequest(Controller.java:87)' | nc -u localhost 514
sleep $DELAY

# Test 8: Python Stack Trace
echo "8. Testing Python stack trace..."
echo '<14>Traceback (most recent call last):
  File "/app/main.py", line 123, in process_data
    result = data.get_value()
AttributeError: NoneType object has no attribute get_value' | nc -u localhost 514
sleep $DELAY

# Test 9: JavaScript/Node.js Error
echo "9. Testing JavaScript error..."
echo '<14>TypeError: Cannot read property "name" of undefined
    at UserController.getName (/app/controllers/user.js:45:12)
    at async Router.handle (/app/routes/index.js:23:5)' | nc -u localhost 514
sleep $DELAY

# Test 10: Docker Container Log (simulated compose service)
echo "10. Testing Docker container log..."
echo '<14>Dec 11 10:38:00 a1b2c3d4e5f6 spunk_api_1[1234]: Server listening on port 3000' | nc -u localhost 514
sleep $DELAY

# Test 11: Mixed - JSON within syslog with Docker
echo "11. Testing mixed JSON + Docker..."
echo '<14>Dec 11 10:39:00 abc123456789 myproject_web_2[5678]: {"level":"warn","msg":"High memory usage","service":"web","memory_mb":512}' | nc -u localhost 514
sleep $DELAY

# Test 12: Regular syslog (should fallback to default)
echo "12. Testing regular syslog message..."
echo '<14>Dec 11 10:40:00 router kernel: iptables: INPUT DROP eth0 PROTO=TCP' | nc -u localhost 514
sleep $DELAY

echo ""
echo "=============================="
echo "All test messages sent!"
echo ""
echo "To view parsed logs in ClickHouse:"
echo "  docker exec -it spunk-clickhouse clickhouse-client --user spunk --password spunk123 --database spunk"
echo "  SELECT timestamp, log_type, hostname, message FROM logs ORDER BY timestamp DESC LIMIT 15;"
echo ""
echo "To view parsed fields:"
echo "  SELECT timestamp, log_type, json_data, http_status, exception_type, docker_enabled FROM logs ORDER BY timestamp DESC LIMIT 15;"
