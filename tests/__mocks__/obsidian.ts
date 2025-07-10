// Mock Obsidian APIs for testing
// This file provides mocks for Obsidian's APIs that aren't available in the test environment

export class Plugin {
  app: any;
  
  constructor() {
    this.app = {};
  }
  
  registerEvent = jest.fn();
  registerEditorSuggest = jest.fn();
  registerEditorExtension = jest.fn();
  addCommand = jest.fn();
  addSettingTab = jest.fn();
  loadData = jest.fn();
  saveData = jest.fn();
}

export interface EditorPosition {
  line: number;
  ch: number;
}

export interface EditorSuggestContext {
  editor: any;
  file: any;
  start: EditorPosition;
  end: EditorPosition;
  query: string;
}

export class Notice {
  constructor(message: string, timeout?: number) {}
}

export class TFile {
  path: string;
  name: string;
  
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
  }
}

export class MarkdownView {
  editor: any;
  file: TFile;
  
  constructor() {
    this.editor = {};
    this.file = new TFile('test.md');
  }
}

// Add more mocks as needed for your tests 