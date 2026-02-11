/**
 * ClawMemory OpenClaw Plugin - Test Suite
 * Tests all API functionality that the plugin relies on
 */

const API_BASE = "https://clawmemory.dev/api";
const API_KEY = "cm_R3mWXoEd1VWHlOVQPM-aYIPG6F68aOxi0qgrIcMes1xLr7Fu";

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({
      name,
      passed: true,
      duration: Date.now() - start,
    });
    console.log(`✅ ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    results.push({
      name,
      passed: false,
      duration: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    console.log(`❌ ${name} (${Date.now() - start}ms)`);
    console.log(`   Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function apiRequest(endpoint: string, method: string, body?: object): Promise<any> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

// ============================================================================
// TESTS
// ============================================================================

async function testStoreMemory() {
  const result = await apiRequest("/memories", "POST", {
    content: "Test memory from plugin test suite",
    type: "fact",
    importance: 0.8,
    agentId: "test-suite",
  });
  
  if (!result.success) throw new Error(`Store failed: ${JSON.stringify(result)}`);
  if (!result.data?.id) throw new Error("No memory ID returned");
  
  // Store for cleanup
  (global as any).testMemoryId = result.data.id;
}

async function testStoreWithAllTypes() {
  const types = ["fact", "preference", "decision", "event", "task", "context"];
  
  for (const type of types) {
    const result = await apiRequest("/memories", "POST", {
      content: `Test ${type} memory`,
      type,
      importance: 0.5,
      agentId: "test-suite",
    });
    
    if (!result.success) throw new Error(`Store ${type} failed`);
  }
}

async function testRecallByQuery() {
  const result = await apiRequest("/memories/recall", "POST", {
    query: "plugin test suite",
    limit: 5,
    threshold: 0.2,
  });
  
  if (!result.success) throw new Error(`Recall failed: ${JSON.stringify(result)}`);
  if (!result.data?.memories) throw new Error("No memories array returned");
  if (result.data.memories.length === 0) throw new Error("No memories found");
}

async function testRecallRelevance() {
  // Store a specific memory
  await apiRequest("/memories", "POST", {
    content: "The user's favorite color is blue",
    type: "preference",
    importance: 0.9,
    agentId: "test-suite",
  });
  
  // Wait a moment for indexing
  await new Promise(r => setTimeout(r, 500));
  
  // Recall with semantic query
  const result = await apiRequest("/memories/recall", "POST", {
    query: "What color does the user like?",
    limit: 3,
    threshold: 0.2,
  });
  
  if (!result.success) throw new Error("Recall failed");
  
  const found = result.data.memories.some((m: any) => 
    m.content.toLowerCase().includes("blue") || m.content.toLowerCase().includes("color")
  );
  
  if (!found) throw new Error("Semantic search didn't find related memory");
}

async function testRecallWithLimit() {
  const result = await apiRequest("/memories/recall", "POST", {
    query: "test",
    limit: 2,
  });
  
  if (!result.success) throw new Error("Recall failed");
  if (result.data.memories.length > 2) throw new Error("Limit not respected");
}

async function testGetMemoryById() {
  const id = (global as any).testMemoryId;
  if (!id) throw new Error("No test memory ID available");
  
  const response = await fetch(`${API_BASE}/memories/${id}`, {
    headers: { "Authorization": `Bearer ${API_KEY}` },
  });
  const result = await response.json();
  
  if (!result.success) throw new Error("Get by ID failed");
  if (!result.data?.content) throw new Error("No content returned");
}

async function testUpdateMemory() {
  const id = (global as any).testMemoryId;
  if (!id) throw new Error("No test memory ID available");
  
  const result = await apiRequest(`/memories/${id}`, "PATCH", {
    content: "Updated test memory content",
    importance: 0.95,
  });
  
  if (!result.success) throw new Error("Update failed");
}

async function testDeleteMemory() {
  const id = (global as any).testMemoryId;
  if (!id) throw new Error("No test memory ID available");
  
  const response = await fetch(`${API_BASE}/memories/${id}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${API_KEY}` },
  });
  const result = await response.json();
  
  if (!result.success) throw new Error("Delete failed");
}

