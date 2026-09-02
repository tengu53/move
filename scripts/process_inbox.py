#!/usr/bin/env python3
"""Process one Markdown draft from inbox into a publishable blog post.

This is a deterministic helper for the boring parts of the inbox workflow.
It does not replace editorial judgment: pass tags/category explicitly when the
defaults are not good enough.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INBOX = ROOT / "inbox"
POSTS = ROOT / "posts"
STATIC_IMAGES = ROOT / "static" / "images"
LOG = ROOT / "log.md"

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
IGNORED_INBOX_MD = {"README.md", "about.md"}


@dataclass(frozen=True)
class InboxImage:
    source: Path
    target_name: str


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()
    return slug or "post"


def strip_markdown(value: str) -> str:
    text = re.sub(r"!\[[^\]]*]\([^)]+\)", " ", value)
    text = re.sub(r"\[([^\]]+)]\([^)]+\)", r"\1", text)
    text = re.sub(r"<!--\s*more\s*-->", " ", text)
    text = re.sub(r"[#*_`>-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def yaml_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def parse_tags(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def choose_draft(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit)
        if not path.is_absolute():
            path = INBOX / path
        if not path.exists():
            raise FileNotFoundError(f"Inbox draft not found: {path}")
        return path

    candidates = [
        path
        for path in INBOX.glob("*.md")
        if path.name not in IGNORED_INBOX_MD
    ]
    if not candidates:
        raise FileNotFoundError("No Markdown drafts found in inbox.")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def split_title(source: str, fallback: str) -> tuple[str, str]:
    lines = source.replace("\r\n", "\n").split("\n")
    for index, line in enumerate(lines):
        match = re.match(r"^#\s+(.+?)\s*$", line)
        if match:
            body = "\n".join(lines[:index] + lines[index + 1 :]).strip()
            return match.group(1).strip(), body
    return fallback, source.strip()


def insert_more_marker(markdown: str) -> str:
    if "<!-- more -->" in markdown:
        return markdown

    blocks = re.split(r"\n\s*\n", markdown.strip())
    for index, block in enumerate(blocks):
        clean = block.strip()
        if not clean or clean.startswith("#") or clean.startswith("- "):
            continue
        if index == 0 and clean.startswith("*") and clean.endswith("*") and len(blocks) > 1:
            continue
        blocks[index] = clean + "<!-- more -->"
        return "\n\n".join(blocks)
    return markdown


def excerpt(markdown: str, limit: int = 180) -> str:
    before_more = markdown.split("<!-- more -->", 1)[0]
    text = strip_markdown(before_more or markdown)
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def frontmatter(
    *,
    title: str,
    date: str,
    author: str,
    tags: list[str],
    category: str,
    description: str,
    image: InboxImage | None,
    caption: str,
) -> str:
    lines = [
        "---",
        f"title: {yaml_quote(title)}",
        f"date: {date}",
        "draft: false",
        f"author: {yaml_quote(author)}",
        "tags: [" + ", ".join(yaml_quote(tag) for tag in tags) + "]",
        "categories: [" + yaml_quote(category) + "]",
        f"description: {yaml_quote(description)}",
    ]
    if image:
        alt = title
        lines.extend(
            [
                f"image: {yaml_quote(image.target_name)}",
                f"image_alt: {yaml_quote(alt)}",
                f"image_caption: {yaml_quote(caption)}",
            ]
        )
    lines.append("---")
    return "\n".join(lines)


def find_image(draft: Path, explicit: str | None) -> InboxImage | None:
    if explicit:
        source = Path(explicit)
        if not source.is_absolute():
            source = INBOX / source
        if not source.exists():
            raise FileNotFoundError(f"Inbox image not found: {source}")
        return InboxImage(source=source, target_name=slugify(source.stem) + source.suffix.lower())

    stem_slug = slugify(draft.stem)
    images = [path for path in INBOX.iterdir() if path.suffix.lower() in IMAGE_SUFFIXES]
    if not images:
        return None

    def score(path: Path) -> tuple[int, float]:
        image_slug = slugify(path.stem)
        shared = len(set(stem_slug.split("-")) & set(image_slug.split("-")))
        return shared, path.stat().st_mtime

    best = max(images, key=score)
    if score(best)[0] == 0 and len(images) > 1:
        return None
    return InboxImage(source=best, target_name=slugify(best.stem) + best.suffix.lower())


def copy_image(image: InboxImage | None, overwrite: bool) -> None:
    if not image:
        return
    target = STATIC_IMAGES / image.target_name
    if target.exists() and not overwrite:
        raise FileExistsError(f"Image already exists: {target}")
    STATIC_IMAGES.mkdir(parents=True, exist_ok=True)
    shutil.copy2(image.source, target)


def write_post(path: Path, content: str, overwrite: bool) -> None:
    if path.exists() and not overwrite:
        raise FileExistsError(f"Post already exists: {path}")
    POSTS.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def append_log(title: str, post_path: Path, image: InboxImage | None) -> None:
    today = dt.date.today().isoformat()
    log = LOG.read_text(encoding="utf-8") if LOG.exists() else "# Log zmen\n"
    heading = f"## {today}"
    if heading not in log:
        log = log.rstrip() + f"\n\n{heading}\n"
    image_note = f"; obrazek `{image.source.name}` zkopirovan jako `static/images/{image.target_name}`" if image else ""
    line = f"- Automaticky zpracovan inbox text do clanku `{post_path.as_posix()}`{image_note}."
    log = log.rstrip() + "\n\n" + line + "\n"
    LOG.write_text(log, encoding="utf-8", newline="\n")


def run_build() -> None:
    subprocess.run(["node", "build-web.mjs", "--check-links"], cwd=ROOT, check=True, text=True)


def process(args: argparse.Namespace) -> Path:
    draft = choose_draft(args.file)
    source = draft.read_text(encoding="utf-8")
    title, body = split_title(source, fallback=draft.stem.replace("_", " "))
    body = insert_more_marker(body)
    slug = args.slug or slugify(title)
    tags = parse_tags(args.tags) or ["trendspotting"]
    image = find_image(draft, args.image) if not args.no_image else None
    post_path = POSTS / f"{slug}.md"

    content = (
        frontmatter(
            title=title,
            date=args.date,
            author=args.author,
            tags=tags,
            category=args.category,
            description=args.description or excerpt(body),
            image=image,
            caption=args.caption,
        )
        + "\n\n"
        + body.strip()
        + "\n"
    )

    copy_image(image, overwrite=args.overwrite)
    write_post(post_path, content, overwrite=args.overwrite)
    if not args.keep_inbox:
        draft.unlink()
    append_log(title, post_path.relative_to(ROOT), image)
    if args.build:
        run_build()
    return post_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Process one Markdown draft from inbox into posts.")
    parser.add_argument("command", nargs="?", default="run", choices=["run"], help="Use 'run' to process the newest inbox draft.")
    parser.add_argument("file", nargs="?", help="Inbox Markdown file. Defaults to newest non-README draft.")
    parser.add_argument("--image", help="Inbox image file. Defaults to best matching image when available.")
    parser.add_argument("--no-image", action="store_true", help="Do not attach a cover image.")
    parser.add_argument("--slug", help="Override output post slug.")
    parser.add_argument("--date", default=dt.date.today().isoformat(), help="Post date, default: today.")
    parser.add_argument("--author", default="Edgar Walden")
    parser.add_argument("--category", default="experimenty")
    parser.add_argument("--tags", default="", help="Comma-separated tags. Default: trendspotting.")
    parser.add_argument("--description", help="Override generated description.")
    parser.add_argument("--caption", default="Obr: Nano-bana AI")
    parser.add_argument("--keep-inbox", action="store_true", help="Keep processed Markdown in inbox.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing post/image targets.")
    parser.add_argument("--no-build", dest="build", action="store_false", help="Skip node build-web.mjs --check-links.")
    parser.set_defaults(build=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        post_path = process(args)
    except (FileExistsError, FileNotFoundError, UnicodeDecodeError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"Processed {post_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
