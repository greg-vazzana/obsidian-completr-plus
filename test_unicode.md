# Unicode Character Test Cases

## Basic Special Characters
- Zürich
- München
- Größe
- Straße
- über
- schön

## Compound Words with Special Characters
- über-müde
- Größen-änderung
- Straßen_name
- München.Bayern

## Mixed with Numbers
- München2023
- Zürich1
- Test2öst

## With Apostrophes
- können's
- geht's
- d'accord

## Edge Cases
- ÖÄÜ
- äöü
- ß

## Mixed with Punctuation
Here's a sentence with, special characters. Zürich-based companies and München's architecture are beautiful!

## In Different Contexts
- In code: `const city = "Zürich";`
- In link: [München Info](https://example.com)
- In LaTeX: $\text{größer}$

## Combined Cases
- über-München's
- Test_Größe.txt
- Straße2_West

Each of these cases should be properly detected as complete words, respecting word boundaries and special characters.

# Live Word Tracking Test

This is a test document to verify live word tracking functionality.

## English Words
hello world testing frequency tracking
hello hello hello
world world
testing

## Unicode Characters
café résumé naïve
こんにちは 世界
Привет мир

## Words with Special Characters
word-with-hyphens
word_with_underscores
word'with'apostrophes
file.txt
test.example.com

## Mixed Content
Testing mixed content with English, café, and こんにちは in the same sentence. 