async function testListMemories() {
  const response = await fetch(`${API_BASE}/memories?limit=10`, {
    headers: { "Authorization": `Bearer ${API_KEY}` },
  });
  const result = await response.json();
  
  if (!result.success) throw new Error("List failed");
  if (!Array.isArray(result.data)) throw new Error("Data is not an array");
}

async function testInvalidApiKey() {
  const response = await fetch(`${API_BASE}/memories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer invalid_key",
    },
    body: JSON.stringify({ content: "test" }),
  });
  const result = await response.json();
  
  if (result.success) throw new Error("Should have failed with invalid key");
}

async function testEmptyContent() {
  const result = await apiRequest("/memories", "POST", {
    content: "",
    type: "fact",
  });
  
  // Should fail or handle gracefully
  if (result.success && result.data?.id) {
    // Clean up
    await fetch(`${API_BASE}/memories/${result.data.id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${API_KEY}` },
    });
  }
}

async function testRecallLatency() {
  const start = Date.now();
  
  await apiRequest("/memories/recall", "POST", {
    query: "test query for latency check",
    limit: 5,
  });
  
  const latency = Date.now() - start;
  if (latency > 2000) throw new Error(`Latency too high: ${latency}ms`);
  
  results[results.length - 1].details = `Latency: ${latency}ms`;
}

async function testConcurrentRequests() {
  const promises = Array(5).fill(null).map((_, i) =>
    apiRequest("/memories", "POST", {
      content: `Concurrent test ${i}`,
      type: "context",
      agentId: "test-suite",
    })
  );
  
  const responses = await Promise.all(promises);
  const allSuccess = responses.every(r => r.success);
  
  if (!allSuccess) throw new Error("Some concurrent requests failed");
  
  // Cleanup
  for (const r of responses) {
    if (r.data?.id) {
      await fetch(`${API_BASE}/memories/${r.data.id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${API_KEY}` },
      });
    }
  }
}

// ============================================================================
// RUN TESTS
// ============================================================================

async function runAllTests() {
  console.log("\n🧪 ClawMemory Plugin Test Suite\n");
  console.log("=".repeat(50));
  console.log(`API: ${API_BASE}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log("=".repeat(50) + "\n");
  
  // Core functionality
  console.log("📦 Core API Tests\n");
  await runTest("Store memory", testStoreMemory);
  await runTest("Store all memory types", testStoreWithAllTypes);
  await runTest("Get memory by ID", testGetMemoryById);
  await runTest("Update memory", testUpdateMemory);
  await runTest("List memories", testListMemories);
  await runTest("Delete memory", testDeleteMemory);
  
  // Recall/Search
  console.log("\n🔍 Recall & Search Tests\n");
  await runTest("Recall by query", testRecallByQuery);
  await runTest("Recall with semantic relevance", testRecallRelevance);
  await runTest("Recall with limit", testRecallWithLimit);
  await runTest("Recall latency (<2s)", testRecallLatency);
  
  // Edge cases
  console.log("\n⚠️ Edge Cases & Security\n");
  await runTest("Invalid API key rejected", testInvalidApiKey);
  await runTest("Empty content handling", testEmptyContent);
  await runTest("Concurrent requests", testConcurrentRequests);
  
  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 TEST SUMMARY\n");
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`Total:  ${results.length} tests`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Time:   ${totalDuration}ms`);
  console.log(`Rate:   ${((passed / results.length) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log("\n❌ Failed Tests:");
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
  }
  
  console.log("\n" + "=".repeat(50));
  
  // Return exit code
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error("Test suite error:", err);
  process.exit(1);
});
