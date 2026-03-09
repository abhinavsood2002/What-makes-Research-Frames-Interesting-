// src/components/FileSelector.tsx
import React, { useState, useEffect } from 'react';
import { TFile, TFolder, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import {
  VStack,
  HStack,
  Box,
  Text,
  Input,
  Button,
  Checkbox,
  Flex,
  Badge,
  InputGroup,
  InputLeftElement,
  Collapse,
  useDisclosure,
  IconButton,
  Modal as ChakraModal, 
  ModalOverlay, 
  ModalContent, 
  ModalHeader, 
  ModalBody, 
  ModalFooter, 
  ModalCloseButton,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { SearchIcon, ChevronDownIcon, ChevronRightIcon, AddIcon, AttachmentIcon } from '@chakra-ui/icons';
import { ChakraProvider } from './ChakraProvider';

// New interface for simplified FileSelector - exported for use in SetupView
export interface PDFLinkMapping {
    [notePath: string]: string; // notePath -> pdfPath
}

export interface FileSelectorResult {
    selectedNotes: string[];
    pdfLinks: PDFLinkMapping;
}


interface PDFLinkDialogProps {
    isOpen: boolean;
    onClose: () => void;
    noteFilePath: string;
    currentPdfPath?: string;
    onLinkUpdate: (notePath: string, pdfPath: string | null) => void;
}

// Custom Obsidian Modal class
class FileSelectorModal extends Modal {
    private root: Root | null = null;
    private onFileSelection: (result: FileSelectorResult) => void;
    private onCancel: () => void;
    private initialSelectedFiles: string[];
    private initialPdfLinks: PDFLinkMapping;

    constructor(
        app: any,
        initialSelectedFiles: string[],
        initialPdfLinks: PDFLinkMapping,
        onFileSelection: (result: FileSelectorResult) => void,
        onCancel: () => void
    ) {
        super(app);
        this.initialSelectedFiles = initialSelectedFiles;
        this.initialPdfLinks = initialPdfLinks;
        this.onFileSelection = onFileSelection;
        this.onCancel = onCancel;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Set modal title
        this.titleEl.setText('Select Files for Processing');
        
        // Style the modal
        this.modalEl.style.width = '800px';
        this.modalEl.style.maxWidth = '90vw';
        this.modalEl.style.height = '600px';
        this.modalEl.style.maxHeight = '80vh';
        
        // Create container for React content
        const reactContainer = contentEl.createDiv();
        reactContainer.style.height = '100%';
        reactContainer.style.overflow = 'hidden';

        // Render React component with ChakraProvider
        this.root = createRoot(reactContainer);
        this.root.render(
            <ChakraProvider>
                <FileSelectorContent
                    app={this.app}
                    selectedFiles={this.initialSelectedFiles}
                    initialPdfLinks={this.initialPdfLinks}
                    onFileSelection={(result) => {
                        this.onFileSelection(result);
                        this.close();
                    }}
                    onCancel={() => {
                        this.onCancel();
                        this.close();
                    }}
                />
            </ChakraProvider>
        );
    }

    onClose() {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
    }
}

// React component for the modal content
interface FileSelectorContentProps {
    app: any;
    selectedFiles: string[];
    initialPdfLinks: PDFLinkMapping;
    onFileSelection: (result: FileSelectorResult) => void;
    onCancel: () => void;
}

const FileSelectorContent: React.FC<FileSelectorContentProps> = ({
    app,
    selectedFiles: initialSelected,
    initialPdfLinks,
    onFileSelection,
    onCancel
}) => {
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set(initialSelected));
    const [searchQuery, setSearchQuery] = useState('');
    const [pdfLinks, setPdfLinks] = useState<PDFLinkMapping>(initialPdfLinks || {});
    const [pdfLinkDialog, setPdfLinkDialog] = useState<{ 
        isOpen: boolean; 
        noteFilePath?: string;
        currentPdfPath?: string;
    }>({ isOpen: false });


    const toggleFile = (filePath: string) => {
        const newSelected = new Set(selectedFiles);
        if (newSelected.has(filePath)) {
            newSelected.delete(filePath);
        } else {
            newSelected.add(filePath);
        }
        setSelectedFiles(newSelected);
    };

    const selectAllInFolder = (folder: TFolder) => {
        const markdownFiles = getAllMarkdownFiles(folder);
        const newSelected = new Set(selectedFiles);
        markdownFiles.forEach(file => newSelected.add(file));
        setSelectedFiles(newSelected);
    };

    const deselectAllInFolder = (folder: TFolder) => {
        const markdownFiles = getAllMarkdownFiles(folder);
        const newSelected = new Set(selectedFiles);
        markdownFiles.forEach(file => newSelected.delete(file));
        setSelectedFiles(newSelected);
    };

    const handleSave = () => {
        const result: FileSelectorResult = {
            selectedNotes: Array.from(selectedFiles),
            pdfLinks: pdfLinks
        };
        onFileSelection(result);
    };

    const handlePDFLink = (noteFilePath: string) => {
        const currentPdfPath = pdfLinks[noteFilePath];
        setPdfLinkDialog({ 
            isOpen: true, 
            noteFilePath,
            currentPdfPath 
        });
    };

    const handlePDFLinkUpdate = (notePath: string, pdfPath: string | null) => {
        setPdfLinkDialog({ isOpen: false });
        
        const newPdfLinks = { ...pdfLinks };
        if (pdfPath) {
            newPdfLinks[notePath] = pdfPath;
        } else {
            delete newPdfLinks[notePath];
        }
        setPdfLinks(newPdfLinks);
    };

    return (
        <VStack spacing={4} align="stretch" h="100%" p={4}>
            {/* Header */}
            <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="obsidian.text.muted">
                    Choose markdown files from your vault to include in the analysis.
                </Text>
            </Flex>

            {/* Selection Summary */}
            <Flex justify="space-between" align="center" p={3} bg="obsidian.bg.secondary" borderRadius="md">
                <Text fontSize="sm" color="obsidian.text.normal">
                    Selected: <strong>{selectedFiles.size}</strong> files
                </Text>
                <Badge colorScheme={selectedFiles.size > 0 ? 'green' : 'gray'}>
                    {selectedFiles.size} files
                </Badge>
            </Flex>

            {/* Search */}
            <InputGroup>
                <InputLeftElement pointerEvents="none">
                    <SearchIcon color="obsidian.text.muted" />
                </InputLeftElement>
                <Input
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    bg="obsidian.bg.primary"
                />
            </InputGroup>

            {/* File Tree */}
            <Box flex={1} overflowY="auto" border="1px solid" borderColor="obsidian.modifier.border" borderRadius="md" p={2}>
                <FileTreeNode
                    app={app}
                    folder={app.vault.getRoot()}
                    selectedFiles={selectedFiles}
                    onToggleFile={toggleFile}
                    onSelectAllInFolder={selectAllInFolder}
                    onDeselectAllInFolder={deselectAllInFolder}
                    onPDFLink={handlePDFLink}
                    pdfLinks={pdfLinks}
                    searchQuery={searchQuery}
                />
            </Box>

            {/* Footer */}
            <HStack justify="space-between" pt={3} borderTop="1px solid" borderColor="obsidian.modifier.border">
                <Button variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button 
                    variant="solid" 
                    onClick={handleSave}
                    isDisabled={selectedFiles.size === 0}
                    leftIcon={<AddIcon />}
                >
                    Select {selectedFiles.size} Files
                </Button>
            </HStack>

            {/* PDF Link Dialog */}
            <PDFLinkDialog
                isOpen={pdfLinkDialog.isOpen}
                noteFilePath={pdfLinkDialog.noteFilePath || ''}
                currentPdfPath={pdfLinkDialog.currentPdfPath}
                onClose={() => setPdfLinkDialog({ isOpen: false })}
                onLinkUpdate={handlePDFLinkUpdate}
                app={app}
            />
        </VStack>
    );
};

// File tree node component
interface FileTreeNodeProps {
    app: any;
    file?: TFile;
    folder?: TFolder;
    selectedFiles: Set<string>;
    onToggleFile: (path: string) => void;
    onSelectAllInFolder?: (folder: TFolder) => void;
    onDeselectAllInFolder?: (folder: TFolder) => void;
    onPDFLink?: (noteFilePath: string) => void;
    pdfLinks: PDFLinkMapping;
    searchQuery: string;
    depth?: number;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
    app,
    file,
    folder,
    selectedFiles,
    onToggleFile,
    onSelectAllInFolder,
    onDeselectAllInFolder,
    onPDFLink,
    pdfLinks,
    searchQuery,
    depth = 0
}) => {
    const { isOpen, onToggle } = useDisclosure({ 
        defaultIsOpen: depth === 0 || !!searchQuery 
    });

    if (file) {
        const isSelected = selectedFiles.has(file.path);
        const matchesSearch = !searchQuery || 
            file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            file.path.toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesSearch) return null;

        // Check if this note has a linked PDF in local state
        const linkedPdfPath = pdfLinks[file.path];
        const hasLinkedPDF = !!linkedPdfPath;

        return (
            <VStack spacing={1} align="stretch">
                <HStack
                    p={2}
                    pl={depth * 4 + 2}
                    _hover={{ bg: 'obsidian.modifier.hover' }}
                    bg={isSelected ? 'obsidian.modifier.success' : 'transparent'}
                    borderRadius="md"
                >
                    <Checkbox 
                        isChecked={isSelected}
                        onChange={() => onToggleFile(file.path)}
                        colorScheme="blue"
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <Text 
                        fontSize="sm" 
                        color="obsidian.text.normal" 
                        flex={1}
                        cursor="pointer"
                        onClick={() => onToggleFile(file.path)}
                    >
                        {file.name}
                    </Text>
                    {isSelected && onPDFLink && (
                        <Button
                            size="xs"
                            variant={hasLinkedPDF ? "outline" : "ghost"}
                            colorScheme={hasLinkedPDF ? "blue" : "gray"}
                            leftIcon={<AttachmentIcon />}
                            onClick={(e) => {
                                e.stopPropagation();
                                onPDFLink(file.path);
                            }}
                        >
                            {hasLinkedPDF ? "Change PDF" : "Link PDF"}
                        </Button>
                    )}
                </HStack>
                
                {/* Show linked PDF info */}
                {isSelected && hasLinkedPDF && (
                    <HStack 
                        pl={depth * 4 + 8}
                        py={1}
                        fontSize="xs"
                        color="obsidian.text.muted"
                    >
                        <AttachmentIcon boxSize={3} />
                        <Text>Linked to: {linkedPdfPath?.split('/').pop()}</Text>
                    </HStack>
                )}
            </VStack>
        );
    }

    if (folder) {
        const children = folder.children.filter(child => {
            if (child instanceof TFile && child.extension === 'md') {
                return !searchQuery ||
                    child.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    child.path.toLowerCase().includes(searchQuery.toLowerCase());
            } else if (child instanceof TFolder) {
                return hasMatchingChildren(child, searchQuery);
            }
            return false;
        }).sort((a, b) => {
            // Sort folders first, then files, both alphabetically by name
            if (a instanceof TFolder && b instanceof TFile) return -1;
            if (a instanceof TFile && b instanceof TFolder) return 1;
            return a.name.localeCompare(b.name);
        });

        if (children.length === 0) return null;

        const folderFiles = getAllMarkdownFiles(folder);
        const selectedInFolder = folderFiles.filter(f => selectedFiles.has(f)).length;

        return (
            <Box>
                <HStack
                    p={2}
                    pl={depth * 4 + 2}
                    cursor="pointer"
                    onClick={onToggle}
                    _hover={{ bg: 'obsidian.modifier.hover' }}
                    borderRadius="md"
                >
                    <IconButton
                        icon={isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        size="xs"
                        variant="ghost"
                        aria-label="Toggle folder"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggle();
                        }}
                    />
                    <Text fontSize="sm" fontWeight="medium" color="obsidian.text.normal" flex={1}>
                        {folder.name || 'Root'}
                    </Text>
                    {selectedInFolder > 0 && (
                        <Badge size="sm" colorScheme="blue">
                            {selectedInFolder}
                        </Badge>
                    )}
                    <HStack spacing={1}>
                        <Button
                            size="xs"
                            variant="ghost"
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectAllInFolder?.(folder);
                            }}
                        >
                            All
                        </Button>
                        <Button
                            size="xs"
                            variant="ghost"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeselectAllInFolder?.(folder);
                            }}
                        >
                            None
                        </Button>
                    </HStack>
                </HStack>

                <Collapse in={isOpen}>
                    <VStack spacing={0} align="stretch">
                        {children.map((child) => (
                            <FileTreeNode
                                key={child.path}
                                app={app}
                                file={child instanceof TFile ? child : undefined}
                                folder={child instanceof TFolder ? child : undefined}
                                selectedFiles={selectedFiles}
                                onToggleFile={onToggleFile}
                                onSelectAllInFolder={onSelectAllInFolder}
                                onDeselectAllInFolder={onDeselectAllInFolder}
                                onPDFLink={onPDFLink}
                                pdfLinks={pdfLinks}
                                searchQuery={searchQuery}
                                depth={depth + 1}
                            />
                        ))}
                    </VStack>
                </Collapse>
            </Box>
        );
    }

    return null;
};

