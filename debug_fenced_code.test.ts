import { TextAnalyzer } from './src/utils/text_analyzer';

describe('Debug Fenced Code Block Detection', () => {
  it('should debug language-specific fenced code block detection', () => {
    // Exactly the same text as the failing test
    const lines = [
      '```javascript',
      'hello world',
      'const x = "test";',
      '```'
    ];
    const fullText = lines.join('\n');
    const position = lines[0].length + 1 + 5; // Position at "h" in "hello world" on line 1
    
    console.log('Debug info:');
    console.log('Full text:', JSON.stringify(fullText));
    console.log('Position:', position);
    console.log('Character at position:', JSON.stringify(fullText[position]));
    
    // Test pattern detection
    const patterns = (TextAnalyzer as any).findAllPatterns(fullText);
    console.log('Detected patterns:', patterns);
    
    // Test context analysis
    const analysis = TextAnalyzer.analyzeContext(fullText, position);
    console.log('Context analysis:', {
      shouldSkip: analysis.shouldSkipCapitalization,
      reason: analysis.reason,
      patterns: analysis.matchedPatterns
    });
    
    // Manually test the fenced code block regex
    const fencedRegex = /```[a-zA-Z0-9]*\s*[\s\S]*?```/g;
    const matches = [...fullText.matchAll(fencedRegex)];
    console.log('Manual regex matches:', matches.map(m => ({
      match: m[0],
      start: m.index,
      end: m.index! + m[0].length
    })));
    
    expect(analysis.shouldSkipCapitalization).toBe(true);
  });
});