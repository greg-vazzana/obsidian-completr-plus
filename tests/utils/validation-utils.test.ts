import { ValidationUtils } from '../../src/utils/validation_utils';
import { Editor, EditorPosition } from 'obsidian';

// Mock the Editor interface with minimal required methods
const createMockEditor = (lines: string[]): Editor => {
  return {
    getLine: (lineNumber: number): string => lines[lineNumber] || '',
    lastLine: (): number => lines.length - 1,
  } as unknown as Editor;
};

describe('ValidationUtils', () => {
  describe('Front Matter Detection', () => {
    describe('getFrontMatterBounds', () => {
      it('should return null when no front matter exists', () => {
        const editor = createMockEditor(['# Title', 'Content line']);
        const result = ValidationUtils.getFrontMatterBounds(editor);
        expect(result).toBeNull();
      });

      it('should return null when only start marker exists', () => {
        const editor = createMockEditor(['---', 'title: Test', 'author: John']);
        const result = ValidationUtils.getFrontMatterBounds(editor);
        expect(result).toBeNull();
      });

      it('should return bounds for valid front matter', () => {
        const editor = createMockEditor([
          '---',
          'title: Test Document',
          'author: John Doe',
          '---',
          '# Main Content'
        ]);
        const result = ValidationUtils.getFrontMatterBounds(editor);
        
        expect(result).not.toBeNull();
        expect(result?.startLine).toBe(0);
        expect(result?.endLine).toBe(3);
      });

      it('should find front matter starting at line 0', () => {
        const editor = createMockEditor([
          '---',
          'layout: post',
          'date: 2023-01-01',
          '---',
          'Content starts here'
        ]);
        const result = ValidationUtils.getFrontMatterBounds(editor);
        
        expect(result?.startLine).toBe(0);
        expect(result?.endLine).toBe(3);
      });

      it('should handle front matter with empty lines', () => {
        const editor = createMockEditor([
          '---',
          'title: Test',
          '',
          'tags: [test]',
          '---',
          'Content'
        ]);
        const result = ValidationUtils.getFrontMatterBounds(editor);
        
        expect(result?.startLine).toBe(0);
        expect(result?.endLine).toBe(4);
      });

      it('should limit search to first 5 lines for start marker', () => {
        const editor = createMockEditor([
          'Line 0',
          'Line 1', 
          'Line 2',
          'Line 3',
          'Line 4',
          '---', // This is line 5, should not be found
          'title: Test',
          '---'
        ]);
        const result = ValidationUtils.getFrontMatterBounds(editor);
        expect(result).toBeNull();
      });

      it('should limit search to 50 lines for end marker', () => {
        const lines = ['---', 'title: Test'];
        // Add 49 more lines without end marker
        for (let i = 0; i < 49; i++) {
          lines.push(`line${i}`);
        }
        lines.push('---'); // This is line 51, should not be found
        
        const editor = createMockEditor(lines);
        const result = ValidationUtils.getFrontMatterBounds(editor);
        expect(result).toBeNull();
      });

      it('should handle documents with multiple --- lines', () => {
        const editor = createMockEditor([
          '---',
          'title: Test',
          '---',
          'Content with --- in it',
          '---',
          'More content'
        ]);
        const result = ValidationUtils.getFrontMatterBounds(editor);
        
        expect(result?.startLine).toBe(0);
        expect(result?.endLine).toBe(2);
      });

      it('should handle empty document', () => {
        const editor = createMockEditor([]);
        const result = ValidationUtils.getFrontMatterBounds(editor);
        expect(result).toBeNull();
      });

      it('should handle document with only one line', () => {
        const editor = createMockEditor(['# Title']);
        const result = ValidationUtils.getFrontMatterBounds(editor);
        expect(result).toBeNull();
      });

      it('should handle document with only start marker', () => {
        const editor = createMockEditor(['---']);
        const result = ValidationUtils.getFrontMatterBounds(editor);
        expect(result).toBeNull();
      });
    });

    describe('isInFrontMatterBlock', () => {
      it('should return false for line 0', () => {
        const editor = createMockEditor([
          '---',
          'title: Test',
          '---',
          'Content'
        ]);
        const pos: EditorPosition = { line: 0, ch: 0 };
        
        expect(ValidationUtils.isInFrontMatterBlock(editor, pos)).toBe(false);
      });

      it('should return true for positions inside front matter', () => {
        const editor = createMockEditor([
          '---',
          'title: Test Document',
          'author: John Doe',
          '---',
          '# Main Content'
        ]);
        
        expect(ValidationUtils.isInFrontMatterBlock(editor, { line: 1, ch: 0 })).toBe(true);
        expect(ValidationUtils.isInFrontMatterBlock(editor, { line: 2, ch: 5 })).toBe(true);
      });

      it('should return false for positions outside front matter', () => {
        const editor = createMockEditor([
          '---',
          'title: Test',
          '---',
          '# Content',
          'Regular text'
        ]);
        
        expect(ValidationUtils.isInFrontMatterBlock(editor, { line: 0, ch: 0 })).toBe(false); // start marker
        expect(ValidationUtils.isInFrontMatterBlock(editor, { line: 2, ch: 0 })).toBe(false); // end marker
        expect(ValidationUtils.isInFrontMatterBlock(editor, { line: 3, ch: 0 })).toBe(false); // content
        expect(ValidationUtils.isInFrontMatterBlock(editor, { line: 4, ch: 0 })).toBe(false); // content
      });

      it('should return false when no front matter exists', () => {
        const editor = createMockEditor([
          '# Title',
          'Content line'
        ]);
        
        expect(ValidationUtils.isInFrontMatterBlock(editor, { line: 0, ch: 0 })).toBe(false);
        expect(ValidationUtils.isInFrontMatterBlock(editor, { line: 1, ch: 0 })).toBe(false);
      });

      it('should handle edge cases with malformed front matter', () => {
        const editor = createMockEditor([
          '---',
          'title: Test',
          // Missing end marker
        ]);
        
        expect(ValidationUtils.isInFrontMatterBlock(editor, { line: 1, ch: 0 })).toBe(false);
      });
    });
  });

  describe('String Validation', () => {
    describe('isNullOrEmpty', () => {
      it('should return true for null', () => {
        expect(ValidationUtils.isNullOrEmpty(null)).toBe(true);
      });

      it('should return true for undefined', () => {
        expect(ValidationUtils.isNullOrEmpty(undefined)).toBe(true);
      });

      it('should return true for empty string', () => {
        expect(ValidationUtils.isNullOrEmpty('')).toBe(true);
      });

      it('should return false for non-empty string', () => {
        expect(ValidationUtils.isNullOrEmpty('hello')).toBe(false);
        expect(ValidationUtils.isNullOrEmpty('a')).toBe(false);
        expect(ValidationUtils.isNullOrEmpty('123')).toBe(false);
      });

      it('should return false for whitespace-only string', () => {
        expect(ValidationUtils.isNullOrEmpty(' ')).toBe(false);
        expect(ValidationUtils.isNullOrEmpty('  ')).toBe(false);
        expect(ValidationUtils.isNullOrEmpty('\t')).toBe(false);
        expect(ValidationUtils.isNullOrEmpty('\n')).toBe(false);
        expect(ValidationUtils.isNullOrEmpty('\r\n')).toBe(false);
      });

      it('should return false for string with content and whitespace', () => {
        expect(ValidationUtils.isNullOrEmpty(' hello ')).toBe(false);
        expect(ValidationUtils.isNullOrEmpty('\thello\t')).toBe(false);
      });
    });

    describe('isNullOrWhitespace', () => {
      it('should return true for null', () => {
        expect(ValidationUtils.isNullOrWhitespace(null)).toBe(true);
      });

      it('should return true for undefined', () => {
        expect(ValidationUtils.isNullOrWhitespace(undefined)).toBe(true);
      });

      it('should return true for empty string', () => {
        expect(ValidationUtils.isNullOrWhitespace('')).toBe(true);
      });

      it('should return true for whitespace-only strings', () => {
        expect(ValidationUtils.isNullOrWhitespace(' ')).toBe(true);
        expect(ValidationUtils.isNullOrWhitespace('  ')).toBe(true);
        expect(ValidationUtils.isNullOrWhitespace('\t')).toBe(true);
        expect(ValidationUtils.isNullOrWhitespace('\n')).toBe(true);
        expect(ValidationUtils.isNullOrWhitespace('\r\n')).toBe(true);
        expect(ValidationUtils.isNullOrWhitespace('   \t  \n  ')).toBe(true);
      });

      it('should return false for non-empty string', () => {
        expect(ValidationUtils.isNullOrWhitespace('hello')).toBe(false);
        expect(ValidationUtils.isNullOrWhitespace('a')).toBe(false);
        expect(ValidationUtils.isNullOrWhitespace('123')).toBe(false);
      });

      it('should return false for string with content and whitespace', () => {
        expect(ValidationUtils.isNullOrWhitespace(' hello ')).toBe(false);
        expect(ValidationUtils.isNullOrWhitespace('\thello\t')).toBe(false);
        expect(ValidationUtils.isNullOrWhitespace('hello world')).toBe(false);
      });

      it('should return false for special characters', () => {
        expect(ValidationUtils.isNullOrWhitespace('!')).toBe(false);
        expect(ValidationUtils.isNullOrWhitespace('@#$')).toBe(false);
        expect(ValidationUtils.isNullOrWhitespace('.')).toBe(false);
      });
    });
  });

  describe('Character Validation', () => {
    describe('isWordCharacter', () => {
      it('should delegate to WordPatterns.isWordCharacter', () => {
        // Test a few cases to ensure delegation works
        expect(ValidationUtils.isWordCharacter('a')).toBe(true);
        expect(ValidationUtils.isWordCharacter('Z')).toBe(true);
        expect(ValidationUtils.isWordCharacter('5')).toBe(true);
        expect(ValidationUtils.isWordCharacter('é')).toBe(true);
        
        expect(ValidationUtils.isWordCharacter(' ')).toBe(false);
        expect(ValidationUtils.isWordCharacter('-')).toBe(false);
        expect(ValidationUtils.isWordCharacter('.')).toBe(false);
        expect(ValidationUtils.isWordCharacter('')).toBe(false);
      });
    });
  });

  describe('Number Validation', () => {
    describe('isInRange', () => {
      it('should return true for value within range', () => {
        expect(ValidationUtils.isInRange(5, 0, 10)).toBe(true);
        expect(ValidationUtils.isInRange(0, 0, 10)).toBe(true);
        expect(ValidationUtils.isInRange(10, 0, 10)).toBe(true);
        expect(ValidationUtils.isInRange(7.5, 0, 10)).toBe(true);
      });

      it('should return false for value outside range', () => {
        expect(ValidationUtils.isInRange(-1, 0, 10)).toBe(false);
        expect(ValidationUtils.isInRange(11, 0, 10)).toBe(false);
        expect(ValidationUtils.isInRange(100, 0, 10)).toBe(false);
      });

      it('should handle negative ranges', () => {
        expect(ValidationUtils.isInRange(-5, -10, 0)).toBe(true);
        expect(ValidationUtils.isInRange(-10, -10, 0)).toBe(true);
        expect(ValidationUtils.isInRange(0, -10, 0)).toBe(true);
        expect(ValidationUtils.isInRange(-11, -10, 0)).toBe(false);
        expect(ValidationUtils.isInRange(1, -10, 0)).toBe(false);
      });

      it('should handle decimal values', () => {
        expect(ValidationUtils.isInRange(0.5, 0, 1)).toBe(true);
        expect(ValidationUtils.isInRange(0.001, 0, 1)).toBe(true);
        expect(ValidationUtils.isInRange(0.999, 0, 1)).toBe(true);
        expect(ValidationUtils.isInRange(1.001, 0, 1)).toBe(false);
      });

      it('should handle equal min and max', () => {
        expect(ValidationUtils.isInRange(5, 5, 5)).toBe(true);
        expect(ValidationUtils.isInRange(4, 5, 5)).toBe(false);
        expect(ValidationUtils.isInRange(6, 5, 5)).toBe(false);
      });

      it('should handle zero values', () => {
        expect(ValidationUtils.isInRange(0, -5, 5)).toBe(true);
        expect(ValidationUtils.isInRange(0, 0, 0)).toBe(true);
        expect(ValidationUtils.isInRange(0, 1, 5)).toBe(false);
      });

      it('should handle infinity values', () => {
        expect(ValidationUtils.isInRange(Infinity, 0, Infinity)).toBe(true);
        expect(ValidationUtils.isInRange(-Infinity, -Infinity, 0)).toBe(true);
        expect(ValidationUtils.isInRange(100, 0, Infinity)).toBe(true);
        expect(ValidationUtils.isInRange(Infinity, 0, 100)).toBe(false);
      });

      it('should handle NaN values', () => {
        expect(ValidationUtils.isInRange(NaN, 0, 10)).toBe(false);
        expect(ValidationUtils.isInRange(5, NaN, 10)).toBe(false);
        expect(ValidationUtils.isInRange(5, 0, NaN)).toBe(false);
      });
    });
  });

  describe('Array Validation', () => {
    describe('isArrayNullOrEmpty', () => {
      it('should return true for null', () => {
        expect(ValidationUtils.isArrayNullOrEmpty(null)).toBe(true);
      });

      it('should return true for undefined', () => {
        expect(ValidationUtils.isArrayNullOrEmpty(undefined)).toBe(true);
      });

      it('should return true for empty array', () => {
        expect(ValidationUtils.isArrayNullOrEmpty([])).toBe(true);
      });

      it('should return false for non-empty array', () => {
        expect(ValidationUtils.isArrayNullOrEmpty([1])).toBe(false);
        expect(ValidationUtils.isArrayNullOrEmpty([1, 2, 3])).toBe(false);
        expect(ValidationUtils.isArrayNullOrEmpty(['a', 'b'])).toBe(false);
      });

      it('should return false for array with null/undefined elements', () => {
        expect(ValidationUtils.isArrayNullOrEmpty([null])).toBe(false);
        expect(ValidationUtils.isArrayNullOrEmpty([undefined])).toBe(false);
        expect(ValidationUtils.isArrayNullOrEmpty([null, undefined])).toBe(false);
      });

      it('should return false for array with mixed types', () => {
        expect(ValidationUtils.isArrayNullOrEmpty([1, 'a', true, null])).toBe(false);
        expect(ValidationUtils.isArrayNullOrEmpty([{}, []])).toBe(false);
      });

      it('should handle different array types', () => {
        expect(ValidationUtils.isArrayNullOrEmpty<string>(['hello'])).toBe(false);
        expect(ValidationUtils.isArrayNullOrEmpty<number>([42])).toBe(false);
        expect(ValidationUtils.isArrayNullOrEmpty<boolean>([true])).toBe(false);
        expect(ValidationUtils.isArrayNullOrEmpty<object>([{}])).toBe(false);
      });
    });
  });

  describe('Object Validation', () => {
    describe('hasProperty', () => {
      it('should return true for existing properties', () => {
        const obj = { name: 'John', age: 30, active: true };
        expect(ValidationUtils.hasProperty(obj, 'name')).toBe(true);
        expect(ValidationUtils.hasProperty(obj, 'age')).toBe(true);
        expect(ValidationUtils.hasProperty(obj, 'active')).toBe(true);
      });

      it('should return false for non-existing properties', () => {
        const obj = { name: 'John', age: 30 };
        expect(ValidationUtils.hasProperty(obj, 'email')).toBe(false);
        expect(ValidationUtils.hasProperty(obj, 'phone')).toBe(false);
      });

      it('should return false for null object', () => {
        expect(ValidationUtils.hasProperty(null, 'name')).toBe(false);
      });

      it('should return false for undefined object', () => {
        expect(ValidationUtils.hasProperty(undefined, 'name')).toBe(false);
      });

             it('should handle properties with null/undefined values', () => {
         const obj = { name: null as string | null, age: undefined as number | undefined, active: false };
         expect(ValidationUtils.hasProperty(obj, 'name')).toBe(true);
         expect(ValidationUtils.hasProperty(obj, 'age')).toBe(true);
         expect(ValidationUtils.hasProperty(obj, 'active')).toBe(true);
       });

      it('should handle inherited properties correctly', () => {
        const parent = { inherited: 'value' };
        const child = Object.create(parent);
        child.own = 'own value';
        
        expect(ValidationUtils.hasProperty(child, 'own')).toBe(true);
        expect(ValidationUtils.hasProperty(child, 'inherited')).toBe(false); // Should not find inherited
      });

      it('should handle properties with special names', () => {
        const obj = { 
          'special-name': 'value1',
          'with spaces': 'value2',
          '123': 'value3',
          '': 'empty key'
        };
        
        expect(ValidationUtils.hasProperty(obj, 'special-name')).toBe(true);
        expect(ValidationUtils.hasProperty(obj, 'with spaces')).toBe(true);
        expect(ValidationUtils.hasProperty(obj, '123')).toBe(true);
        expect(ValidationUtils.hasProperty(obj, '')).toBe(true);
      });

      it('should handle arrays as objects', () => {
        const arr = ['a', 'b', 'c'];
        expect(ValidationUtils.hasProperty(arr, '0')).toBe(true);
        expect(ValidationUtils.hasProperty(arr, '1')).toBe(true);
        expect(ValidationUtils.hasProperty(arr, '2')).toBe(true);
        expect(ValidationUtils.hasProperty(arr, '3')).toBe(false);
        expect(ValidationUtils.hasProperty(arr, 'length')).toBe(true);
      });
    });

    describe('safeGet', () => {
      it('should return property value when it exists', () => {
        const obj = { name: 'John', age: 30, active: true };
        expect(ValidationUtils.safeGet(obj, 'name', 'default')).toBe('John');
        expect(ValidationUtils.safeGet(obj, 'age', 0)).toBe(30);
        expect(ValidationUtils.safeGet(obj, 'active', false)).toBe(true);
      });

      it('should return default value when property does not exist', () => {
        const obj = { name: 'John' };
        expect(ValidationUtils.safeGet(obj, 'email' as any, 'default@example.com')).toBe('default@example.com');
        expect(ValidationUtils.safeGet(obj, 'age' as any, 0)).toBe(0);
        expect(ValidationUtils.safeGet(obj, 'active' as any, false)).toBe(false);
      });

      it('should return default value when object is null', () => {
        expect(ValidationUtils.safeGet(null, 'name' as any, 'default')).toBe('default');
        expect(ValidationUtils.safeGet(null, 'age' as any, 0)).toBe(0);
      });

      it('should return default value when object is undefined', () => {
        expect(ValidationUtils.safeGet(undefined, 'name' as any, 'default')).toBe('default');
        expect(ValidationUtils.safeGet(undefined, 'age' as any, 0)).toBe(0);
      });

             it('should handle properties with null/undefined values', () => {
         const obj = { name: null as string | null, age: undefined as number | undefined, count: 0 };
         // Note: safeGet uses ?? operator, so null/undefined values return the default
         expect(ValidationUtils.safeGet(obj, 'name', 'default')).toBe('default');
         expect(ValidationUtils.safeGet(obj, 'age', 25)).toBe(25);
         expect(ValidationUtils.safeGet(obj, 'count', 10)).toBe(0);
       });

      it('should handle different types correctly', () => {
        const obj = { 
          str: 'hello',
          num: 42,
          bool: true,
          arr: [1, 2, 3],
          obj: { nested: 'value' },
          func: () => 'test'
        };
        
        expect(ValidationUtils.safeGet(obj, 'str', 'default')).toBe('hello');
        expect(ValidationUtils.safeGet(obj, 'num', 0)).toBe(42);
        expect(ValidationUtils.safeGet(obj, 'bool', false)).toBe(true);
        expect(ValidationUtils.safeGet(obj, 'arr', [])).toEqual([1, 2, 3]);
                 expect(ValidationUtils.safeGet(obj, 'obj', { nested: 'default' })).toEqual({ nested: 'value' });
        expect(ValidationUtils.safeGet(obj, 'func', () => 'default')()).toBe('test');
      });

      it('should work with type inference', () => {
        interface TestObj {
          name: string;
          age: number;
          active: boolean;
        }
        
        const obj: TestObj = { name: 'John', age: 30, active: true };
        
        // These should infer the correct types
        const name: string = ValidationUtils.safeGet(obj, 'name', 'default');
        const age: number = ValidationUtils.safeGet(obj, 'age', 0);
        const active: boolean = ValidationUtils.safeGet(obj, 'active', false);
        
        expect(name).toBe('John');
        expect(age).toBe(30);
        expect(active).toBe(true);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should work with complex validation scenarios', () => {
      const data = {
        users: [
          { name: 'John', age: 30, email: 'john@example.com' },
          { name: 'Jane', age: 25, email: null as string | null },
          { name: '', age: 0, email: 'invalid' }
        ],
        settings: {
          maxUsers: 100,
          allowEmptyNames: false
        }
      };

      // Validate array is not empty
      expect(ValidationUtils.isArrayNullOrEmpty(data.users)).toBe(false);
      
      // Validate settings exist
      expect(ValidationUtils.hasProperty(data, 'settings')).toBe(true);
      
      // Safely get configuration values
      const maxUsers = ValidationUtils.safeGet(data.settings, 'maxUsers', 50);
      const allowEmpty = ValidationUtils.safeGet(data.settings, 'allowEmptyNames', true);
      
      expect(maxUsers).toBe(100);
      expect(allowEmpty).toBe(false);
      
      // Validate individual users
      for (const user of data.users) {
        const hasName = ValidationUtils.hasProperty(user, 'name');
        const hasValidName = hasName && !ValidationUtils.isNullOrWhitespace(user.name);
        const hasValidAge = ValidationUtils.hasProperty(user, 'age') && 
                           ValidationUtils.isInRange(user.age, 0, 150);
        
        expect(hasName).toBe(true);
        expect(hasValidAge).toBe(true);
        
        if (user.name === 'John') {
          expect(hasValidName).toBe(true);
        } else if (user.name === 'Jane') {
          expect(hasValidName).toBe(true);
        } else {
          expect(hasValidName).toBe(false); // Empty name user
        }
      }
    });

         it('should handle edge cases in combination', () => {
       const edgeData = {
         emptyString: '',
         nullValue: null as any,
         undefinedValue: undefined as any,
         zeroValue: 0,
         emptyArray: [] as any[],
         whitespaceString: '   ',
         specialChars: '!@#$%^&*()',
         unicodeString: 'café naïve résumé'
       };

      // Test combinations
      expect(ValidationUtils.isNullOrEmpty(edgeData.emptyString)).toBe(true);
      expect(ValidationUtils.isNullOrWhitespace(edgeData.whitespaceString)).toBe(true);
      expect(ValidationUtils.isArrayNullOrEmpty(edgeData.emptyArray)).toBe(true);
      expect(ValidationUtils.isInRange(edgeData.zeroValue, -10, 10)).toBe(true);
      expect(ValidationUtils.hasProperty(edgeData, 'nullValue')).toBe(true);
             expect(ValidationUtils.safeGet(edgeData, 'undefinedValue', 'default')).toBe('default');
      expect(ValidationUtils.safeGet(edgeData, 'nonExistent' as any, 'default')).toBe('default');
      
      // Unicode handling
      expect(ValidationUtils.isNullOrEmpty(edgeData.unicodeString)).toBe(false);
      expect(ValidationUtils.isNullOrWhitespace(edgeData.unicodeString)).toBe(false);
    });
  });
}); 