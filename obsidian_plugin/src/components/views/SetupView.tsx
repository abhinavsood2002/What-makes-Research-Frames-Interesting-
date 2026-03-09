// src/components/views/SetupView.tsx
import React, { useState, useEffect } from 'react';
import {
  VStack,
  HStack,
  Box,
  Heading,
  Text,
  Textarea,
  Button,
  Card,
  CardBody,
  Badge,
  FormControl,
  FormLabel,
  FormHelperText,
  List,
  ListItem,
  Flex,
  Icon,
  Container,
  useToast,
  Divider,
} from '@chakra-ui/react';
import { AddIcon, CheckIcon, ArrowForwardIcon } from '@chakra-ui/icons';
import { useFrameStore } from '../../store/frameStore';
import { useApp } from '../../contexts/AppContext';
import { FileSelector, PDFLinkMapping, FileSelectorResult } from '../FileSelector';
import { TFile } from 'obsidian';

interface Note {
  id: number;
  file_path: string;
  content: string;
  created_at: string;
  updated_at: string;
  linked_pdf_id?: number;
}

export const SetupView: React.FC = () => {
  const { api, app } = useApp();
  const toast = useToast();
  const {
    username,
    logout,
    userContext,
    setUserContext,
    setLoading,
    setError
  } = useFrameStore();

  const [showFileSelector, setShowFileSelector] = useState(false);
  const [researchInterest, setResearchInterest] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Array<{ path: string; content: string; }>>([]);
  const [pdfLinks, setPdfLinks] = useState<PDFLinkMapping>({});
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isContextUpdateInProgress, setIsContextUpdateInProgress] = useState(false);

  const getLinkedPDFCount = () => {
    // Count PDFs linked to selected notes in local state
    const linkedCount = selectedFiles.filter(file => {
      const hasLink = !!pdfLinks[file.path];
      if (hasLink) {
        console.log(`📎 Note ${file.path} has PDF link: ${pdfLinks[file.path]}`);
      }
      return hasLink;
    }).length;
    console.log(`📊 Total linked PDFs: ${linkedCount} out of ${selectedFiles.length} selected notes`);
    return linkedCount;
  };

  const getNotesWithoutPDFs = () => {
    return selectedFiles.filter(file => {
      return !pdfLinks[file.path];
    });
  };

  // Load existing context and notes on mount
  useEffect(() => {
    console.log(`🔄 SetupView useEffect triggered - userContext: ${userContext ? 'exists' : 'null'}, isContextUpdateInProgress: ${isContextUpdateInProgress}`);

    // Skip loading if we're in the middle of a context update
    if (isContextUpdateInProgress) {
      console.log('⏸️ Skipping context reload - update in progress');
      return;
    }

    const loadInitialContext = async () => {
      try {
        // First, try to use userContext from store if available
        if (userContext && userContext.selected_note_ids && userContext.selected_note_ids.length > 0) {
          console.log(`📋 Using userContext from store: ${userContext.selected_note_ids.length} notes`);
          setResearchInterest(userContext.research_interest);
          setSelectedNoteIds(userContext.selected_note_ids);
          const { pdfLinks: extractedPdfLinks } = await loadAvailableNotesAndReconstruct(userContext.selected_note_ids);
          setPdfLinks(extractedPdfLinks);
          return;
        }

        // Otherwise, try to load from backend
        console.log('🆕 Loading context from backend...');
        const savedContext = await api.getUserContext();
        if (savedContext && savedContext.selected_note_ids && savedContext.selected_note_ids.length > 0) {
          setUserContext(savedContext);
          setResearchInterest(savedContext.research_interest);
          setSelectedNoteIds(savedContext.selected_note_ids);

          const { pdfLinks: extractedPdfLinks } = await loadAvailableNotesAndReconstruct(savedContext.selected_note_ids);
          setPdfLinks(extractedPdfLinks);

          console.log(`📦 Restored context from backend: ${savedContext.selected_note_ids.length} notes, ${Object.keys(extractedPdfLinks).length} PDF links`);
        } else {
          console.log('🆕 No saved context found, starting fresh');
          // Clear any existing state
          setSelectedFiles([]);
          setPdfLinks({});
          setSelectedNoteIds([]);
        }
      } catch (error: any) {
        console.log('⚠️ Error loading context:', error.message);
        // Start fresh if loading fails
        setSelectedFiles([]);
        setPdfLinks({});
        setSelectedNoteIds([]);
      }
    };

    loadInitialContext();
  }, [api, isContextUpdateInProgress]); // Removed userContext from dependencies to avoid loops

  const loadAvailableNotes = async (preserveCurrentSelections = false) => {
    return loadAvailableNotesWithIds(selectedNoteIds, preserveCurrentSelections);
  };

  const loadAvailableNotesWithIds = async (noteIds: number[], preserveCurrentSelections = false) => {
    try {
      console.log('🔄 Refreshing notes data...');
      const response = await api.getNotes();
      
      // Log PDF links in the response
      const notesWithPDFs = response.notes.filter((note: Note) => note.linked_pdf_id);
      console.log(`📊 Notes with PDF links: ${notesWithPDFs.length}`, notesWithPDFs.map(n => `${n.file_path} -> ${n.linked_pdf_id}`));
      
      // Smart selection preservation: preserve if we already have selections and no explicit note IDs
      const shouldPreserveSelections = preserveCurrentSelections || 
        (selectedFiles.length > 0 && noteIds.length === 0);
      
      // Only update selectedFiles if we're not preserving current selections
      if (!shouldPreserveSelections) {
        // Update selectedFiles based on provided noteIds
        const currentlySelected = response.notes.filter((note: Note) => 
          noteIds.includes(note.id)
        );
        setSelectedFiles(currentlySelected.map(note => ({
          path: note.file_path,
          content: note.content
        })));
        console.log(`✅ Loaded ${response.notes.length} notes, ${currentlySelected.length} selected (from provided IDs: [${noteIds.join(', ')}])`);
      } else {
        console.log(`✅ Loaded ${response.notes.length} notes, preserving current selections (${selectedFiles.length} files)`);
      }
    } catch (error: any) {
      console.warn('Could not load notes:', error.message);
    }
  };

  const loadAvailableNotesAndReconstruct = async (savedNoteIds: number[]): Promise<{ pdfLinks: PDFLinkMapping }> => {
    // Load notes and PDFs in parallel for better performance
    const [notesResponse, pdfsResponse] = await Promise.all([
      api.getNotes(),
      api.getPDFs()
    ]);

    // Create PDF lookup map: ID -> vault path (now using standardized vault_pdf_path)
    const pdfMap = new Map<number, string>();
    pdfsResponse.pdfs.forEach((pdf: any) => {
      if (pdf.id && pdf.vault_pdf_path) {
        pdfMap.set(pdf.id, pdf.vault_pdf_path);
        console.log(`📊 Mapped PDF ${pdf.id} -> ${pdf.vault_pdf_path}`);
      }
    });

    // Extract PDF links from backend notes using the standardized mapping
    const extractedPdfLinks: PDFLinkMapping = {};

    // Filter selected notes and extract their PDF links
    const selectedNotes = notesResponse.notes.filter((note: Note) =>
      savedNoteIds.includes(note.id)
    );

    selectedNotes.forEach((note: Note) => {
      if (note.linked_pdf_id) {
        const pdfPath = pdfMap.get(note.linked_pdf_id);
        if (pdfPath) {
          extractedPdfLinks[note.file_path] = pdfPath;
          console.log(`🔗 Restored PDF link: ${note.file_path} -> ${pdfPath}`);
        } else {
          console.warn(`⚠️ Could not find PDF vault path for ID ${note.linked_pdf_id} linked to note ${note.file_path}`);
        }
      }
    });

    // Update selectedFiles
    setSelectedFiles(selectedNotes.map(note => ({
      path: note.file_path,
      content: note.content
    })));

    console.log(`✅ Reconstructed context: ${savedNoteIds.length} note IDs provided, ${Object.keys(extractedPdfLinks).length} PDF links restored`);

    return { pdfLinks: extractedPdfLinks };
  };

  const handleFileSelection = async (result: FileSelectorResult) => {
    setShowFileSelector(false);
    setLoading(true);
    
    try {
      // Load file contents - no backend operations yet
      const filesWithContent: Array<{ path: string; content: string; }> = [];
      
      for (const path of result.selectedNotes) {
        const file = app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          const content = await app.vault.read(file);
          filesWithContent.push({ path, content });
        }
      }
      
      setSelectedFiles(filesWithContent);
      setPdfLinks(result.pdfLinks);
      
      // Clear note IDs since we haven't created backend notes yet
      setSelectedNoteIds([]);
      
    } catch (error: any) {
      setError(`Error loading files: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };



  const handleUpdateContext = async () => {
    if (!researchInterest.trim() || selectedFiles.length === 0) {
      toast({
        title: 'Missing information',
        description: 'Please provide research interest and select notes',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsUpdating(true);
    setIsContextUpdateInProgress(true);
    
    try {
      console.log('🚀 Starting backend operations...');

      // Step 0: Pre-validation - check all files exist
      console.log('🔍 Validating all files exist...');
      const missingFiles: string[] = [];

      // Validate notes
      for (const file of selectedFiles) {
        const noteFile = app.vault.getAbstractFileByPath(file.path);
        if (!noteFile) {
          missingFiles.push(`Note: ${file.path}`);
        }
      }

      // Validate PDFs
      for (const [notePath, pdfPath] of Object.entries(pdfLinks)) {
        const pdfFile = app.vault.getAbstractFileByPath(pdfPath);
        if (!pdfFile || !(pdfFile instanceof TFile) || pdfFile.extension !== 'pdf') {
          missingFiles.push(`PDF: ${pdfPath} (for note: ${notePath})`);
        }
      }

      if (missingFiles.length > 0) {
        const errorMsg = `Missing files:\n${missingFiles.join('\n')}`;
        console.error('❌ Validation failed:', errorMsg);
        throw new Error(`Cannot proceed - missing files:\n${missingFiles.join('\n')}`);
      }

      console.log('✅ All files validated successfully');

      // Step 1: Clean up previous privacy data
      console.log('🧹 Cleaning up previous privacy data...');
      try {
        const cleanupResult = await api.cleanupPrivacyData();
        console.log(`✅ Privacy cleanup completed: ${cleanupResult.message}`);
      } catch (cleanupError: any) {
        console.warn('⚠️ Privacy cleanup failed (continuing anyway):', cleanupError.message);
        // Don't fail the entire operation if cleanup fails
      }
      
      const notePathToId = new Map<string, number>();
      const noteIds: number[] = [];

      // Step 1: Create/update all notes in backend
      console.log('📝 Creating notes in backend...');
      for (const file of selectedFiles) {
        const note = await api.createNote(file.path, file.content);
        if (note && note.id) {
          notePathToId.set(file.path, note.id);
          noteIds.push(note.id);
          console.log(`✅ Created note: ${file.path} -> ID ${note.id}`);
        } else {
          console.error(`❌ Failed to create note: ${file.path}`);
          throw new Error(`Failed to create note: ${file.path}`);
        }
      }

      console.log(`✅ Created ${noteIds.length} notes in backend`);

      // Step 2: Upload PDFs and create links
      console.log('📄 Processing PDF uploads and links...');
      for (const [notePath, pdfPath] of Object.entries(pdfLinks)) {
        // Get the note ID using explicit mapping
        const noteId = notePathToId.get(notePath);
        if (!noteId) {
          console.error(`❌ Could not find note ID for path: ${notePath}`);
          throw new Error(`Could not find note ID for path: ${notePath}`);
        }
        
        try {
          // Read PDF from vault and convert to base64
          const file = app.vault.getAbstractFileByPath(pdfPath);
          if (!file || !(file instanceof TFile) || file.extension !== 'pdf') {
            throw new Error(`Invalid PDF file: ${pdfPath}`);
          }

          console.log(`📄 Processing PDF: ${pdfPath} -> Note ${noteId}`);
          const pdfBuffer = await app.vault.readBinary(file);
          const base64Content = btoa(
            new Uint8Array(pdfBuffer)
              .reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          // Upload PDF and link to note
          const uploadResult = await api.uploadPDFFromVault(pdfPath, base64Content, noteId);
          console.log(`✅ Uploaded and linked PDF: ${pdfPath} -> Note ${noteId}`, uploadResult);

        } catch (pdfError: any) {
          console.error(`❌ Failed to upload PDF ${pdfPath}:`, pdfError);
          throw new Error(`Failed to upload PDF ${pdfPath}: ${pdfError.message}`);
        }
      }
      
      // Step 3: Update context on backend
      console.log('🔄 Updating research context...');
      try {
        const contextResult = await api.updateContext(
          researchInterest.trim(),
          noteIds,
          [] // PDFs are managed through note relationships
        );
        console.log('✅ Context updated:', contextResult);
      } catch (contextError: any) {
        console.error('❌ Failed to update context:', contextError);
        throw new Error(`Failed to update context: ${contextError.message}`);
      }

      // Step 4: Update local state
      setSelectedNoteIds(noteIds);
      const newContext = {
        research_interest: researchInterest.trim(),
        selected_note_ids: noteIds,
        selected_pdf_ids: [],
        updated_at: new Date().toISOString()
      };
      setUserContext(newContext);

      const pdfCount = Object.keys(pdfLinks).length;
      console.log(`✅ Context update complete: ${noteIds.length} notes, ${pdfCount} PDF links`);

      toast({
        title: 'Context updated successfully',
        description: `${noteIds.length} notes and ${pdfCount} PDFs processed successfully. PDF summaries will be generated in the background.`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      // Refresh notes data to get updated backend state
      await loadAvailableNotes(true);

    } catch (error: any) {
      console.error('❌ Context update failed:', error);

      // Provide more specific error messages
      let errorMessage = error.message;
      if (errorMessage.includes('Failed to create note')) {
        errorMessage = `Note creation failed. Please check that all selected notes still exist in your vault.`;
      } else if (errorMessage.includes('Failed to upload PDF')) {
        errorMessage = `PDF upload failed. Please check that all linked PDFs are accessible and valid.`;
      } else if (errorMessage.includes('Missing files')) {
        errorMessage = `Some files are missing from your vault. Please check the file paths and try again.`;
      }

      setError(`Context update failed: ${errorMessage}`);
      toast({
        title: 'Context update failed',
        description: errorMessage,
        status: 'error',
        duration: 8000,
        isClosable: true,
      });
    } finally {
      setIsUpdating(false);
      setIsContextUpdateInProgress(false);
    }
  };


  const isValid = researchInterest.trim().length >= 5 && selectedFiles.length > 0;
  const hasChanges = userContext && (
    userContext.research_interest !== researchInterest.trim() ||
    JSON.stringify(userContext.selected_note_ids || []) !== JSON.stringify(selectedNoteIds) ||
    selectedFiles.length !== (userContext.selected_note_ids || []).length
  );

  return (
    <Container maxW="4xl" h="100%" overflowY="auto" py={8}>
      <VStack spacing={8} align="stretch">
        {/* Header */}
        <Flex justify="space-between" align="center">
          <Box>
            <Heading 
              as="h1" 
              size="lg"
              bgGradient="linear(to-r, obsidian.text.accent, obsidian.interactive.accentHover)"
              bgClip="text"
            >
              Research Setup
            </Heading>
            <Text color="obsidian.text.muted" mt={2}>
              Configure your research context for automatic frame generation
            </Text>
            {username && (
              <Text fontSize="sm" color="obsidian.text.muted" mt={1}>
                Logged in as: <strong>{username}</strong>
              </Text>
            )}
          </Box>
          
          <HStack spacing={2}>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              colorScheme="red"
            >
              Logout
            </Button>
          </HStack>
        </Flex>

        {/* Current Status */}
        {userContext && (
          <Card variant="filled">
            <CardBody>
              <VStack align="stretch" spacing={3}>
                <Text fontWeight="semibold" color="obsidian.text.normal">
                  Current Research Context:
                </Text>
                <Text fontSize="sm" color="obsidian.text.muted">
                  <strong>Interest:</strong> {userContext.research_interest}
                </Text>
                <Text fontSize="sm" color="obsidian.text.muted">
                  <strong>Notes:</strong> {userContext.selected_note_ids?.length || 0} files selected
                </Text>
                <Text fontSize="sm" color="obsidian.text.muted">
                  <strong>PDFs:</strong> {getLinkedPDFCount()} notes have linked PDFs
                </Text>
                <Text fontSize="xs" color="obsidian.text.muted">
                  Last updated: {new Date(userContext.updated_at || '').toLocaleString()}
                </Text>
              </VStack>
            </CardBody>
          </Card>
        )}

        {/* Research Interest */}
        <Card variant="elevated">
          <CardBody>
            <FormControl>
              <FormLabel color="obsidian.text.normal" fontWeight="semibold" fontSize="lg">
                Research Interest
              </FormLabel>
              <Textarea
                placeholder="Describe your research question, area of interest, or what you want to explore..."
                value={researchInterest}
                onChange={(e) => setResearchInterest(e.target.value)}
                rows={5}
                size="lg"
                resize="vertical"
              />
              <FormHelperText color="obsidian.text.muted">
                This will guide the automatic generation of research frames. Be specific about your research focus.
              </FormHelperText>
            </FormControl>
          </CardBody>
        </Card>

        {/* File Selection */}
        <Card variant="elevated">
          <CardBody>
            <FormControl>
              <Flex justify="space-between" align="center" mb={4}>
                <Box>
                  <FormLabel color="obsidian.text.normal" fontWeight="semibold" fontSize="lg" mb={1}>
                    Research Notes
                  </FormLabel>
                  <Text fontSize="sm" color="obsidian.text.muted">
                    Select notes that contain relevant information for your research
                  </Text>
                </Box>
                <Badge 
                  variant={selectedFiles.length > 0 ? 'solid' : 'subtle'}
                  colorScheme={selectedFiles.length > 0 ? 'green' : 'gray'}
                  fontSize="sm"
                  px={3}
                  py={1}
                >
                  {selectedFiles.length} files
                </Badge>
              </Flex>

              <VStack spacing={3} w="full">
                <Button
                  leftIcon={<AddIcon />}
                  variant="outline"
                  onClick={() => {
                    console.log('🖱️ File button clicked, current showFileSelector:', showFileSelector);
                    if (showFileSelector) {
                      // If already open, close it first, then reopen
                      setShowFileSelector(false);
                      setTimeout(() => {
                        console.log('🔄 Reopening FileSelector after reset');
                        setShowFileSelector(true);
                      }, 100);
                    } else {
                      console.log('📂 Opening FileSelector');
                      setShowFileSelector(true);
                    }
                  }}
                  size="lg"
                  w="full"
                >
                  Select Files from Vault
                </Button>
                
              </VStack>

              {selectedFiles.length > 0 && (
                <Card variant="glass">
                  <CardBody>
                    <Text fontWeight="semibold" mb={3} color="obsidian.text.normal">
                      Selected Files:
                    </Text>
                    <List spacing={2}>
                      {selectedFiles.slice(0, 8).map((file, index) => {
                        const linkedPdfPath = pdfLinks[file.path];
                        const hasLinkedPDF = !!linkedPdfPath;
                        
                        return (
                          <VStack key={index} align="stretch" spacing={1}>
                            <ListItem 
                              fontSize="sm"
                              color="obsidian.text.muted"
                              display="flex"
                              alignItems="center"
                            >
                              <Icon as={CheckIcon} color="obsidian.text.success" mr={2} boxSize={3} />
                              {file.path}
                            </ListItem>
                            {hasLinkedPDF ? (
                              <Box ml={6} pl={2} borderLeft="2px solid" borderColor="green.200">
                                <Text fontSize="xs" color="green.600" fontStyle="italic">
                                  📎 Linked PDF: {linkedPdfPath?.split('/').pop()}
                                </Text>
                              </Box>
                            ) : (
                              <Box ml={6} pl={2} borderLeft="2px solid" borderColor="orange.200">
                                <Text fontSize="xs" color="orange.600" fontStyle="italic">
                                  📄 Note only (use file selector to link a PDF)
                                </Text>
                              </Box>
                            )}
                          </VStack>
                        );
                      })}
                      {selectedFiles.length > 8 && (
                        <ListItem fontSize="sm" color="obsidian.text.muted" fontStyle="italic">
                          ... and {selectedFiles.length - 8} more files
                        </ListItem>
                      )}
                    </List>
                    
                    {/* PDF Summary */}
                    <Box mt={4} p={3} bg="obsidian.bg.primary" borderRadius="md">
                      <HStack justify="space-between">
                        <Text fontSize="xs" color="obsidian.text.muted">
                          <strong>{getLinkedPDFCount()}</strong> notes have PDFs, <strong>{getNotesWithoutPDFs().length}</strong> notes without PDFs
                        </Text>
                        {getNotesWithoutPDFs().length > 0 && (
                          <Text fontSize="xs" color="orange.600">
                            Use file selector to link PDFs
                          </Text>
                        )}
                      </HStack>
                    </Box>
                  </CardBody>
                </Card>
              )}
            </FormControl>
          </CardBody>
        </Card>


        <Divider />

        {/* Actions */}
        <VStack spacing={4}>
          <Button
            variant="gradient"
            size="lg"
            onClick={handleUpdateContext}
            isDisabled={!isValid}
            isLoading={isUpdating}
            rightIcon={<ArrowForwardIcon />}
            w="full"
            maxW="400px"
          >
            {userContext ? 'Update Research Context' : 'Set Research Context'}
          </Button>

          {hasChanges && (
            <Text fontSize="sm" color="obsidian.text.muted" textAlign="center">
              You have unsaved changes. Update your context first, then extract and generate frames.
            </Text>
          )}

          {!hasChanges && userContext && (
            <Text fontSize="sm" color="obsidian.text.success" textAlign="center">
              ✓ Research context saved. Use the navigation buttons above to extract context and generate frames.
            </Text>
          )}
        </VStack>
      </VStack>

      {/* File Selector Modal */}
      {showFileSelector && (
        <>
          {console.log('📁 Rendering FileSelector modal')}
          <FileSelector
            app={app}
            selectedFiles={selectedFiles.map(f => f.path)}
            initialPdfLinks={pdfLinks}
            onFileSelection={handleFileSelection}
            onCancel={() => {
              console.log('🚫 FileSelector cancelled');
              setShowFileSelector(false);
            }}
          />
        </>
      )}

    </Container>
  );
};