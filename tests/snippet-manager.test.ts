// Mock dependencies
jest.mock('../src/utils/editor_utils');
jest.mock('../src/marker_state_field', () => ({
  addMark: { of: jest.fn() },
  clearMarks: { of: jest.fn() },
  removeMarkBySpecAttribute: { of: jest.fn() },
  markerStateField: jest.fn(),
}));

// Mock CodeMirror modules
jest.mock('@codemirror/view', () => ({
  Decoration: {
    mark: jest.fn(),
  },
}));

jest.mock('@codemirror/state', () => ({
  Range: jest.fn(),
}));

import SnippetManager, { PlaceholderReference } from '../src/snippet_manager';
import { EditorUtils } from '../src/utils/editor_utils';
import { addMark, clearMarks, markerStateField, removeMarkBySpecAttribute } from '../src/marker_state_field';
import { Decoration } from '@codemirror/view';
import { Editor, EditorPosition } from 'obsidian';

// Mock implementations with type assertions
const mockEditorUtils = EditorUtils as jest.Mocked<typeof EditorUtils>;
const mockAddMark = addMark as jest.Mocked<typeof addMark>;
const mockClearMarks = clearMarks as jest.Mocked<typeof clearMarks>;
const mockRemoveMarkBySpecAttribute = removeMarkBySpecAttribute as jest.Mocked<typeof removeMarkBySpecAttribute>;
const mockDecoration = Decoration as jest.Mocked<typeof Decoration>;

describe('PlaceholderReference', () => {
    let mockEditor: jest.Mocked<Editor>;
    let mockState: any;
    let mockView: any;
    let placeholderRef: PlaceholderReference;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock editor
        mockEditor = {
            setCursor: jest.fn(),
            setSelection: jest.fn(),
            replaceRange: jest.fn(),
        } as any;

        // Mock state with marker field
        mockState = {
            field: jest.fn().mockReturnValue({
                iter: jest.fn().mockReturnValue({
                    value: null as any,
                    next: jest.fn(),
                }),
            }),
            doc: { length: 100 },
        };

        // Mock view
        mockView = {
            dispatch: jest.fn(),
            state: mockState,
        };

        // Mock EditorUtils
        mockEditorUtils.editorToCodeMirrorState.mockReturnValue(mockState);
        mockEditorUtils.editorToCodeMirrorView.mockReturnValue(mockView);
        mockEditorUtils.indexFromPos.mockReturnValue(10);
        mockEditorUtils.posFromIndex.mockReturnValue({ line: 0, ch: 5 });

        placeholderRef = new PlaceholderReference(mockEditor);
    });

    describe('constructor', () => {
        it('should store the editor reference', () => {
            expect(placeholderRef.editor).toBe(mockEditor);
        });
    });

    describe('marker getter', () => {
        it('should return marker range when placeholder exists', () => {
            const mockMarker = {
                spec: { reference: placeholderRef },
            } as any;
            
            const mockIter = {
                value: mockMarker,
                from: 5,
                to: 10,
                next: jest.fn(),
            };

            const mockRangeSet = {
                iter: jest.fn().mockReturnValue(mockIter),
            };

            mockState.field.mockReturnValue(mockRangeSet);

            const result = placeholderRef.marker;

            expect(result).toEqual({
                from: 5,
                to: 10,
                value: mockMarker,
            });
        });

        it('should return null when no marker found', () => {
            const mockIter = {
                value: null as any,
                next: jest.fn(),
            };

            const mockRangeSet = {
                iter: jest.fn().mockReturnValue(mockIter),
            };

            mockState.field.mockReturnValue(mockRangeSet);

            const result = placeholderRef.marker;

            expect(result).toBeNull();
        });
    });

    describe('removeFromEditor', () => {
        it('should dispatch remove effect with correct parameters', () => {
            mockRemoveMarkBySpecAttribute.of.mockReturnValue({} as any);

            placeholderRef.removeFromEditor();

            expect(mockRemoveMarkBySpecAttribute.of).toHaveBeenCalledWith({
                attribute: "reference",
                reference: placeholderRef,
            });
            expect(mockView.dispatch).toHaveBeenCalled();
        });
    });
});

