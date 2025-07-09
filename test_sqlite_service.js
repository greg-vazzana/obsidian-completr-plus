"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sqlite_database_service_1 = require("./src/db/sqlite_database_service");
// Mock Vault for testing
class MockVault {
    constructor() {
        this.configDir = '.obsidian';
        this.adapter = {
            exists: async (path) => false,
            readBinary: async (path) => new ArrayBuffer(0),
            writeBinary: async (path, data) => { }
        };
    }
}
async function testSQLiteService() {
    try {
        console.log('🧪 Testing SQLiteDatabaseService...');
        const mockVault = new MockVault();
        const service = new sqlite_database_service_1.SQLiteDatabaseService(mockVault);
        // Test initialization
        await service.initialize();
        console.log('✅ Initialization successful');
        // Test basic operations
        const sourceId = await service.addOrUpdateWordListSource('test.txt', 'test content');
        console.log('✅ Added word list source:', sourceId);
        await service.addWord('hello', sourceId);
        await service.addWord('world', sourceId);
        console.log('✅ Added test words');
        const words = await service.getWordsByFirstLetter('h');
        console.log('✅ Retrieved words starting with "h":', words);
        // Test word frequency
        await service.addOrIncrementWord('hello', sourceId, 5);
        console.log('✅ Incremented word frequency');
        const scanSourceId = await service.getScanSourceId();
        console.log('✅ Retrieved scan source ID:', scanSourceId);
        // Test LaTeX commands
        await service.addLatexCommand('\\alpha', 'Greek letter alpha');
        const latexCommands = await service.getLatexCommandsByFirstLetter('\\');
        console.log('✅ Added and retrieved LaTeX commands:', latexCommands.length);
        // Test front matter
        await service.addFrontMatterEntry('title', 'Test Document');
        const suggestions = await service.getFrontMatterSuggestions('title', 'Test');
        console.log('✅ Added front matter and got suggestions:', suggestions);
        // Test search
        const searchResults = await service.searchWords('hel');
        console.log('✅ Search results:', searchResults);
        // Test word count
        const wordCount = await service.getWordCount();
        console.log('✅ Total word count:', wordCount);
        // Test cleanup
        await service.shutdown();
        console.log('✅ Service shutdown successful');
        console.log('🎉 All tests passed!');
    }
    catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}
testSQLiteService();
