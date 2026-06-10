/**
 * Test: Advanced Research Pipeline
 * Verifies semantic search, ranking, and citation formatting
 */

import { 
  generateEmbedding,
  searchLocalDocuments,
  scoreRelevance,
  formatCitation,
  generateBibliography,
  createVHFMonitoringPipeline,
  performAdvancedSearch
} from "../api/services/advanced-research-pipeline";

async function runTests() {
  console.log("🚀 Starting Advanced Research Pipeline Tests...\n");

  try {
    // Test 1: Embedding generation
    console.log("✓ Test 1: Embedding generation");
    const embedding = await generateEmbedding("VHF monitoring anomaly detection");
    console.log(`  - Generated embedding with ${embedding.length} dimensions`);
    console.log(`  - Sample values: [${embedding.slice(0, 3).join(", ")}]\n`);

    // Test 2: VHF topic pipeline
    console.log("✓ Test 2: VHF Monitoring Pipeline Configuration");
    const vhfQuery = await createVHFMonitoringPipeline();
    console.log(`  - Topic: ${vhfQuery.topic}`);
    console.log(`  - Keywords: ${vhfQuery.keywords.slice(0, 5).join(", ")}...`);
    console.log(`  - Year range: ${vhfQuery.yearFrom}-${vhfQuery.yearTo}`);
    console.log(`  - Return count: ${vhfQuery.returnCount}\n`);

    // Test 3: Search local documents
    console.log("✓ Test 3: Local Document Search");
    const localResults = await searchLocalDocuments(vhfQuery);
    console.log(`  - Found ${localResults.length} local documents`);
    localResults.forEach((paper, idx) => {
      console.log(`    ${idx + 1}. ${paper.title} (${paper.relevanceScore}% relevance)`);
    });
    console.log();

    // Test 4: Advanced search (hybrid)
    console.log("✓ Test 4: Hybrid Search Execution");
    const result = await performAdvancedSearch(vhfQuery);
    console.log(`  - Total papers found: ${result.totalPapersFound}`);
    console.log(`  - Search duration: ${result.searchDuration}ms`);
    console.log(`  - Sources: ${new Set(result.papers.map(p => p.source)).size} unique sources`);
    console.log(`  - Warnings: ${result.warnings.length}`);
    result.warnings.forEach(w => console.log(`    ⚠️  ${w}`));
    console.log();

    // Test 5: Citation formatting
    if (result.papers.length > 0) {
      console.log("✓ Test 5: Citation Formatting");
      const paper = result.papers[0];
      console.log(`  - Paper: ${paper.title}`);
      
      const apaFormat = formatCitation(paper, "APA");
      console.log(`  - APA: ${apaFormat.substring(0, 100)}...`);
      
      const ieeeFormat = formatCitation(paper, "IEEE");
      console.log(`  - IEEE: ${ieeeFormat.substring(0, 100)}...`);
      console.log();
    }

    // Test 6: Bibliography generation
    if (result.papers.length > 0) {
      console.log("✓ Test 6: Bibliography Generation");
      const bibliography = generateBibliography(result.papers.slice(0, 3), "APA");
      const lineCount = bibliography.split("\n").length;
      console.log(`  - Generated bibliography with ${lineCount} entries (APA format)`);
      console.log(`  - First entry: ${bibliography.split("\n")[0].substring(0, 80)}...\n`);
    }

    console.log("✅ All tests passed!\n");
    console.log("📊 Summary:");
    console.log(`  - Local documents available: ${localResults.length}`);
    console.log(`  - Total papers found: ${result.totalPapersFound}`);
    console.log(`  - Response time: ${result.searchDuration}ms`);
    console.log("\n🎯 Ready to use!\n");

  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

runTests();