describe('SnippetManager', () => {
    let snippetManager: SnippetManager;
    let mockEditor: jest.Mocked<Editor>;
    let mockState: any;
    let mockView: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock editor
        mockEditor = {
            setCursor: jest.fn(),
            setSelection: jest.fn(),
            replaceRange: jest.fn(),
        } as any;

        // Mock state
        mockState = {
            doc: { length: 100 },
            field: jest.fn().mockReturnValue({
                iter: jest.fn().mockReturnValue({
                    value: null as any,
                    next: jest.fn(),
                }),
            }),
        };

        // Mock view
        mockView = {
            dispatch: jest.fn(),
            state: mockState,
        };

        // Mock EditorUtils
        mockEditorUtils.editorToCodeMirrorState.mockReturnValue(mockState);
        mockEditorUtils.editorToCodeMirrorView.mockReturnValue(mockView);
        mockEditorUtils.indexFromPos.mockReturnValue(10);
        mockEditorUtils.posFromIndex.mockReturnValue({ line: 0, ch: 5 });

        // Mock Decoration
        const mockDecorationRange = {
            range: jest.fn().mockReturnValue({ from: 5, to: 10 }),
        } as any;
        mockDecoration.mark.mockReturnValue(mockDecorationRange);

        snippetManager = new SnippetManager();
    });

    describe('handleSnippet', () => {
        it('should handle simple snippet with single placeholder', () => {
            const snippet = 'Hello #world';
            const start: EditorPosition = { line: 0, ch: 0 };
            const mockEffect = { value: { from: 5, to: 10 } } as any;
            mockAddMark.of.mockReturnValue(mockEffect);

            // Mock the selectMarker method to avoid marker getter issues
            const selectSpy = jest.spyOn(snippetManager, 'selectMarker').mockImplementation(() => {});

            snippetManager.handleSnippet(snippet, start, mockEditor);

            expect(mockAddMark.of).toHaveBeenCalled();
            expect(mockView.dispatch).toHaveBeenCalledWith({
                effects: mockEffect,
            });
            expect(selectSpy).toHaveBeenCalled();
        });

        it('should handle snippet with cursor position marker', () => {
            const snippet = 'Hello ~world';
            const start: EditorPosition = { line: 0, ch: 0 };

            snippetManager.handleSnippet(snippet, start, mockEditor);

            expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 0, ch: 6 });
            expect(mockEditor.replaceRange).toHaveBeenCalledWith('', { line: 0, ch: 6 }, { line: 0, ch: 7 });
        });

        it('should handle multiline snippet', () => {
            const snippet = 'Line 1\nLine 2 #placeholder\nLine 3';
            const start: EditorPosition = { line: 0, ch: 0 };
            const mockEffect = { value: { from: 5, to: 10 } } as any;
            mockAddMark.of.mockReturnValue(mockEffect);

            // Mock the selectMarker method to avoid marker getter issues
            const selectSpy = jest.spyOn(snippetManager, 'selectMarker').mockImplementation(() => {});

            snippetManager.handleSnippet(snippet, start, mockEditor);

            expect(mockAddMark.of).toHaveBeenCalled();
            expect(mockView.dispatch).toHaveBeenCalled();
            expect(selectSpy).toHaveBeenCalled();
        });

        it('should assign colors to placeholders', () => {
            const snippet = '#first #second';
            const start: EditorPosition = { line: 0, ch: 0 };
            
            // Mock the selectMarker method to avoid marker getter issues
            const selectSpy = jest.spyOn(snippetManager, 'selectMarker').mockImplementation(() => {});
            
            snippetManager.handleSnippet(snippet, start, mockEditor);

            expect(mockDecoration.mark).toHaveBeenCalledWith(
                expect.objectContaining({
                    attributes: expect.objectContaining({
                        class: 'completr-suggestion-placeholder0',
                    }),
                })
            );
            expect(selectSpy).toHaveBeenCalled();
        });
    });

    describe('consumeAndGotoNextMarker', () => {


        it('should remove current placeholder and select next one', () => {
            const mockPlaceholder1 = new PlaceholderReference(mockEditor);
            const mockPlaceholder2 = new PlaceholderReference(mockEditor);
            
            jest.spyOn(mockPlaceholder1, 'marker', 'get').mockReturnValue({
                from: 0,
                to: 5,
                value: {} as any,
            });
            jest.spyOn(mockPlaceholder2, 'marker', 'get').mockReturnValue({
                from: 10,
                to: 15,
                value: {} as any,
            });
            
            const removeSpy = jest.spyOn(mockPlaceholder1, 'removeFromEditor').mockImplementation(() => {});
            const selectSpy = jest.spyOn(snippetManager, 'selectMarker').mockImplementation(() => {});
            
            // Mock the static method
            jest.spyOn(SnippetManager as any, 'rangeFromPlaceholder').mockImplementation((ref: any) => {
                if (ref === mockPlaceholder1) return { from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } };
                if (ref === mockPlaceholder2) return { from: { line: 0, ch: 10 }, to: { line: 0, ch: 15 } };
                return null;
            });

            (snippetManager as any).currentPlaceholderReferences = [mockPlaceholder1, mockPlaceholder2];

            const result = snippetManager.consumeAndGotoNextMarker(mockEditor);

            expect(result).toBe(true);
            expect(removeSpy).toHaveBeenCalled();
            expect(selectSpy).toHaveBeenCalledWith(mockPlaceholder2);
        });
    });

    describe('placeholderAtPos', () => {
        it('should return null when no placeholders exist', () => {
            const pos: EditorPosition = { line: 0, ch: 5 };
            
            const result = snippetManager.placeholderAtPos(pos);

            expect(result).toBeNull();
        });



        it('should return null when position is outside placeholder range', () => {
            const mockPlaceholder = new PlaceholderReference(mockEditor);
            jest.spyOn(mockPlaceholder, 'marker', 'get').mockReturnValue({
                from: 0,
                to: 10,
                value: {} as any,
            });
            
            mockEditorUtils.posFromIndex.mockReturnValueOnce({ line: 0, ch: 0 })
                                           .mockReturnValueOnce({ line: 0, ch: 10 });
            
            (snippetManager as any).currentPlaceholderReferences = [mockPlaceholder];

            const pos: EditorPosition = { line: 0, ch: 15 };
            const result = snippetManager.placeholderAtPos(pos);

            expect(result).toBeNull();
        });
    });

    describe('selectMarker', () => {
        it('should do nothing when reference is null', () => {
            snippetManager.selectMarker(null);

            expect(mockEditor.setSelection).not.toHaveBeenCalled();
        });


    });

    describe('clearAllPlaceholders', () => {
        it('should do nothing when no placeholders exist', () => {
            snippetManager.clearAllPlaceholders();

            expect(mockView.dispatch).not.toHaveBeenCalled();
        });

        it('should clear all placeholders and reset array', () => {
            const mockPlaceholder = new PlaceholderReference(mockEditor);
            (snippetManager as any).currentPlaceholderReferences = [mockPlaceholder];
            
            const mockEffect = { value: null } as any;
            mockClearMarks.of.mockReturnValue(mockEffect);

            snippetManager.clearAllPlaceholders();

            expect(mockClearMarks.of).toHaveBeenCalledWith(null);
            expect(mockView.dispatch).toHaveBeenCalledWith({
                effects: mockEffect,
            });
            expect((snippetManager as any).currentPlaceholderReferences).toEqual([]);
        });
    });

    describe('onunload', () => {
        it('should clear all placeholders on unload', () => {
            const clearSpy = jest.spyOn(snippetManager, 'clearAllPlaceholders');
            
            snippetManager.onunload();

            expect(clearSpy).toHaveBeenCalled();
        });
    });
}); 