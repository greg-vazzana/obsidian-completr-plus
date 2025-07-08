# NLP-Based Capitalization Test Cases

This file demonstrates the new NLP-powered capitalization features using the compromise.js library. The plugin now supports both line-level and sentence-level capitalization with intelligent sentence boundary detection.

## New Features Added

### 🆕 Sentence-Level Capitalization
- **Intelligent sentence detection** using NLP analysis
- **Cross-line sentence handling** - sentences that span multiple lines
- **Better punctuation handling** - sentences ending with !, ?, or .
- **Context-aware processing** - understands abbreviations, quotes, etc.

### ⚙️ New Settings Available
- `Auto-capitalize first word of sentence` - NLP-powered sentence detection
- `Preserve mixed-case words` - Protects iPhone, JavaScript, etc.
- `Debug NLP capitalization` - Console logging for troubleshooting

## Test Cases

### ✅ Basic Sentence Detection
Type these examples to test sentence-level capitalization:

```
hello world. this is a test
```
**Expected:** `Hello world. This is a test`

```
great work! let's continue. what's next?
```
**Expected:** `Great work! Let's continue. What's next?`

### ✅ Cross-Line Sentences  
Test sentences that span multiple lines:

```
this is a long sentence that continues
across multiple lines and should have
only the first word capitalized.
```
**Expected:** First word "this" → "This", others remain lowercase

### ✅ Mixed Case Preservation
These should remain unchanged when "Preserve mixed-case words" is enabled:

```
iPhone development with JavaScript
```
**Expected:** No changes to iPhone or JavaScript

```
welcome to eBay shopping
```
**Expected:** "welcome" → "Welcome", eBay unchanged

### ✅ Markdown Context Respect

#### Headers
```
# this is a header
## another header example
```
**Expected:** Line-level capitalization applies to first word after #

#### Lists
```
- first item in list
- second item here
1. numbered item one
2. numbered item two
```
**Expected:** Line-level capitalization for list items

#### Blockquotes
```
> this is a quoted sentence. it has multiple parts.
```
**Expected:** "this" → "This", "it" → "It"

### ❌ Should NOT Capitalize (Markdown Protection)

#### Code Blocks
````
```javascript
let message = "hello world";
console.log(message);
```
````
**Expected:** No capitalization inside code blocks

#### Inline Code
```
This is `hello world` in code and `another example`.
```
**Expected:** Code content unchanged, "This" and sentence detection works outside

#### Front Matter
```yaml
---
title: my document title
author: john doe
---
```
**Expected:** No capitalization in front matter

#### Links
```
[hello world](https://example.com)
[[internal link example]]
```
**Expected:** Link text unchanged

### ✅ Advanced Sentence Detection

#### Abbreviations and Titles
```
Dr. Smith said hello. Mrs. Johnson agreed.
```
**Expected:** "hello" → "Hello" (NLP should detect Dr. doesn't end sentence)

#### Quotes and Dialogue
```
He said "hello there. how are you?" and walked away.
```
**Expected:** "hello" → "Hello", "how" → "How" (sentence detection within quotes)

#### Complex Punctuation
```
What?! really... that's amazing!
```
**Expected:** Each sentence start detected properly

### ⚡ Performance Test Cases

#### Large Text Blocks
Test with longer content to ensure NLP processing doesn't cause lag:

```
this is a longer paragraph with multiple sentences. it tests the performance of the NLP library. we want to make sure it processes quickly. the system should handle this without noticeable delay. typing should feel responsive and natural.
```

#### Rapid Typing
Test by typing quickly through sentence boundaries to ensure real-time processing works smoothly.

## Comparison: Before vs After

### Before (Line-Level Only)
```
Original: hello world. this continues on
          the same line but is separate sentence.
Result:   Hello world. this continues on
          The same line but is separate sentence.
```

### After (NLP Sentence Detection)
```
Original: hello world. this continues on
          the same line but is separate sentence.
Result:   Hello world. This continues on
          the same line but is separate sentence.
```

## Technical Implementation Notes

### Libraries Used
- **compromise.js** - NLP processing and sentence detection
- **Existing infrastructure** - Maintains compatibility with current system

### Key Features
1. **Dual Mode Operation** - Both line and sentence level can be enabled
2. **Fallback Handling** - Falls back to line-level if NLP processing fails
3. **Context Preservation** - All existing markdown protections maintained
4. **Performance Optimized** - Processes only surrounding context, not entire document

### Configuration Options
All configurable through plugin settings:
- Enable/disable sentence-level detection
- Preserve mixed-case words
- Debug logging for troubleshooting
- Maintains all existing line-level options

## Testing Instructions

1. **Enable Settings:**
   - ✅ Auto-capitalize first word of line
   - ✅ Auto-capitalize first word of sentence
   - ✅ Preserve mixed-case words
   - ❌ Debug NLP capitalization (unless troubleshooting)

2. **Test Scenarios:**
   - Type the examples above
   - Verify capitalization happens as expected
   - Test edge cases with markdown syntax
   - Check performance with longer text

3. **Expected Behavior:**
   - Typing feels natural and responsive
   - Sentences are intelligently detected
   - Mixed-case words are preserved
   - Markdown contexts are respected
   - No conflicts between line and sentence detection

## Troubleshooting

If capitalization isn't working as expected:

1. **Check Settings** - Ensure both options are enabled
2. **Enable Debug Mode** - Turn on "Debug NLP capitalization"
3. **Check Console** - Look for NLP processing logs
4. **Test Context** - Verify you're not in code blocks/front matter
5. **Library Loading** - Ensure compromise.js loaded successfully

---

*This enhanced capitalization system provides a more natural and intelligent writing experience while maintaining full compatibility with existing functionality.* 