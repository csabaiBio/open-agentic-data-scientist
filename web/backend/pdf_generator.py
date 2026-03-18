"""
PDF generator for research papers.

Converts markdown paper content to a styled PDF with embedded figures
using fpdf2.
"""

import logging
import re
import sys
from pathlib import Path
from typing import Optional

from fpdf import FPDF

logger = logging.getLogger(__name__)

# Page layout constants — publication-style (compact for 5-page limit)
PAGE_W = 210  # A4 width mm
MARGIN_L = 25
MARGIN_R = 25
MARGIN_T = 20
MARGIN_B = 20
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".webp", ".tiff"}

# Unicode replacement map for characters outside standard fonts
_UNICODE_REPLACEMENTS = {
    "\u2014": "--",   # em dash
    "\u2013": "-",    # en dash
    "\u2018": "'",    # left single quote
    "\u2019": "'",    # right single quote
    "\u201c": '"',    # left double quote
    "\u201d": '"',    # right double quote
    "\u2026": "...",  # ellipsis
    "\u2022": "*",    # bullet
    "\u2023": ">",    # triangular bullet
    "\u2039": "<",    # single left angle quote
    "\u203a": ">",    # single right angle quote
    "\u00ab": "<<",   # left double angle quote
    "\u00bb": ">>",   # right double angle quote
    "\u2190": "<-",   # left arrow
    "\u2192": "->",   # right arrow
    "\u2264": "<=",   # less than or equal
    "\u2265": ">=",   # greater than or equal
    "\u00b1": "+/-",  # plus minus
    "\u00d7": "x",    # multiplication
    "\u00f7": "/",    # division
    "\u03b1": "alpha",
    "\u03b2": "beta",
    "\u03b3": "gamma",
    "\u03b4": "delta",
    "\u03bc": "mu",
    "\u03c3": "sigma",
    "\u03c0": "pi",
    "\u2248": "~=",   # approximately equal
    "\u2260": "!=",   # not equal
    "\u221e": "inf",  # infinity
    "\u207b": "-",    # superscript minus
    "\u207a": "+",    # superscript plus
    "\u2070": "0",    # superscript 0
    "\u00b9": "1",    # superscript 1
    "\u00b2": "2",    # superscript 2
    "\u00b3": "3",    # superscript 3
    "\u2074": "4",    # superscript 4
    "\u2075": "5",    # superscript 5
    "\u2076": "6",    # superscript 6
    "\u2077": "7",    # superscript 7
    "\u2078": "8",    # superscript 8
    "\u2079": "9",    # superscript 9
    "\u2080": "0",    # subscript 0
    "\u2081": "1",    # subscript 1
    "\u2082": "2",    # subscript 2
    "\u2083": "3",    # subscript 3
}


def _find_system_font(family: str = "arial") -> Optional[Path]:
    """Find a Unicode TTF font on the system."""
    candidates = []

    if sys.platform == "win32":
        fonts_dir = Path("C:/Windows/Fonts")
        candidates = [
            fonts_dir / "arial.ttf",
            fonts_dir / "arialbd.ttf",
            fonts_dir / "ariali.ttf",
            fonts_dir / "arialbi.ttf",
            fonts_dir / "times.ttf",
            fonts_dir / "timesbd.ttf",
            fonts_dir / "timesi.ttf",
            fonts_dir / "timesbi.ttf",
            fonts_dir / "calibri.ttf",
            fonts_dir / "calibrib.ttf",
            fonts_dir / "calibrii.ttf",
        ]
    else:
        # Linux / macOS common locations
        for base in [
            Path("/usr/share/fonts"),
            Path("/usr/local/share/fonts"),
            Path.home() / ".fonts",
            Path("/System/Library/Fonts"),       # macOS
            Path("/Library/Fonts"),               # macOS
        ]:
            if base.exists():
                candidates.extend(base.rglob("DejaVuSans*.ttf"))
                candidates.extend(base.rglob("LiberationSans*.ttf"))
                candidates.extend(base.rglob("Arial*.ttf"))

    for c in candidates:
        if c.exists():
            return c
    return None


def _sanitize_text(text: str) -> str:
    """Replace Unicode characters that may not be supported by the PDF font."""
    for char, replacement in _UNICODE_REPLACEMENTS.items():
        text = text.replace(char, replacement)
    return text


