# Auto-Capitalization Test Cases

This file contains test cases for the auto-capitalization feature. Enable the "Auto-capitalize first word of line" setting and type the examples below to test the functionality.

## Basic Test Cases

### ✅ Should Capitalize
Type these lowercase words at the start of lines - they should automatically capitalize:

hello world
the quick brown fox
testing capitalization
simple test case

### ❌ Should NOT Capitalize (Mixed Case Words)
Type these words - they should remain unchanged:

iPhone testing
JavaScript development
myVariable assignment
eBay shopping
MacBook purchase

## Markdown Context Tests

### ✅ Headers (Should Capitalize)
# hello world
## testing headers
### another example

### ✅ Lists (Should Capitalize)
- hello item
- testing lists
1. first item
2. second item

### ✅ Blockquotes (Should Capitalize)
> hello quote
> testing blockquotes

### ❌ Code Blocks (Should NOT Capitalize)
```
hello world
testing code
```

```javascript
hello world
const test = true;
```

### ❌ Inline Code (Should NOT Capitalize)
This is `hello world` in code.
Here's another `testing example`.

### ❌ Links (Should NOT Capitalize)
[hello world](https://example.com)
[[hello world]]
[testing link][ref]

## Word Boundary Triggers

Type these patterns to test different triggers:

### Space Trigger
hello [SPACE] → Hello [SPACE]
testing [SPACE] → Testing [SPACE]

### Punctuation Triggers
hello. → Hello.
testing, → Testing,
hello! → Hello!
testing? → Testing?
hello; → Hello;
testing: → Testing:

### Line Break Trigger
hello[ENTER] → Hello
testing[ENTER] → Testing

## Edge Cases

### Empty Lines
[Type on blank line] hello → Hello

### Indented Content
    hello indented → Hello indented
        testing nested → Testing nested

### After Markdown Prefixes
- hello → - Hello
1. testing → 1. Testing  
> hello → > Hello
# testing → # Testing

### Mixed Scenarios
- iPhone testing → - iPhone testing (mixed case preserved)
> hello world → > Hello world (first word capitalized)
## testing headers → ## Testing headers (first word capitalized)

## Case Override Tests

### Should Override Simple Cases
hello → Hello
HELLO → Hello
testing → Testing
TESTING → Testing

### Should Preserve Mixed Case
iPhone → iPhone (unchanged)
JavaScript → JavaScript (unchanged)
myVariable → myVariable (unchanged)

## Unicode and Special Characters

### Should Capitalize
café testing → Café testing
résumé writing → Résumé writing
naïve approach → Naïve approach

### Mixed Case Unicode (Should Preserve)
über-München → über-München (if it contains internal uppercase)
iPhone-compatible → iPhone-compatible

---

## Testing Instructions

1. Enable the "Auto-capitalize first word of line" setting in Completr settings
2. Type the examples above in various contexts
3. Verify that:
   - Simple lowercase words at line start get capitalized
   - Mixed case words (iPhone, JavaScript) are preserved
   - Capitalization doesn't happen in code blocks, inline code, or links
   - Different trigger characters (space, punctuation, Enter) all work
   - Markdown formatting is respected (headers, lists, blockquotes work)

## Expected Behavior Summary

- ✅ Capitalize: Simple words at line start after trigger characters
- ❌ Don't capitalize: Mixed case words, code contexts, link text
- ✅ Override: Simple ALL CAPS or lowercase words
- ✅ Respect: Markdown prefixes (headers, lists, quotes)
- ✅ Trigger on: Space, punctuation (.,!?;:), line breaks
