# Unified Notebooks: Fact Sheet & Integration Strategy
*(Formerly known as Google Drive Projects Fact Sheet)*

## 1. What Are Unified Notebooks?
Google has unified NotebookLM and the Gemini Web App. A "Notebook" is now a shared, cross-platform knowledge base that serves as a bounded context for your AI interactions.

### Key Capabilities
*   **Dual-Interface Access:** A Notebook created in either the Gemini Web App or NotebookLM is seamlessly synced across both.
*   **Strict Grounding (The Reference Overlay):** You add diverse sources (Google Docs, PDFs, Drive folders) to a Notebook. The Notebook acts as a reference overlay—it does not move or duplicate the physical files in your Drive.
*   **Cross-Source Synthesis:** Gemini synthesizes answers, generates summaries, and finds connections strictly using the files housed within that Notebook, greatly reducing hallucination.

---

## 2. How Notebooks Improve "The System"
Integrating Unified Notebooks provides massive architectural upgrades for AI interaction without requiring us to destroy our existing Life Organisation System (LOS) structures.

1.  **Instant Socratic Context:** Instead of feeding multiple URLs or files to a Gemini Gem (like Atlas or The System Architect) for a `/grill-me` session, you simply open the relevant Notebook in Gemini. The AI is instantly grounded in the exact, bounded context of that Notebook's sources.
2.  **Complementary to Shortcuts:** `.shortcut` files will **not** be pruned. Shortcuts will continue to serve as the human-facing manual aggregation method for the Ministry of Workflows, while Notebooks will serve as the AI-facing aggregation method.
3.  **Preservation of Taxonomy:** By using Notebooks as reference overlays, `the_system` continues to strictly enforce the absolute categorical taxonomy (`LOS_Taxonomy.json`) without compromises.

---

## 3. Implementation in The System's Project Plan

### The Dual-Interface Strategy
*   **The NotebookLM Interface (For Deep Curation):** Use this interface when uploading massive source documents, performing rigorous source-grounded research, or generating NotebookLM-specific artifacts like Audio Overviews.
*   **The Gemini Web App Interface (For Expansion):** Load your synced Notebook directly inside the Gemini Web App when you want to use the Notebook's sources as the *foundation*, but need Gemini's advanced abilities (web searching, coding, creative drafting) to expand upon it and generate new outputs.

### Required Rules:
1.  **Identity Boundary:** Notebooks are tied to your active Google Account. PMT Notebooks must be accessed via your `@playmetech.net` profile. Private Notebooks via your `@gmail.com` profile.
2.  **Context Linking:** When creating an L4 Active Project (e.g., `01 05 01 Projects / 202604 Staycation`), manually construct a corresponding Notebook and link the L4 files into it to establish the bounded context for Gemini.
