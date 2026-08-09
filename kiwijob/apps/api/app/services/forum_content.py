from __future__ import annotations

import html
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit


ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s", "h2", "h3",
    "ul", "ol", "li", "blockquote", "a", "span", "div", "font",
}
ALLOWED_STYLES = {"font-family", "font-size", "color", "text-align"}
SAFE_FONT_SIZES = {"12px", "14px", "16px", "18px", "24px", "32px"}
SAFE_FONTS = {"Arial", "Georgia", "Tahoma", "Times New Roman", "Verdana"}
BLOCKED_CONTENT_TAGS = {"script", "style", "iframe", "object", "embed", "svg", "math"}


def _safe_style(value: str) -> str:
    declarations: list[str] = []
    for item in value.split(";"):
        if ":" not in item:
            continue
        name, raw_value = (part.strip() for part in item.split(":", 1))
        name = name.lower()
        if name not in ALLOWED_STYLES:
            continue
        if name == "font-size" and raw_value not in SAFE_FONT_SIZES:
            continue
        if name == "font-family" and raw_value.strip("'\"") not in SAFE_FONTS:
            continue
        if name == "color" and not re.fullmatch(r"#[0-9a-fA-F]{6}", raw_value):
            continue
        if name == "text-align" and raw_value not in {"left", "center", "right"}:
            continue
        declarations.append(f"{name}: {raw_value}")
    return "; ".join(declarations)


class _Sanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.blocked_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in BLOCKED_CONTENT_TAGS:
            self.blocked_depth += 1
            return
        if self.blocked_depth or tag not in ALLOWED_TAGS:
            return
        output_tag = "span" if tag == "font" else tag
        safe_attrs: list[str] = []
        attr_map = {name.lower(): value or "" for name, value in attrs}
        style = _safe_style(attr_map.get("style", ""))
        if tag == "font":
            font_styles: list[str] = []
            face = attr_map.get("face", "").strip("'\"")
            if face in SAFE_FONTS:
                font_styles.append(f"font-family: {face}")
            size = {"2": "12px", "3": "14px", "4": "16px", "5": "18px", "6": "24px"}.get(attr_map.get("size", ""))
            if size:
                font_styles.append(f"font-size: {size}")
            color = attr_map.get("color", "")
            if re.fullmatch(r"#[0-9a-fA-F]{6}", color):
                font_styles.append(f"color: {color}")
            style = "; ".join(filter(None, [style, *font_styles]))
        if style and tag in {"span", "p", "div", "font"}:
            safe_attrs.append(f' style="{html.escape(style, quote=True)}"')
        if tag == "a":
            href = attr_map.get("href", "").strip()
            parsed = urlsplit(href)
            if parsed.scheme in {"http", "https", "mailto"}:
                safe_attrs.append(f' href="{html.escape(href, quote=True)}"')
                safe_attrs.append(' target="_blank" rel="noopener noreferrer"')
        self.parts.append(f"<{output_tag}{''.join(safe_attrs)}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag.lower() != "br":
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in BLOCKED_CONTENT_TAGS:
            self.blocked_depth = max(0, self.blocked_depth - 1)
            return
        if not self.blocked_depth and tag in ALLOWED_TAGS and tag != "br":
            self.parts.append(f"</{'span' if tag == 'font' else tag}>")

    def handle_data(self, data: str) -> None:
        if not self.blocked_depth:
            self.parts.append(html.escape(data))


def sanitize_forum_html(value: str) -> str:
    parser = _Sanitizer()
    parser.feed(value)
    parser.close()
    return "".join(parser.parts).strip()


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"p", "div", "h2", "h3", "li", "blockquote"}:
            self.parts.append("\n")


def forum_plain_text(value: str) -> str:
    parser = _TextExtractor()
    parser.feed(value)
    parser.close()
    return re.sub(r"[ \t]+", " ", "".join(parser.parts)).strip()