class PaperPDF(FPDF):
    """Custom PDF class with header/footer and academic styling."""

    def __init__(self, title: str = "Research Paper", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._paper_title = title
        self._page_number_start = True
        self._unicode_font = False

        # Try to register a Unicode TTF font
        font_path = _find_system_font()
        if font_path:
            try:
                font_dir = font_path.parent
                self.add_font("UniSans", "", str(font_dir / "arial.ttf") if (font_dir / "arial.ttf").exists() else str(font_path))
                # Try adding bold/italic variants
                for style, names in [
                    ("B", ["arialbd.ttf", "Arial Bold.ttf"]),
                    ("I", ["ariali.ttf", "Arial Italic.ttf"]),
                    ("BI", ["arialbi.ttf", "Arial Bold Italic.ttf"]),
                ]:
                    for name in names:
                        variant = font_dir / name
                        if variant.exists():
                            self.add_font("UniSans", style, str(variant))
                            break
                self._unicode_font = True
                logger.info(f"Registered Unicode font from {font_path}")
            except Exception as e:
                logger.warning(f"Could not register Unicode font: {e}")
                self._unicode_font = False

    def _font_family(self) -> str:
        """Return the best available font family name."""
        return "UniSans" if self._unicode_font else "Helvetica"

    def _mono_family(self) -> str:
        return "Courier"

    def header(self):
        if self.page_no() > 1:
            self.set_font(self._font_family(), "I", 8)
            self.set_text_color(140, 140, 140)
            # Truncate long titles
            display_title = self._paper_title[:80] + "..." if len(self._paper_title) > 80 else self._paper_title
            self.cell(0, 8, _sanitize_text(display_title), new_x="LMARGIN", new_y="NEXT", align="C")
            self.set_draw_color(200, 200, 200)
            self.line(MARGIN_L, self.get_y(), PAGE_W - MARGIN_R, self.get_y())
            self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font(self._font_family(), "I", 8)
        self.set_text_color(140, 140, 140)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")


def _resolve_image_path(img_ref: str, working_dir: Path) -> Optional[Path]:
    """
    Resolve a markdown image reference to an actual file path.
    Searches common locations within the project working directory.
    """
    # Clean up the reference
    img_ref = img_ref.strip().strip('"').strip("'")

    # Direct path
    direct = working_dir / img_ref
    if direct.exists():
        return direct

    # Try common subdirectories
    for subdir in ["", "results", "figures", "workflow", "output", "plots"]:
        base = working_dir / subdir if subdir else working_dir
        if not base.exists():
            continue

        # Exact match
        candidate = base / Path(img_ref).name
        if candidate.exists():
            return candidate

        # Try with different extensions
        stem = Path(img_ref).stem
        for ext in IMAGE_EXTENSIONS:
            candidate = base / f"{stem}{ext}"
            if candidate.exists():
                return candidate

    return None


def _find_all_figures(working_dir: Path) -> dict[str, Path]:
    """Build a map of filename -> path for all image files in the project."""
    figure_map = {}
    for ext in IMAGE_EXTENSIONS:
        for p in working_dir.rglob(f"*{ext}"):
            figure_map[p.name.lower()] = p
            # Also map stem for flexible matching
            figure_map[p.stem.lower()] = p
    return figure_map


def _parse_markdown_to_blocks(md_text: str) -> list[dict]:
    """
    Parse markdown into a list of rendering blocks.
    Each block is a dict with 'type' and content fields.
    """
    blocks = []
    lines = md_text.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i]

        # Heading
        heading_match = re.match(r'^(#{1,6})\s+(.*)', line)
        if heading_match:
            level = len(heading_match.group(1))
            blocks.append({"type": "heading", "level": level, "text": heading_match.group(2).strip()})
            i += 1
            continue

        # Image: ![alt](path)
        img_match = re.match(r'!\[([^\]]*)\]\(([^)]+)\)', line.strip())
        if img_match:
            blocks.append({"type": "image", "alt": img_match.group(1), "src": img_match.group(2)})
            i += 1
            continue

        # Horizontal rule
        if re.match(r'^(-{3,}|_{3,}|\*{3,})\s*$', line.strip()):
            blocks.append({"type": "hr"})
            i += 1
            continue

        # Code block
        if line.strip().startswith("```"):
            code_lines = []
            lang = line.strip()[3:].strip()
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # skip closing ```
            blocks.append({"type": "code", "lang": lang, "text": "\n".join(code_lines)})
            continue

        # Unordered list item
        list_match = re.match(r'^(\s*)([-*+])\s+(.*)', line)
        if list_match:
            indent = len(list_match.group(1))
            blocks.append({"type": "list_item", "indent": indent, "text": list_match.group(3).strip()})
            i += 1
            continue

        # Ordered list item
        olist_match = re.match(r'^(\s*)(\d+)[.)]\s+(.*)', line)
        if olist_match:
            indent = len(olist_match.group(1))
            blocks.append({"type": "olist_item", "indent": indent, "num": olist_match.group(2), "text": olist_match.group(3).strip()})
            i += 1
            continue

        # Blank line
        if line.strip() == "":
            blocks.append({"type": "blank"})
            i += 1
            continue

        # Regular paragraph text — collect consecutive lines
        para_lines = [line]
        i += 1
        while i < len(lines):
            next_line = lines[i]
            # Stop at headings, images, code blocks, lists, blanks, hrs
            if (next_line.strip() == "" or
                re.match(r'^#{1,6}\s+', next_line) or
                re.match(r'!\[', next_line.strip()) or
                next_line.strip().startswith("```") or
                re.match(r'^(\s*)([-*+])\s+', next_line) or
                re.match(r'^(\s*)(\d+)[.)]\s+', next_line) or
                re.match(r'^(-{3,}|_{3,}|\*{3,})\s*$', next_line.strip())):
                break
            para_lines.append(next_line)
            i += 1

        blocks.append({"type": "paragraph", "text": " ".join(l.strip() for l in para_lines)})

    return blocks


