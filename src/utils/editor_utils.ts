import { Editor, EditorPosition } from "obsidian";
import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { TextUtils } from "./text_utils";
import { ValidationUtils } from "./validation_utils";

/**
 * Block types for LaTeX and code blocks
 */
export class BlockType {
    public static DOLLAR_MULTI = new BlockType("$$", true);
    public static DOLLAR_SINGLE = new BlockType("$", false, BlockType.DOLLAR_MULTI);
    public static CODE_MULTI = new BlockType("```", true);
    public static CODE_SINGLE = new BlockType("`", false, BlockType.CODE_MULTI);

    static {
        BlockType.DOLLAR_MULTI.otherType0 = BlockType.DOLLAR_SINGLE;
        BlockType.CODE_MULTI.otherType0 = BlockType.CODE_SINGLE;
    }

    public static SINGLE_TYPES = [BlockType.DOLLAR_SINGLE, BlockType.CODE_SINGLE];

    constructor(
        public readonly c: string, 
        public readonly isMultiLine: boolean, 
        private otherType0: BlockType | null = null
    ) {}

    public get isDollarBlock(): boolean {
        return this === BlockType.DOLLAR_SINGLE || this === BlockType.DOLLAR_MULTI;
    }

    public get isCodeBlock(): boolean {
        return !this.isDollarBlock;
    }

    public get otherType(): BlockType | null {
        return this.otherType0;
    }
}

/**
 * Editor-related utilities for the Completr plugin
 */
export class EditorUtils {
    /**
     * Convert CodeMirror document offset to Obsidian EditorPosition
     * @param doc - The CodeMirror document
     * @param offset - The character offset
     * @returns The EditorPosition
     */
    static posFromIndex(doc: Text, offset: number): EditorPosition {
        const line = doc.lineAt(offset);
        return { line: line.number - 1, ch: offset - line.from };
    }

    /**
     * Convert Obsidian EditorPosition to CodeMirror document offset
     * @param doc - The CodeMirror document
     * @param pos - The EditorPosition
     * @returns The character offset
     */
    static indexFromPos(doc: Text, pos: EditorPosition): number {
        const ch = pos.ch;
        const line = doc.line(pos.line + 1);
        return Math.min(line.from + Math.max(0, ch), line.to);
    }

    /**
     * Get CodeMirror EditorState from Obsidian Editor
     * @param editor - The Obsidian editor
     * @returns The CodeMirror EditorState
     */
    static editorToCodeMirrorState(editor: Editor): EditorState {
        return (editor as any).cm.state;
    }

    /**
     * Get CodeMirror EditorView from Obsidian Editor
     * @param editor - The Obsidian editor
     * @returns The CodeMirror EditorView
     */
    static editorToCodeMirrorView(editor: Editor): EditorView {
        return (editor as any).cm;
    }

    /**
     * Match word backwards from cursor position
     * @param editor - The editor instance
     * @param cursor - The cursor position
     * @param charPredicate - Function to test if character is part of word
     * @param maxLookBackDistance - Maximum distance to look back (default: 50)
     * @returns Object with query string and separator character
     */
    static matchWordBackwards(
        editor: Editor,
        cursor: EditorPosition,
        charPredicate: (char: string) => boolean,
        maxLookBackDistance: number = 50
    ): { query: string, separatorChar: string } {
        let query = "";
        let separatorChar = "";

        // Save some time for very long lines
        const lookBackEnd = Math.max(0, cursor.ch - maxLookBackDistance);
        
        // Find word in front of cursor
        for (let i = cursor.ch - 1; i >= lookBackEnd; i--) {
            const prevChar = editor.getRange({ ...cursor, ch: i }, { ...cursor, ch: i + 1 });
            if (!charPredicate(prevChar)) {
                separatorChar = prevChar;
                break;
            }
            query = prevChar + query;
        }

        return { query, separatorChar };
    }



    /**
     * Get the LaTeX block type at cursor position
     * @param editor - The editor instance
     * @param cursorPos - The cursor position
     * @param triggerInCodeBlocks - Whether to trigger in code blocks
     * @returns The block type or null if not in a block
     */
    static getLatexBlockType(editor: Editor, cursorPos: EditorPosition, triggerInCodeBlocks: boolean): BlockType | null {
        const frontMatterBounds = ValidationUtils.getFrontMatterBounds(editor) ?? { startLine: -1, endLine: -1 };
        const blockTypeStack: { type: BlockType, line: number }[] = [];

        for (let lineIndex = Math.max(0, cursorPos.line - 5000); lineIndex <= cursorPos.line; lineIndex++) {
            if (lineIndex >= frontMatterBounds.startLine && lineIndex <= frontMatterBounds.endLine) {
                continue;
            }

            const line = editor.getLine(lineIndex);
            for (let j = cursorPos.line === lineIndex ? cursorPos.ch - 1 : line.length - 1; j >= 0; j--) {
                const currentChar = line.charAt(j);
                let matchingBlockType = BlockType.SINGLE_TYPES.find((b) => b.c.charAt(0) === currentChar);
                if (!matchingBlockType || line.charAt(Math.max(0, j - 1)) === '\\') {
                    continue;
                }

                const multiTypeLength = matchingBlockType.otherType!.c.length;
                const isDouble = j + 1 >= multiTypeLength && 
                    TextUtils.substringMatches(line, matchingBlockType.otherType!.c, j - multiTypeLength + 1);
                if (isDouble) {
                    j -= multiTypeLength - 1;
                    matchingBlockType = matchingBlockType.otherType!;
                }

                blockTypeStack.push({ type: matchingBlockType, line: lineIndex });
            }
        }

        if (blockTypeStack.length < 1) {
            return null;
        }

        let currentIndex = 0;
        while (true) {
            if (currentIndex >= blockTypeStack.length) {
                return null;
            }

            const currentBlock = blockTypeStack[currentIndex];
            const otherBlockIndex = TextUtils.indexOf(
                blockTypeStack, 
                ({ type }) => type === currentBlock.type, 
                currentIndex + 1
            );

            if (otherBlockIndex === -1) {
                if (!triggerInCodeBlocks && currentBlock.type.isCodeBlock) {
                    return null;
                }
                if (currentBlock.type.isCodeBlock || 
                    (currentBlock.type === BlockType.DOLLAR_SINGLE && currentBlock.line !== cursorPos.line)) {
                    currentIndex++;
                    continue;
                }

                return currentBlock.type;
            } else {
                currentIndex = otherBlockIndex + 1;
            }
        }
    }


} 