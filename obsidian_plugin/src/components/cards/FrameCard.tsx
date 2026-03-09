// src/components/cards/FrameCard.tsx
import React, { useState } from 'react';
import {
  Card,
  CardBody,
  VStack,
  HStack,
  Heading,
  Text,
  Badge,
  Box,
  Button,
  Divider,
  Collapse,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  useToast,
  IconButton,
} from '@chakra-ui/react';
import {
  ViewIcon,
  DeleteIcon
} from '@chakra-ui/icons';
import { Frame } from '../../api';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { preprocessLatex } from '../../utils/latexUtils';

interface FrameCardProps {
  frame: Frame;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: (frameId: number) => Promise<void>;
}


export const FrameCard: React.FC<FrameCardProps> = ({
  frame,
  isSelected,
  onSelect,
  onDelete
}) => {
  const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const toast = useToast();


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getGenerationBadgeColor = (minutes: number) => {
    if (minutes < 2) return 'green';
    if (minutes < 5) return 'yellow';
    return 'red';
  };

  const getFrameAccentColor = (frameId: number) => {
    const colors = ['blue', 'purple', 'teal', 'orange', 'pink', 'cyan'];
    return colors[frameId % colors.length];
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    
    setIsDeleting(true);
    try {
      await onDelete(frame.id);
      toast({
        title: 'Frame deleted',
        description: `Frame "${frame.title}" has been deleted successfully`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error: any) {
      toast({
        title: 'Error deleting frame',
        description: error.message || 'Failed to delete frame',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card
        variant={isSelected ? 'elevated' : 'outline'}
        transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        transform={isSelected ? 'scale(1.02)' : 'scale(1)'}
        _hover={{
          transform: isSelected ? 'scale(1.02)' : 'translateY(-1px)',
          boxShadow: isSelected ? 'xl' : 'md',
          cursor: 'pointer',
          borderColor: `${getFrameAccentColor(frame.id)}.400`
        }}
        position="relative"
        overflow="hidden"
        onClick={onSelect}
        borderLeft="4px solid"
        borderLeftColor={
          !frame.is_viewed 
            ? "green.400" 
            : isSelected 
              ? `${getFrameAccentColor(frame.id)}.500`
              : `${getFrameAccentColor(frame.id)}.300`
        }
        bg={undefined}
        boxShadow={isSelected ? 'lg' : undefined}
      >
        {/* New frame indicator */}
        {!frame.is_viewed && (
          <Box
            position="absolute"
            top={3}
            right={3}
            bg="obsidian.text.success"
            color="white"
            px={2}
            py={0.5}
            borderRadius="md"
            fontSize="xs"
            fontWeight="semibold"
            zIndex={1}
            boxShadow="sm"
          >
            NEW
          </Box>
        )}

        <CardBody pt={!frame.is_viewed ? 7 : 5} pb={isSelected ? 5 : 4}>
          <VStack align="stretch" spacing={isSelected ? 3 : 2.5}>
            {/* Header */}
            <Box>
              <HStack justify="space-between" align="center" mb={3}>
                <Badge 
                  colorScheme={getFrameAccentColor(frame.id)}
                  variant="subtle"
                  fontSize="xs"
                  px={2}
                  py={1}
                >
                  #{frame.id}
                </Badge>
                <HStack spacing={2}>
                  <Badge 
                    colorScheme={getGenerationBadgeColor(frame.generation_time_minutes)}
                    fontSize="xs"
                    variant="subtle"
                  >
                    {frame.generation_time_minutes.toFixed(1)}m
                  </Badge>
                  <Text fontSize="xs" color="obsidian.text.muted">
                    {formatDate(frame.created_at)}
                  </Text>
                  {onDelete && (
                    <IconButton
                      aria-label="Delete frame"
                      icon={<DeleteIcon />}
                      size="xs"
                      variant="solid"
                      colorScheme="red"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete();
                      }}
                      isLoading={isDeleting}
                      _hover={{ bg: 'red.600' }}
                      bg="red.500"
                      color="white"
                    />
                  )}
                </HStack>
              </HStack>

              <Heading
                as="h3"
                size="sm"
                color="obsidian.text.normal"
                lineHeight="1.4"
                mb={2}
                noOfLines={2}
                fontWeight="semibold"
              >
                {frame.title}
              </Heading>

              {/* Research Question */}
              <Text
                fontSize="xs"
                color="obsidian.text.accent"
                lineHeight="1.4"
                mb={2}
                noOfLines={2}
                fontWeight="medium"
                fontStyle="italic"
              >
                Q: {frame.research_question}
              </Text>

            </Box>

            {/* Expand indicator */}
            <HStack justify="flex-end" fontSize="xs" color="obsidian.text.muted">
              <Text fontSize="xs" color="obsidian.text.accent" fontWeight="medium">
                {isSelected ? 'Click to collapse' : 'Click to expand'}
              </Text>
            </HStack>

            {/* Expandable content - only show when selected */}
            {isSelected && (
              <>
                <Divider opacity={0.4} />

                {/* Full Perspective Content */}
                <Box>
                  <Text fontSize="sm" fontWeight="semibold" color="obsidian.text.normal" mb={3}>
                    Full Perspective
                  </Text>
                  <Collapse in={isExpanded} startingHeight={120}>
                    <Box
                      className="frame-content"
                      fontSize="sm"
                      color="obsidian.text.normal"
                      lineHeight="1.6"
                      bg="obsidian.bg.secondary"
                      p={4}
                      borderRadius="md"
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {preprocessLatex(frame.perspective ?? 'No perspective available')}
                      </ReactMarkdown>
                    </Box>
                  </Collapse>

                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(!isExpanded);
                    }}
                    mt={2}
                    fontSize="xs"
                    color="obsidian.text.accent"
                    _hover={{ bg: 'obsidian.modifier.hover' }}
                  >
                    {isExpanded ? 'Collapse perspective' : 'Expand to read full perspective'}
                  </Button>
                </Box>


                <Divider opacity={0.4} />

                {/* Actions */}
                <Button
                  size="sm"
                  colorScheme={getFrameAccentColor(frame.id)}
                  variant="solid"
                  leftIcon={<ViewIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onModalOpen();
                  }}
                  w="full"
                  borderRadius="lg"
                  _hover={{
                    transform: 'translateY(-1px)',
                    boxShadow: 'md'
                  }}
                  transition="all 0.2s ease"
                >
                  View Details
                </Button>
              </>
            )}
          </VStack>
        </CardBody>
      </Card>

      {/* Full Frame Modal */}
      <Modal isOpen={isModalOpen} onClose={onModalClose} size="6xl">
        <ModalOverlay />
        <ModalContent maxH="90vh">
          <ModalHeader pb={2}>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between" align="flex-start">
                <HStack spacing={3}>
                  <Badge colorScheme={getFrameAccentColor(frame.id)} variant="solid">
                    Frame #{frame.id}
                  </Badge>
                  <Badge
                    colorScheme={getGenerationBadgeColor(frame.generation_time_minutes)}
                    variant="subtle"
                  >
                    {frame.generation_time_minutes.toFixed(1)}m generation
                  </Badge>
                </HStack>
                <Text fontSize="sm" color="obsidian.text.muted">
                  {formatDate(frame.created_at)}
                </Text>
              </HStack>
              <Heading size="lg" lineHeight="1.3" color="obsidian.text.normal">
                {frame.title}
              </Heading>
              <Box
                bg="obsidian.bg.secondary"
                p={3}
                borderRadius="md"
                borderLeft="4px solid"
                borderLeftColor="obsidian.text.accent"
              >
                <Text fontSize="sm" color="obsidian.text.muted" fontWeight="medium" mb={1}>
                  Research Question:
                </Text>
                <Text fontSize="md" color="obsidian.text.normal" lineHeight="1.5">
                  {frame.research_question}
                </Text>
              </Box>
            </VStack>
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody overflowY="auto" pt={2}>
            <VStack spacing={6} align="stretch">
              {/* Full Perspective Content */}
              <Box>
                <Text fontSize="lg" fontWeight="bold" mb={4} color="obsidian.text.normal">
                  Research Perspective
                </Text>
                <Box
                  className="frame-content"
                  bg="obsidian.bg.secondary"
                  p={6}
                  borderRadius="lg"
                  lineHeight="1.7"
                  fontSize="md"
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {preprocessLatex(frame.perspective ?? 'No perspective available')}
                  </ReactMarkdown>
                </Box>
              </Box>

              {/* Content Sources */}
              {((frame.notes_used?.length || 0) > 0 || (frame.pdfs_used?.length || 0) > 0) && (
                <Box>
                  <Text fontSize="lg" fontWeight="bold" mb={3} color="obsidian.text.normal">
                    Content Sources
                  </Text>
                  <HStack spacing={4} wrap="wrap">
                    {(frame.notes_used?.length || 0) > 0 && (
                      <Badge colorScheme="blue" variant="outline" px={3} py={1}>
                        {frame.notes_used.length} Note{frame.notes_used.length !== 1 ? 's' : ''} Used
                      </Badge>
                    )}
                    {(frame.pdfs_used?.length || 0) > 0 && (
                      <Badge colorScheme="red" variant="outline" px={3} py={1}>
                        {frame.pdfs_used.length} PDF{frame.pdfs_used.length !== 1 ? 's' : ''} Used
                      </Badge>
                    )}
                  </HStack>
                </Box>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button colorScheme={getFrameAccentColor(frame.id)} onClick={onModalClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};