def _strip_inline_formatting(text: str) -> str:
    """Remove markdown bold/italic markers for plain text rendering."""
    text = re.sub(r'\*\*\*(.+?)\*\*\*', r'\1', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'__(.+?)__', r'\1', text)
    text = re.sub(r'_(.+?)_', r'\1', text)
    text = re.sub(r'`(.+?)`', r'\1', text)
    return text


def _render_rich_text(pdf: FPDF, text: str, default_size: int = 10):
    """
    Render text with inline bold/italic using multi_cell with markdown=True.
    fpdf2 supports **bold** and *italic* via the markdown parameter.
    """
    pdf.multi_cell(w=CONTENT_W, text=_sanitize_text(text), markdown=True, new_x="LMARGIN", new_y="NEXT")


def generate_paper_pdf(
    markdown_content: str,
    working_dir: str | Path,
    output_path: str | Path,
    title: str = "Research Paper",
) -> Path:
    """
    Generate a styled PDF from markdown paper content with embedded figures.

    Parameters
    ----------
    markdown_content : str
        The paper content in markdown format.
    working_dir : str or Path
        Project working directory containing figures.
    output_path : str or Path
        Where to save the generated PDF.
    title : str
        Paper title for the header.

    Returns
    -------
    Path
        Path to the generated PDF file.
    """
    working_dir = Path(working_dir)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Build figure map for flexible resolution
    figure_map = _find_all_figures(working_dir)

    # Parse markdown
    blocks = _parse_markdown_to_blocks(markdown_content)

    # Create PDF — publication-quality compact layout
    pdf = PaperPDF(title=title, orientation="P", unit="mm", format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=MARGIN_B)
    pdf.set_margins(MARGIN_L, MARGIN_T, MARGIN_R)
    pdf.add_page()

    # ── Inline title block (no separate title page — saves space) ──
    pdf.ln(5)
    pdf.set_font(pdf._font_family(), "B", 16)
    pdf.set_text_color(20, 20, 60)
    pdf.multi_cell(w=CONTENT_W, h=7, text=_sanitize_text(title), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_draw_color(80, 80, 160)
    pdf.set_line_width(0.4)
    mid = PAGE_W / 2
    pdf.line(mid - 25, pdf.get_y(), mid + 25, pdf.get_y())
    pdf.ln(2)
    pdf.set_font(pdf._font_family(), "I", 8)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 5, "Generated by Agentic Data Scientist", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(4)
    pdf.set_draw_color(200, 200, 200)
    pdf.set_line_width(0.15)
    pdf.line(MARGIN_L, pdf.get_y(), PAGE_W - MARGIN_R, pdf.get_y())
    pdf.ln(4)

    pdf.set_text_color(30, 30, 30)

    # ── Font sizes for compact publication layout ──
    BODY_SIZE = 9
    BODY_LINE_H = 4.2
    H1_SIZE = 13
    H2_SIZE = 11
    H3_SIZE = 10
    H4_SIZE = 9
    CAPTION_SIZE = 8
    CODE_SIZE = 7

    figure_counter = 0

    for block in blocks:
        btype = block["type"]

        if btype == "heading":
            level = block["level"]
            text = _sanitize_text(_strip_inline_formatting(block["text"]))

            if level == 1:
                pdf.ln(4)
                pdf.set_font(pdf._font_family(), "B", H1_SIZE)
                pdf.set_text_color(20, 20, 60)
                pdf.multi_cell(w=CONTENT_W, h=6, text=text, new_x="LMARGIN", new_y="NEXT")
                pdf.set_draw_color(80, 80, 160)
                pdf.set_line_width(0.2)
                pdf.line(MARGIN_L, pdf.get_y() + 0.5, MARGIN_L + CONTENT_W, pdf.get_y() + 0.5)
                pdf.ln(3)
            elif level == 2:
                pdf.ln(3)
                pdf.set_font(pdf._font_family(), "B", H2_SIZE)
                pdf.set_text_color(30, 30, 80)
                pdf.multi_cell(w=CONTENT_W, h=5.5, text=text, new_x="LMARGIN", new_y="NEXT")
                pdf.ln(1.5)
            elif level == 3:
                pdf.ln(2)
                pdf.set_font(pdf._font_family(), "BI", H3_SIZE)
                pdf.set_text_color(50, 50, 90)
                pdf.multi_cell(w=CONTENT_W, h=5, text=text, new_x="LMARGIN", new_y="NEXT")
                pdf.ln(1)
            else:
                pdf.ln(1.5)
                pdf.set_font(pdf._font_family(), "B", H4_SIZE)
                pdf.set_text_color(60, 60, 60)
                pdf.multi_cell(w=CONTENT_W, h=BODY_LINE_H, text=text, new_x="LMARGIN", new_y="NEXT")
                pdf.ln(1)

            pdf.set_text_color(30, 30, 30)

        elif btype == "paragraph":
            pdf.set_font(pdf._font_family(), "", BODY_SIZE)
            _render_rich_text(pdf, block["text"], BODY_SIZE)
            pdf.ln(1.5)

        elif btype == "image":
            figure_counter += 1
            src = block["src"]
            alt = block["alt"] or f"Figure {figure_counter}"

            # Resolve image path
            img_path = _resolve_image_path(src, working_dir)
            if not img_path:
                src_name = Path(src).name.lower()
                src_stem = Path(src).stem.lower()
                img_path = figure_map.get(src_name) or figure_map.get(src_stem)

            if img_path and img_path.exists() and img_path.suffix.lower() in IMAGE_EXTENSIONS:
                try:
                    from PIL import Image as PILImage
                    with PILImage.open(img_path) as img:
                        img_w, img_h = img.size
                        w_mm = img_w * 25.4 / 96
                        h_mm = img_h * 25.4 / 96

                        # Publication-size figures: max 70% of content width, max 80mm tall
                        max_w = CONTENT_W * 0.70
                        max_h = 80

                        scale = min(max_w / w_mm, max_h / h_mm, 1.0)
                        final_w = w_mm * scale
                        final_h = h_mm * scale

                    # Need new page if not enough room for figure + caption
                    space_needed = final_h + 12  # figure + caption + padding
                    if pdf.get_y() + space_needed > (297 - MARGIN_B):
                        pdf.add_page()

                    pdf.ln(2)

                    # Draw a light border box around figure + caption
                    box_x = MARGIN_L + (CONTENT_W - final_w - 6) / 2
                    box_y = pdf.get_y()
                    box_w = final_w + 6
                    box_h = final_h + 10

                    pdf.set_draw_color(210, 210, 210)
                    pdf.set_line_width(0.15)
                    pdf.rect(box_x, box_y, box_w, box_h)

                    # Center the image inside the box
                    x_offset = box_x + 3
                    pdf.image(str(img_path), x=x_offset, y=box_y + 1.5, w=final_w, h=final_h)

                    # Caption below image inside box
                    pdf.set_y(box_y + final_h + 2.5)
                    pdf.set_font(pdf._font_family(), "I", CAPTION_SIZE)
                    pdf.set_text_color(80, 80, 80)
                    caption = _sanitize_text(f"Figure {figure_counter}. {alt}")
                    pdf.set_x(box_x)
                    pdf.multi_cell(w=box_w, h=3.5, text=caption, align="C", new_x="LMARGIN", new_y="NEXT")
                    pdf.set_text_color(30, 30, 30)
                    pdf.set_y(box_y + box_h + 2)

                except Exception as e:
                    logger.warning(f"Failed to embed image {img_path}: {e}")
                    pdf.set_font(pdf._font_family(), "I", CAPTION_SIZE)
                    pdf.set_text_color(180, 80, 80)
                    pdf.cell(0, 5, _sanitize_text(f"[Figure {figure_counter}: {alt} -- could not be embedded]"),
                             new_x="LMARGIN", new_y="NEXT", align="C")
                    pdf.set_text_color(30, 30, 30)
                    pdf.ln(1)
            else:
                pdf.set_font(pdf._font_family(), "I", CAPTION_SIZE)
                pdf.set_text_color(180, 80, 80)
                pdf.cell(0, 5, _sanitize_text(f"[Figure {figure_counter}: {alt} -- file not found: {src}]"),
                         new_x="LMARGIN", new_y="NEXT", align="C")
                pdf.set_text_color(30, 30, 30)
                pdf.ln(1)

        elif btype == "code":
            pdf.ln(1)
            pdf.set_font("Courier", "", CODE_SIZE)
            pdf.set_fill_color(248, 248, 248)
            pdf.set_draw_color(210, 210, 210)

            code_text = block["text"]
            code_lines = code_text.split("\n")
            if len(code_lines) > 20:
                code_text = "\n".join(code_lines[:18]) + "\n  ... [truncated]"

            pdf.multi_cell(w=CONTENT_W, h=3.2, text=_sanitize_text(code_text), border=1, fill=True,
                          new_x="LMARGIN", new_y="NEXT")
            pdf.set_font(pdf._font_family(), "", BODY_SIZE)
            pdf.ln(1.5)

        elif btype == "list_item":
            indent = min(block.get("indent", 0) // 2, 3)
            pdf.set_font(pdf._font_family(), "", BODY_SIZE)
            x_indent = MARGIN_L + 4 + indent * 4
            bullet_w = CONTENT_W - 4 - indent * 4
            pdf.set_x(x_indent)
            text = _sanitize_text(f"*  {block['text']}")
            pdf.multi_cell(w=bullet_w, h=BODY_LINE_H, text=text, markdown=True, new_x="LMARGIN", new_y="NEXT")
            pdf.ln(0.5)

        elif btype == "olist_item":
            indent = min(block.get("indent", 0) // 2, 3)
            pdf.set_font(pdf._font_family(), "", BODY_SIZE)
            x_indent = MARGIN_L + 4 + indent * 4
            item_w = CONTENT_W - 4 - indent * 4
            pdf.set_x(x_indent)
            text = _sanitize_text(f"{block['num']}.  {block['text']}")
            pdf.multi_cell(w=item_w, h=BODY_LINE_H, text=text, markdown=True, new_x="LMARGIN", new_y="NEXT")
            pdf.ln(0.5)

        elif btype == "hr":
            pdf.ln(2)
            pdf.set_draw_color(200, 200, 200)
            pdf.set_line_width(0.15)
            pdf.line(MARGIN_L + 15, pdf.get_y(), PAGE_W - MARGIN_R - 15, pdf.get_y())
            pdf.ln(2)

        elif btype == "blank":
            pdf.ln(1.5)

    # Save
    pdf.output(str(output_path))
    logger.info(f"PDF generated: {output_path} ({output_path.stat().st_size} bytes)")
    return output_path
