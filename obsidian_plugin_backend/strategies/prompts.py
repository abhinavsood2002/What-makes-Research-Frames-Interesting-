"""
Centralized prompts for all strategy classes.
Contains all LLM prompts used across different frame generation strategies.
"""

def get_direct_answer_prompt(research_interest: str, research_question: str) -> str:
    """Direct answer prompt for analytical frames without content sources."""
    return f"""You are a researcher who is coming up with expert perspectives on a research question. You are given a research context that
outlines your research interest. Based on your analytical expertise and knowledge in this field, provide a thoughtful research perspective that addresses this question.
Follow the given instructions.

**Instructions**
Create a response in this exact format:
TITLE: [A focused, analytical title that directly addresses the question - 8-12 words]
PERSPECTIVE: [A comprehensive perspective that:
- Directly addresses the research question
- Offers a specific direction instead of being broad and vague
- Is 150-250 words and grounded in academic rigor
- Is formatted in markdown
- Is different from existing frames if they are provided below]

**Research Context**
{research_interest}

**Research Question**
{research_question}"""

def get_comprehensive_frame_prompt(research_interest: str, research_question: str,
                                 sources_text: str) -> str:
    """Comprehensive frame prompt for all objects strategy."""
    return f"""You are a researcher who is coming up with expert perspectives on a research question. You are given a research context that
outlines your research interest. Additionally, you are provided with sources that are comprised of notes and academic papers relevant to your research.
Based on your analytical expertise and knowledge in this field, provide a thoughtful research perspective that addresses this question.
Follow the given instructions.

**Instructions**
Create a response in this exact format:
TITLE: [A focused, analytical title that directly addresses the question - 8-12 words]
PERSPECTIVE: [A comprehensive perspective that:
- Directly addresses the research question
- Offers a specific direction instead of being broad and vague
- Is 150-250 words and grounded in academic rigor
- Is formatted in markdown
- Is different from existing frames if they are provided below]

**Research Context**
{research_interest}

**Research Question**
{research_question}

**Available Sources**
{sources_text}"""


def get_archaeology_prompt(research_interest: str, research_question: str, sources_text: str) -> str:
    """Archaeology step prompt for Dorst's frame strategy."""
    return f"""You are conducting an archaeological analysis of a research question.  
Given the available sources that comprise of notes and academic papers relevant to you, examine how this problem has been previously approached and defined.
Provide a 150-200 word analysis revealing the "archaeology" of this research question - previous approaches, assumptions, and how the problem came to be defined.

**Research Context**
{research_interest}

**Research Question**
{research_question}

**Available Sources**
{sources_text}
"""

def get_paradox_prompt(research_interest: str, research_question: str,
                      archaeology_result: str, sources_text: str) -> str:
    """Paradox step prompt for Dorst's frame strategy."""
    return f"""You are identifying the paradoxes that make a research question challenging to solve.  
Given the available sources that comprise of notes and academic papers relevant to you, build on the archaeological understanding and analyze what creates deadlock or prevents progress.
Provide a 150-200 word analysis identifying the core paradoxes and difficulties that make this research question challenging to address.

**Research Context**
{research_interest}

**Research Question**
{research_question}

**Previous Analysis**
{archaeology_result}

**Available Sources**
{sources_text}
"""

def get_context_prompt(research_interest: str, research_question: str,
                      archaeology_result: str, paradox_result: str, sources_text: str) -> str:
    """Context step prompt for Dorst's frame strategy."""
    return f"""You are mapping the deeper context of a research question as a researcher. You are provided with previous analysis on previous approaches to the
problem and an understanding of what makes it difficult. Given the available sources that comprise of notes and academic papers relevant to you,
Provide a 150-200 word analysis of the deeper context of the problem.

**Research Context**
{research_interest}

**Research Question**
{research_question}

**Previous Analysis**
{archaeology_result}
{paradox_result}

**Available Sources**
{sources_text}"""

def get_frames_prompt(research_interest: str, research_question: str,
                     archaeology_result: str, paradox_result: str,
                     context_result: str, sources_text: str) -> str:
    """Final frames step prompt for Dorst's frame strategy."""
    return f"""You are a researcher who is coming up with expert perspectives on a research question. You are given a research context that
outlines your research interest. Additionally, you are provided with sources that are comprised of notes and academic papers relevant to your research.
Based on your analytical expertise and knowledge in this field, provide a thoughtful research perspective that addresses this question. While crafting
this perspective, make use of the given previous analysis. The previous analysis consists of three steps: understanding previous approaches, understanding
what makes the problem difficult to solve, and understanding the deeper context of the problem.
Follow the given instructions.

**Instructions**
Create a response in this exact format:
TITLE: [A focused, analytical title that directly addresses the question - 8-12 words]
PERSPECTIVE: [A comprehensive perspective that:
- Directly addresses the research question
- Offers a specific direction instead of being broad and vague
- Is 150-250 words and grounded in academic rigor
- Is formatted in markdown
- Is different from existing frames if they are provided below]

**Research Context**
{research_interest}

**Research Question**
{research_question}

**Previous Analysis**
{archaeology_result}
{paradox_result}
{context_result}

**Available Sources**
{sources_text}
"""