// Helper functions
const getAllMarkdownFiles = (folder: TFolder): string[] => {
    const files: string[] = [];
    
    const traverse = (currentFolder: TFolder) => {
        for (const child of currentFolder.children) {
            if (child instanceof TFile && child.extension === 'md') {
                files.push(child.path);
            } else if (child instanceof TFolder) {
                traverse(child);
            }
        }
    };
    
    traverse(folder);
    return files;
};

const hasMatchingChildren = (folder: TFolder, searchQuery: string): boolean => {
    if (!searchQuery) return true;
    
    for (const child of folder.children) {
        if (child instanceof TFile && child.extension === 'md') {
            if (child.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                child.path.toLowerCase().includes(searchQuery.toLowerCase())) {
                return true;
            }
        } else if (child instanceof TFolder && hasMatchingChildren(child, searchQuery)) {
            return true;
        }
    }
    return false;
};

// PDF Link Dialog Component
const PDFLinkDialog: React.FC<PDFLinkDialogProps & { app: any }> = ({
    isOpen,
    onClose,
    noteFilePath,
    currentPdfPath,
    onLinkUpdate,
    app
}) => {
    const [selectedPDFPath, setSelectedPDFPath] = useState<string | null>(currentPdfPath || null);
    const [vaultPDFs, setVaultPDFs] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            // Scan vault for PDF files
            const pdfs: string[] = [];
            app.vault.getAllLoadedFiles().forEach((file: any) => {
                if (file.extension === 'pdf') {
                    pdfs.push(file.path);
                }
            });
            // Sort PDFs alphabetically by filename
            pdfs.sort((a, b) => a.localeCompare(b));
            setVaultPDFs(pdfs);
            setSelectedPDFPath(currentPdfPath || null);
        }
    }, [isOpen, app, currentPdfPath]);

    const handleUpdate = () => {
        onLinkUpdate(noteFilePath, selectedPDFPath);
    };

    return (
        <ChakraModal isOpen={isOpen} onClose={onClose} size="lg">
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>Link PDF to Note</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    <VStack spacing={4} align="stretch">
                        <Text fontSize="sm" color="gray.600">
                            Note: <strong>{noteFilePath}</strong>
                        </Text>
                        
                        {currentPdfPath && (
                            <Text fontSize="sm" color="blue.600">
                                Currently linked to: <strong>{currentPdfPath.split('/').pop()}</strong>
                            </Text>
                        )}
                        
                        {vaultPDFs.length === 0 ? (
                            <Alert status="info">
                                <AlertIcon />
                                No PDF files found in your vault.
                            </Alert>
                        ) : (
                            <>
                                <Text fontSize="sm">Select a PDF or remove link:</Text>
                                <VStack align="stretch" maxH="300px" overflowY="auto" border="1px solid" borderColor="gray.200" borderRadius="md" p={2}>
                                    {/* Option to remove link */}
                                    <HStack
                                        p={2}
                                        cursor="pointer"
                                        onClick={() => setSelectedPDFPath(null)}
                                        bg={selectedPDFPath === null ? 'red.50' : 'transparent'}
                                        _hover={{ bg: 'gray.50' }}
                                        borderRadius="md"
                                    >
                                        <Box
                                            w={3}
                                            h={3}
                                            border="2px solid"
                                            borderColor={selectedPDFPath === null ? 'red.500' : 'gray.300'}
                                            borderRadius="full"
                                            bg={selectedPDFPath === null ? 'red.500' : 'transparent'}
                                        />
                                        <Text fontSize="sm" flex={1} color="red.600" fontStyle="italic">
                                            Remove PDF link
                                        </Text>
                                    </HStack>
                                    
                                    {/* Available PDFs */}
                                    {vaultPDFs.map((pdfPath) => (
                                        <HStack
                                            key={pdfPath}
                                            p={2}
                                            cursor="pointer"
                                            onClick={() => setSelectedPDFPath(pdfPath)}
                                            bg={selectedPDFPath === pdfPath ? 'blue.50' : 'transparent'}
                                            _hover={{ bg: 'gray.50' }}
                                            borderRadius="md"
                                        >
                                            <Box
                                                w={3}
                                                h={3}
                                                border="2px solid"
                                                borderColor={selectedPDFPath === pdfPath ? 'blue.500' : 'gray.300'}
                                                borderRadius="full"
                                                bg={selectedPDFPath === pdfPath ? 'blue.500' : 'transparent'}
                                            />
                                            <Text fontSize="sm" flex={1}>
                                                {pdfPath}
                                                {pdfPath === currentPdfPath && (
                                                    <Badge ml={2} colorScheme="blue" size="sm">Current</Badge>
                                                )}
                                            </Text>
                                        </HStack>
                                    ))}
                                </VStack>
                            </>
                        )}
                    </VStack>
                </ModalBody>
                <ModalFooter>
                    <Button variant="ghost" mr={3} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button 
                        colorScheme={selectedPDFPath === null ? 'red' : 'blue'}
                        onClick={handleUpdate}
                        isDisabled={selectedPDFPath === currentPdfPath}
                        leftIcon={<AttachmentIcon />}
                    >
                        {selectedPDFPath === null ? 'Remove Link' : 'Update Link'}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </ChakraModal>
    );
};


// Main FileSelector component with AppContext dependency removed
interface FileSelector_ExternalProps {
    app: any;
    selectedFiles: string[];
    initialPdfLinks?: PDFLinkMapping;
    onFileSelection: (result: FileSelectorResult) => void;
    onCancel: () => void;
}

export const FileSelector: React.FC<FileSelector_ExternalProps> = (props) => {
    useEffect(() => {
        const modal = new FileSelectorModal(
            props.app,
            props.selectedFiles,
            props.initialPdfLinks || {},
            props.onFileSelection,
            props.onCancel
        );
        
        // Open modal immediately
        modal.open();

        // Cleanup function
        return () => {
            modal.close();
        };
    }, [props.app, props.selectedFiles, props.initialPdfLinks, props.onFileSelection, props.onCancel]);

    return null; // The modal handles its own rendering
};