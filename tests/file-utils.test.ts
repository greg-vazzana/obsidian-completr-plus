import { FileUtils } from '../src/utils/file_utils';
import { Vault } from 'obsidian';

// Mock Obsidian Vault
const mockAdapter = {
    exists: jest.fn(),
    read: jest.fn(),
    write: jest.fn(),
    mkdir: jest.fn(),
    list: jest.fn(),
};

const mockVault = {
    configDir: '/test/config',
    adapter: mockAdapter,
} as any;

describe('FileUtils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('intoCompletrPath', () => {
        it('should create path within plugin data directory', () => {
            const result = FileUtils.intoCompletrPath(mockVault, 'test', 'file.txt');
            
            expect(result).toBe('/test/config/plugins/obsidian-completr-plus/test/file.txt');
        });

        it('should handle single path segment', () => {
            const result = FileUtils.intoCompletrPath(mockVault, 'file.txt');
            
            expect(result).toBe('/test/config/plugins/obsidian-completr-plus/file.txt');
        });

        it('should handle empty path segments', () => {
            const result = FileUtils.intoCompletrPath(mockVault);
            
            expect(result).toBe('/test/config/plugins/obsidian-completr-plus/');
        });

        it('should handle multiple path segments', () => {
            const result = FileUtils.intoCompletrPath(mockVault, 'folder1', 'folder2', 'file.txt');
            
            expect(result).toBe('/test/config/plugins/obsidian-completr-plus/folder1/folder2/file.txt');
        });
    });

    describe('exists', () => {
        it('should return true when file exists', async () => {
            mockAdapter.exists.mockResolvedValue(true);
            
            const result = await FileUtils.exists(mockVault, 'test/file.txt');
            
            expect(result).toBe(true);
            expect(mockAdapter.exists).toHaveBeenCalledWith('test/file.txt');
        });

        it('should return false when file does not exist', async () => {
            mockAdapter.exists.mockResolvedValue(false);
            
            const result = await FileUtils.exists(mockVault, 'nonexistent/file.txt');
            
            expect(result).toBe(false);
            expect(mockAdapter.exists).toHaveBeenCalledWith('nonexistent/file.txt');
        });

        it('should handle adapter errors', async () => {
            const error = new Error('Access denied');
            mockAdapter.exists.mockRejectedValue(error);
            
            await expect(FileUtils.exists(mockVault, 'test/file.txt')).rejects.toThrow('Access denied');
        });
    });

    describe('readFile', () => {
        it('should read file contents successfully', async () => {
            const mockContent = 'test file content';
            mockAdapter.read.mockResolvedValue(mockContent);
            
            const result = await FileUtils.readFile(mockVault, 'test/file.txt');
            
            expect(result).toBe(mockContent);
            expect(mockAdapter.read).toHaveBeenCalledWith('test/file.txt');
        });

        it('should handle empty file', async () => {
            mockAdapter.read.mockResolvedValue('');
            
            const result = await FileUtils.readFile(mockVault, 'empty/file.txt');
            
            expect(result).toBe('');
            expect(mockAdapter.read).toHaveBeenCalledWith('empty/file.txt');
        });

        it('should handle read errors', async () => {
            const error = new Error('File not found');
            mockAdapter.read.mockRejectedValue(error);
            
            await expect(FileUtils.readFile(mockVault, 'missing/file.txt')).rejects.toThrow('File not found');
        });
    });

    describe('writeFile', () => {
        it('should write file contents successfully', async () => {
            const content = 'test content to write';
            mockAdapter.write.mockResolvedValue(undefined);
            
            await FileUtils.writeFile(mockVault, 'test/file.txt', content);
            
            expect(mockAdapter.write).toHaveBeenCalledWith('test/file.txt', content);
        });

        it('should handle empty content', async () => {
            mockAdapter.write.mockResolvedValue(undefined);
            
            await FileUtils.writeFile(mockVault, 'test/empty.txt', '');
            
            expect(mockAdapter.write).toHaveBeenCalledWith('test/empty.txt', '');
        });

        it('should handle write errors', async () => {
            const error = new Error('Write permission denied');
            mockAdapter.write.mockRejectedValue(error);
            
            await expect(FileUtils.writeFile(mockVault, 'readonly/file.txt', 'content')).rejects.toThrow('Write permission denied');
        });
    });

    describe('ensureDirectory', () => {
        it('should create directory when it does not exist', async () => {
            mockAdapter.exists.mockResolvedValue(false);
            mockAdapter.mkdir.mockResolvedValue(undefined);
            
            await FileUtils.ensureDirectory(mockVault, 'test/newdir');
            
            expect(mockAdapter.exists).toHaveBeenCalledWith('test/newdir');
            expect(mockAdapter.mkdir).toHaveBeenCalledWith('test/newdir');
        });

        it('should not create directory when it already exists', async () => {
            mockAdapter.exists.mockResolvedValue(true);
            
            await FileUtils.ensureDirectory(mockVault, 'test/existingdir');
            
            expect(mockAdapter.exists).toHaveBeenCalledWith('test/existingdir');
            expect(mockAdapter.mkdir).not.toHaveBeenCalled();
        });

        it('should handle mkdir errors', async () => {
            mockAdapter.exists.mockResolvedValue(false);
            const error = new Error('Permission denied');
            mockAdapter.mkdir.mockRejectedValue(error);
            
            await expect(FileUtils.ensureDirectory(mockVault, 'restricted/dir')).rejects.toThrow('Permission denied');
        });

        it('should handle exists check errors', async () => {
            const error = new Error('Access denied');
            mockAdapter.exists.mockRejectedValue(error);
            
            await expect(FileUtils.ensureDirectory(mockVault, 'test/dir')).rejects.toThrow('Access denied');
        });
    });

    describe('listFiles', () => {
        it('should list files and folders successfully', async () => {
            const mockListing = {
                files: ['file1.txt', 'file2.md'],
                folders: ['subfolder1', 'subfolder2']
            };
            mockAdapter.list.mockResolvedValue(mockListing);
            
            const result = await FileUtils.listFiles(mockVault, 'test/directory');
            
            expect(result).toEqual(mockListing);
            expect(mockAdapter.list).toHaveBeenCalledWith('test/directory');
        });

        it('should handle empty directory', async () => {
            const mockListing: {files: string[], folders: string[]} = {
                files: [],
                folders: []
            };
            mockAdapter.list.mockResolvedValue(mockListing);
            
            const result = await FileUtils.listFiles(mockVault, 'empty/directory');
            
            expect(result).toEqual(mockListing);
            expect(mockAdapter.list).toHaveBeenCalledWith('empty/directory');
        });

        it('should handle list errors', async () => {
            const error = new Error('Directory not found');
            mockAdapter.list.mockRejectedValue(error);
            
            await expect(FileUtils.listFiles(mockVault, 'nonexistent/directory')).rejects.toThrow('Directory not found');
        });
    });

    describe('joinPath', () => {
        it('should join multiple path segments', () => {
            const result = FileUtils.joinPath('folder1', 'folder2', 'file.txt');
            
            expect(result).toBe('folder1/folder2/file.txt');
        });

        it('should handle single path segment', () => {
            const result = FileUtils.joinPath('file.txt');
            
            expect(result).toBe('file.txt');
        });

        it('should handle empty segments', () => {
            const result = FileUtils.joinPath();
            
            expect(result).toBe('');
        });

        it('should handle empty strings in segments', () => {
            const result = FileUtils.joinPath('folder1', '', 'file.txt');
            
            expect(result).toBe('folder1//file.txt');
        });

        it('should handle many segments', () => {
            const result = FileUtils.joinPath('a', 'b', 'c', 'd', 'e', 'file.txt');
            
            expect(result).toBe('a/b/c/d/e/file.txt');
        });
    });
}); 