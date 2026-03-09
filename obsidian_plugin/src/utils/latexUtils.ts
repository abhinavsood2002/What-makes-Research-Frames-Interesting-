/**
 * LaTeX preprocessing utilities for handling Unicode characters and LaTeX syntax
 * in markdown content that will be rendered with KaTeX.
 */

/**
 * Preprocesses content to make it compatible with KaTeX LaTeX rendering.
 * Handles problematic Unicode characters and converts LaTeX syntax.
 *
 * @param content - The raw content string to preprocess
 * @returns Preprocessed content safe for KaTeX rendering
 */
export const preprocessLatex = (content: string): string => {
  if (!content) return content;

  return content
    // Handle problematic Unicode characters that cause KaTeX errors
    .replace(/‑/g, '-')           // Non-breaking hyphen (U+8209) → regular hyphen
    .replace(/–/g, '-')           // En dash (U+2013) → regular hyphen


    // Handle Greek letters (convert to names to avoid KaTeX conflicts)
    // Fix table formatting issues
    .replace(/\|\\/g, '|')         // Remove trailing backslashes after pipes
    .replace(/\\\s*$/gm, '')       // Remove trailing backslashes at end of lines

    // Convert LaTeX delimiters to markdown math format
    .replace(/\\\(/g, '$')         // Inline math start
    .replace(/\\\)/g, '$')         // Inline math end
    .replace(/\\\[/g, '$$')        // Display math start
    .replace(/\\\]/g, '$$');       // Display math end
};
